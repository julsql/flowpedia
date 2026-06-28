import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { AncestryEntry } from "@flowpedia/shared";
import { radii, type ThemeColors } from "../theme";
import { useLocale, type TranslationKey } from "../i18n";

// Generation label per ahnentafel depth (1 = parents, 2 = grandparents…).
const GEN_LABEL_KEYS: TranslationKey[] = [
  "ancestry.gen1",
  "ancestry.gen2",
  "ancestry.gen3",
  "ancestry.gen4",
];
// Generations shown before the "show more" toggle (parents + grandparents).
const DEFAULT_DEPTH = 2;

/** Ahnentafel generation of a position: ⌊log2(position)⌋ (2-3 → 1, 4-7 → 2…). */
function depthOf(position: number): number {
  return Math.floor(Math.log2(position));
}

interface AncestryProps {
  entries: AncestryEntry[];
  colors: ThemeColors;
  onLinkPress: (targetId: string) => void;
}

/**
 * The page's "ascendance" (ahnentafel) chart, shown as a compact, mobile-first
 * generational view: one row per generation (Parents, Grandparents…), each a set
 * of tappable name chips — instead of Wikipedia's huge horizontal tree table.
 */
export function Ancestry({ entries, colors, onLinkPress }: AncestryProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);

  const generations = useMemo(() => {
    const byDepth = new Map<number, AncestryEntry[]>();
    for (const e of entries) {
      const depth = depthOf(e.position);
      if (depth < 1) {
        continue; // skip position 1 (the subject themselves)
      }
      const list = byDepth.get(depth);
      if (list) {
        list.push(e);
      } else {
        byDepth.set(depth, [e]);
      }
    }
    return [...byDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, people]) => ({
        depth,
        people: people.sort((a, b) => a.position - b.position),
      }));
  }, [entries]);

  if (!generations.length) {
    return null;
  }

  const shown = expanded ? generations : generations.filter((g) => g.depth <= DEFAULT_DEPTH);
  const hasMore = generations.some((g) => g.depth > DEFAULT_DEPTH);

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t("article.ancestry")}</Text>
      {shown.map((g) => (
        <View key={g.depth} style={styles.gen}>
          <Text style={styles.genLabel}>
            {g.depth <= GEN_LABEL_KEYS.length ? t(GEN_LABEL_KEYS[g.depth - 1]) : t("ancestry.older")}
          </Text>
          <View style={styles.chips}>
            {g.people.map((p) =>
              p.targetId ? (
                <Pressable
                  key={p.position}
                  style={styles.chip}
                  onPress={() => onLinkPress(p.targetId as string)}
                  accessibilityRole="link"
                >
                  <Text style={styles.chipLink}>{p.label}</Text>
                </Pressable>
              ) : (
                <View key={p.position} style={[styles.chip, styles.chipPlain]}>
                  <Text style={styles.chipText}>{p.label}</Text>
                </View>
              ),
            )}
          </View>
        </View>
      ))}
      {hasMore ? (
        <Pressable
          style={styles.toggle}
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.toggleText}>
            {expanded ? t("article.showLess") : t("article.readMore")}
          </Text>
          <MaterialIcons
            name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
            size={18}
            color={colors.accent}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    block: {
      marginTop: 24,
      padding: 14,
      borderRadius: radii.media,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    title: { color: colors.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 12 },
    gen: { marginBottom: 12 },
    genLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
    },
    chipPlain: { opacity: 0.7 },
    chipLink: { color: colors.accentLinkText, fontSize: 14, fontWeight: "500" },
    chipText: { color: colors.textSecondary, fontSize: 14 },
    toggle: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
    toggleText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  });
