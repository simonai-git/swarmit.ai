import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Compare due date (YYYY-MM-DD string) against today in server's local time
function isDateOverdue(dueDateStr: string): boolean {
  // Parse the due date as local midnight (not UTC)
  const [year, month, day] = dueDateStr.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day); // month is 0-indexed
  
  // Get today's date at local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Due date is overdue if it's before today
  return dueDate < today;
}

interface TaskMetrics {
  total_tasks: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_assignee: Record<string, number>;
  by_contributor: Record<string, number>; // Tasks worked on by each contributor
  completed_by_contributor: Record<string, number>; // Completed tasks by contributor
  completed_this_week: number;
  avg_cycle_time_hours: number | null;
  velocity_per_day: number;
  overdue_count: number;
  blocked_count: number;
}

export async function GET() {
  try {
    // Get all tasks
    const allTasks = await pool.query('SELECT * FROM tasks');
    const tasks = allTasks.rows;
    
    // Calculate metrics
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // By status
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    const byContributor: Record<string, number> = {}; // All tasks worked on
    const completedByContributor: Record<string, number> = {}; // Completed tasks
    
    let completedThisWeek = 0;
    let totalCycleTime = 0;
    let cycleTimeCount = 0;
    let overdueCount = 0;
    let blockedCount = 0;
    
    for (const task of tasks) {
      // By status
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      
      // By priority
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
      
      // By assignee
      byAssignee[task.assignee] = (byAssignee[task.assignee] || 0) + 1;
      
      // By contributor (who worked on this task)
      // Falls back to assignee if worked_by is empty (for tasks before tracking was added)
      const workedBy: string[] = task.worked_by ? JSON.parse(task.worked_by) : [];
      const contributors = workedBy.length > 0 ? workedBy : [task.assignee];
      for (const contributor of contributors) {
        byContributor[contributor] = (byContributor[contributor] || 0) + 1;
        if (task.status === 'done') {
          completedByContributor[contributor] = (completedByContributor[contributor] || 0) + 1;
        }
      }
      
      // Completed this week
      if (task.status === 'done') {
        const updatedAt = new Date(task.updated_at);
        if (updatedAt >= oneWeekAgo) {
          completedThisWeek++;
        }
        
        // Cycle time (created to done)
        const createdAt = new Date(task.created_at);
        const cycleTimeHours = (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        totalCycleTime += cycleTimeHours;
        cycleTimeCount++;
      }
      
      // Overdue
      if (task.due_date && task.status !== 'done') {
        if (isDateOverdue(task.due_date)) {
          overdueCount++;
        }
      }
      
      // Blocked
      if (task.is_blocked) {
        blockedCount++;
      }
    }
    
    // Calculate velocity (tasks per day over last week)
    const velocityPerDay = completedThisWeek / 7;
    
    // Average cycle time
    const avgCycleTime = cycleTimeCount > 0 ? totalCycleTime / cycleTimeCount : null;
    
    const metrics: TaskMetrics = {
      total_tasks: tasks.length,
      by_status: byStatus,
      by_priority: byPriority,
      by_assignee: byAssignee,
      by_contributor: byContributor,
      completed_by_contributor: completedByContributor,
      completed_this_week: completedThisWeek,
      avg_cycle_time_hours: avgCycleTime ? Math.round(avgCycleTime * 10) / 10 : null,
      velocity_per_day: Math.round(velocityPerDay * 10) / 10,
      overdue_count: overdueCount,
      blocked_count: blockedCount,
    };
    
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
