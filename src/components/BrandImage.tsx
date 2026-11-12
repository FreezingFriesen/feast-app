import { Image } from "expo-image";
import { View } from "react-native";

// The two pieces of Alex's artwork the app shows. Both are bundled (no download), so
// they appear offline. The originals are never bundled (see docs/DESIGN_SYSTEM.md).
const ART = {
  // The orange F with yellow leaves. Decorative: screen readers skip it.
  mark: { source: require("../../assets/brand/icon-main.png"), aspectRatio: 151 / 192 },
  // The full "Feast" wordmark with the tagline. Meant for a green background.
  wordmark: { source: require("../../assets/brand/logo-main.png"), aspectRatio: 1200 / 499 },
} as const;

type BrandImageProps = {
  variant: keyof typeof ART;
  // Height in points; the width follows from the artwork's shape.
  height: number;
};

// The Feast logo or brand mark at a fixed size. The wordmark is never typed out in a font.
export function BrandImage({ variant, height }: BrandImageProps) {
  const art = ART[variant];
  const size = { height, width: height * art.aspectRatio };

  if (variant === "mark") {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={art.source} style={size} contentFit="contain" accessible={false} />
      </View>
    );
  }
  return (
    <Image
      source={art.source}
      style={size}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Feast. Stress Less. Feast More."
    />
  );
}
