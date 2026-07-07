import React from 'react';
import { CreditCard } from 'lucide-react';
import PlatformComingSoon from '../components/platform/PlatformComingSoon';

export default function PlatformSubscriptions() {
  return (
    <PlatformComingSoon
      icon={CreditCard}
      title="ניהול מנויים וחיוב"
      phase="שלב 4 — בבנייה"
      points={[
        'מנוי וחבילה לכל מסעדה, תוקף וחידוש',
        'הכנסה חודשית חוזרת (MRR), צמיחה ו-churn',
        'אינטגרציית סליקה (Stripe / משולם) + כשלי תשלום והקפאת חשבון',
      ]}
    />
  );
}
