import "server-only";
import { prisma } from "@/lib/prisma";

// Feeds the small dot on the floating avatar (see FloatingBinderBar) --
// plain userId-in, no verifySession(), since this is called from
// app/layout.tsx on every page including signed-out ones and /welcome,
// where verifySession()'s redirects would loop (see lib/dal.ts).
export async function hasPendingTradeActivity(userId: string): Promise<boolean> {
  const [incomingFriendRequest, incomingTradeOffer] = await Promise.all([
    prisma.friendship.findFirst({ where: { addresseeId: userId, status: "PENDING" }, select: { id: true } }),
    prisma.tradeOffer.findFirst({ where: { recipientId: userId, status: "PENDING" }, select: { id: true } }),
  ]);
  return !!incomingFriendRequest || !!incomingTradeOffer;
}
