import { NextRequest, NextResponse } from 'next/server';

const SKILLSMP_BASE_URL = 'https://skillsmp.com/api/v1';

interface SkillsmpSkill {
  id: string;
  name: string;
  author: string;
  description: string;
  githubUrl: string;
  skillUrl: string;
  stars: number;
  updatedAt: number;
}

// GET /api/skills/search?q=query&ai=true&page=1&limit=20&sortBy=stars
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q');
    const useAI = request.nextUrl.searchParams.get('ai') === 'true';
    const page = request.nextUrl.searchParams.get('page') || '1';
    const limit = request.nextUrl.searchParams.get('limit') || '20';
    const sortBy = request.nextUrl.searchParams.get('sortBy') || 'recent';

    if (!q) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    const SKILLSMP_API_KEY = process.env.SKILLSMP_API_KEY;
    if (!SKILLSMP_API_KEY) {
      return NextResponse.json({ error: 'SkillsMP API key not configured' }, { status: 503 });
    }

    const endpoint = useAI ? 'skills/ai-search' : 'skills/search';
    const params = new URLSearchParams({ q });
    if (!useAI) {
      params.set('page', page);
      params.set('limit', limit);
      params.set('sortBy', sortBy);
    }
    const url = `${SKILLSMP_BASE_URL}/${endpoint}?${params.toString()}`;

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

    const raw = await res.json();

    // Normalize responses from SkillsMP API
    if (useAI) {
      // AI search: { success, data: { data: [{ skill: {...}, score }], has_more } }
      const aiData = raw?.data;
      const skills: SkillsmpSkill[] = (aiData?.data || []).map(
        (item: { skill: SkillsmpSkill; score: number }) => ({
          ...item.skill,
          score: item.score,
        })
      );
      return NextResponse.json({
        skills,
        pagination: { hasMore: aiData?.has_more || false },
      });
    } else {
      // Keyword search: { success, data: { skills: [...], pagination: {...} } }
      const kwData = raw?.data;
      return NextResponse.json({
        skills: kwData?.skills || [],
        pagination: kwData?.pagination || null,
      });
    }
  } catch (error) {
    console.error('Error searching skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
