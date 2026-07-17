// Google OAuth + sync routes. PUBLIC — no auth required because the user
// is in the middle of the OAuth handshake. State param carries the phone
// number so callbacks know which user is connecting.
import { buildConsentUrl, exchangeCodeForTokens, saveGoogleTokens, isGoogleConnected } from '../lib/googleSync.js';
function decodeIdTokenEmail(idToken) {
    if (!idToken)
        return undefined;
    const parts = idToken.split('.');
    if (parts.length !== 3)
        return undefined;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return payload?.email;
    }
    catch {
        return undefined;
    }
}
export const googleSyncRoutes = async (app) => {
    // Initiate OAuth — redirect to Google consent screen.
    app.get('/connect', async (req, reply) => {
        const phone = String(req.query?.phone || '').trim();
        if (!phone)
            return reply.code(400).type('text/html').send('<h2>missing ?phone= param</h2>');
        const url = buildConsentUrl(phone);
        return reply.redirect(url);
    });
    // OAuth callback — exchange code for tokens, save, show confirmation.
    app.get('/callback', async (req, reply) => {
        const code = String(req.query?.code || '');
        const phone = String(req.query?.state || '');
        const error = req.query?.error;
        if (error) {
            return reply.type('text/html; charset=utf-8').send(`<h2 style="font-family:sans-serif" dir="rtl">⚠️ דחית את הגישה (${error}). חזור לוואטסאפ ושלח "חבר גוגל" שוב כדי לנסות.</h2>`);
        }
        if (!code || !phone) {
            return reply.code(400).type('text/html').send('<h2>missing code or state</h2>');
        }
        try {
            const tokens = await exchangeCodeForTokens(code);
            const email = decodeIdTokenEmail(tokens.id_token);
            await saveGoogleTokens(phone, {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_in: tokens.expires_in,
                email,
            });
            return reply.type('text/html; charset=utf-8').send(`
        <div style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:24px;border-radius:12px;background:#f6fdf6;border:1px solid #c8e9c8;text-align:center" dir="rtl">
          <div style="font-size:48px">✅</div>
          <h2 style="margin:8px 0">חיבור Google הצליח!</h2>
          <p>החשבון <strong>${email || phone}</strong> מחובר כעת לעלינא.</p>
          <p>מעכשיו אירועים ומשימות שתוסיף בוואטסאפ יסתנכרנו אוטומטית ל-Google Calendar ול-Google Tasks. אירועים שתוסיף ביומן יגיעו אליך כתזכורות בוואטסאפ.</p>
          <p style="color:#666;font-size:14px">תוכל לסגור את החלון הזה ולחזור לוואטסאפ.</p>
        </div>
      `);
        }
        catch (e) {
            return reply.code(500).type('text/html').send(`<h2 style="color:red" dir="rtl">⚠️ שגיאה בשמירת ה-tokens: ${e?.message || 'unknown'}</h2>`);
        }
    });
    // Diagnostic — check if a phone is connected.
    app.get('/status', async (req, reply) => {
        const phone = String(req.query?.phone || '');
        if (!phone)
            return reply.code(400).send({ error: 'missing_phone' });
        const connected = await isGoogleConnected(phone);
        return { phone, connected };
    });
};
//# sourceMappingURL=googleSync.js.map