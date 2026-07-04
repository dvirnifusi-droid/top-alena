// AES-256-GCM encryption for stored mailbox app-passwords.
// Key: EMAIL_TOKEN_ENC_KEY env — 64 hex chars (32 bytes). Generate once with:
//   openssl rand -hex 32
// Stored format: <iv-hex>:<authTag-hex>:<ciphertext-hex>
import crypto from 'node:crypto';

function key(): Buffer {
  const hex = process.env.EMAIL_TOKEN_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('EMAIL_TOKEN_ENC_KEY must be 64 hex chars (openssl rand -hex 32)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  const [ivH, tagH, dataH] = stored.split(':');
  if (!ivH || !tagH || !dataH) throw new Error('bad_encrypted_token_format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivH, 'hex'));
  decipher.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
}
