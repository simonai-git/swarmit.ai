import { NextResponse } from 'next/server';
import { getAllTaskDependencyCounts } from '@/lib/db';

export async function GET() {
  try {
    const counts = await getAllTaskDependencyCounts();
    return NextResponse.json(counts);
  } catch (error) {
    console.error('Error fetching dependency counts:', error);
    return NextResponse.json({}, { status: 500 });
  }
}
