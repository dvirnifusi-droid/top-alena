// App-wide language switcher (sidebar). Switching to a non-Hebrew language
// activates the runtime translator (src/lib/appI18n.js); switching back to
// Hebrew reloads to restore the original source strings.
//
// Admins/owners also get a "set as default for the whole business" action:
// every staffer who hasn't picked their own language opens in that language
// (e.g. an English-speaking restaurant defaults to English automatically).
import React from 'react';
import { Globe, Check } from 'lucide-react';
import { APP_LANGUAGES, getAppLanguage, setAppLanguage, setTenantDefaultLanguage } from '@/lib/appI18n';
import { User } from '@/entities/User';

export default function AppLanguagePicker({ compact = false }) {
  const [lang, setLang] = React.useState(getAppLanguage());
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [savedDefault, setSavedDefault] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try { const me = await User.me(); setIsAdmin(me?.role === 'admin' || me?.role === 'owner'); } catch { /* staff */ }
    })();
  }, []);

  const onChange = (e) => {
    const code = e.target.value;
    setLang(code);
    setSavedDefault(false);
    setAppLanguage(code); // may reload (when going back to Hebrew)
  };

  const makeDefault = async () => {
    try {
      await setTenantDefaultLanguage(lang);
      setSavedDefault(true);
      setTimeout(() => setSavedDefault(false), 2500);
    } catch (err) { console.warn('set default language', err); }
  };

  return (
    <div className={`${compact ? '' : 'p-1'}`}>
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <select
          value={lang}
          onChange={onChange}
          aria-label="Language"
          className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:border-primary outline-none cursor-pointer"
        >
          {APP_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
          ))}
        </select>
      </div>
      {isAdmin && (
        <button
          onClick={makeDefault}
          className="mt-1 text-[11px] text-muted-foreground hover:text-primary underline decoration-dotted underline-offset-2 flex items-center gap-1"
          title="קבע את השפה הזו כברירת מחדל לכל הצוות של העסק"
        >
          {savedDefault ? <><Check className="w-3 h-3 text-green-600" /> נקבע כברירת מחדל</> : 'קבע כברירת מחדל לכל הצוות'}
        </button>
      )}
    </div>
  );
}
