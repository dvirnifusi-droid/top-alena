import React from 'react';
import { Sparkles } from 'lucide-react';
import PlatformComingSoon from '../components/platform/PlatformComingSoon';

export default function PlatformFeatures() {
  return (
    <PlatformComingSoon
      icon={Sparkles}
      title="פיצ'רים גלובליים וחבילות"
      phase="שלב 2 — בבנייה"
      points={[
        'קטלוג גלובלי של כל הפיצ׳רים במערכת',
        'בונה חבילות (Basic / Pro / Enterprise) עם מתגי פיצ׳רים ומגבלות',
        'הקצאת חבילה לכל מסעדה + החרגות אישיות (Add-ons)',
      ]}
    />
  );
}
