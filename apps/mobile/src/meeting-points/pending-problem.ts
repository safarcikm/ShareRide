import { readAppData, writeAppData } from "@/lib/app-data";

// "Something wrong here?" pressed before someone signed in (spec 2, 3.5):
// the point is kept on the device while they sign in or up, so its report
// form opens afterwards. Only the point's ID and the time, in the app's own
// storage. Keeping it forgets a booking or an offer kept before, so signing
// in goes on to the last thing chosen.

export const pendingProblemKey = "pending-problem";

/** Signing up takes a few minutes; a point kept longer ago is forgotten. */
const lifetimeMs = 60 * 60 * 1000;

export async function keepPendingProblem(meetingPointId: string, at: Date): Promise<void> {
  // The keys in pending-booking.ts and pending-offer.ts.
  await writeAppData("pending-booking", "");
  await writeAppData("pending-offer", "");
  await writeAppData(
    pendingProblemKey,
    JSON.stringify({ meetingPointId, keptAt: at.toISOString() }),
  );
}

/** The point kept within the last hour, once: taking it forgets it. */
export async function takePendingProblem(at: Date): Promise<string | null> {
  const stored = await readAppData(pendingProblemKey);
  if (stored === null || stored === "") return null;
  await writeAppData(pendingProblemKey, "");
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { meetingPointId, keptAt } = value as Record<string, unknown>;
  const age = typeof keptAt === "string" ? at.getTime() - Date.parse(keptAt) : Number.NaN;
  if (typeof meetingPointId !== "string" || !(age >= 0 && age <= lifetimeMs)) return null;
  return meetingPointId;
}
