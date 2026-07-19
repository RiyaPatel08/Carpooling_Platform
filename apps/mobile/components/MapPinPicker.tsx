import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Button } from './ui';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import type { Place } from './PlacePicker';

/**
 * Drop-a-pin location picker, the way Uber and Rapido do it.
 *
 * The pin is fixed to the centre of the screen and the MAP moves underneath
 * it, rather than dragging a marker around. That is the convention for a
 * reason: it works one-handed, the pin is never hidden under your thumb, and
 * the target stays at the optical centre while you pan.
 *
 * The address is resolved when panning STOPS, not continuously — reverse
 * geocoding every frame would hammer the geocoder and make the label flicker.
 */
export default function MapPinPicker({
  visible, onClose, onPick, initial, title,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (p: Place) => void;
  initial?: Place | null;
  title: string;
}) {
  const [region, setRegion] = useState<Region>({
    latitude: initial?.lat ?? 23.0225,
    longitude: initial?.lng ?? 72.5714,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const [label, setLabel] = useState<string | null>(initial?.label ?? null);
  const [resolving, setResolving] = useState(false);
  const mapRef = useRef<MapView>(null);
  const seq = useRef(0);

  // Open on the user's own position when we have no better starting point —
  // most pickups are near where you are standing.
  useEffect(() => {
    if (!visible || initial) return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (!pos) return;
      const next = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    })();
  }, [visible, initial]);

  async function resolve(r: Region) {
    // Guard against out-of-order responses: a slow lookup for an earlier pan
    // must not overwrite the label for where the user actually stopped.
    const mine = ++seq.current;
    setResolving(true);
    try {
      const place = await api<Place>(`/geo/reverse?lat=${r.latitude}&lng=${r.longitude}`);
      if (mine === seq.current) setLabel(place.label);
    } catch {
      if (mine === seq.current) {
        setLabel(`Pinned location (${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)})`);
      }
    } finally {
      if (mine === seq.current) setResolving(false);
    }
  }

  async function useCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(
      () => null,
    );
    if (!pos) return;
    const next = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 500);
    void resolve(next);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            initialRegion={region}
            showsUserLocation
            showsMyLocationButton={false}
            onRegionChangeComplete={(r) => {
              setRegion(r);
              void resolve(r);
            }}
          />

          {/* Centre pin, offset up by half its height so the point — not the
              middle of the glyph — sits on the chosen coordinate. */}
          <View pointerEvents="none" style={s.pinWrap}>
            <Ionicons name="location" size={40} color={colors.primary} />
            <View style={s.pinShadow} />
          </View>

          <Pressable style={s.gps} onPress={useCurrentLocation} accessibilityLabel="Use my current location">
            <Ionicons name="locate" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={s.footer}>
          <Text style={s.label}>Selected location</Text>
          <View style={s.labelRow}>
            {resolving && <ActivityIndicator size="small" color={colors.primary} />}
            <Text style={s.labelText} numberOfLines={2}>
              {resolving ? 'Finding address…' : label ?? 'Move the map to choose a point'}
            </Text>
          </View>
          <Button
            title="Confirm location"
            icon="checkmark"
            disabled={!label || resolving}
            onPress={() => {
              if (!label) return;
              onPick({ label, lat: region.latitude, lng: region.longitude });
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  pinWrap: {
    position: 'absolute', top: '50%', left: 0, right: 0,
    alignItems: 'center', marginTop: -40,
  },
  pinShadow: {
    width: 10, height: 4, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -4,
  },
  gps: {
    position: 'absolute', right: spacing.md, bottom: spacing.md,
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
  },
  footer: {
    padding: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', marginBottom: 6,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, minHeight: 40 },
  labelText: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
});
