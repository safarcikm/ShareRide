// For tests: a person's profile photo, as `PUT /v1/me/photo` leaves it
// (ADR 0033), without sending a file.
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { newProfilePhotoKey } from "../../platform/photo-storage.ts";
import type { TestApi } from "../../testing.ts";

/**
 * Gives the person a photo, one ShareRide hid with `hiddenAt`, and the
 * link the test API's photo storage gives for it.
 */
export async function givePhoto(
  api: TestApi,
  userId: string,
  hiddenAt: Date | null = null,
): Promise<string> {
  const photoKey = newProfilePhotoKey();
  await api.connection.db
    .update(schema.users)
    .set({ photoKey, photoHiddenAt: hiddenAt })
    .where(eq(schema.users.id, userId));
  return api.photos.linkTo(photoKey, api.now());
}
