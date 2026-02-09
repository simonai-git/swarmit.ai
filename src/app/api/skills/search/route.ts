import { NextRequest, NextResponse } from 'next/server';

const SKILLSMP_API_KEY = process.env.SKILLSMP_API_KEY;
const SKILLSMP_BASE_URL = 'https://skillsmp.com/api/v1';

// GET /api/skills/search?q=query&ai=true
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q');
    const useAI = request.nextUrl.searchParams.get('ai') === 'true';

    if (!q) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    if (!SKILLSMP_API_KEY) {
      return NextResponse.json({ error: 'SkillsMP API key not configured' }, { status: 503 });
    }

    const endpoint = useAI ? 'skills/ai-search' : 'skills/search';
    const url = `${SKILLSMP_BASE_URL}/${endpoint}?q=${encodeURIComponent(q)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SKILLSMP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[SkillsMP] Search failed: ${res.status} ${errorText}`);
      return NextResponse.json(
        { error: 'Skills search failed', details: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error searching skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
