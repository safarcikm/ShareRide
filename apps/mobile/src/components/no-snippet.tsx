import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

/**
 * Keeps what it holds out of search engines' snippets (spec 23, 3.4): on the
 * web it is marked `data-nosnippet`; phones show it as it is.
 */
export function NoSnippet({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}) {
  return <View style={style}>{children}</View>;
}
