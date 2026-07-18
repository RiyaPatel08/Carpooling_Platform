import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const shortcuts = saved.filter((p) => !query || p.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={query}
        onChangeText={onType}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[s.input, !!error && { borderColor: colors.danger }]}
      />
      {!!error && <Text style={s.error}>{error}</Text>}

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

          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
              <Pressable style={s.row} onPress={() => pick(item)}>
                <Text style={s.rowTitle} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
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
