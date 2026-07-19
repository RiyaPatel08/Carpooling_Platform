import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

/**
 * Grouped bar chart built from plain Views.
 *
 * A charting library would mean react-native-svg plus a wrapper, for a plot
 * that is fundamentally "rectangles with proportional heights". Flex does that
 * natively, renders instantly, and needs no native module — which also keeps
 * the app running in Expo Go.
 *
 * ponytail: no axes, gridlines or tooltips. If the reports screen ever needs
 * real interrogation of the data, that is the point to bring in a chart lib.
 */

export interface Series {
  label: string;
  color: string;
}

export default function BarChart({
  data, series, height = 150, formatValue,
}: {
  /** One entry per x-axis group; `values` aligns with `series` by index. */
  data: { label: string; values: number[] }[];
  series: Series[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  // Single scale across every series so bars are comparable to each other,
  // not just within their own group. Guard against an all-zero month, which
  // would otherwise divide by zero and render NaN heights.
  const max = Math.max(1, ...data.flatMap((d) => d.values));

  return (
    <View>
      <View style={[s.plot, { height }]}>
        {data.map((group) => (
          <View key={group.label} style={s.group}>
            <View style={s.bars}>
              {group.values.map((v, i) => (
                <View
                  key={series[i]?.label ?? i}
                  style={[
                    s.bar,
                    {
                      // Minimum 2px so a real-but-tiny value stays visible
                      // rather than vanishing and reading as "no data".
                      height: Math.max(2, (v / max) * (height - 22)),
                      backgroundColor: series[i]?.color ?? colors.border,
                    },
                  ]}
                  accessibilityLabel={`${group.label} ${series[i]?.label}: ${
                    formatValue ? formatValue(v) : v
                  }`}
                />
              ))}
            </View>
            <Text style={s.xLabel} numberOfLines={1}>{group.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.legend}>
        {series.map((sr) => (
          <View key={sr.label} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: sr.color }]} />
            <Text style={s.legendText}>{sr.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  group: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 9, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  xLabel: { fontSize: 10, color: colors.textMuted, marginTop: 6 },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
    marginTop: spacing.md, justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 11.5, color: colors.textMuted, fontWeight: '500' },
});
