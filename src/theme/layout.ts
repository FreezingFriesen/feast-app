import { colors } from "./colors";

// Space between and inside things, in points.
export const spacing = Object.freeze({
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
});

// Corner rounding. Cards, text boxes and buttons use md; the header and tab bar use xl.
export const radius = Object.freeze({
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
});

export const borderWidth = Object.freeze({
  thin: 1,
  thick: 2,
});

// The smallest tappable area (Apple and Android guidelines). Use hitSlop to reach it
// when the visible control is smaller.
export const MIN_TOUCH_TARGET = 44;

// The height of a text box or button.
export const CONTROL_HEIGHT = 48;

// The height of a chip. Chips get hitSlop to make up the 44-point tap area.
export const CHIP_HEIGHT = 36;

export const iconSize = Object.freeze({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
});

// Small round markers: the "meals planned" dot in the week strip, and the outlined
// meal-slot markers in the month view.
export const DOT_SIZE = 6;
export const MARKER_SIZE = 8;

// The square tiles that hold an icon (menu rows, meal cards, empty states).
export const tileSize = Object.freeze({
  md: 40,
  lg: 72,
});

// Only the header and tab bar cast shadows. List rows don't (they'd slow scrolling).
export const shadows = Object.freeze({
  header: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabBar: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  // The selected segment of a SegmentedControl.
  raised: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
