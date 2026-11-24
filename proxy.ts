// Quick check before every page: no session cookie -> login page. Real checks happen on the server (lib/auth.ts).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") return; // public landing page
  if (!request.cookies.has("nexus_session")) return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
