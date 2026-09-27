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

  // The blocked side gets the same message as a mistyped code, so a block
  // never reveals itself.
  const block = await findBlockBetween(session.userId, target.id);
  if (block) {
    return {
      error:
        block.blockerId === session.userId
          ? "You've blocked this account. Unblock it below first."
          : "No account found with that code.",
    };
  }

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

// ---------- block & report (App Store guideline 1.2) ----------

async function findBlockBetween(userIdA: string, userIdB: string) {
  return prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { blockerId: true },
  });
}

// Blocking also tears down everything the two accounts share -- the
// friendship (or pending request) in either direction and any live trade
// still being negotiated -- so nothing is left that lets them reach each
// other. proposeTradeOffer already requires an ACCEPTED friendship, so
// deleting it is what keeps new trades from starting.
async function applyBlock(blockerId: string, blockedId: string) {
  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: blockerId, addresseeId: blockedId },
          { requesterId: blockedId, addresseeId: blockerId },
        ],
      },
    }),
    prisma.tradeOffer.updateMany({
      where: {
        status: "PENDING",
        OR: [
          { proposerId: blockerId, recipientId: blockedId },
          { proposerId: blockedId, recipientId: blockerId },
        ],
      },
      data: { status: "CANCELLED" },
    }),
  ]);
}

export async function blockUser(userId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (userId === session.userId) return { error: "You can't block yourself." };

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return { error: "Account not found." };

  await applyBlock(session.userId, target.id);
  revalidatePath("/settings");
  return {};
}

export async function unblockUser(userId: string): Promise<void> {
  const session = await verifySession();
  await prisma.userBlock.deleteMany({ where: { blockerId: session.userId, blockedId: userId } });
  revalidatePath("/settings");
}

const REPORT_REASONS = ["INAPPROPRIATE_NAME", "SCAM_OR_UNFAIR_TRADE", "HARASSMENT_OR_SPAM", "OTHER"] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number];
const MAX_REPORT_DETAILS = 1000;

export async function reportUser(input: {
  userId: string;
  reason: string;
  details?: string;
  alsoBlock: boolean;
}): Promise<{ error?: string }> {
  const session = await verifySession();
  if (input.userId === session.userId) return { error: "You can't report yourself." };
  if (!REPORT_REASONS.includes(input.reason as ReportReasonValue)) return { error: "Pick a reason." };

  const details = input.details?.trim().slice(0, MAX_REPORT_DETAILS) || null;
  if (input.reason === "OTHER" && !details) return { error: "Tell us a little about what happened." };

  const target = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!target) return { error: "Account not found." };

  await prisma.userReport.create({
    data: {
      reporterId: session.userId,
      reportedId: target.id,
      reason: input.reason as ReportReasonValue,
      details,
    },
  });
  if (input.alsoBlock) await applyBlock(session.userId, target.id);

  revalidatePath("/settings");
  return {};
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

export type BlockedSummary = { userId: string; name: string | null; email: string };

export type FriendsData = {
  code: string | null;
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
  blocked: BlockedSummary[];
};

// Single read used by app/settings/page.tsx to hydrate FriendsSection --
// follows the page's existing pattern of doing its own prisma reads
// server-side rather than a dedicated "list" action.
export async function getFriendsData(userId: string): Promise<FriendsData> {
  const [user, rows, blocks] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { friendCode: true } }),
    prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        addressee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
      include: { blocked: { select: { id: true, name: true, email: true } } },
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

  const blocked = blocks.map((b) => ({ userId: b.blocked.id, name: b.blocked.name, email: b.blocked.email }));

  return { code: user?.friendCode ?? null, friends, incoming, outgoing, blocked };
}
