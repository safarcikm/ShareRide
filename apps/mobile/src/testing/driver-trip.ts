import { fireEvent, screen } from "expo-router/testing-library";

/**
 * The spoken name of a passenger's row on a ride I drive, from its start:
 * "Jón, BSÍ bus terminal to Blönduós, 2 seats, 8,000 ISK, Confirmed" (spec
 * 31, 3.12, item 4). In English, as the screen tests are.
 */
export const passengerRow = (name: string) => new RegExp(`^${name}, .+ to .+, \\d+ seats?, `);

/**
 * Unfolds a passenger's row on a ride I drive: their profile, reporting
 * them and "Cancel booking" stand under it.
 */
export async function unfoldPassenger(name: string) {
  await fireEvent.press(await screen.findByRole("button", { name: passengerRow(name) }));
}
