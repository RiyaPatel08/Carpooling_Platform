import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import MapPinPicker from './MapPinPicker';
import { api } from '../lib/api';
import { colors, radius, spacing } from '../theme';

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface SavedPlace {
  id: string;
  label: string;
  placeName: string;
  lat: number;
  lng: number;
}

/**
 * Location input with Photon autocomplete and saved-place shortcuts.
 *
 * Debounced at 350ms: firing a geocoder request per keystroke would be both
 * rude to the upstream service and visibly laggy on a phone keyboard.
 */
export default function PlacePicker({
  label, value, onChange, placeholder, error,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
  error?: string;
}) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<SavedPlace[]>('/saved-places').then(setSaved).catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    setQuery(value?.label ?? '');
  }, [value]);

  function onType(text: string) {
    setQuery(text);
    // Typing invalidates the previously chosen coordinates — otherwise a user
    // edits the text and unknowingly still submits the old location.
    onChange(null);
    setOpen(true);

    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api<Place[]>(`/geo/autocomplete?q=${encodeURIComponent(text)}`));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function pick(p: Place) {
    onChange(p);
    setQuery(p.label);
    setOpen(false);
    setResults([]);
  }

  /**
   * "Use my current location", the shortcut every ride-hailing app opens with.
   * Coordinates alone are not enough — the driver needs a name to navigate to,
   * so the fix is a reverse geocode before the place is accepted.
   */
  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocalError('Location permission denied. Search for the place instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const place = await api<Place>(
        `/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
      );
      setLocalError(null);
      pick(place);
    } catch {
      setLocalError('Could not get your location. Search for the place instead.');
    } finally {
      setLocating(false);
    }
  }

  const shortcuts = saved.filter((p) => !query || p.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={onType}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={s.inputInner}
        />
        {!!value && (
          <Pressable
            onPress={() => { onChange(null); setQuery(''); }}
            hitSlop={8}
            accessibilityLabel="Clear location"
          >
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* The two shortcuts every rider expects, right under the field. */}
      <View style={s.shortcutRow}>
        <Pressable style={s.chip} onPress={useCurrentLocation} disabled={locating} accessibilityRole="button">
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={15} color={colors.primary} />
          )}
          <Text style={s.chipText}>{locating ? 'Locating…' : 'Use my location'}</Text>
        </Pressable>
        <Pressable style={s.chip} onPress={() => setPinOpen(true)} accessibilityRole="button">
          <Ionicons name="map" size={15} color={colors.primary} />
          <Text style={s.chipText}>Pin on map</Text>
        </Pressable>
      </View>

      {!!(error || localError) && <Text style={s.error}>{error ?? localError}</Text>}

      <MapPinPicker
        visible={pinOpen}
        onClose={() => setPinOpen(false)}
        onPick={pick}
        initial={value}
        title={label}
      />

      {open && (query.trim().length < 2 ? shortcuts.length > 0 : true) && (
        <View style={s.dropdown}>
          {query.trim().length < 2 &&
            shortcuts.map((p) => (
              <Pressable
                key={p.id}
                style={s.row}
                onPress={() => pick({ label: p.placeName, lat: p.lat, lng: p.lng })}
              >
                <Text style={s.rowTitle}>{p.label}</Text>
                <Text style={s.rowSub}>{p.placeName}</Text>
              </Pressable>
            ))}

          {query.trim().length >= 2 && searching && <Text style={s.hint}>Searching…</Text>}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <Text style={s.hint}>No places found</Text>
          )}

          {/* A plain map, not a FlatList: `results` is capped at a handful of
              autocomplete hits, and this dropdown already lives inside the
              screen's own ScrollView — nesting a same-orientation
              VirtualizedList there breaks its windowing (and React Native
              warns loudly about exactly that). */}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
            {results.map((item, i) => (
              <Pressable key={`${item.lat},${item.lng},${i}`} style={s.row} onPress={() => pick(item)}>
                <Text style={s.rowTitle} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  inputInner: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  shortcutRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 11,
    borderRadius: radius.pill, backgroundColor: colors.primaryLight,
  },
  chipText: { color: colors.primaryDark, fontSize: 12.5, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginTop: 5 },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: 4,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: spacing.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, color: colors.text, fontWeight: '500' },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { padding: spacing.md, color: colors.textMuted, fontSize: 13 },
});
