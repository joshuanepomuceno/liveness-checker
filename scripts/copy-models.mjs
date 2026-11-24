// Copies the small face-api model weights into public/models so the app
// works offline and never fetches weights from a third-party CDN.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
const dest = join(root, 'public', 'models');
const wanted = ['tiny_face_detector', 'face_landmark_68', 'face_recognition', 'face_expression'];

if (!existsSync(src)) {
  console.warn('[copy-models] face-api models not found, skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  if (wanted.some((w) => file.startsWith(`${w}_model`))) cpSync(join(src, file), join(dest, file));
}
console.log('[copy-models] models copied to public/models');
