// App-wide language switcher (sidebar). Switching to a non-Hebrew language
// activates the runtime translator (src/lib/appI18n.js); switching back to
// Hebrew reloads to restore the original source strings.
import React from 'react';
import { Globe } from 'lucide-react';
import { APP_LANGUAGES, getAppLanguage, setAppLanguage } from '@/lib/appI18n';

export default function AppLanguagePicker({ compact = false }) {
  const [lang, setLang] = React.useState(getAppLanguage());

  const onChange = (e) => {
    const code = e.target.value;
    setLang(code);
    setAppLanguage(code); // may reload (when going back to Hebrew)
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'p-1'}`}>
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
  );
}
