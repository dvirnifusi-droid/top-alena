import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plug, Check, Unplug, ExternalLink, Save, RefreshCw, HelpCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageGuard from '../components/shared/PageGuard';

function IntegrationCard({ integration, onSave, onDisconnect, savingKeys }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({});
  const Icon = Icons[integration.icon] || Icons.Plug;

  const handleDraft = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const handleSave = async () => {
    const entries = Object.entries(draft).filter(([, v]) => v && String(v).trim());
    if (!entries.length) return;
    await onSave(entries);
    setDraft({});
    setExpanded(false);
  };

  const externalPage = integration.external_page;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className="w-6 h-6 text-slate-600 shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-semibold">{integration.name_he}</div>
              {integration.connected ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1">
                  <Check className="w-3 h-3" /> מחובר
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">לא מחובר</Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">{integration.description_he}</div>
          </div>
          {externalPage ? (
            <Link to={createPageUrl(externalPage)}>
              <Button size="sm" variant="outline" className="gap-1">
                <ExternalLink className="w-3 h-3" /> פתח דף
              </Button>
            </Link>
          ) : integration.connected ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 gap-1"
              onClick={() => onDisconnect(integration.secret_keys)}
            >
              <Unplug className="w-3 h-3" /> נתק
            </Button>
          ) : (
            <Button size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'בטל' : 'חבר'}
            </Button>
          )}
        </div>

        {!externalPage && (expanded || (integration.connected && integration.secret_status?.length)) && (
          <div className="mt-3 border-t pt-3 space-y-2">
            {integration.secret_status?.map((s) => {
              const isSaving = savingKeys.has(s.key);
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className="text-xs w-56 font-mono text-slate-600 truncate">{s.key}</div>
                  <Input
                    type="password"
                    placeholder={s.present ? '••••••••••' : 'הדבק כאן'}
                    value={draft[s.key] || ''}
                    onChange={(e) => handleDraft(s.key, e.target.value)}
                    className="flex-1 h-8 text-xs"
                    disabled={isSaving}
                  />
                  {s.present && !draft[s.key] && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Check className="w-3 h-3 text-emerald-600" /> מוגדר
                    </Badge>
                  )}
                </div>
              );
            })}
            {integration.optional_status?.length > 0 && (
              <>
                <div className="text-[10px] text-slate-400 pt-1">אופציונלי:</div>
                {integration.optional_status.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <div className="text-xs w-56 font-mono text-slate-500 truncate">{s.key}</div>
                    <Input
                      placeholder={s.present ? 'מוגדר' : 'הדבק אם רלוונטי'}
                      value={draft[s.key] || ''}
                      onChange={(e) => handleDraft(s.key, e.target.value)}
                      className="flex-1 h-8 text-xs"
                    />
                  </div>
                ))}
              </>
            )}
            <div className="flex items-center gap-2 pt-2">
              {integration.help_url && (
                <a
                  href={integration.help_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <HelpCircle className="w-3 h-3" /> איך משיגים את הטוקן?
                </a>
              )}
              <div className="flex-1" />
              <Button size="sm" onClick={handleSave} disabled={!Object.values(draft).some(Boolean)}>
                <Save className="w-3 h-3 ml-1" /> שמור
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationsInner() {
  const [integrations, setIntegrations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKeys, setSavingKeys] = useState(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.listMyIntegrations({});
      const data = res?.data || res;
      setIntegrations(data?.integrations || []);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (entries) => {
    const newSaving = new Set(savingKeys);
    entries.forEach(([k]) => newSaving.add(k));
    setSavingKeys(newSaving);
    setError(null);
    try {
      for (const [key, value] of entries) {
        await base44.functions.setIntegrationSecret({ key, value });
      }
      await load();
    } catch (e) {
      setError('שגיאה בשמירה: ' + (e?.message || ''));
    } finally {
      entries.forEach(([k]) => newSaving.delete(k));
      setSavingKeys(new Set(newSaving));
    }
  };

  const handleDisconnect = async (keys) => {
    if (!window.confirm('לנתק את החיבור? הטוקנים יימחקו.')) return;
    setError(null);
    try {
      await base44.functions.deleteIntegrationSecrets({ keys });
      await load();
    } catch (e) {
      setError('שגיאה בניתוק: ' + (e?.message || ''));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-slate-700 to-slate-900 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Plug className="w-8 h-8" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">חיבורים חיצוניים</h1>
            <p className="text-sm text-white/80 mt-1">
              חבר את החשבונות שלך — Instagram, Google, Telegram, POS. הטוקנים נשמרים בסכימה שלך בלבד.
            </p>
          </div>
          <Button variant="ghost" onClick={load} className="text-white hover:bg-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {integrations?.map((int) => (
            <IntegrationCard
              key={int.key}
              integration={int}
              onSave={handleSave}
              onDisconnect={handleDisconnect}
              savingKeys={savingKeys}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-slate-400 pt-4">
        הטוקנים מוצפנים ונשמרים ב-<code>tenant_&lt;slug&gt;.IntegrationSecret</code>. אף טננט אחר לא יכול לגשת אליהם.
      </div>
    </div>
  );
}

export default function Integrations() {
  return (
    <PageGuard pageName="Integrations" pageTitle="חיבורים">
      <IntegrationsInner />
    </PageGuard>
  );
}
