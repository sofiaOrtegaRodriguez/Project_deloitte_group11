import { NextResponse, type NextRequest } from 'next/server';

/** Must match SESSION_COOKIE in the backend (auth.constants.ts). */
const SESSION_COOKIE = 'hosstock_session';

/**
 * Sends visitors without a session cookie to Login before any page is rendered.
 * It only checks that the cookie exists: whether the session is still valid is decided by the
 * backend on every request, and the app shell goes to Login when the backend answers 401.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Every page except Login, the /api proxy to the backend and Next's own static files.
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
