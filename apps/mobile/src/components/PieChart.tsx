import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ArticleChart } from "@flowpedia/shared";
import { radii, type ThemeColors } from "../theme";

interface PieChartCardProps {
  chart: ArticleChart;
  colors: ThemeColors;
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")} %`;
}

/**
 * Chart reconstructed from a Wikipedia CSS pie (an empty frame the app can't
 * render as an image). Shown as a proportional colored bar + a legend — pure RN
 * (no native module), so it renders the same on web and native.
 */
export function PieChartCard({ chart, colors }: PieChartCardProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Largest share first, so the bar and legend read top-down.
  const slices = useMemo(
    () => [...chart.slices].sort((a, b) => b.value - a.value),
    [chart.slices],
  );

  return (
    <View style={styles.card}>
      {chart.title ? <Text style={styles.title}>{chart.title}</Text> : null}
      <View style={styles.bar}>
        {slices.map((s, i) => (
          <View key={i} style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel} numberOfLines={2}>
              {s.label}
            </Text>
            <Text style={styles.legendValue}>{formatPct(s.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginTop: 16,
      padding: 14,
      borderRadius: radii.media,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 12,
    },
    bar: {
      flexDirection: "row",
      height: 26,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 16,
      backgroundColor: colors.field,
    },
    legend: { gap: 9 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    swatch: { width: 14, height: 14, borderRadius: 4 },
    legendLabel: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 18 },
    legendValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  });
