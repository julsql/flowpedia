/**
 * Design tokens — dark theme, warm near-black with the amber accent kept from
 * Direction A (Pépite/Flowpedia handoff). Visual source of truth: design/README.md.
 * Semantic token names so screens stay theme-agnostic.
 */
export const colors = {
  bg: "#121110", // app background (warm near-black)
  surface: "#1b1916", // raised surfaces: cards, sheets
  textPrimary: "#f4efe8",
  textSecondary: "#b3aca1",
  textTertiary: "#8c857b",
  muted: "#6f6962",
  mutedLight: "#6a635b", // inactive icons / meta
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
  immersiveBg: "#000000", // full-screen "flow" screen
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
