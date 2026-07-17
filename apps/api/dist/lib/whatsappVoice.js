// WhatsApp voice notes — admin sends an audio note → we transcribe with
// Gemini → treat the transcript as if it was a text command.
//
// Why Gemini and not Whisper: Gemini accepts inline audio (base64 ogg/wav)
// out of the box, no separate API key, and handles Hebrew well. Same library
// we already use everywhere else.
import { invokeLLM } from './llm.js';
import { Readable } from 'node:stream';
import { uploadStreamToS3 } from './storage.js';
async function downloadTwilioMedia(mediaUrl) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token)
        throw new Error('twilio_creds_missing');
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    let currentUrl = mediaUrl;
    let currentHeaders = { Authorization: `Basic ${creds}` };
    for (let hops = 0; hops < 5; hops++) {
        const res = await fetch(currentUrl, { headers: currentHeaders, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
            const next = res.headers.get('location');
            if (!next)
                throw new Error(`media_redirect_${res.status}_no_location`);
            currentUrl = new URL(next, currentUrl).toString();
            currentHeaders = {};
            continue;
        }
        if (!res.ok)
            throw new Error(`media_fetch_${res.status}`);
        const mimeType = res.headers.get('content-type') || 'application/octet-stream';
        const buf = Buffer.from(await res.arrayBuffer());
        return { mimeType, buf };
    }
    throw new Error('media_redirect_too_many_hops');
}
// Download a WhatsApp audio note via Twilio and return the transcribed text.
// Returns '' on transcription failure so callers can fall back gracefully.
export async function transcribeWhatsAppVoice(mediaUrl) {
    // Twilio voice notes come in as audio/ogg (Opus). Gemini handles it directly,
    // but we need an internal /api/files/<key> URL for the fast-path fetcher.
    const { mimeType, buf } = await downloadTwilioMedia(mediaUrl);
    const ext = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mpeg') ? '.mp3' : mimeType.includes('wav') ? '.wav' : '.audio';
    const stream = Readable.from(buf);
    const { key } = await uploadStreamToS3(`whatsapp-voice${ext}`, mimeType, stream);
    const internalUrl = `/api/files/${key}`;
    const out = await invokeLLM({
        prompt: [
            'תמלל את ההקלטה הקולית הזו לעברית, מילה במילה.',
            'אם הדובר מערבב מילים באנגלית — השאר אותן באנגלית.',
            'החזר אך ורק את הטקסט המתומלל, בלי מטא-מידע, בלי קידומות, בלי הסברים.',
        ].join('\n'),
        fileUrls: [internalUrl],
        maxOutputTokens: 1000,
        timeoutMs: 20000,
    });
    // invokeLLM returns either parsed JSON or raw text. For audio prompts
    // without responseSchema, the return is typically a plain string.
    let text;
    if (typeof out === 'string')
        text = out;
    else if (out?.raw)
        text = String(out.raw);
    else if (out?.text)
        text = String(out.text);
    else
        text = String(out || '');
    return text.trim();
}
//# sourceMappingURL=whatsappVoice.js.map