import { schema, type Database } from "@shareride/db";
import { and, eq, ne } from "drizzle-orm";

const { pushTokens, sessions } = schema;

/**
 * Stores the push token of a signed-in device, or removes it (plan 4.5). A
 * token another session had moves to this one: the device has been signed
 * in again, perhaps by someone else, and must not get the old account's
 * news.
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
    const [session] = await tx
      .select({ platform: sessions.platform })
      .from(sessions)
      .where(eq(sessions.id, device.sessionId));
    if (session === undefined) return;
    await tx
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, token), ne(pushTokens.sessionId, device.sessionId)));
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
