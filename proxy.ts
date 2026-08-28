import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

// Signed-out visitors get bounced here rather than rendering the page: these
// pages call verifySession(), whose redirect() only reaches the browser as a
// 1-second `<meta http-equiv="refresh">` once streaming has started -- which
// shows up as a blank white page before the login form appears.
const protectedRoutes = ["/dashboard", "/portfolio", "/transactions", "/watchlist", "/welcome", "/settings"];
const authRoutes = ["/login", "/signup"];
const dashboardRedirectRoutes = ["/"];
// Only the landing page marks the visitor as "already landed" -- reaching the
// portfolio or watchlist shouldn't consume the one-time redirect to /dashboard.
const dashboardRoutes = ["/dashboard"];
const DASHBOARD_LANDED_COOKIE = "dash_landed";

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isDashboardRoute = dashboardRoutes.some((route) => path.startsWith(route));
  const isAuthRoute = authRoutes.includes(path);
  const isDashboardRedirectRoute = dashboardRedirectRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthRoute && session?.userId) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Signed-in visitors land on their dashboard the first time they open the
  // site in a browser session. After that first landing (tracked by a
  // session-lifetime cookie, not the Referer header -- Referer isn't sent
  // reliably for history back/forward navigation, which made both the
  // "Binder" logo link and the browser Back button feel broken/looping),
  // "/" behaves like a normal route: the catalog, its links, and the back
  // button all just work.
  if (isDashboardRedirectRoute && session?.userId && !req.cookies.get(DASHBOARD_LANDED_COOKIE)) {
    const response = NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    response.cookies.set(DASHBOARD_LANDED_COOKIE, "1", { path: "/", sameSite: "lax" });
    return response;
  }

  // The cookie also needs to be set the moment /dashboard is reached through
  // ANY other path (a direct login redirect, a bookmark, a session that
  // predates this cookie existing) -- otherwise the "Binder" link's very
  // first click bounces straight back to /dashboard (the redirect-once
  // check above still thinks it's a "fresh visit"), which looks like the
  // link does nothing since you're already on the page it redirects to.
  if (isDashboardRoute && session?.userId && !req.cookies.get(DASHBOARD_LANDED_COOKIE)) {
    const response = NextResponse.next();
    response.cookies.set(DASHBOARD_LANDED_COOKIE, "1", { path: "/", sameSite: "lax" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
