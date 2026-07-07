import React from 'react';
import { Layers } from 'lucide-react';
import PlatformComingSoon from '../components/platform/PlatformComingSoon';

export default function PlatformWhiteLabel() {
  return (
    <PlatformComingSoon
      icon={Layers}
      title="הגדרות White Label"
      phase="בקרוב"
      points={[
        'מיתוג ברירת מחדל לפלטפורמה (שם, לוגו, צבעים)',
        'דומיין מותאם ותבנית מייל/וואטסאפ',
        'מה מסעדה יכולה לשנות בעצמה מול מה שנעול',
      ]}
    />
  );
}
