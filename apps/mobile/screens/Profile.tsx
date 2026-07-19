import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pickSquarePhoto, ImagePickerUnavailable } from '../lib/imagePicker';
import { Avatar, Button, Card, ErrorNote, Field } from '../components/ui';
import { api, ApiError, API_URL, type AuthUser } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

/**
 * Profile photos come back as an /uploads/... path so user rows stay small.
 * The app is the only thing that knows which host that path belongs to.
 */
export function photoSrc(photoUrl?: string | null): string | null {
  if (!photoUrl) return null;
  return photoUrl.startsWith('/') ? `${API_URL}${photoUrl}` : photoUrl;
}

export default function Profile({ navigation }: ScreenProps<'Profile'>) {
  const { user, refreshUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function pickPhoto() {
    setError(null);
    let picked;
    try {
      picked = await pickSquarePhoto();
    } catch (e) {
      if (e instanceof ImagePickerUnavailable) {
        Alert.alert(
          'Photo picker unavailable',
          'This build does not include the photo picker. Run:\n\n' +
            'pnpm --filter @syncroute/mobile add expo-image-picker\n\n' +
            'with the Expo dev server stopped, then restart the app.',
        );
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not open your photo library');
      return;
    }
    if (!picked) return;

    setUploading(true);
    try {
      const updated = await api<AuthUser>('/me/photo', {
        method: 'POST',
        body: JSON.stringify({ photo: `data:${picked.mimeType};base64,${picked.base64}` }),
      });
      await refreshUser(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not upload that photo');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const updated = await api<AuthUser>('/me', {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      await refreshUser(updated);
      Alert.alert('Profile updated');
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else setError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <View style={s.photoWrap}>
        <Pressable onPress={pickPhoto} disabled={uploading} accessibilityRole="button">
          <Avatar uri={photoSrc(user?.photoUrl)} name={user?.name} size={104} />
          <View style={s.camera}>
            <Ionicons name={uploading ? 'hourglass' : 'camera'} size={16} color="#fff" />
          </View>
        </Pressable>
        <Text style={s.photoHint}>
          {uploading ? 'Uploading…' : 'Tap to change your photo'}
        </Text>
      </View>

      {!!error && <ErrorNote text={error} />}

      <Card>
        <Field label="Name" value={name} onChangeText={setName} error={fields.name} />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          error={fields.phone}
        />
        {/* Email and organisation are identity, not preferences — changing
            them is an admin action, so they are shown read-only. */}
        <ReadOnly label="Email" value={user?.email ?? '—'} />
        <ReadOnly label="Role" value={user?.role === 'admin' ? 'Administrator' : 'Employee'} />
      </Card>

      <Button title="Save changes" icon="checkmark" onPress={save} loading={saving} />

      <Button
        title="Help & Support"
        icon="help-buoy"
        variant="secondary"
        onPress={() => navigation.navigate('Help')}
        style={{ marginTop: spacing.sm }}
      />

      <Button
        title="Sign out"
        icon="log-out"
        variant="danger"
        onPress={() =>
          Alert.alert('Sign out?', 'You will need to sign in again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ])
        }
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.readonly}>
      <Text style={s.readonlyLabel}>{label}</Text>
      <Text style={s.readonlyValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  photoWrap: { alignItems: 'center', marginVertical: spacing.lg },
  camera: {
    position: 'absolute', right: -2, bottom: -2,
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.background,
  },
  photoHint: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13 },
  readonly: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border,
  },
  readonlyLabel: { color: colors.textMuted, fontSize: 14 },
  readonlyValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
