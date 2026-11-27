import { Platform } from "react-native";

// What a part is, said to a screen reader where the eye has the part's
// place to go by: at which end of a ticket a time stands, or that the
// person in its foot is the driver (spec 31, 3.20).

/**
 * For the view around such a part. The web names a group, which a screen
 * reader says on coming into it. A phone's screen reader reads no name of
 * a view it does not stop at, so there the part's own text says it
 * (`spokenAs`).
 */
export function namedGroup(name: string | undefined): object {
  return Platform.OS === "web" && name !== undefined ? { role: "group", "aria-label": name } : {};
}

/**
 * For the text of such a part, on a phone: "Get in: 10:00" for "10:00".
 * The web has the group's name, and reads no name of a plain text.
 */
export function spokenAs(name: string | undefined, text: string): object {
  return Platform.OS === "web" || name === undefined
    ? {}
    : { accessibilityLabel: `${name}: ${text}` };
}
