import React from 'react';
import { Users } from 'lucide-react';
import PlatformComingSoon from '../components/platform/PlatformComingSoon';

export default function PlatformUsers() {
  return (
    <PlatformComingSoon
      icon={Users}
      title="ניהול משתמשים"
      phase="בקרוב"
      points={[
        'כל המשתמשים בכל המסעדות במקום אחד',
        'חיפוש, תפקידים, איפוס סיסמה וחסימה',
        'לוג פעילות ו-impersonation מבוקר',
      ]}
    />
  );
}
