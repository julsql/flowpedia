/**
 * Design tokens — Direction A "Clair & épuré" (Pépite/Flowpedia handoff).
 * Visual source of truth: design/README.md. Accent = amber (hue ~55–60 oklch).
 * Hex/rgba values (equivalents of the handoff oklch) for React Native.
 */
export const colors = {
  bg: "#ffffff",
  textPrimary: "#16140f",
  textSecondary: "#5c574e",
  textTertiary: "#6b665d",
  muted: "#9a948a",
  mutedLight: "#bdb8af",
  separator: "#f1eee9",
  separatorThick: "#f4f2ee",
  field: "#f4f2ee", // search bar, chips, share buttons
  accent: "#c56a1e", // oklch(0.62 0.17 55) — active tab, links, CTA
  accentDark: "#9a4f12", // oklch(0.5 0.15 55) — category labels
  accentLinkText: "#a85a18", // oklch(0.55 0.16 55)
  accentLinkUnderline: "#d6a878", // oklch(0.78 0.1 60)
  interestChipBg: "rgba(214, 142, 56, 0.14)", // oklch(0.7 0.18 60 / .14)
  interestChipText: "#8a4d18", // oklch(0.45 0.13 55)
  like: "#d24a2e", // oklch(0.62 0.18 28) — filled heart, intentionally NOT the accent
  immersiveBg: "#0c0b0a", // full-screen "flow" screen
} as const;

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
