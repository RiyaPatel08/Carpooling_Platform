import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, ErrorNote } from '../components/ui';
import { registerRequest, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

export default function Signup({ navigation }: ScreenProps<'Signup'>) {
  const { signIn } = useAuth();
  const [form, setForm] = useState({
    orgCode: '', name: '', phone: '', email: '', password: '', confirmPassword: '', photoUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!form.photoUrl) delete payload.photoUrl;
      await signIn(await registerRequest(payload));
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Create Account</Text>
        <Text style={s.sub}>Join your company's carpool</Text>

        {!!error && <ErrorNote text={error} />}

        {/* Photo upload is a URL field: no image host in scope, and the
            profile picture only needs to identify a colleague at pickup. */}
        <Pressable style={s.photo}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {form.photoUrl ? 'Photo set' : 'Profile photo (optional)'}
          </Text>
        </Pressable>

        <Field
          label="Company Code"
          value={form.orgCode}
          onChangeText={set('orgCode')}
          autoCapitalize="characters"
          placeholder="ODOO"
          error={fields.orgCode}
        />
        <Field label="Name" value={form.name} onChangeText={set('name')} error={fields.name} />
        <Field
          label="Phone"
          value={form.phone}
          onChangeText={set('phone')}
          keyboardType="phone-pad"
          placeholder="9876500000"
          error={fields.phone}
        />
        <Field
          label="Email / Mobile"
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
          error={fields.email}
        />
        <Field
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          secureTextEntry
          error={fields.password}
        />
        <Field
          label="Confirm Password"
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
          secureTextEntry
          error={fields.confirmPassword}
        />
        <Field
          label="Photo URL (optional)"
          value={form.photoUrl}
          onChangeText={set('photoUrl')}
          autoCapitalize="none"
          placeholder="https://…"
          error={fields.photoUrl}
        />

        <Button title="Sign Up" onPress={submit} loading={busy} />

        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
          <Text style={s.link}>Already have an account? Login</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  sub: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
  photo: {
    height: 88, width: 88, borderRadius: radius.pill, alignSelf: 'center',
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg, padding: spacing.sm,
  },
  link: { textAlign: 'center', color: colors.primary, fontWeight: '600' },
});
