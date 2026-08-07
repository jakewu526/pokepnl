import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";

// Escape hatch for a session cookie that decrypts fine but points at a user
// this database doesn't have: a deleted account, a restored/switched
// database, or -- most easily hit here -- a session minted on UAT.
// (localhost:3001 and localhost:3000 share one cookie jar, so signing in on
// one environment overwrites the other's session cookie.)
//
// The proxy only sees the JWT, so it treats that cookie as signed in and
// bounces /login and /signup to /dashboard, while every DB-backed lookup
// says signed out -- leaving no way to log back in. Clearing the cookie is a
// mutation, which a Server Component can't do during render, so the ghost
// check in lib/dal.ts redirects here instead.
export async function GET(req: NextRequest) {
  await deleteSession();
  return NextResponse.redirect(new URL("/login", req.nextUrl));
}
