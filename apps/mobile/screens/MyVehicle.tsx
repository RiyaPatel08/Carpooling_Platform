import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';

interface Vehicle {
  id: string;
  model: string;
  registrationNo: string;
  seatingCapacity: number;
  mileageKmpl: number | null;
  color: string | null;
  status: 'pending' | 'approved' | 'inactive';
}

const TONE = { approved: 'green', pending: 'amber', inactive: 'grey' } as const;
const LABEL = { approved: 'Active', pending: 'Awaiting approval', inactive: 'Inactive' } as const;

export default function MyVehicle() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVehicles(await api<Vehicle[]>('/vehicles'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your vehicles');
      setVehicles([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function remove(v: Vehicle) {
    Alert.alert('Remove vehicle?', `${v.model} (${v.registrationNo})`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/vehicles/${v.id}`, { method: 'DELETE' });
            await load();
          } catch (e) {
            Alert.alert('Could not remove', e instanceof ApiError ? e.message : 'Please try again');
          }
        },
      },
    ]);
  }

  if (vehicles === null) return <Loading />;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>My Vehicle</Text>
        <Button
          title={adding ? 'Cancel' : 'Add Vehicle'}
          variant="secondary"
          onPress={() => setAdding((v) => !v)}
        />
      </View>

      {!!error && <ErrorNote text={error} />}

      {adding && <AddVehicle onDone={() => { setAdding(false); void load(); }} />}

      {vehicles.length === 0 && !adding && (
        <Empty text="No vehicles registered. Add one before offering a ride." />
      )}

      {vehicles.map((v) => (
        <Card key={v.id}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.model}>{v.model}</Text>
              <Text style={s.meta}>
                {v.registrationNo} · {v.seatingCapacity} seats
                {v.mileageKmpl ? ` · ${v.mileageKmpl} km/l` : ''}
              </Text>
            </View>
            <Badge text={LABEL[v.status]} tone={TONE[v.status]} />
          </View>

          {v.status === 'pending' && (
            <Text style={s.hint}>
              Your administrator needs to approve this before you can publish rides with it.
            </Text>
          )}

          <Button title="Remove" variant="secondary" onPress={() => remove(v)} style={{ marginTop: spacing.sm }} />
        </Card>
      ))}
    </ScrollView>
  );
}

function AddVehicle({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ model: '', registrationNo: '', seatingCapacity: '4', mileageKmpl: '', color: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const payload: Record<string, unknown> = {
        model: form.model,
        registrationNo: form.registrationNo,
        seatingCapacity: form.seatingCapacity,
      };
      if (form.mileageKmpl) payload.mileageKmpl = form.mileageKmpl;
      if (form.color) payload.color = form.color;

      await api('/vehicles', { method: 'POST', body: JSON.stringify(payload) });
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else setError('Could not add the vehicle');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={s.section}>Add Vehicle</Text>
      {!!error && <ErrorNote text={error} />}
      <Field label="Model" value={form.model} onChangeText={set('model')} placeholder="Swift Dzire" error={fields.model} />
      <Field
        label="Registration Number"
        value={form.registrationNo}
        onChangeText={set('registrationNo')}
        autoCapitalize="characters"
        placeholder="GJ01AB1234"
        error={fields.registrationNo}
      />
      <Field
        label="Seating Capacity"
        value={form.seatingCapacity}
        onChangeText={set('seatingCapacity')}
        keyboardType="number-pad"
        error={fields.seatingCapacity}
      />
      <Field
        label="Mileage (km/l, optional)"
        value={form.mileageKmpl}
        onChangeText={set('mileageKmpl')}
        keyboardType="decimal-pad"
        placeholder="18"
        error={fields.mileageKmpl}
      />
      <Field label="Colour (optional)" value={form.color} onChangeText={set('color')} error={fields.color} />
      <Button title="Add Vehicle" onPress={submit} loading={busy} />
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  model: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 13, color: colors.warning, marginTop: spacing.sm },
});
