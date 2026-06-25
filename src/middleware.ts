import { NextRequest, NextResponse } from "next/server";

/**
 * Optional HTTP Basic Auth for the dashboard. If DASHBOARD_USER and
 * DASHBOARD_PASSWORD are both set, every page (except /api and static assets)
 * requires those credentials. If either is unset, auth is disabled.
 */
export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;

  // Auth disabled when not configured.
  if (!user || !password) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Post Tracker"' },
  });
}

export const config = {
  // Protect everything except API routes and Next internals/static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
