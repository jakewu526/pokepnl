import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const protectedRoutes = ["/collection"];
const authRoutes = ["/login", "/signup"];
const dashboardRedirectRoutes = ["/"];
const DASHBOARD_LANDED_COOKIE = "dash_landed";

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isAuthRoute = authRoutes.includes(path);
  const isDashboardRedirectRoute = dashboardRedirectRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthRoute && session?.userId) {
    return NextResponse.redirect(new URL("/collection", req.nextUrl));
  }

  // Signed-in visitors land on their dashboard the first time they open the
  // site in a browser session. After that first landing (tracked by a
  // session-lifetime cookie, not the Referer header -- Referer isn't sent
  // reliably for history back/forward navigation, which made both the
  // "Binder" logo link and the browser Back button feel broken/looping),
  // "/" behaves like a normal route: the catalog, its links, and the back
  // button all just work.
  if (isDashboardRedirectRoute && session?.userId && !req.cookies.get(DASHBOARD_LANDED_COOKIE)) {
    const response = NextResponse.redirect(new URL("/collection", req.nextUrl));
    response.cookies.set(DASHBOARD_LANDED_COOKIE, "1", { path: "/", sameSite: "lax" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
