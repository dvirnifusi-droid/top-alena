import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import * as Icons from 'lucide-react';

const CATEGORY_LABELS = {
  core: 'ליבה',
  operations: 'תפעול',
  customer: 'לקוחות',
  ai: 'AI ואוטומציה',
  advanced: 'מתקדם',
};

const CATEGORY_ORDER = ['core', 'operations', 'customer', 'ai', 'advanced'];

function ModuleCard({ mod, onToggle, saving }) {
  const Icon = Icons[mod.icon] || Icons.Box;
  return (
    <Card className={mod.core ? 'opacity-70' : ''}>
      <CardContent className="p-4 flex items-start gap-3">
        <Icon className="w-6 h-6 text-slate-600 shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{mod.name_he}</div>
            {mod.core && <Badge variant="secondary" className="text-xs">חובה</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-1">{mod.description_he}</div>
        </div>
        <Switch
          checked={mod.enabled}
          disabled={mod.core || saving}
          onCheckedChange={(v) => onToggle(mod.key, v)}
        />
      </CardContent>
    </Card>
  );
}

export default function ModuleToggleGrid({ modules, onToggle, savingKey }) {
  if (!modules) return null;
  const byCat = {};
  for (const m of modules) {
    if (!byCat[m.category]) byCat[m.category] = [];
    byCat[m.category].push(m);
  }
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((cat) => (
        <div key={cat}>
          <h2 className="text-lg font-bold mb-2 text-slate-700">{CATEGORY_LABELS[cat]}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byCat[cat].map((m) => (
              <ModuleCard
                key={m.key}
                mod={m}
                onToggle={onToggle}
                saving={savingKey === m.key}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
