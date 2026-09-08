"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { generateFriendCode, normalizeFriendCode } from "@/lib/friend-code";

const MAX_CODE_ATTEMPTS = 5;

// Friends exist for exactly one reason: knowing which two accounts are
// allowed to open a live trade with each other. No messaging, no activity
// feed -- see app/actions/trades.ts for what friendship actually unlocks.

export async function getOrCreateFriendCode(): Promise<string> {
  const session = await verifySession();

  const existing = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { friendCode: true },
  });
  if (existing?.friendCode) return existing.friendCode;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateFriendCode();
    try {
      const updated = await prisma.user.update({
        where: { id: session.userId },
        data: { friendCode: code },
        select: { friendCode: true },
      });
      return updated.friendCode!;
    } catch (e) {
      const isUniqueViolation = e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === MAX_CODE_ATTEMPTS - 1) throw e;
    }
  }
  throw new Error("Could not generate a friend code.");
}

export async function sendFriendRequest(rawCode: string): Promise<{ error?: string }> {
  const session = await verifySession();
  const code = normalizeFriendCode(rawCode);
  if (!code) return { error: "Enter a friend code." };

  const target = await prisma.user.findUnique({ where: { friendCode: code }, select: { id: true } });
  if (!target) return { error: "No account found with that code." };
  if (target.id === session.userId) return { error: "That's your own code." };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: session.userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: session.userId },
      ],
    },
  });
  if (existing) {
    return { error: existing.status === "ACCEPTED" ? "You're already friends." : "A request is already pending." };
  }

  await prisma.friendship.create({
    data: { requesterId: session.userId, addresseeId: target.id },
  });
  revalidatePath("/settings");
  return {};
}

export async function acceptFriendRequest(friendshipId: string): Promise<{ error?: string }> {
  const session = await verifySession();

  const result = await prisma.friendship.updateMany({
    where: { id: friendshipId, addresseeId: session.userId, status: "PENDING" },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });
  if (result.count === 0) return { error: "Request not found." };

  revalidatePath("/settings");
  return {};
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const session = await verifySession();
  await prisma.friendship.deleteMany({
    where: { id: friendshipId, addresseeId: session.userId, status: "PENDING" },
  });
  revalidatePath("/settings");
}

export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  const session = await verifySession();
  await prisma.friendship.deleteMany({
    where: { id: friendshipId, requesterId: session.userId, status: "PENDING" },
  });
  revalidatePath("/settings");
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const session = await verifySession();
  await prisma.friendship.deleteMany({
    where: {
      id: friendshipId,
      status: "ACCEPTED",
      OR: [{ requesterId: session.userId }, { addresseeId: session.userId }],
    },
  });
  revalidatePath("/settings");
}

// Friend picker for ProposeTradeModal -- can be opened from anywhere via the
// green button overlay, so it needs its own fetch rather than relying on a
// page's server-fetched props.
export async function getAcceptedFriends(): Promise<FriendSummary[]> {
  const session = await verifySession();
  const data = await getFriendsData(session.userId);
  return data.friends;
}

export type FriendSummary = { friendshipId: string; userId: string; name: string | null; email: string };
export type FriendRequestSummary = { friendshipId: string; userId: string; name: string | null; email: string; createdAt: string };

export type FriendsData = {
  code: string | null;
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
};

// Single read used by app/settings/page.tsx to hydrate FriendsSection --
// follows the page's existing pattern of doing its own prisma reads
// server-side rather than a dedicated "list" action.
export async function getFriendsData(userId: string): Promise<FriendsData> {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { friendCode: true } }),
    prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        addressee: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const friends: FriendSummary[] = [];
  const incoming: FriendRequestSummary[] = [];
  const outgoing: FriendRequestSummary[] = [];

  for (const row of rows) {
    const isRequester = row.requesterId === userId;
    const other = isRequester ? row.addressee : row.requester;
    if (row.status === "ACCEPTED") {
      friends.push({ friendshipId: row.id, userId: other.id, name: other.name, email: other.email });
    } else if (isRequester) {
      outgoing.push({
        friendshipId: row.id,
        userId: other.id,
        name: other.name,
        email: other.email,
        createdAt: row.createdAt.toISOString(),
      });
    } else {
      incoming.push({
        friendshipId: row.id,
        userId: other.id,
        name: other.name,
        email: other.email,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  return { code: user?.friendCode ?? null, friends, incoming, outgoing };
}
