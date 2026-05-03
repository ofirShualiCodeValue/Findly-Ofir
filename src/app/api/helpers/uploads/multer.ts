import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { randomUUID } from 'node:crypto';

// MVP: local filesystem storage. For production replace with S3 presigned uploads
// using @monkeytech/nodejs-core/services/aws/s3/PresignedUrl.
const LOGOS_DIR = path.resolve(process.cwd(), 'uploads', 'logos');
const AVATARS_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(LOGOS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function makeUploader(targetDir: string): multer.Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, targetDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.bin';
      cb(null, `${randomUUID()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, ALLOWED_MIME.has(file.mimetype));
    },
  });
}

export const logoUpload = makeUploader(LOGOS_DIR);
export const avatarUpload = makeUploader(AVATARS_DIR);

export function publicLogoUrl(filename: string): string {
  return `/uploads/logos/${filename}`;
}

export function publicAvatarUrl(filename: string): string {
  return `/uploads/avatars/${filename}`;
}
