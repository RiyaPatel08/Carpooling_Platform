/**
 * Thin wrapper over expo-image-picker.
 *
 * Loaded with require() rather than a static import so the app still bundles
 * on a machine where the native module has not been installed yet — a missing
 * static import is a hard bundler failure, which would take the whole demo
 * down over one optional screen. Everything else keeps working; only the
 * "change photo" button reports that it is unavailable.
 *
 * Install with:  pnpm --filter @syncroute/mobile add expo-image-picker
 */

export interface PickedImage {
  base64: string;
  mimeType: string;
}

interface ImagePickerModule {
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchImageLibraryAsync: (opts: Record<string, unknown>) => Promise<{
    canceled: boolean;
    assets: { base64?: string | null; mimeType?: string | null }[];
  }>;
}

function load(): ImagePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

export const imagePickerAvailable = (): boolean => load() !== null;

export class ImagePickerUnavailable extends Error {
  constructor() {
    super('Photo picker is not installed in this build.');
  }
}

/** Opens the gallery and returns a square, compressed image, or null if cancelled. */
export async function pickSquarePhoto(): Promise<PickedImage | null> {
  const picker = load();
  if (!picker) throw new ImagePickerUnavailable();

  const perm = await picker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access was denied.');

  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Square crop and 0.5 quality on device: a 4 MB camera photo becomes
    // roughly 40 KB before it ever touches the network. Compressing here
    // rather than server-side is what keeps the upload quick on venue wifi.
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.base64) return null;

  return { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}
