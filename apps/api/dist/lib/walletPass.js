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
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '../db.js';
const execFileAsync = promisify(execFile);
const dbx = () => prisma;
/** Credentials live in IntegrationSecret, which is admin-gated. */
async function secret(key) {
    const row = await dbx().integrationSecret
        .findFirst({ where: { key }, select: { value: true } })
        .catch(() => null);
    return row?.value || null;
}
const APPLE_KEYS = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_PEM', 'APPLE_PASS_KEY_PEM', 'APPLE_WWDR_PEM'];
const GOOGLE_KEYS = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SA_EMAIL', 'GOOGLE_WALLET_SA_KEY'];
/** What the owner has actually set up — drives which buttons are shown. */
export async function walletAvailability() {
    const present = async (keys) => {
        const missing = [];
        for (const k of keys)
            if (!(await secret(k)))
                missing.push(k);
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
// ── Apple ──────────────────────────────────────────────────────────────────
/**
 * The pass.json Apple reads.
 *
 * storeCard is the loyalty-card layout: a strip of fields, a barcode, and a back
 * side. The barcode carries the redemption URL rather than the raw code so a
 * scan behaves identically to scanning the QR on the web card — one flow for
 * staff to learn, not two.
 */
function buildPassJson(d, passTypeId, teamId) {
    const serial = `club-${d.customerId}`;
    const fields = {
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
    }
    else {
        // With no benefit open, lead with the thing that is true rather than an
        // empty slot: who they are and where they stand.
        fields.primaryFields.push({ key: 'member', label: 'חבר מועדון', value: d.name || '' });
    }
    if (d.coins > 0) {
        fields.auxiliaryFields.push({ key: 'coins', label: 'מטבעות', value: String(d.coins) });
    }
    if (d.tier)
        fields.auxiliaryFields.push({ key: 'tier', label: 'דרגה', value: d.tier });
    fields.backFields.push({ key: 'name', label: 'על שם', value: d.name || '' }, { key: 'howto', label: 'איך מממשים', value: 'הציגו את הברקוד לצוות המסעדה.' });
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
async function signManifest(manifest, certPem, keyPem, wwdrPem) {
    const dir = await mkdtemp(join(tmpdir(), 'pkpass-'));
    try {
        const p = (n) => join(dir, n);
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
    }
    finally {
        await rm(dir, { recursive: true, force: true }).catch(() => { });
    }
}
/** A 1x1 transparent PNG. Apple refuses a pass with no icon; branding can follow. */
const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export async function buildApplePass(d) {
    const [passTypeId, teamId, certPem, keyPem, wwdrPem] = await Promise.all([
        secret('APPLE_PASS_TYPE_ID'), secret('APPLE_TEAM_ID'),
        secret('APPLE_PASS_CERT_PEM'), secret('APPLE_PASS_KEY_PEM'), secret('APPLE_WWDR_PEM'),
    ]);
    if (!passTypeId || !teamId || !certPem || !keyPem || !wwdrPem)
        return null;
    const passJson = Buffer.from(JSON.stringify(buildPassJson(d, passTypeId, teamId)), 'utf8');
    const iconPng = (await secret('APPLE_PASS_ICON_PNG'))
        ? Buffer.from(String(await secret('APPLE_PASS_ICON_PNG')), 'base64')
        : PLACEHOLDER_PNG;
    const logoPng = (await secret('APPLE_PASS_LOGO_PNG'))
        ? Buffer.from(String(await secret('APPLE_PASS_LOGO_PNG')), 'base64')
        : iconPng;
    const files = {
        'pass.json': passJson,
        'icon.png': iconPng,
        'icon@2x.png': iconPng,
        'logo.png': logoPng,
        'logo@2x.png': logoPng,
    };
    const manifest = {};
    for (const [name, buf] of Object.entries(files)) {
        manifest[name] = createHash('sha1').update(buf).digest('hex');
    }
    const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
    const signature = await signManifest(manifestBuf, certPem, keyPem, wwdrPem);
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const [name, buf] of Object.entries(files))
        zip.file(name, buf);
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
export async function buildGoogleWalletLink(d) {
    const [issuerId, saEmail, saKey, logoUrl] = await Promise.all([
        secret('GOOGLE_WALLET_ISSUER_ID'), secret('GOOGLE_WALLET_SA_EMAIL'),
        secret('GOOGLE_WALLET_SA_KEY'), secret('GOOGLE_WALLET_LOGO_URL'),
    ]);
    if (!issuerId || !saEmail || !saKey)
        return null;
    const classId = `${issuerId}.club`;
    const objectId = `${issuerId}.${d.customerId.replace(/[^a-zA-Z0-9_.-]/g, '')}`;
    const loyaltyClass = {
        id: classId,
        issuerName: d.brand,
        programName: `מועדון ${d.brand}`,
        reviewStatus: 'UNDER_REVIEW',
        hexBackgroundColor: '#A04A2E',
    };
    // Google rejects a logo entry with no URL, so it is included only when set.
    if (logoUrl) {
        loyaltyClass.programLogo = {
            sourceUri: { uri: logoUrl },
            contentDescription: { defaultValue: { language: 'he', value: d.brand } },
        };
    }
    const loyaltyObject = {
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
        textModulesData: [],
    };
    if (d.benefit) {
        loyaltyObject.textModulesData.push({ header: 'ההטבה שלך', body: d.benefit.description, id: 'benefit' });
    }
    if (d.coins > 0) {
        loyaltyObject.loyaltyPoints = { label: 'מטבעות', balance: { int: d.coins } };
    }
    if (d.tier)
        loyaltyObject.textModulesData.push({ header: 'דרגה', body: d.tier, id: 'tier' });
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({
        iss: saEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        origins: [d.redeemBaseUrl],
        payload: { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] },
    }, 
    // Service-account keys arrive with literal \n when pasted through a form.
    String(saKey).replace(/\\n/g, '\n'), { algorithm: 'RS256' });
    return `https://pay.google.com/gp/v/save/${token}`;
}
// ── certificate expiry ─────────────────────────────────────────────────────
/**
 * When the Apple certificate lapses, every customer's pass stops working on the
 * same day and nothing announces it. Reading the date out of the certificate is
 * the only way to see it coming.
 */
export async function applyCertExpiry() {
    const certPem = await secret('APPLE_PASS_CERT_PEM');
    if (!certPem)
        return { expires: null, days_left: null };
    const dir = await mkdtemp(join(tmpdir(), 'certchk-'));
    try {
        const f = join(dir, 'cert.pem');
        await writeFile(f, certPem);
        const { stdout } = await execFileAsync('openssl', ['x509', '-enddate', '-noout', '-in', f]);
        const raw = String(stdout).split('=')[1]?.trim();
        if (!raw)
            return { expires: null, days_left: null };
        const when = new Date(raw);
        if (isNaN(when.getTime()))
            return { expires: null, days_left: null };
        return {
            expires: when.toISOString(),
            days_left: Math.floor((when.getTime() - Date.now()) / 86400000),
        };
    }
    catch {
        return { expires: null, days_left: null };
    }
    finally {
        await rm(dir, { recursive: true, force: true }).catch(() => { });
    }
}
//# sourceMappingURL=walletPass.js.map