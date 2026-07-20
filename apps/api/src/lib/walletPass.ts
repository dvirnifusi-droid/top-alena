// The club card as a real pass in Apple Wallet and Google Wallet.
//
// This is not Apple Pay — that is payments. A Wallet pass is the same object as
// a boarding card or a supermarket loyalty card: it sits in the phone's wallet,
// carries a scannable code, can be updated remotely, and can surface on the lock
// screen when its holder is near the place it belongs to. For a restaurant that
// last property is the whole point: the card appears by itself as someone walks
// past, holding a free dessert.
//
// Both platforms need credentials the owner has to obtain, and neither can be
// faked from here:
//   Apple  — an Apple Developer account, a Pass Type ID, and the signing
//            certificate issued under it. The certificate EXPIRES ANNUALLY and
//            every customer's pass stops working the day it lapses.
//   Google — a Google Cloud service account and a Wallet issuer id.
//
// Everything degrades to "not configured" rather than throwing, so the member
// card works exactly as before until credentials exist.
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '../db.js';

const execFileAsync = promisify(execFile);
const dbx = () => prisma as any;

/** Credentials live in IntegrationSecret, which is admin-gated. */
async function secret(key: string): Promise<string | null> {
  const row: any = await dbx().integrationSecret
    .findFirst({ where: { key }, select: { value: true } })
    .catch(() => null);
  return row?.value || null;
}

/**
 * Pull a usable PEM out of whatever got pasted into the key box.
 *
 * The value lives inside a downloaded JSON file, so the natural thing a person
 * does is select a bit of that file and paste it — bringing along the
 * "private_key": label, the surrounding quotes, a neighbouring private_key_id
 * line, and a trailing comma. Signing then fails with something unhelpful about
 * PEM formatting, and the owner has no way to tell that the credential was fine
 * and only the selection was wrong.
 *
 * So this accepts the whole JSON file, a fragment of it, a quoted string, or the
 * bare PEM, and returns the key. It is the one field in the app most likely to
 * be filled by copying from a file rather than typing.
 */
export function normalizePrivateKey(raw: string): string {
  let v = String(raw || '').trim();
  if (!v) return '';

  // The entire service-account file.
  if (v.startsWith('{')) {
    try {
      const parsed = JSON.parse(v);
      if (parsed?.private_key) v = String(parsed.private_key);
    } catch { /* fall through to the text handling below */ }
  }

  // A fragment containing the labelled field, with or without escaped newlines.
  if (v.includes('private_key')) {
    const m = v.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*[,}]?/);
    if (m) v = m[1];
  }

  v = v.replace(/\\n/g, '\n').replace(/^["'\s]+|["'\s,]+$/g, '');

  // Keep only the PEM block, dropping anything that rode along beside it.
  const block = v.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/);
  if (block) v = block[0];

  return v.trim() ? `${v.trim()}\n` : '';
}

/** The service-account email, if the whole JSON file was pasted somewhere. */
export function emailFromServiceAccountJson(raw: string): string | null {
  const v = String(raw || '').trim();
  if (!v.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(v);
    return parsed?.client_email ? String(parsed.client_email) : null;
  } catch {
    return null;
  }
}

export type WalletAvailability = {
  apple: boolean;
  google: boolean;
  apple_missing: string[];
  google_missing: string[];
};

const APPLE_KEYS = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_PEM', 'APPLE_PASS_KEY_PEM', 'APPLE_WWDR_PEM'];
const GOOGLE_KEYS = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SA_EMAIL', 'GOOGLE_WALLET_SA_KEY'];

/** What the owner has actually set up — drives which buttons are shown. */
export async function walletAvailability(): Promise<WalletAvailability> {
  const present = async (keys: string[]) => {
    const missing: string[] = [];
    for (const k of keys) if (!(await secret(k))) missing.push(k);
    return missing;
  };
  const apple_missing = await present(APPLE_KEYS);
  const google_missing = await present(GOOGLE_KEYS);
  return {
    apple: apple_missing.length === 0,
    google: google_missing.length === 0,
    apple_missing,
    google_missing,
  };
}

/**
 * The restaurant's own primary colour, so a tenant's card looks like the
 * tenant's brand without anyone configuring it. Falls back to the app's
 * terracotta if the profile has no colours set.
 */
