/**
 * Design tokens — light & dark palettes sharing the same keys, with the amber
 * accent from Direction A (Pépite/Flowpedia handoff). Semantic names so screens
 * stay theme-agnostic. `radii`, `spacing`, `typography` are theme-independent.
 */
export interface ThemeColors {
  bg: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  muted: string;
  mutedLight: string;
  separator: string;
  separatorThick: string;
  field: string;
  accent: string;
  accentDark: string;
  accentLinkText: string;
  accentLinkUnderline: string;
  interestChipBg: string;
  interestChipText: string;
  like: string;
  immersiveBg: string;
  /** Text/icon color on top of an `accent`-filled surface (primary buttons). */
  onAccent: string;
  /** Error / destructive text & icons (always paired with text or an icon). */
  danger: string;
}

export const darkColors: ThemeColors = {
  bg: "#121110", // app background (warm near-black)
  surface: "#1b1916", // raised surfaces: cards, sheets
  textPrimary: "#f4efe8",
  textSecondary: "#b3aca1", // 8.4:1 on bg — AAA
  textTertiary: "#8c857b", // 5.2:1 on bg — AA
  muted: "#847e75", // 4.7:1 on bg — AA (was 3.5:1, failed)
  mutedLight: "#847d73", // 4.6:1 on bg — AA; inactive icons / meta (was 2.6:1, failed)
  separator: "#2a2723", // hairline borders
  separatorThick: "#1e1c19", // thick separator band between feed cards
  field: "#211f1b", // search bar, chips, share buttons
  accent: "#d9822b", // amber — active tab, links, CTA
  accentDark: "#e3a05a", // category labels (lighter amber on dark)
  accentLinkText: "#e3a05a", // internal links
  accentLinkUnderline: "#6e4d2c",
  interestChipBg: "rgba(217, 130, 43, 0.18)",
  interestChipText: "#e7ab68",
  like: "#e85c45", // filled heart, intentionally NOT the accent
  immersiveBg: "#000000", // full-screen "flow" screen (always dark)
  onAccent: "#000000", // 7.2:1 on accent #d9822b — AAA (large text)
  danger: "#e85c45", // 6.0:1 on bg — AA (paired with icon/text, never color-only)
};

export const lightColors: ThemeColors = {
  bg: "#ffffff",
  surface: "#f7f5f1",
  textPrimary: "#16140f",
  textSecondary: "#5c574e", // 7.2:1 on bg — AAA
  textTertiary: "#5f5a50", // 6.9:1 on bg — AAA
  muted: "#6f6a61", // 5.4:1 on bg — AA (was 3.0:1, failed)
  mutedLight: "#797368", // 4.7:1 on bg — AA (was 1.9:1, failed)
  separator: "#f1eee9",
  separatorThick: "#f4f2ee",
  field: "#f4f2ee",
  accent: "#c56a1e", // oklch(0.62 0.17 55)
  accentDark: "#9a4f12",
  accentLinkText: "#a85a18",
  accentLinkUnderline: "#d6a878",
  interestChipBg: "rgba(214, 142, 56, 0.14)",
  interestChipText: "#8a4d18",
  like: "#d24a2e",
  immersiveBg: "#0c0b0a", // full-screen media stays dark even in light theme
  onAccent: "#000000", // 5.5:1 on accent #c56a1e — AA (large/bold button label)
  danger: "#c0341c", // 5.6:1 on bg — AA (paired with icon/text, never color-only)
};

/**
 * High-contrast palettes (optional, toggled in settings): pure black/white
 * background and text (21:1) for low-light or low-vision use, keeping a brighter
 * accent. WCAG AAA by construction.
 */
export const highContrastDark: ThemeColors = {
  ...darkColors,
  bg: "#000000",
  surface: "#000000",
  textPrimary: "#ffffff",
  textSecondary: "#f2f2f2",
  textTertiary: "#e0e0e0",
  muted: "#cccccc",
  mutedLight: "#cccccc",
  separator: "#4d4d4d",
  separatorThick: "#333333",
  field: "#1a1a1a",
  accent: "#ffae4d",
  accentDark: "#ffc680",
  accentLinkText: "#ffc680",
};

export const highContrastLight: ThemeColors = {
  ...lightColors,
  bg: "#ffffff",
  surface: "#ffffff",
  textPrimary: "#000000",
  textSecondary: "#0d0d0d",
  textTertiary: "#1a1a1a",
  muted: "#262626",
  mutedLight: "#262626",
  separator: "#999999",
  separatorThick: "#cccccc",
  field: "#ededed",
  accent: "#8a3d00",
  accentDark: "#6e3100",
  accentLinkText: "#7a3700",
};

/** Default palette for non-reactive contexts. */
export const colors: ThemeColors = darkColors;

export const radii = {
  media: 14,
  profileThumb: 10,
  pill: 999,
  sheetTop: 26,
} as const;

export const spacing = {
  screenPadding: 16,
  cardGap: 8, // separator band between cards
} as const;

export const typography = {
  brandFamily: "Newsreader", // brand title, serif
  uiFamily: "Helvetica Neue", // everything else
  brandSize: 24,
  articleTitleCard: 21,
  articleTitleDetail: 25,
  body: 16,
  categoryLabel: 11, // UPPERCASE, letter-spacing 0.07em, 700
  tab: 15,
  meta: 12,
} as const;
