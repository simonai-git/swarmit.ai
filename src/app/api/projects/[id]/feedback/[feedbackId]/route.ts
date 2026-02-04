import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { updateProjectFeedback, deleteProjectFeedback, FeedbackStatus } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  const { feedbackId } = await params;
  
  // Check API key or session
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { status, title, content, type } = body;

    const updates: Record<string, unknown> = {};
    
    if (status) {
      const validStatuses: FeedbackStatus[] = ['open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix'];
      if (validStatuses.includes(status)) {
        updates.status = status;
      }
    }
    
    if (title?.trim()) updates.title = title.trim();
    if (content?.trim()) updates.content = content.trim();
    if (type) updates.type = type;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    const feedback = await updateProjectFeedback(feedbackId, updates);
    
    if (!feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    return NextResponse.json(feedback);
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  const { feedbackId } = await params;
  
  // Check API key or session
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const deleted = await deleteProjectFeedback(feedbackId);
    
    if (!deleted) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
