import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { decrypt, getSessionCookie } from "@/lib/session";

export const verifySession = cache(async () => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  // A cookie that decrypts is not proof the account still exists -- see
  // app/api/auth/reset/route.ts. Without this check the page renders as an
  // empty-but-signed-in dashboard and the user can never reach /login again,
  // because the proxy (which only sees the JWT) keeps redirecting away from it.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (!user) {
    redirect("/api/auth/reset");
  }

  return { isAuth: true, userId: session.userId };
});

export const getCurrentUser = cache(async () => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true },
  });
  return user;
});
