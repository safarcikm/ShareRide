import { schema, type Database } from "@shareride/db";
import { sessionRules } from "@shareride/domain";
import { hashToken, newToken } from "../../platform/crypto.ts";
import type { Device, IssuedTokens, Transaction } from "./service.ts";

const { sessions, sessionTokens } = schema;

type Executor = Database | Transaction;

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

/** A new access and refresh token for a session, stored only as hashes (ADR 0016). */
export async function issueTokens(
  executor: Executor,
  sessionId: string,
  now: Date,
): Promise<{ readonly refreshTokenId: string; readonly tokens: IssuedTokens }> {
  const accessToken = newToken("access");
  const refreshToken = newToken("refresh");
  const accessTokenExpiresAt = addSeconds(now, sessionRules.accessTokenSeconds);
  const refreshTokenExpiresAt = addSeconds(now, sessionRules.refreshTokenIdleSeconds);
  const rows = await executor
    .insert(sessionTokens)
    .values([
      {
        sessionId,
        kind: "access",
        tokenHash: hashToken(accessToken),
        expiresAt: accessTokenExpiresAt,
        createdAt: now,
        updatedAt: now,
      },
      {
        sessionId,
        kind: "refresh",
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .returning({ id: sessionTokens.id, kind: sessionTokens.kind });
  const refreshRow = rows.find((row) => row.kind === "refresh");
  if (refreshRow === undefined) throw new Error("The refresh token was not stored.");
  return {
    refreshTokenId: refreshRow.id,
    tokens: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt },
  };
}

/**
 * Starts a session on a device for an account that may sign in, after a
 * phone code or a Google or Apple sign-in (spec 1, 3.7).
 */
export async function openSession(
  executor: Executor,
  input: { readonly userId: string; readonly device: Device; readonly now: Date },
): Promise<{ readonly sessionId: string; readonly tokens: IssuedTokens }> {
  const { userId, device, now } = input;
  const [session] = await executor
    .insert(sessions)
    .values({
      userId,
      platform: device.platform,
      deviceName: device.name ?? null,
      appVersion: device.appVersion ?? null,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: sessions.id });
  if (session === undefined) throw new Error("The session was not stored.");
  const { tokens } = await issueTokens(executor, session.id, now);
  return { sessionId: session.id, tokens };
}
