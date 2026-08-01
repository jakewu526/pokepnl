import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const protectedRoutes = ["/collection"];
const authRoutes = ["/login", "/signup"];
const dashboardRedirectRoutes = ["/"];

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

  // Signed-in visitors land on their dashboard when they open the site fresh
  // (typed URL, bookmark, new tab). In-app navigation back to "/" -- e.g. the
  // "Binder" logo or a "Browse cards" link -- carries a same-origin Referer
  // and is left alone, since "/" is still the only catalog/browse route.
  if (isDashboardRedirectRoute && session?.userId) {
    const referer = req.headers.get("referer");
    const isSameOriginNav = referer && new URL(referer).origin === req.nextUrl.origin;
    if (!isSameOriginNav) {
      return NextResponse.redirect(new URL("/collection", req.nextUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
