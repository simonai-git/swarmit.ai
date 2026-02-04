import { NextRequest, NextResponse } from 'next/server';
import { getAllAgents, getActiveAgents, createAgent, Agent } from '@/lib/db';
import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';

export interface AgentWithMetrics extends Agent {
  assigned_count: number;
  worked_count: number;
  completed_count: number;
}

// Compute metrics for all agents from tasks table
async function computeAgentMetrics(): Promise<Record<string, { assigned: number; worked: number; completed: number }>> {
  const result = await pool.query('SELECT assignee, status, worked_by FROM tasks');
  const tasks = result.rows;
  
  const metrics: Record<string, { assigned: number; worked: number; completed: number }> = {};
  
  for (const task of tasks) {
    const assignee = task.assignee;
    const status = task.status;
    const workedBy: string[] = task.worked_by ? JSON.parse(task.worked_by) : [];
    
    // Initialize metrics for assignee if not exists
    if (!metrics[assignee]) {
      metrics[assignee] = { assigned: 0, worked: 0, completed: 0 };
    }
    metrics[assignee].assigned++;
    
    // Count worked_by contributions
    for (const contributor of workedBy) {
      if (!metrics[contributor]) {
        metrics[contributor] = { assigned: 0, worked: 0, completed: 0 };
      }
      metrics[contributor].worked++;
      
      // Count completed tasks (where contributor is in worked_by AND status = 'done')
      if (status === 'done') {
        metrics[contributor].completed++;
      }
    }
  }
  
  return metrics;
}

// GET /api/agents - Get all agents with computed metrics
// Supports filtering:
//   ?active=true - only active agents
//   ?specialization=frontend - filter by specialization (case-insensitive, partial match)
//   ?available=true - only agents not currently working on a task
export async function GET(request: NextRequest) {

  try {
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
    const specializationFilter = request.nextUrl.searchParams.get('specialization')?.toLowerCase();
    const availableOnly = request.nextUrl.searchParams.get('available') === 'true';
    
    let agents = activeOnly ? await getActiveAgents() : await getAllAgents();
    
    // Filter by specialization (case-insensitive partial match)
    if (specializationFilter) {
      agents = agents.filter(agent => 
        agent.specialization?.toLowerCase().includes(specializationFilter) ||
        agent.description?.toLowerCase().includes(specializationFilter)
      );
    }
    
    // Compute metrics from tasks
    const metrics = await computeAgentMetrics();
    
    // Add metrics to each agent
    let agentsWithMetrics: AgentWithMetrics[] = agents.map(agent => ({
      ...agent,
      assigned_count: metrics[agent.name]?.assigned || 0,
      worked_count: metrics[agent.name]?.worked || 0,
      completed_count: metrics[agent.name]?.completed || 0,
    }));
    
    // Filter for available agents (no in_progress tasks assigned to them)
    if (availableOnly) {
      const inProgressResult = await pool.query(
        "SELECT DISTINCT assignee FROM tasks WHERE status = 'in_progress'"
      );
      const busyAgents = new Set(inProgressResult.rows.map(r => r.assignee));
      agentsWithMetrics = agentsWithMetrics.filter(agent => !busyAgents.has(agent.name));
    }
    
    return NextResponse.json(agentsWithMetrics);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/agents - Create a new agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.name || !body.specialization) {
      return NextResponse.json(
        { error: 'Name and specialization are required' },
        { status: 400 }
      );
    }

    const agent = await createAgent({
      id: body.id || `agent-${uuidv4()}`,
      name: body.name,
      specialization: body.specialization,
      description: body.description,
      system_prompt: body.system_prompt,
      memory: body.memory,
      avatar_emoji: body.avatar_emoji,
      avatar_color: body.avatar_color,
      is_active: body.is_active,
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json({ error: 'An agent with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