async function brandColor(): Promise<string> {
  try {
    const row: any = await dbx().restaurantProfile.findFirst({ select: { brand_colors: true } });
    const primary = row?.brand_colors?.primary;
    // Only a real hex value — a malformed one makes Google reject the class.
    if (typeof primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(primary.trim())) return primary.trim();
  } catch { /* fall through */ }
  return '#A04A2E';
}

export type PassData = {
  customerId: string;
  name: string;
  tier?: string | null;
  coins: number;
  /** The benefit the pass should advertise, if any. */
  benefit?: { description: string; code: string } | null;
  brand: string;
  /** Where the barcode points — the same redemption screen staff already use. */
  redeemBaseUrl: string;
};

// ── Apple ──────────────────────────────────────────────────────────────────

/**
 * The pass.json Apple reads.
 *
 * storeCard is the loyalty-card layout: a strip of fields, a barcode, and a back
 * side. The barcode carries the redemption URL rather than the raw code so a
 * scan behaves identically to scanning the QR on the web card — one flow for
 * staff to learn, not two.
 */
function buildPassJson(d: PassData, passTypeId: string, teamId: string): any {
  const serial = `club-${d.customerId}`;
  const fields: any = {
    headerFields: [],
    primaryFields: [],
    secondaryFields: [],
    auxiliaryFields: [],
    backFields: [],
  };

  if (d.benefit) {
    fields.primaryFields.push({
      key: 'benefit', label: 'ההטבה שלך', value: d.benefit.description,
    });
    fields.secondaryFields.push({ key: 'code', label: 'קוד', value: d.benefit.code });
  } else {
    // With no benefit open, lead with the thing that is true rather than an
    // empty slot: who they are and where they stand.
    fields.primaryFields.push({ key: 'member', label: 'חבר מועדון', value: d.name || '' });
  }

  if (d.coins > 0) {
    fields.auxiliaryFields.push({ key: 'coins', label: 'מטבעות', value: String(d.coins) });
  }
  if (d.tier) fields.auxiliaryFields.push({ key: 'tier', label: 'דרגה', value: d.tier });

  fields.backFields.push(
    { key: 'name', label: 'על שם', value: d.name || '' },
    { key: 'howto', label: 'איך מממשים', value: 'הציגו את הברקוד לצוות המסעדה.' },
  );

  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: serial,
    organizationName: d.brand,
    description: `כרטיס מועדון — ${d.brand}`,
    logoText: d.brand,
    backgroundColor: 'rgb(160, 74, 46)',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(217, 189, 131)',
    storeCard: fields,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: d.benefit
          ? `${d.redeemBaseUrl}/ClubRedeem?code=${encodeURIComponent(d.benefit.code)}`
          : `${d.redeemBaseUrl}/MemberCard`,
        messageEncoding: 'iso-8859-1',
      },
    ],
  };
}

/**
 * A .pkpass is a zip of the assets plus a manifest of their SHA-1 digests plus a
 * detached PKCS#7 signature over that manifest. Node's crypto has no CMS, so the
 * signature is produced by openssl — the documented approach, and it avoids
 * adding a dependency to sign one small file.
 */
