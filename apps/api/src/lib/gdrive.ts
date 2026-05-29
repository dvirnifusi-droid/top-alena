import { JWT } from 'google-auth-library';

// Reads a Google service-account key JSON from env (GOOGLE_SERVICE_ACCOUNT_JSON)
// and returns short-lived access tokens for the Drive API (read-only).
function serviceAccount(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  // Accept either raw JSON or base64-encoded JSON (base64 avoids .env escaping issues).
  let text = raw.trim();
  if (!text.startsWith('{')) {
    try { text = Buffer.from(text, 'base64').toString('utf8'); } catch { /* keep as-is */ }
  }
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) throw new Error('invalid service account json');
  return sa;
}

export async function driveAccessToken(): Promise<string> {
  const sa = serviceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const { access_token } = await jwt.authorize();
  if (!access_token) throw new Error('failed_to_get_drive_token');
  return access_token;
}

export type DriveFile = { id: string; name: string; mimeType: string };

export async function listDriveFiles(
  folderId: string,
  token: string,
  mimeTypes: string[],
): Promise<DriveFile[]> {
  const mimeQuery = mimeTypes.map((m) => `mimeType='${m}'`).join(' or ');
  const url =
    `https://www.googleapis.com/drive/v3/files?` +
    `q='${folderId}'+in+parents+and+(${mimeQuery})+and+trashed=false` +
    `&fields=files(id,name,mimeType)&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`drive_list_${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return (data.files ?? []) as DriveFile[];
}

export async function downloadDriveFile(fileId: string, token: string): Promise<Buffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`drive_download_${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
