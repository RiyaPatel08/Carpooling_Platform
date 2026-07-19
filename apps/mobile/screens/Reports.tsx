import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import BarChart from '../components/BarChart';
import { Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, spacing } from '../theme';

interface MonthRow {
  month: string;
  tripsAsDriver: number;
  tripsAsPassenger: number;
  distanceKm: number;
  fuelCost: number;
  maintenanceCost: number;
  earnings: number;
  fareSpent: number;
  netAmount: number;
  co2SavedKg: number;
}

const rupee = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** "2026-07" to "Jul". */
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

/**
 * Your own month, not the organization's — org-wide totals live on the admin
 * web app's Reports tab. This is what carpooling has cost or earned YOU:
 * fuel and fares come straight from your completed trips and bookings;
 * maintenance is the non-fuel share of your org's configured cost per km.
 */
export default function Reports() {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMonths(await api<MonthRow[]>('/reports/mine/monthly'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your reports');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!months) {
    return error ? (
      <View style={{ padding: spacing.md }}><ErrorNote text={error} /></View>
    ) : (
      <Loading text="Crunching your numbers…" />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
    >
      <Text style={s.title}>Reports</Text>
      <Text style={s.sub}>Your carpooling activity and cost.</Text>

      {!!error && <ErrorNote text={error} />}

      {months.length === 0 ? (
        <Empty icon="bar-chart-outline" text="No completed trips yet. Finish a trip to see your numbers." />
      ) : (
        <MonthlyBreakdown months={months} />
      )}
    </ScrollView>
  );
}

function MonthlyBreakdown({ months }: { months: MonthRow[] }) {
  const latest = months[months.length - 1];
  const trips = latest.tripsAsDriver + latest.tripsAsPassenger;

  return (
    <>
      {/* Latest month broken out, because that is the number anyone
          actually asks for. Earlier months are the trend below. */}
      <Card>
        <View style={s.monthHead}>
          <Text style={s.monthName}>
            {new Date(`${latest.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </Text>
          <Text style={s.monthTrips}>
            {trips} trip{trips === 1 ? '' : 's'} · {latest.distanceKm.toFixed(0)} km
          </Text>
        </View>

        <View style={s.grid}>
          <Stat icon="car-sport" label="Drove" value={String(latest.tripsAsDriver)} />
          <Stat icon="people" label="Rode" value={String(latest.tripsAsPassenger)} />
        </View>

        {latest.tripsAsDriver > 0 && (
          <>
            <Text style={s.groupLabel}>As driver</Text>
            <Line label="Earned from passengers" value={rupee(latest.earnings)} tone="good" />
            <Line label="Fuel cost" value={`− ${rupee(latest.fuelCost)}`} />
            <Line label="Maintenance" value={`− ${rupee(latest.maintenanceCost)}`} />
          </>
        )}
        {latest.tripsAsPassenger > 0 && (
          <>
            <Text style={s.groupLabel}>As passenger</Text>
            <Line label="Fares paid" value={`− ${rupee(latest.fareSpent)}`} />
          </>
        )}

        <View style={s.divider} />
        <Line
          label="Net this month"
          value={`${latest.netAmount >= 0 ? '+' : '− '}${rupee(latest.netAmount)}`}
          tone={latest.netAmount >= 0 ? 'good' : 'bad'}
          bold
        />

        <Text style={s.footnote}>
          Maintenance is the non-fuel share of your organization&apos;s configured cost per
          kilometre, applied to the distance you drove. Fuel and fares come straight from your
          completed trips.
        </Text>
      </Card>

      <Card>
        <Text style={s.chartTitle}>Net amount by month</Text>
        <BarChart
          data={months.map((m) => ({ label: monthLabel(m.month), values: [Math.max(0, m.netAmount)] }))}
          series={[{ label: 'Net amount', color: colors.success }]}
          formatValue={rupee}
          height={120}
        />
      </Card>

      <Card>
        <Text style={s.chartTitle}>Distance by month</Text>
        <BarChart
          data={months.map((m) => ({ label: monthLabel(m.month), values: [m.distanceKm] }))}
          series={[{ label: 'Distance', color: colors.primary }]}
          formatValue={(n) => `${n.toFixed(0)} km`}
          height={120}
        />
      </Card>

      <Card>
        <Text style={s.chartTitle}>CO₂ avoided by month</Text>
        <BarChart
          data={months.map((m) => ({ label: monthLabel(m.month), values: [m.co2SavedKg] }))}
          series={[{ label: 'kg CO₂ avoided', color: colors.success }]}
          formatValue={(n) => `${n.toFixed(1)} kg`}
          height={120}
        />
      </Card>
    </>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Line({
  label, value, tone, bold,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  bold?: boolean;
}) {
  const color = tone === 'good' ? colors.success : tone === 'bad' ? colors.danger : colors.text;
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, bold && { fontWeight: '700', color: colors.text }]}>{label}</Text>
      <Text style={[s.lineValue, { color }, bold && { fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  grid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  stat: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: 3,
  },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 19, fontWeight: '700', color: colors.text },
  groupLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 2,
  },
  monthHead: { marginBottom: spacing.sm },
  monthName: { fontSize: 17, fontWeight: '700', color: colors.text },
  monthTrips: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  lineLabel: { fontSize: 14, color: colors.textMuted },
  lineValue: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  footnote: { fontSize: 11.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
});
