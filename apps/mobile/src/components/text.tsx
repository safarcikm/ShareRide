import type { ReactNode } from "react";
import { Text } from "react-native";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

export function Title({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return <Text style={[typography.body, { color: palette.textMuted }]}>{children}</Text>;
}
