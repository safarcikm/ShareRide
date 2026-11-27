import { Platform, Text, type TextStyle } from "react-native";

// What a part is, said to a screen reader where the eye has the part's
// place to go by: at which end of a ticket a time stands, or that the
// person in its foot is the driver (spec 31, 3.20).

/**
 * The words, before the part, on the web: a text that is heard and not
 * seen, and takes no room. A name on a view around the part would not
 * do: the screen readers of phones, VoiceOver and TalkBack, do not say a
 * group's name as they come into it. A phone's app says the words with
 * the part's own text instead (`spokenAs`).
 */
export function Heard({ says }: { readonly says: string | undefined }) {
  if (Platform.OS !== "web" || says === undefined) return null;
  return <Text style={heard}>{says}</Text>;
}

/**
 * For the text of such a part, in a phone's app: "Get in: 10:00" for
 * "10:00". The web has `Heard` before it, and reads no name of a plain
 * text.
 */
export function spokenAs(name: string | undefined, text: string): object {
  return Platform.OS === "web" || name === undefined
    ? {}
    : { accessibilityLabel: `${name}: ${text}` };
}

/** Cut to nothing where it stands, out of the layout, and not copied with what is around it. */
const heard = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  userSelect: "none",
} as unknown as TextStyle;
