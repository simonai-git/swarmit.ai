import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow API key authentication for API routes
  if (pathname.startsWith('/api/tasks') || pathname.startsWith('/api/watcher') || pathname.startsWith('/api/reports') || pathname.startsWith('/api/agents') || pathname.startsWith('/api/projects') || pathname.startsWith('/api/events')) {
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.SIMON_API_KEY;
    
    if (apiKey && validApiKey && apiKey === validApiKey) {
      return NextResponse.next();
    }
  }
  
  // Skip auth for login and auth routes
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  
  // Check for session
  const token = await getToken({ req: request });
  
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
