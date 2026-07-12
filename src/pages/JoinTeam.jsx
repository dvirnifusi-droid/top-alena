// Public self-signup page for new team members. One generic link per
// restaurant (https://<slug>.topalena.com/JoinTeam) — the owner shares it
// in the staff WhatsApp group, each employee fills their own details and
// lands in ניהול עובדים as "ממתין לאישור". No token needed: the tenant is
// identified by the subdomain the page is served from.
// Trilingual (Hebrew / English / Spanish) — many kitchens are staffed by
// non-Hebrew speakers, so the join page auto-detects the browser language and
// offers a language switcher.
import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Users } from 'lucide-react';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';

const LANGS = [
  { code: 'he', label: 'עברית', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
];

const TR = {
  join_title:    { he: 'הצטרפו לצוות {brand} 🌿', en: 'Join the {brand} team 🌿', es: 'Únete al equipo de {brand} 🌿' },
  join_subtitle: { he: 'מלא את הפרטים והמנהל יאשר אותך', en: 'Fill in your details and the manager will approve you', es: 'Completa tus datos y el gerente te aprobará' },
  full_name:     { he: 'שם מלא', en: 'Full name', es: 'Nombre completo' },
  full_name_ph:  { he: 'ישראל ישראלי', en: 'John Smith', es: 'Juan Pérez' },
  phone:         { he: 'טלפון (וואטסאפ)', en: 'Phone (WhatsApp)', es: 'Teléfono (WhatsApp)' },
  email:         { he: 'מייל', en: 'Email', es: 'Correo electrónico' },
  role:          { he: 'תפקיד', en: 'Role', es: 'Puesto' },
  submit:        { he: 'שלח בקשת הצטרפות', en: 'Send join request', es: 'Enviar solicitud' },
  required:      { he: 'כל השדות חובה', en: 'All fields are required', es: 'Todos los campos son obligatorios' },
  err_generic:   { he: 'שגיאה — נסה שוב', en: 'Something went wrong — try again', es: 'Algo salió mal — inténtalo de nuevo' },
  done_title:    { he: 'הבקשה נשלחה! 🎉', en: 'Request sent! 🎉', es: '¡Solicitud enviada! 🎉' },
  done_body:     {
    he: 'המנהל של {brand} קיבל התראה ויאשר אותך בקרוב. ברגע שתאושר — תקבל וואטסאפ עם פרטי הכניסה שלך למערכת.',
    en: "The manager at {brand} has been notified and will approve you soon. Once approved, you'll get a WhatsApp with your login details.",
    es: 'El gerente de {brand} ha sido notificado y te aprobará pronto. Una vez aprobado, recibirás un WhatsApp con tus datos de acceso.',
  },
};

const initLang = () => {
  try { const s = localStorage.getItem('topalena_lang'); if (s && LANGS.some((l) => l.code === s)) return s; } catch { /* noop */ }
  const n = ((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
  if (n.startsWith('es')) return 'es';
  if (n.startsWith('en')) return 'en';
  return 'he';
};

export default function JoinTeam() {
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  const [lang, setLang] = useState(initLang);
  const dir = LANGS.find((l) => l.code === lang)?.dir || 'rtl';
  const t = (key) => (TR[key]?.[lang] || TR[key]?.he || '').replace('{brand}', brand);
  const changeLang = (code) => { setLang(code); try { localStorage.setItem('topalena_lang', code); } catch { /* noop */ } };

  const [roles, setRoles] = useState([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    invokePublic('getJoinTeamInfo', {})
      .then((res) => setRoles((res?.data || res)?.roles || []))
      .catch(() => setRoles(['מלצר/ית', 'טבח/ית', 'ברמן/ית', 'אחמ"ש']));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim() || !role) {
      setError(t('required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await invokePublic('joinTeamRequest', {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
      });
      setDone(true);
    } catch (err) {
      setError(err?.message || t('err_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const LangSwitch = () => (
    <div className="flex items-center justify-center gap-1.5 mb-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => changeLang(l.code)}
          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
            lang === l.code ? 'bg-[#44512C] border-[#44512C] text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-[#44512C]'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );

  if (done) {
    return (
      <div dir={dir} className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <LangSwitch />
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold">{t('done_title')}</h2>
            <p className="text-sm text-slate-600">{t('done_body')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-4">
          <LangSwitch />
          <div className="text-center">
            <Users className="w-10 h-10 mx-auto text-[#44512C]" />
            <h1 className="text-2xl font-bold mt-2">{t('join_title')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('join_subtitle')}</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>{t('full_name')}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('full_name_ph')} />
            </div>
            <div>
              <Label>{t('phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" dir="ltr" className={dir === 'rtl' ? 'text-right' : 'text-left'} />
            </div>
            <div>
              <Label>{t('email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="me@gmail.com" dir="ltr" className={dir === 'rtl' ? 'text-right' : 'text-left'} />
            </div>
            <div>
              <Label>{t('role')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      role === r ? 'border-[#44512C] bg-[#F4ECD8]' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full bg-[#44512C] hover:bg-[#37421f]">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
