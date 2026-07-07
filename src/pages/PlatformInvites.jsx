import React from 'react';
import { Send } from 'lucide-react';
import PlatformComingSoon from '../components/platform/PlatformComingSoon';

export default function PlatformInvites() {
  return (
    <PlatformComingSoon
      icon={Send}
      title="הזמנות למערכת"
      phase="בקרוב"
      points={[
        'שלח הזמנה אישית לעסק חדש (SMS / מייל / וואטסאפ)',
        'קישור רישום ייעודי עם פרטים ממולאים מראש',
        'מעקב אחרי סטטוס ההזמנה עד ההצטרפות',
      ]}
    />
  );
}
