import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PlacePicker, { type Place } from '../components/PlacePicker';
import { Button, Card, ErrorNote, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

interface SavedPlace {
  id: string;
  label: string;
  placeName: string;
  lat: number;
  lng: number;
}

const LINKS = [
  { label: 'My Trips', screen: 'MyTrips' },
  { label: 'My Vehicle', screen: 'MyVehicle' },
  { label: 'Wallet', screen: 'Wallet' },
  { label: 'Ride History', screen: 'RideHistory' },
  { label: 'Reports', screen: 'Reports' },
] as const;

export default function Settings({ navigation }: ScreenProps<'Settings'>) {
  const { user, signOut } = useAuth();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPlace, setNewPlace] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlaces(await api<SavedPlace[]>('/saved-places'));
    } catch {
      setPlaces([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function addPlace() {
    if (!newLabel.trim()) return setError('Give the place a label, like Home or Office.');
    if (!newPlace) return setError('Pick a location from the suggestions.');
    try {
      await api('/saved-places', {
        method: 'POST',
        body: JSON.stringify({
          label: newLabel.trim(),
          placeName: newPlace.label,
          lat: newPlace.lat,
          lng: newPlace.lng,
        }),
      });
      setNewLabel('');
      setNewPlace(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that place');
    }
  }

  async function removePlace(id: string) {
    try {
      await api(`/saved-places/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      /* the list reloads on next focus anyway */
    }
  }

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Settings</Text>

      <Card>
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.meta}>{user?.email}</Text>
        <Text style={s.meta}>{user?.phone}</Text>
      </Card>

      <Text style={s.section}>Quick access</Text>
      <Card>
        {LINKS.map((l, i) => (
          <Pressable
            key={l.screen}
            onPress={() => navigation.navigate(l.screen)}
            style={[s.link, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <Text style={s.linkText}>{l.label}</Text>
            <Text style={s.chevron}>›</Text>
          </Pressable>
        ))}
      </Card>

      <Text style={s.section}>Saved places</Text>
      {!!error && <ErrorNote text={error} />}

      <Card>
        {places.length === 0 && <Text style={s.meta}>Nothing saved yet.</Text>}
        {places.map((p) => (
          <View key={p.id} style={s.placeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.placeLabel}>{p.label}</Text>
              <Text style={s.meta}>{p.placeName}</Text>
            </View>
            <Pressable onPress={() => removePlace(p.id)}>
              <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card>
        <Field label="Label" value={newLabel} onChangeText={setNewLabel} placeholder="Home" />
        <PlacePicker label="Location" value={newPlace} onChange={setNewPlace} placeholder="Search a place" />
        <Button title="Save Place" onPress={addPlace} />
      </Card>

      <Button
        title="Sign out"
        variant="secondary"
        onPress={() =>
          Alert.alert('Sign out?', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ])
        }
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  linkText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  chevron: { fontSize: 22, color: colors.textMuted },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: spacing.md,
  },
  placeLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
});
