import type { ViewProps } from "react-native";

/**
 * For a part inside something that cuts off what reaches past it, such as
 * a row in a card of rows: its keyboard focus ring is drawn inside it
 * (`focusRingCss`). React Native Web writes `dataSet` as data-*
 * attributes; React Native's types lack it.
 */
export const ringInside = { dataSet: { ring: "inside" } } as unknown as ViewProps;
