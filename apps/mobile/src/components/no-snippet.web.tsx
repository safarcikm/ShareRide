import type { ReactNode } from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";

/** React Native Web writes `dataSet` as data-* attributes; React Native's types lack it. */
const nosnippet = { dataSet: { nosnippet: "" } } as unknown as ViewProps;

/**
 * Keeps what it holds out of search engines' snippets (spec 23, 3.4), such
 * as the drivers' first names among the rides leaving soon on Find.
 */
export function NoSnippet({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyle;
}) {
  return (
    <View {...nosnippet} style={style}>
      {children}
    </View>
  );
}
