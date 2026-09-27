"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentUser } from "@/lib/dal";

const SignupSchema = z.object({
  name: z.string().trim().min(1, { error: "Name is required." }),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
});

const LoginSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Password is required." }),
});

const CompleteProfileSchema = z.object({
  name: z.string().trim().min(1, { error: "Name is required." }),
});

export type AuthFormState =
  | {
      errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validatedFields = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { name, email, password } = validatedFields.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validatedFields = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const { email, password } = validatedFields.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return user && !user.passwordHash
      ? { message: "This account uses Google sign-in. Continue with Google below." }
      : { message: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

export type DeleteAccountState = { message?: string } | undefined;

// App Store guideline 5.1.1(v): an app with sign-up must let people delete
// their account from inside the app. Every table keyed to a user already
// has onDelete: Cascade (collection, lots, transactions, watchlist, trades,
// friends, blocks, reports, eBay link), so deleting the User row is the
// whole wipe. Password accounts re-enter their password; Google accounts
// have none, so typing DELETE is the only confirmation there.
export async function deleteAccount(_state: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { message: "Type DELETE to confirm." };
  }

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (account?.passwordHash) {
    const password = String(formData.get("password") ?? "");
    if (!password || !(await verifyPassword(password, account.passwordHash))) {
      return { message: "That password isn't right." };
    }
  }

  await prisma.$transaction([
    // Other people's trade history keeps its rows (counterpartyUserId is
    // SetNull), but a live trade has no counterpartyNote to fall back on --
    // without this label the row would show a blank name.
    prisma.trade.updateMany({
      where: { counterpartyUserId: user.id, counterpartyNote: null },
      data: { counterpartyNote: "a deleted account" },
    }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  await deleteSession();
  redirect("/login?deleted=1");
}

// The one-time completion step for accounts that reached /welcome with no
// name -- a Google sign-in whose claim omitted one, or (before name became
// required above) a legacy email account. Reads the signed-in user off the
// session itself rather than trusting a hidden form field, so there's no way
// to submit a name onto someone else's account.
export async function completeProfile(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validatedFields = CompleteProfileSchema.safeParse({ name: formData.get("name") });

  if (!validatedFields.success) {
    return { errors: z.flattenError(validatedFields.error).fieldErrors };
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: validatedFields.data.name },
  });

  redirect("/dashboard");
}
