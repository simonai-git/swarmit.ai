import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getProjectFeedback, 
  createProjectFeedback, 
  getProject,
  FeedbackType
} from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  // Check API key or session
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const feedback = await getProjectFeedback(projectId);
    return NextResponse.json(feedback);
  } catch (error) {
    console.error('Error fetching project feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  // Check API key or session
  const apiKey = request.headers.get('x-api-key');
  let author = 'Anonymous';
  
  if (!apiKey) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    author = session.user?.name || session.user?.email || 'User';
  } else {
    // API access - use provided author or default
    const body = await request.clone().json();
    author = body.author || 'Agent';
  }

  try {
    // Verify project exists
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { type, title, content } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const validTypes: FeedbackType[] = ['suggestion', 'improvement', 'bug', 'feature', 'question'];
    const feedbackType: FeedbackType = validTypes.includes(type) ? type : 'suggestion';

    const feedback = await createProjectFeedback({
      id: uuidv4(),
      project_id: projectId,
      author: body.author || author,
      type: feedbackType,
      title: title.trim(),
      content: content.trim(),
      status: 'open'
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    console.error('Error creating project feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
