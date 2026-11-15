import { schema, type Database } from "@shareride/db";
import { and, eq, isNull, ne, or } from "drizzle-orm";

const { pushTokens, sessions } = schema;

/**
 * Stores the push token of a signed-in device, or removes it (plan 4.5). A
 * token another session had moves to this one: the device has been signed
 * in again, perhaps by someone else, and must not get the old account's
 * news. There is no proof that the caller holds the device: a token is
 * never shown, logged or sent anywhere but Expo, so only the phone itself
 * has it, and the app registers again at each start, which takes it back.
 * A new token gets a new row, so the old token's tickets go with the old
 * row and a late receipt for it can never remove the new one.
 */
export async function setPushToken(
  db: Database,
  device: { readonly userId: string; readonly sessionId: string },
  token: string | null,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (token === null) {
      await tx.delete(pushTokens).where(eq(pushTokens.sessionId, device.sessionId));
      return;
    }
    // Locked, so a sign-out at the same moment waits and then removes the
    // token, or ends the session first and nothing is stored.
    const [session] = await tx
      .select({ platform: sessions.platform })
      .from(sessions)
      .where(and(eq(sessions.id, device.sessionId), isNull(sessions.endedAt)))
      .for("share");
    if (session === undefined) return;
    await tx
      .delete(pushTokens)
      .where(
        or(
          and(eq(pushTokens.token, token), ne(pushTokens.sessionId, device.sessionId)),
          and(eq(pushTokens.sessionId, device.sessionId), ne(pushTokens.token, token)),
        ),
      );
    await tx
      .insert(pushTokens)
      .values({
        sessionId: device.sessionId,
        userId: device.userId,
        platform: session.platform,
        token,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushTokens.sessionId,
        set: { token, updatedAt: now },
      });
  });
}
