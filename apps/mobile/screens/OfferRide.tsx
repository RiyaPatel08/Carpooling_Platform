import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PlacePicker, { type Place } from '../components/PlacePicker';
import { Button, Field, ErrorNote, Loading } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

interface Vehicle {
  id: string;
  model: string;
  registrationNo: string;
  seatingCapacity: number;
  status: 'pending' | 'approved' | 'inactive';
}

/** Twin of Find Ride, plus vehicle selection and the suggested fare. */
export default function OfferRide({ navigation }: ScreenProps<'OfferRide'>) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [when, setWhen] = useState(defaultWhen());
  const [seats, setSeats] = useState('3');
  const [fare, setFare] = useState('');
  const [suggested, setSuggested] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Vehicle[]>('/vehicles')
      .then((v) => {
        setVehicles(v);
        const approved = v.find((x) => x.status === 'approved');
        if (approved) setVehicleId(approved.id);
      })
      .catch(() => setVehicles([]));
  }, []);

  // Fare suggestion needs a route distance, so it waits until both ends are
  // chosen, then prices the trip from the org's fuel config.
  useEffect(() => {
    if (!from || !to || !vehicleId) return;
    let cancelled = false;
    (async () => {
      try {
        const route = await api<{ distanceM: number }>(
          `/geo/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`,
        );
        const s = await api<{ suggestedFarePerSeat: number }>(
          `/rides/fare-suggestion?distanceM=${route.distanceM}&vehicleId=${vehicleId}&seatsTotal=${Number(seats) || 1}`,
        );
        if (cancelled) return;
        setSuggested(s.suggestedFarePerSeat);
        // Prefill, but leave it editable — the driver decides the final fare.
        setFare((prev) => (prev === '' ? String(s.suggestedFarePerSeat) : prev));
      } catch {
        /* suggestion is a convenience; publishing must still work without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, vehicleId, seats]);

  const approved = vehicles?.filter((v) => v.status === 'approved') ?? [];

  function submit() {
    if (!vehicleId) return setError('Select an approved vehicle first.');
    if (!from || !to) return setError('Pick both a start and a destination from the suggestions.');
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return setError('Enter the date and time as YYYY-MM-DD HH:MM.');
    if (!fare || Number(fare) < 0) return setError('Enter a fare per seat.');

    setError(null);
    navigation.navigate('RouteConfirmation', {
      mode: 'offer',
      from, to,
      date: date.toISOString(),
      seats: Number(seats) || 1,
      farePerSeat: Number(fare),
      vehicleId,
    });
  }

  if (vehicles === null) return <Loading />;

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Offer Ride</Text>

      {!!error && <ErrorNote text={error} />}

      {approved.length === 0 ? (
        <View style={s.notice}>
          <Text style={s.noticeText}>
            You need an approved vehicle before you can offer a ride.
            {vehicles.length > 0 ? ' Yours is still awaiting administrator approval.' : ''}
          </Text>
          <Button
            title="Go to My Vehicle"
            variant="secondary"
            onPress={() => navigation.navigate('MyVehicle')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : (
        <>
          <Text style={s.label}>Vehicle</Text>
          <View style={s.vehicles}>
            {approved.map((v) => {
              const on = v.id === vehicleId;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setVehicleId(v.id)}
                  style={[s.vehicle, on && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                >
                  <Text style={s.vehicleModel}>{v.model}</Text>
                  <Text style={s.vehicleReg}>{v.registrationNo} · {v.seatingCapacity} seats</Text>
                </Pressable>
              );
            })}
          </View>

          <PlacePicker label="Start Location" value={from} onChange={setFrom} placeholder="Enter your location" />

          <Pressable onPress={() => { setFrom(to); setTo(from); }} style={s.swap}>
            <Text style={s.swapText}>Swap ⇅</Text>
          </Pressable>

          <PlacePicker label="Destination Location" value={to} onChange={setTo} placeholder="Enter drop location" />

          <Field label="Date & Time" value={when} onChangeText={setWhen} placeholder="2026-07-18 19:00" />
          <Field label="Available Seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          <Field label="Fare Per Seat (₹)" value={fare} onChangeText={setFare} keyboardType="decimal-pad" />

          {suggested !== null && (
            <Text style={s.hint}>
              Suggested ₹{suggested} — your fuel cost split across {Number(seats) || 1} passenger
              {(Number(seats) || 1) > 1 ? 's' : ''} and yourself.
            </Text>
          )}

          <Button title="Publish Ride" onPress={submit} style={{ marginTop: spacing.md }} />
        </>
      )}
    </ScrollView>
  );
}

function defaultWhen(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  vehicles: { gap: spacing.sm, marginBottom: spacing.md },
  vehicle: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, backgroundColor: colors.surface,
  },
  vehicleModel: { fontWeight: '700', color: colors.text, fontSize: 15 },
  vehicleReg: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  swap: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, marginBottom: spacing.sm },
  swapText: { color: colors.primary, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: -spacing.sm, marginBottom: spacing.sm },
  notice: { backgroundColor: colors.primaryLight, padding: spacing.md, borderRadius: radius.md },
  noticeText: { color: colors.primaryDark, fontSize: 14, lineHeight: 20 },
});
