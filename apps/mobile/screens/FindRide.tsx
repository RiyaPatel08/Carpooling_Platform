import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import PlacePicker, { type Place } from '../components/PlacePicker';
import { Button, Field, ErrorNote } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export default function FindRide({ navigation }: ScreenProps<'FindRide'>) {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [when, setWhen] = useState(defaultWhen());
  const [seats, setSeats] = useState('1');
  const [recurring, setRecurring] = useState(false);
  const [days, setDays] = useState<string[]>(['MO', 'TU', 'WE', 'TH', 'FR']);
  const [error, setError] = useState<string | null>(null);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  function submit() {
    if (!from || !to) {
      setError('Pick both a start and a destination from the suggestions.');
      return;
    }
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) {
      setError('Enter the date and time as YYYY-MM-DD HH:MM.');
      return;
    }
    setError(null);
    navigation.navigate('RouteConfirmation', {
      mode: 'find',
      from, to,
      date: date.toISOString(),
      seats: Number(seats) || 1,
      recurrence: recurring ? days : undefined,
    });
  }

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Find Ride</Text>

      {!!error && <ErrorNote text={error} />}

      <PlacePicker label="Start Location" value={from} onChange={setFrom} placeholder="Pick up location" />

      <Pressable onPress={swap} style={s.swap}>
        <Text style={s.swapText}>Swap ⇅</Text>
      </Pressable>

      <PlacePicker label="Destination Location" value={to} onChange={setTo} placeholder="Enter drop location" />

      <Field label="Date & Time" value={when} onChangeText={setWhen} placeholder="2026-07-18 19:00" />
      <Field label="Seats Required" value={seats} onChangeText={setSeats} keyboardType="number-pad" />

      <View style={s.switchRow}>
        <Text style={s.switchLabel}>Recurring Ride</Text>
        <Switch
          value={recurring}
          onValueChange={setRecurring}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      {recurring && (
        <View style={s.days}>
          {DAYS.map((d) => {
            const on = days.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                style={[s.day, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[s.dayText, on && { color: '#fff' }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Button title="Find Ride" onPress={submit} style={{ marginTop: spacing.md }} />
    </ScrollView>
  );
}

/** Default to the next round hour — the common "leaving soon" case. */
function defaultWhen(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  swap: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, marginBottom: spacing.sm },
  swapText: { color: colors.primary, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  switchLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  day: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  dayText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
