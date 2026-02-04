import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createTask, updateProjectFeedback, getProject } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import pool from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  const { id: projectId, feedbackId } = await params;
  
  // Check API key or session
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Get the feedback item
    const feedbackResult = await pool.query(
      'SELECT * FROM project_feedback WHERE id = $1 AND project_id = $2',
      [feedbackId, projectId]
    );
    
    if (feedbackResult.rows.length === 0) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }
    
    const feedback = feedbackResult.rows[0];
    
    // Get project for context
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse optional overrides from request body
    const body = await request.json().catch(() => ({}));
    
    // Check for existing task from this feedback (prevent duplicates)
    const existingTaskResult = await pool.query(
      'SELECT id, status FROM tasks WHERE feedback_id = $1',
      [feedbackId]
    );
    
    if (existingTaskResult.rows.length > 0) {
      const existingTask = existingTaskResult.rows[0];
      return NextResponse.json({ 
        error: 'Task already exists for this feedback',
        existingTaskId: existingTask.id,
        existingTaskStatus: existingTask.status
      }, { status: 409 });
    }
    
    // Determine priority based on feedback type
    let priority: 'low' | 'medium' | 'high' = 'medium';
    if (feedback.type === 'bug') priority = 'high';
    if (feedback.type === 'question') priority = 'low';
    
    // Create task from feedback
    const task = await createTask({
      id: uuidv4(),
      title: body.title || `[${feedback.type.toUpperCase()}] ${feedback.title}`,
      description: body.description || `**From Feedback:**\n${feedback.content}\n\n**Reported by:** ${feedback.author}`,
      status: 'todo',
      assignee: body.assignee || 'Simon', // Default to Simon for triage
      priority: body.priority || priority,
      project_id: projectId,
      feedback_id: feedbackId,
    });
    
    // Update feedback status to acknowledged
    await updateProjectFeedback(feedbackId, { status: 'acknowledged' });

    return NextResponse.json({ 
      success: true, 
      task_id: task.id,
      task,
      message: 'Feedback converted to task successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error converting feedback to task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
