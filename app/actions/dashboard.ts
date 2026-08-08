"use server";

import { verifySession } from "@/lib/dal";
import { getDayActivity, type DayActivity } from "@/lib/dashboard";

// Read-only -- the timeline already tells the client which dates have
// activity (hasActivity() in CollectionTimeline), but the *rows* for a date
// are only fetched on click, on demand, scoped to the caller's own session.
export async function getDayActivityAction(date: string): Promise<DayActivity> {
  const session = await verifySession();
  return getDayActivity(session.userId, date);
}
