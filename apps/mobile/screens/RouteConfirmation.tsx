import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Button, Card, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';
import type { Place } from '../components/PlacePicker';
import { goToTab, type ScreenProps } from '../lib/navigation';

interface Params {
  mode: 'find' | 'offer';
  from: Place;
  to: Place;
  date: string;
  seats: number;
  farePerSeat?: number;
  vehicleId?: string;
  recurrence?: string[];
}

/**
 * Shared by both flows (PS §5.2 and §5.3 both list Route Confirmation): show
 * the real road route before committing, so nobody publishes or searches a
 * corridor they did not mean.
 */
export default function RouteConfirmation({ route, navigation }: ScreenProps<'RouteConfirmation'>) {
  const p = route.params;
  const [geo, setGeo] = useState<{ distanceM: number; durationS: number; coordinates: [number, number][] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ distanceM: number; durationS: number; coordinates: [number, number][] }>(
      `/geo/route?fromLat=${p.from.lat}&fromLng=${p.from.lng}&toLat=${p.to.lat}&toLng=${p.to.lng}`,
    )
      .then(setGeo)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not calculate the route'));
  }, [p.from, p.to]);

  async function confirm() {
    if (p.mode === 'find') {
      navigation.navigate('AvailableRides', {
        from: p.from, to: p.to, date: p.date, seats: p.seats,
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api('/rides', {
        method: 'POST',
        body: JSON.stringify({
          vehicleId: p.vehicleId,
          origin: p.from,
          destination: p.to,
          departureAt: p.date,
          seatsTotal: p.seats,
          farePerSeat: p.farePerSeat,
          ...(p.recurrence ? { recurrenceRule: p.recurrence } : {}),
        }),
      });
      // Clear the Offer Ride form off the stack, then land on My Trips.
      // replace('MyTrips') silently did nothing: MyTrips is a tab route, not
      // a stack route, so publishing appeared to hang on this screen.
      navigation.popToTop();
      goToTab('MyTrips');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not publish the ride');
    } finally {
      setBusy(false);
    }
  }

  if (!geo && !error) return <Loading text="Calculating route…" />;

  // GeoJSON is [lng, lat]; react-native-maps wants {latitude, longitude}.
  const line = (geo?.coordinates ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>Route Confirmation</Text>

      {!!error && <ErrorNote text={error} />}

      {line.length > 1 && (
        <View style={s.mapBox}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            initialRegion={regionFor(p.from, p.to)}
          >
            <Polyline coordinates={line} strokeWidth={4} strokeColor={colors.primary} />
            <Marker coordinate={{ latitude: p.from.lat, longitude: p.from.lng }} title="Start" pinColor={colors.primary} />
            <Marker coordinate={{ latitude: p.to.lat, longitude: p.to.lng }} title="Destination" pinColor={colors.danger} />
          </MapView>
        </View>
      )}

      <Card>
        <Row label="Start Location" value={p.from.label} />
        <Row label="Destination" value={p.to.label} />
        <Row label="Departure" value={new Date(p.date).toLocaleString('en-IN')} />
        <Row label="Seats" value={String(p.seats)} />
        {p.farePerSeat !== undefined && <Row label="Fare per seat" value={`₹${p.farePerSeat}`} />}
        {geo && (
          <Row
            label="Distance"
            value={`${(geo.distanceM / 1000).toFixed(1)} km · about ${Math.round(geo.durationS / 60)} min`}
          />
        )}
        {p.recurrence && <Row label="Repeats" value={p.recurrence.join(', ')} />}
      </Card>

      <Button
        title={p.mode === 'find' ? 'Confirm & Find Rides' : 'Publish Ride'}
        onPress={confirm}
        loading={busy}
      />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

/** Frame both endpoints with a margin so neither sits on the map's edge. */
function regionFor(a: Place, b: Place) {
  const latitude = (a.lat + b.lat) / 2;
  const longitude = (a.lng + b.lng) / 2;
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max(Math.abs(a.lat - b.lat) * 1.6, 0.05),
    longitudeDelta: Math.max(Math.abs(a.lng - b.lng) * 1.6, 0.05),
  };
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  mapBox: { height: 280, borderRadius: 16, overflow: 'hidden', marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
