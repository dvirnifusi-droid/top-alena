import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const VOICE_ID = 'nPczCjzI2devNBz1zQrb'; // Bella - reliable voice

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await req.json();
    if (!text) {
        return Response.json({ error: 'No text provided' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
        return Response.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });
    }

    const clean = text.replace(/[*_#`~]/g, '').replace(/\n+/g, ' ').trim().slice(0, 2500);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text: clean,
            model_id: 'eleven_v3',
            voice_settings: {
                stability: 0.75,
                similarity_boost: 0.85,
                style: 0.2,
                use_speaker_boost: true,
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('ElevenLabs API error:', res.status, err);
        return Response.json({ error: `ElevenLabs error: ${res.status} - ${err}` }, { status: 500 });
    }

    const audioBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return Response.json({ audio_base64: base64 });
});