import { NextRequest, NextResponse } from 'next/server';
import { getCommentsByTaskId, createComment, getTask } from '@/lib/db';
import { sendCommentWebhook } from '@/lib/webhook';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await getCommentsByTaskId(id);
    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const comment = await createComment({
      id: uuidv4(),
      task_id: id,
      author: body.author,
      content: body.content,
    });
    
    // Get task for webhook context
    const task = await getTask(id);
    if (task) {
      await sendCommentWebhook({
        task,
        comment: {
          author: comment.author,
          content: comment.content,
        },
      });
    }
    
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
