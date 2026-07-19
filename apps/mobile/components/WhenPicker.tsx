import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './ui';
import { colors, radius, spacing } from '../theme';

/**
 * Departure date and time.
 *
 * Built out of two filtered lists rather than a free-text field or a native
 * picker, because the rule "no departure in the past" is then structural: the
 * past is simply not offered. Validating a typed date after the fact is the
 * approach that let "2020-01-01" through to the server in the first place, and
 * it puts the error a screen away from the mistake.
 *
 * Also avoids a native date-picker dependency, which on Expo needs a config
 * plugin and buys nothing here.
 */

/** How far ahead a ride can be scheduled. */
const DAYS_AHEAD = 14;
/** Time granularity. 15 minutes is what people actually agree on. */
const SLOT_MINUTES = 15;
/** Wheel geometry: one row's height and how many rows are visible at once. */
const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayLabel(d: Date): string {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Every slot from now (rounded up) to midnight, for the selected day. */
function slotsFor(day: Date): Date[] {
  const now = new Date();
  const isToday = startOfDay(day).getTime() === startOfDay(now).getTime();

  const cursor = startOfDay(day);
  if (isToday) {
    // Round up to the next slot boundary so "now" is never offered as a
    // departure that has already passed by the time the form is submitted.
    cursor.setHours(now.getHours(), now.getMinutes(), 0, 0);
    const rem = cursor.getMinutes() % SLOT_MINUTES;
    cursor.setMinutes(cursor.getMinutes() + (SLOT_MINUTES - rem), 0, 0);
  }

  const end = startOfDay(day);
  end.setDate(end.getDate() + 1);

  const out: Date[] = [];
  for (let t = new Date(cursor); t < end; t.setMinutes(t.getMinutes() + SLOT_MINUTES)) {
    out.push(new Date(t));
  }
  return out;
}

export function formatWhen(d: Date): string {
  return `${dayLabel(d)}, ${d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Sensible default: the next slot at least 30 minutes out. */
export function defaultDeparture(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30, 0, 0);
  const rem = d.getMinutes() % SLOT_MINUTES;
  if (rem) d.setMinutes(d.getMinutes() + (SLOT_MINUTES - rem));
  return d;
}

export default function WhenPicker({
  label, value, onChange, error,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => startOfDay(value));
  const [picked, setPicked] = useState(value);

  const days = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  // Today's list shrinks as the day goes on and is empty near midnight, in
  // which case there is genuinely nothing left to offer for today.
  const slots = useMemo(() => slotsFor(day), [day]);

  function confirm() {
    onChange(picked);
    setOpen(false);
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>

      <Pressable
        style={[s.field, !!error && { borderColor: colors.danger }]}
        onPress={() => {
          setPicked(value);
          setDay(startOfDay(value));
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatWhen(value)}`}
      >
        <Ionicons name="calendar" size={17} color={colors.textMuted} />
        <Text style={s.fieldText}>{formatWhen(value)}</Text>
        <Ionicons name="chevron-down" size={17} color={colors.textMuted} />
      </Pressable>

      {!!error && <Text style={s.error}>{error}</Text>}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>When are you leaving?</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <Text style={s.section}>Date</Text>
            <FlatList
              horizontal
              data={days}
              keyExtractor={(d) => d.toISOString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
              renderItem={({ item }) => {
                const on = startOfDay(item).getTime() === day.getTime();
                return (
                  <Pressable
                    onPress={() => {
                      setDay(startOfDay(item));
                      // Selecting a new day invalidates the old time — jump to
                      // its first legal slot rather than keeping a stale one.
                      const first = slotsFor(item)[0];
                      if (first) setPicked(first);
                    }}
                    style={[s.day, on && s.dayOn]}
                  >
                    <Text style={[s.dayText, on && s.dayTextOn]}>{dayLabel(item)}</Text>
                  </Pressable>
                );
              }}
            />

            <Text style={[s.section, { marginTop: spacing.md }]}>Time</Text>
            {slots.length === 0 ? (
              <Text style={s.none}>
                No departure times left today. Pick tomorrow or a later date.
              </Text>
            ) : (
              <TimeWheel slots={slots} value={picked} onChange={setPicked} />
            )}

            <Button
              title={`Set ${formatWhen(picked)}`}
              icon="checkmark"
              onPress={confirm}
              disabled={slots.length === 0}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Vertical scroll wheel, like the iOS time picker: snap-to-row, the centre
 * row is the selection. Built on FlatList's own snapping rather than a
 * picker dependency — the app already avoids native date-picker plugins for
 * the same reason (see file header), and a snapping list gets the same feel
 * for free.
 */
function TimeWheel({
  slots, value, onChange,
}: {
  slots: Date[];
  value: Date;
  onChange: (d: Date) => void;
}) {
  const listRef = useRef<FlatList<Date>>(null);
  const index = Math.max(0, slots.findIndex((d) => d.getTime() === value.getTime()));

  // Jump to the right row whenever the day changes underneath this list,
  // without animating — the sheet just opened or the date row was tapped.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  function onSettle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(i, 0), slots.length - 1);
    onChange(slots[clamped]);
  }

  return (
    <View style={s.wheelWrap}>
      <View pointerEvents="none" style={s.wheelHighlight} />
      <FlatList
        ref={listRef}
        data={slots}
        keyExtractor={(d) => d.toISOString()}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
        initialScrollIndex={index}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}
        onMomentumScrollEnd={onSettle}
        onScrollEndDrag={(e) => {
          // A slow drag with no momentum still needs to settle on a row.
          if (e.nativeEvent.velocity && Math.abs(e.nativeEvent.velocity.y) > 0.05) return;
          onSettle(e);
        }}
        renderItem={({ item }) => {
          const on = item.getTime() === value.getTime();
          return (
            <View style={s.wheelRow}>
              <Text style={[s.wheelText, on && s.wheelTextOn]}>
                {item.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 13, backgroundColor: colors.surface,
  },
  fieldText: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 13, marginTop: 5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, paddingBottom: spacing.lg,
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  section: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  day: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: 13, fontWeight: '600', color: colors.text },
  dayTextOn: { color: '#fff' },
  none: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.md },
  wheelWrap: { justifyContent: 'center' },
  wheelHighlight: {
    position: 'absolute', left: 0, right: 0, top: ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
    height: ITEM_HEIGHT, borderRadius: radius.md, backgroundColor: colors.primaryLight,
  },
  wheelRow: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 17, fontWeight: '500', color: colors.textMuted },
  wheelTextOn: { color: colors.primaryDark, fontWeight: '700', fontSize: 19 },
});
