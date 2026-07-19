import { createHash } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db.js';
import { badRequest } from '../lib/errors.js';

/**
 * Profile photo storage.
 *
 * The DB stores a PATH, never the image. Base64-ing a photo into the
 * users.photo_url text column is the obvious shortcut and the wrong one: every
 * query that selects a user — ride search, trip listing, chat — would then drag
 * a few hundred KB per row across the wire. A ~40-character path keeps those
 * queries the size they were, and the bytes are fetched once by the image
 * loader and cached by the OS.
 *
 * ponytail: local disk, so this does not survive a container rebuild and will
 * not work across multiple API instances. Swap writeFile for an S3/MinIO put
 * and return the object URL — the column and every caller stay identical.
 */

/** Where the files live, relative to the API working directory. */
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/** Cap AFTER the client has already resized. Generous, but not unbounded. */
const MAX_BYTES = 800 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Accepts a data URI or a bare base64 payload and writes it to disk.
 * Returns the public path to store in users.photo_url.
 */
export async function saveProfilePhoto(userId: string, dataUri: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) {
    throw badRequest('Photo must be a base64 data URI', { photo: 'Unsupported image format' });
  }

  const [, mime, b64] = match;
  const ext = MIME_EXT[mime.toLowerCase()];
  // Allow-list rather than deny-list: an unknown mime is never written, so a
  // crafted "image/svg+xml" cannot land a script in a statically served dir.
  if (!ext) {
    throw badRequest('Photo must be a JPEG, PNG or WebP image', {
      photo: 'Use a JPEG, PNG or WebP image',
    });
  }

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.byteLength === 0) {
    throw badRequest('Photo appears to be empty', { photo: 'Pick an image and try again' });
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw badRequest(
      `Photo is too large (${Math.round(buffer.byteLength / 1024)} KB, limit ${MAX_BYTES / 1024} KB)`,
      { photo: 'Choose a smaller image' },
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  // Content hash in the name: re-uploading the same photo reuses the file, and
  // a changed photo gets a new URL, so caches invalidate without cache headers.
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const filename = `${userId}-${hash}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const publicPath = `/uploads/${filename}`;

  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { photoUrl: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { photoUrl: publicPath } });

  // Best-effort cleanup of the file this one replaces. Only ever touches a
  // basename inside UPLOAD_DIR, so a tampered column cannot delete elsewhere.
  const old = previous?.photoUrl;
  if (old && old.startsWith('/uploads/') && old !== publicPath) {
    await unlink(path.join(UPLOAD_DIR, path.basename(old))).catch(() => undefined);
  }

  return publicPath;
}
