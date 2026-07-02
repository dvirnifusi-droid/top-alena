import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Settings2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import ModuleToggleGrid from '../components/platform/ModuleToggleGrid';
import AiUsageCard from '../components/platform/AiUsageCard';
import { useTenantModules } from '@/hooks/useTenantModules';

function PlatformSettingsInner() {
  const { modules, loading, refresh } = useTenantModules();
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);

  const handleToggle = async (module_key, enabled) => {
    setSavingKey(module_key);
    setError(null);
    try {
      await base44.functions.updateMyTenantModule({ module_key, enabled });
      await refresh();
    } catch (e) {
      setError(e?.message || 'שגיאה בעדכון');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-slate-700 to-slate-900 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Settings2 className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">הגדרות פלטפורמה</h1>
            <p className="text-sm text-white/80 mt-1">
              בחר אילו מודולים להפעיל במסעדה שלך. מודולי ליבה תמיד פעילים ולא ניתנים לכיבוי.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      <AiUsageCard />

      {loading || !modules ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <ModuleToggleGrid modules={modules} onToggle={handleToggle} savingKey={savingKey} />
      )}

      <div className="text-xs text-slate-400 pt-4">
        השינויים נכנסים לתוקף מיד. הסייד-בר יתעדכן בטעינה הבאה של הדף (עד 5 דקות).
      </div>
    </div>
  );
}

export default function PlatformSettings() {
  return (
    <PageGuard pageName="PlatformSettings" pageTitle="הגדרות פלטפורמה">
      <PlatformSettingsInner />
    </PageGuard>
  );
}
