import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, ErrorNote } from '../components/ui';
import { loginRequest, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

export default function Login({ navigation }: ScreenProps<'Login'>) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await signIn(await loginRequest(email, password));
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else {
        setError('Could not reach the server. Check that the API is running.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.brand}>Carpooling</Text>
          <Text style={s.tagline}>Ride Together, Save Together</Text>
        </View>

        <Text style={s.title}>Welcome</Text>
        <Text style={s.sub}>Login to continue</Text>

        {!!error && <ErrorNote text={error} />}

        <Field
          label="Email / Mobile"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="raj.patel@odoo.com"
          error={fields.email}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fields.password}
        />

        <Button title="Login" onPress={submit} loading={busy} />

        <View style={s.orRow}>
          <View style={s.line} />
          <Text style={s.or}>Or</Text>
          <View style={s.line} />
        </View>

        <Pressable onPress={() => navigation.navigate('Signup')}>
          <Text style={s.link}>Create New Account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.lg, paddingTop: spacing.xl * 2, backgroundColor: colors.background, flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  brand: { fontSize: 30, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  sub: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { marginHorizontal: spacing.md, color: colors.textMuted },
  link: { textAlign: 'center', color: colors.primary, fontWeight: '700', fontSize: 15 },
});