async function signManifest(manifest: Buffer, certPem: string, keyPem: string, wwdrPem: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'pkpass-'));
  try {
    const p = (n: string) => join(dir, n);
    await writeFile(p('manifest.json'), manifest);
    await writeFile(p('cert.pem'), certPem);
    await writeFile(p('key.pem'), keyPem);
    await writeFile(p('wwdr.pem'), wwdrPem);
    await execFileAsync('openssl', [
      'smime', '-binary', '-sign',
      '-certfile', p('wwdr.pem'),
      '-signer', p('cert.pem'),
      '-inkey', p('key.pem'),
      '-in', p('manifest.json'),
      '-out', p('signature'),
      '-outform', 'DER',
      '-passin', 'pass:',
    ]);
    return await readFile(p('signature'));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** A 1x1 transparent PNG. Apple refuses a pass with no icon; branding can follow. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export async function buildApplePass(d: PassData): Promise<Buffer | null> {
  const [passTypeId, teamId, certPem, keyPem, wwdrPem] = await Promise.all([
    secret('APPLE_PASS_TYPE_ID'), secret('APPLE_TEAM_ID'),
    secret('APPLE_PASS_CERT_PEM'), secret('APPLE_PASS_KEY_PEM'), secret('APPLE_WWDR_PEM'),
  ]);
  if (!passTypeId || !teamId || !certPem || !keyPem || !wwdrPem) return null;

  const passJson = Buffer.from(JSON.stringify(buildPassJson(d, passTypeId, teamId)), 'utf8');
  const iconPng = (await secret('APPLE_PASS_ICON_PNG'))
    ? Buffer.from(String(await secret('APPLE_PASS_ICON_PNG')), 'base64')
    : PLACEHOLDER_PNG;
  const logoPng = (await secret('APPLE_PASS_LOGO_PNG'))
    ? Buffer.from(String(await secret('APPLE_PASS_LOGO_PNG')), 'base64')
    : iconPng;

  const files: Record<string, Buffer> = {
    'pass.json': passJson,
    'icon.png': iconPng,
    'icon@2x.png': iconPng,
    'logo.png': logoPng,
    'logo@2x.png': logoPng,
  };

  const manifest: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = createHash('sha1').update(buf).digest('hex');
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
  const signature = await signManifest(manifestBuf, certPem, keyPem, wwdrPem);

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [name, buf] of Object.entries(files)) zip.file(name, buf);
  zip.file('manifest.json', manifestBuf);
  zip.file('signature', signature);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Google ─────────────────────────────────────────────────────────────────

/**
 * Google takes the opposite approach: no file to sign and serve, just a JWT
 * describing the card, signed with the service account key. The phone opens the
 * link and Google builds it.
 *
 * The class definition travels inside the JWT rather than being created in
 * advance through the API. Google accepts that and creates the class on first
 * save — which removes an entire setup step for the owner, and removes the
 * failure where every save 404s against a class nobody remembered to create.
 */
export async function buildGoogleWalletLink(d: PassData): Promise<string | null> {
  const [issuerId, saEmail, saKey, logoUrl, heroUrl] = await Promise.all([
    secret('GOOGLE_WALLET_ISSUER_ID'), secret('GOOGLE_WALLET_SA_EMAIL'),
    secret('GOOGLE_WALLET_SA_KEY'), secret('GOOGLE_WALLET_LOGO_URL'),
    secret('GOOGLE_WALLET_HERO_URL'),
  ]);
  if (!issuerId || !saEmail || !saKey) return null;

  const classId = `${issuerId}.club`;
  const objectId = `${issuerId}.${d.customerId.replace(/[^a-zA-Z0-9_.-]/g, '')}`;

  const loyaltyClass: any = {
    id: classId,
    issuerName: d.brand,
    programName: `מועדון ${d.brand}`,
    reviewStatus: 'UNDER_REVIEW',
    // The restaurant's own brand colour, read from its profile rather than
    // hardcoded — every tenant gets its own card without configuring anything.
    hexBackgroundColor: await brandColor(),
  };
  // A logo is REQUIRED, not decorative: Google refuses to create a loyalty class
  // without one — "LoyaltyClass cannot be created without a program logo" — and
  // the save link then fails with nothing but "Something went wrong."
  //
  // So it always gets one. An explicitly configured URL wins; otherwise the
  // tenant's own logo, served from the tenant's own domain rather than whatever
  // host it was originally uploaded to.
  const logo = logoUrl || `${d.redeemBaseUrl}/api/wallet/logo.png`;
  loyaltyClass.programLogo = {
    sourceUri: { uri: logo },
    contentDescription: { defaultValue: { language: 'he', value: d.brand } },
  };
  if (heroUrl) {
    loyaltyClass.heroImage = {
      sourceUri: { uri: heroUrl },
      contentDescription: { defaultValue: { language: 'he', value: d.brand } },
    };
  }

  const loyaltyObject: any = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountName: d.name || '',
    accountId: d.customerId,
    barcode: {
      type: 'QR_CODE',
      value: d.benefit
        ? `${d.redeemBaseUrl}/ClubRedeem?code=${encodeURIComponent(d.benefit.code)}`
        : `${d.redeemBaseUrl}/MemberCard`,
    },
    textModulesData: [] as any[],
  };
  if (d.benefit) {
    loyaltyObject.textModulesData.push({ header: 'ההטבה שלך', body: d.benefit.description, id: 'benefit' });
  }
  if (d.coins > 0) {
    loyaltyObject.loyaltyPoints = { label: 'מטבעות', balance: { int: d.coins } };
  }
  if (d.tier) loyaltyObject.textModulesData.push({ header: 'דרגה', body: d.tier, id: 'tier' });

  const { default: jwt } = await import('jsonwebtoken');
  const token = jwt.sign(
    {
      iss: saEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [d.redeemBaseUrl],
      payload: { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] },
    },
    normalizePrivateKey(saKey),
    { algorithm: 'RS256' },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Ask Google what is actually wrong.
 *
 * The Save-to-Wallet page reduces every failure to "Something went wrong.
 * Please try again", which is true of a bad key, an unauthorised service
 * account, a missing issuer and a class that will not validate. The REST API
 * says which. Getting that answer took a hand-written script the first time;
 * this makes it a button.
 */
export async function diagnoseGoogleWallet(): Promise<{
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
}> {
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const push = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });

  const [issuerId, saEmail, rawKey] = await Promise.all([
    secret('GOOGLE_WALLET_ISSUER_ID'), secret('GOOGLE_WALLET_SA_EMAIL'), secret('GOOGLE_WALLET_SA_KEY'),
  ]);
  if (!issuerId || !saEmail || !rawKey) {
    push('הגדרות', false, 'חסרים פרטי חיבור — Issuer ID, מייל חשבון שירות או מפתח');
    return { ok: false, steps };
  }
  push('הגדרות', true, `מנפיק ${issuerId}`);

  const key = normalizePrivateKey(rawKey);
  if (!key.includes('BEGIN')) {
    push('מפתח', false, 'המפתח השמור אינו PEM תקין');
    return { ok: false, steps };
  }

  let client: any;
  try {
    const { JWT } = await import('google-auth-library');
    client = new JWT({ email: saEmail, key, scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'] });
    await client.getAccessToken();
    push('התחברות לגוגל', true, 'חשבון השירות התחבר');
  } catch (e: any) {
    push('התחברות לגוגל', false, String(e?.message || e).slice(0, 200));
    return { ok: false, steps };
  }

  const BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
  const call = async (method: string, path: string, data?: any) => {
    const res = await client.request({ url: `${BASE}${path}`, method, data, validateStatus: () => true });
    return { status: res.status, data: res.data as any };
  };
  const reason = (d: any) => d?.error?.message || JSON.stringify(d || {}).slice(0, 200);

  const issuer = await call('GET', `/issuer/${issuerId}`);
  if (issuer.status === 200) {
    push('הרשאה על המנפיק', true, `מזוהה בשם "${issuer.data?.name || ''}"`);
  } else {
    push('הרשאה על המנפיק', false,
      `${reason(issuer.data)} — בדרך כלל חסר לצרף את חשבון השירות תחת Users בקונסולת Wallet`);
    return { ok: false, steps };
  }

  const classId = `${issuerId}.club`;
  const existing = await call('GET', `/loyaltyClass/${classId}`);
  if (existing.status === 200) {
    push('כרטיס המועדון', true, 'קיים אצל גוגל ומוכן');
    return { ok: true, steps };
  }

  // Not there yet — create it, and report Google's own words if it refuses.
  const created = await call('POST', '/loyaltyClass', {
    id: classId,
    issuerName: 'club',
    programName: 'club',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: await brandColor(),
    programLogo: {
      sourceUri: { uri: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/api/wallet/logo.png` },
    },
  });
  if (created.status < 300) {
    push('כרטיס המועדון', true, 'נוצר עכשיו אצל גוגל');
    return { ok: true, steps };
  }
  push('כרטיס המועדון', false, reason(created.data));
  return { ok: false, steps };
}

// ── certificate expiry ─────────────────────────────────────────────────────

/**
 * When the Apple certificate lapses, every customer's pass stops working on the
 * same day and nothing announces it. Reading the date out of the certificate is
 * the only way to see it coming.
 */
export async function applyCertExpiry(): Promise<{ expires: string | null; days_left: number | null }> {
  const certPem = await secret('APPLE_PASS_CERT_PEM');
  if (!certPem) return { expires: null, days_left: null };
  const dir = await mkdtemp(join(tmpdir(), 'certchk-'));
  try {
    const f = join(dir, 'cert.pem');
    await writeFile(f, certPem);
    const { stdout } = await execFileAsync('openssl', ['x509', '-enddate', '-noout', '-in', f]);
    const raw = String(stdout).split('=')[1]?.trim();
    if (!raw) return { expires: null, days_left: null };
    const when = new Date(raw);
    if (isNaN(when.getTime())) return { expires: null, days_left: null };
    return {
      expires: when.toISOString(),
      days_left: Math.floor((when.getTime() - Date.now()) / 86400000),
    };
  } catch {
    return { expires: null, days_left: null };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
