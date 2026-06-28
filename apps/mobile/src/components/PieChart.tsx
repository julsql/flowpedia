import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { ArticleChart } from "@flowpedia/shared";
import { radii, type ThemeColors } from "../theme";

const SIZE = 200;
const R = SIZE / 2;

interface PieChartCardProps {
  chart: ArticleChart;
  colors: ThemeColors;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path for a pie slice from `start`° to `end`° (clockwise from 12 o'clock). */
function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, end);
  const [x2, y2] = polar(cx, cy, r, start);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2} Z`;
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace(".", ",")} %`;
}

/**
 * Pie chart reconstructed from a Wikipedia CSS pie (an empty frame the app can't
 * render as an image). Drawn with react-native-svg from the extracted slices,
 * plus a legend.
 */
export function PieChartCard({ chart, colors }: PieChartCardProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slices = useMemo(() => {
    const sorted = [...chart.slices].sort((a, b) => b.value - a.value);
    const sum = sorted.reduce((acc, s) => acc + s.value, 0) || 1;
    let cursor = 0;
    return sorted.map((s) => {
      const start = (cursor / sum) * 360;
      cursor += s.value;
      return { ...s, start, end: (cursor / sum) * 360 };
    });
  }, [chart.slices]);

  return (
    <View style={styles.card}>
      {chart.title ? <Text style={styles.title}>{chart.title}</Text> : null}
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {slices.length === 1 || slices[0].end - slices[0].start >= 359.99 ? (
            <Circle cx={R} cy={R} r={R} fill={slices[0].color} />
          ) : (
            slices.map((s, i) => (
              <Path key={i} d={slicePath(R, R, R, s.start, s.end)} fill={s.color} />
            ))
          )}
        </Svg>
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View
            key={i}
            style={styles.legendRow}
            accessible
            accessibilityLabel={`${s.label}: ${formatPct(s.value)}`}
          >
            <View
              style={[styles.swatch, { backgroundColor: s.color }]}
              importantForAccessibility="no"
            />
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
    chartWrap: { alignItems: "center", marginBottom: 16 },
    legend: { gap: 9 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
    },
    legendLabel: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 18 },
    legendValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  });
