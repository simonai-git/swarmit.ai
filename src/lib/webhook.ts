const NTFY_TOPIC = process.env.NTFY_TOPIC || 'simon-tasks-notify';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

export interface WebhookPayload {
  event: 'task.created' | 'task.updated' | 'task.deleted' | 'task.completed';
  task: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    assignee: string | null;
    priority: string;
    due_date?: string | null;
  };
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  try {
    const { event, task } = payload;
    
    // Format message for ntfy (no emojis in headers - they break HTTP)
    const eventActions: Record<string, string> = {
      'task.created': 'New Task',
      'task.updated': 'Updated',
      'task.deleted': 'Deleted',
      'task.completed': 'Completed',
    };
    const eventAction = eventActions[event] || 'Updated';
    
    const title = `${eventAction}: ${task.title}`;
    const message = [
      task.description || 'No description',
      '',
      `Priority: ${task.priority.toUpperCase()}`,
      `Assignee: ${task.assignee || 'Unassigned'}`,
      task.due_date ? `Due: ${task.due_date}` : '',
    ].filter(Boolean).join('\n');

    // Map priority to ntfy priority (1-5)
    const ntfyPriority = task.priority === 'high' ? '5' : task.priority === 'medium' ? '3' : '2';
    
    // Tags for ntfy (emojis work here)
    let tags = task.priority === 'high' ? 'rotating_light' : task.priority === 'medium' ? 'warning' : 'white_check_mark';
    if (event === 'task.completed') {
      tags = 'tada';  // 🎉 for completed tasks
    }

    await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': ntfyPriority,
        'Tags': tags,
      },
      body: message,
    });

    console.log(`Webhook sent: ${event} - ${task.title}`);
  } catch (error) {
    console.error('Webhook error:', error);
    // Don't throw - webhook failure shouldn't break task creation
  }
}

export interface CommentWebhookPayload {
  task: {
    id: string;
    title: string;
    status: string;
    assignee: string | null;
  };
  comment: {
    author: string;
    content: string;
  };
}

export async function sendCommentWebhook(payload: CommentWebhookPayload): Promise<void> {
  try {
    const { task, comment } = payload;
    
    const title = `Comment on: ${task.title}`;
    const message = [
      `From: ${comment.author}`,
      '',
      comment.content,
      '',
      `Task Status: ${task.status}`,
      `Assignee: ${task.assignee || 'Unassigned'}`,
    ].join('\n');

    await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': '4',  // High priority for comments (feedback)
        'Tags': 'speech_balloon',  // 💬
      },
      body: message,
    });

    console.log(`Webhook sent: comment on ${task.title} by ${comment.author}`);
  } catch (error) {
    console.error('Comment webhook error:', error);
  }
}
