import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import PlacePicker, { type Place } from '../components/PlacePicker';
import { Avatar, Button, Card, ErrorNote, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, spacing } from '../theme';
import type { TabScreenProps } from '../lib/navigation';
import { photoSrc } from './Profile';

interface SavedPlace {
  id: string;
  label: string;
  placeName: string;
  lat: number;
  lng: number;
}

/**
 * `kind` distinguishes a tab route from a stack route because they are
 * reached differently — see lib/navigation. Getting this wrong is silent:
 * the row highlights and nothing happens.
 */
const LINKS = [
  { label: 'My Profile', icon: 'person-circle', screen: 'Profile', kind: 'stack' },
  { label: 'My Trips', icon: 'list', screen: 'MyTrips', kind: 'tab' },
  { label: 'My Vehicle', icon: 'construct', screen: 'MyVehicle', kind: 'tab' },
  { label: 'Wallet', icon: 'wallet', screen: 'Wallet', kind: 'tab' },
  { label: 'Ride History', icon: 'time', screen: 'RideHistory', kind: 'stack' },
  { label: 'Reports', icon: 'bar-chart', screen: 'Reports', kind: 'stack' },
  { label: 'Help & Support', icon: 'help-buoy', screen: 'Help', kind: 'stack' },
] as const;

export default function Settings({ navigation }: TabScreenProps<'Settings'>) {
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

      <Pressable onPress={() => navigation.navigate('Profile')}>
        <Card>
          <View style={s.profile}>
            <Avatar uri={photoSrc(user?.photoUrl)} name={user?.name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{user?.name}</Text>
              <Text style={s.meta}>{user?.email}</Text>
              <Text style={s.meta}>{user?.phone}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

      <Text style={s.section}>Quick access</Text>
      <Card>
        {LINKS.map((l, i) => (
          <Pressable
            key={l.screen}
            onPress={() =>
              l.kind === 'tab'
                ? navigation.navigate(l.screen as 'MyTrips')
                : navigation.navigate(l.screen as 'Reports')
            }
            style={[s.link, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            accessibilityRole="button"
          >
            <Ionicons name={l.icon} size={19} color={colors.primary} style={{ width: 26 }} />
            <Text style={s.linkText}>{l.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 13 },
  linkText: { fontSize: 15, color: colors.text, fontWeight: '500', flex: 1 },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: spacing.md,
  },
  placeLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
});
