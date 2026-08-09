import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileSignature, ChevronLeft } from 'lucide-react';

/**
 * Big, unmissable "you still have to sign this" banner for the home screen.
 *
 * Deliberately NOT dismissible: an unsigned employment agreement is a legal gap
 * for the business, and a banner the employee can close is one they will close.
 * It disappears on its own the moment the document is signed.
 *
 * Renders nothing at all when there's nothing pending, so it costs an empty div
 * on every other day.
 */
export default function PendingDocsBanner() {
  const [docs, setDocs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.getMyPendingDocs();
        const d = res?.data || res;
        if (!cancelled && d?.ok) setDocs(d);
      } catch {
        // Never let this break the home screen — it's a nudge, not a feature.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const items = [];
  if (docs?.agreement?.pending) {
    items.push({
      key: 'agreement',
      title: 'לא חתמת על הסכם העבודה',
      sub: 'ההסכם מחכה לך — קריאה, מילוי פרטים וחתימה. לוקח דקה.',
      to: createPageUrl('MyAgreement'),
      cta: 'לקריאה וחתימה',
    });
  }
  if (docs?.form101?.pending) {
    items.push({
      key: 'form101',
      title: `לא מילאת טופס 101 לשנת ${docs.form101.tax_year}`,
      sub: docs.form101.draft
        ? 'התחלת למלא ולא סיימת — הטופס שמור כטיוטה.'
        : 'בלי טופס 101 ינוכה ממך מס בשיעור המרבי.',
      to: createPageUrl('Form101'),
      cta: docs.form101.draft ? 'להמשך המילוי' : 'למילוי הטופס',
    });
  }
  if (!items.length) return null;

  return (
    <div className="space-y-3 mb-4" dir="rtl">
      {items.map((it) => (
        <div
          key={it.key}
          className="rounded-2xl border-2 border-amber-400 bg-gradient-to-l from-amber-50 to-orange-50 p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400/25 flex items-center justify-center shrink-0">
              <FileSignature className="w-6 h-6 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-amber-950">{it.title}</h3>
              <p className="text-sm text-amber-900/80 mt-0.5">{it.sub}</p>
            </div>
          </div>
          <Link to={it.to} className="block mt-3">
            <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-11">
              {it.cta}
              <ChevronLeft className="w-4 h-4 mr-1" />
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}
