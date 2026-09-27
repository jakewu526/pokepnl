"use server";

import { createHash, randomBytes } from "crypto";
import * as z from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { LEGAL } from "@/lib/legal";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
// A second request inside this window is silently ignored, so the form
// can't be used to flood someone's inbox.
const RESEND_COOLDOWN_MS = 60 * 1000;

export type ResetRequestState = { sent?: boolean; errors?: { email?: string[] } } | undefined;
export type ResetPasswordState = { message?: string; errors?: { password?: string[]; confirm?: string[] } } | undefined;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// APP_URL pins the origin used in emailed links. Falling back to the
// request's Host header is only safe on a trusted network: anyone can send a
// forged Host, which would put *their* domain in a real user's reset email.
async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}

const RequestSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
});

// Always answers "sent" for a well-formed email -- whether or not an
// account exists -- so the form can't be used to discover who has one.
export async function requestPasswordReset(_state: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const parsed = RequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user) return { sent: true };

  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return { sent: true };

  const greeting = `Hi${user.name ? ` ${user.name}` : ""},`;

  // Google-only accounts have no password to reset -- tell them how they
  // actually sign in rather than silently sending nothing.
  if (!user.passwordHash) {
    await sendEmail({
      to: user.email,
      subject: `Signing in to ${LEGAL.appName}`,
      text: `${greeting}\n\nSomeone asked to reset the password for this ${LEGAL.appName} account, but it doesn't use a password — it signs in with Google. Use "Continue with Google" on the login page.\n\nIf this wasn't you, you can ignore this email.`,
    });
    // Still record the request so the cooldown applies to these too.
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(randomBytes(32).toString("base64url")), expiresAt: new Date(), usedAt: new Date() },
    });
    return { sent: true };
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);

  const link = `${await appOrigin()}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: `Reset your ${LEGAL.appName} password`,
    text: `${greeting}\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
    html: `<p>${escapeHtml(greeting)}</p><p>Use this link to choose a new password. It works once and expires in 1 hour:</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email — your password won't change.</p>`,
  });

  return { sent: true };
}

// Looked up by the /reset-password page to decide between the form and an
// "expired link" message before the user types anything.
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true },
  });
  return !!row && !row.usedAt && row.expiresAt > new Date();
}

const ResetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, { error: "Password must be at least 8 characters." }),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { error: "Passwords don't match.", path: ["confirm"] });

export async function resetPassword(_state: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = ResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();

  // Claim the token and set the password in one transaction; the
  // updateMany's where-clause is what makes the token single-use even if the
  // form is submitted twice at once.
  const ok = await prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: { id: true, userId: true },
    });
    if (!row) return false;
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return false;
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
    return true;
  });

  if (!ok) return { message: "This reset link has expired or was already used. Request a new one." };
  redirect("/login?reset=1");
}
