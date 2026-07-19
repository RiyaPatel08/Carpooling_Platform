import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, Button, Field, ErrorNote } from '../components/ui';
import { registerRequest, api, ApiError, type AuthUser } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pickSquarePhoto, ImagePickerUnavailable, type PickedImage } from '../lib/imagePicker';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

export default function Signup({ navigation }: ScreenProps<'Signup'>) {
  const { signIn, refreshUser } = useAuth();
  const [form, setForm] = useState({
    orgCode: '', name: '', phone: '', email: '', password: '', confirmPassword: '',
  });
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function pickPhoto() {
    setPickingPhoto(true);
    try {
      const picked = await pickSquarePhoto();
      if (picked) setPhoto(picked);
    } catch (e) {
      if (e instanceof ImagePickerUnavailable) {
        Alert.alert(
          'Photo picker unavailable',
          'This build does not include the photo picker. Run:\n\n' +
            'pnpm --filter @syncroute/mobile add expo-image-picker\n\n' +
            'with the Expo dev server stopped, then restart the app.',
        );
      } else {
        Alert.alert('Could not open your photo library', e instanceof Error ? e.message : undefined);
      }
    } finally {
      setPickingPhoto(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // The photo can only be uploaded once the account exists — there is no
      // token to authorise the upload before registration succeeds — so it
      // is a second call, right after sign-in, using the token that just
      // came back.
      const auth = await registerRequest(form);
      await signIn(auth);
      if (photo) {
        try {
          const updated = await api<AuthUser>('/me/photo', {
            method: 'POST',
            body: JSON.stringify({ photo: `data:${photo.mimeType};base64,${photo.base64}` }),
          });
          await refreshUser(updated);
        } catch {
          // The account is already created and signed in; a failed photo
          // upload is not worth blocking on. They can set it from Profile.
        }
      }
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Create Account</Text>
        <Text style={s.sub}>Join your company's carpool</Text>

        {!!error && <ErrorNote text={error} />}

        <Pressable onPress={pickPhoto} disabled={pickingPhoto} style={s.photoWrap} accessibilityRole="button">
          <Avatar uri={photo ? `data:${photo.mimeType};base64,${photo.base64}` : null} name={form.name} size={88} />
          <View style={s.camera}>
            <Ionicons name={pickingPhoto ? 'hourglass' : 'camera'} size={14} color="#fff" />
          </View>
        </Pressable>
        <Text style={s.photoHint}>{photo ? 'Tap to change photo' : 'Add a profile photo (optional)'}</Text>

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
          label="Email"
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
  photoWrap: { alignSelf: 'center' },
  camera: {
    position: 'absolute', right: -2, bottom: -2,
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: colors.background,
  },
  photoHint: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg },
  link: { textAlign: 'center', color: colors.primary, fontWeight: '600' },
});
