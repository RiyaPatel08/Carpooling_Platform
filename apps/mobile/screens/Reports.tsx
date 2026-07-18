import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';

interface Summary {
  totalTrips: number;
  totalDistanceKm: number;
  totalFuelCost: number;
  costPerKm: number;
  utilizationRate: number;
  co2SavedKg: number;
  activeEmployees: number;
  registeredVehicles: number;
}

interface VehicleRow {
  vehicleId: string;
  model: string;
  registrationNo: string;
  trips: number;
  distanceKm: number;
  fuelCost: number;
  costPerKm: number;
}

export default function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        api<Summary>('/reports/summary'),
        api<VehicleRow[]>('/reports/vehicles'),
      ]);
      setSummary(s);
      setVehicles(v);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load reports');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!summary) return error ? <ErrorNote text={error} /> : <Loading />;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>Reports</Text>
      <Text style={s.sub}>Your organization's travel activity.</Text>

      {/* Numbers, not charts: on a phone a stat tile reads faster than a
          plot, and these are single values with no trend to show. */}
      <View style={s.grid}>
        <Stat label="Completed Trips" value={String(summary.totalTrips)} />
        <Stat label="Distance" value={`${summary.totalDistanceKm.toFixed(0)} km`} />
        <Stat label="Fuel Cost" value={`₹${summary.totalFuelCost.toFixed(0)}`} />
        <Stat label="Cost / km" value={`₹${summary.costPerKm.toFixed(2)}`} />
        <Stat label="Seat Utilization" value={`${summary.utilizationRate.toFixed(0)}%`} />
        <Stat label="CO₂ Avoided" value={`${summary.co2SavedKg.toFixed(1)} kg`} accent />
      </View>

      <Text style={s.section}>Vehicle-wise cost</Text>
      {vehicles.filter((v) => v.trips > 0).length === 0 && (
        <Empty text="No completed trips yet." />
      )}
      {vehicles
        .filter((v) => v.trips > 0)
        .map((v) => (
          <Card key={v.vehicleId}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.model}>{v.model}</Text>
                <Text style={s.meta}>{v.registrationNo} · {v.trips} trips</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.cost}>₹{v.fuelCost.toFixed(0)}</Text>
                <Text style={s.meta}>{v.distanceKm.toFixed(0)} km</Text>
              </View>
            </View>
          </Card>
        ))}
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, accent && { color: colors.primary }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  stat: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderRadius: 12,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  model: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cost: { fontSize: 17, fontWeight: '700', color: colors.text },
});
