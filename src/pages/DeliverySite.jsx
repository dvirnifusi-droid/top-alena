import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Store, Link2, Save, Check, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

// Owner remote for the alenabepita.co.il delivery site. Talks to the WordPress
// control bridge through the app backend (which holds the secret key). See
// apps/api/src/functions/deliverySiteControl.ts.
export default function DeliverySite() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // connect form
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // base44.functions returns axios-style { data, status } — the body is in .data.
      const d = (await base44.functions.getDeliverySiteControl({}))?.data || {};
      setConnected(!!d.connected);
      setSettings(d.settings || null);
      setError(d.error || '');
    } catch (e) {
      setError(e?.message || 'טעינה נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true); setError('');
    try {
      const d = (await base44.functions.connectDeliverySite({ url, key }))?.data || {};
      if (d.connected) {
        setConnected(true); setSettings(d.settings || null); setKey('');
      } else {
        setError(d.error || 'החיבור נכשל');
      }
    } catch (e) {
      setError(e?.message || 'החיבור נכשל');
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      const payload = {
        club: {
          member_discount_pct: Number(settings.club?.member_discount_pct) || 0,
          join_incentive: settings.club?.join_incentive || '',
          coin_value: Number(settings.club?.coin_value) || 0,
          earn_per: Number(settings.club?.earn_per) || 1,
        },
        features: Object.fromEntries(
          Object.entries(settings.features || {}).map(([slug, f]) => [slug, !!f.enabled]),
        ),
      };
      const d = (await base44.functions.setDeliverySiteControl({ settings: payload }))?.data || {};
      if (d.settings) setSettings(d.settings);
      setSavedAt(new Date());
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const setClub = (k, v) => setSettings((s) => ({ ...s, club: { ...s.club, [k]: v } }));
  const setFeature = (slug, v) =>
    setSettings((s) => ({ ...s, features: { ...s.features, [slug]: { ...s.features[slug], enabled: v } } }));

  return (
    <PageGuard pageName="DeliverySite" pageTitle="אתר משלוחים">
      <PageShell>
        <PageHeader
          title="אתר משלוחים — עלינא בפיתה"
          subtitle="שליטה בהטבות ובהגדרות של אתר ההזמנות, ישירות מכאן"
          icon={Store}
          action={connected ? (
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="w-4 h-4 ml-1" /> רענון
            </Button>
          ) : null}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען…
          </div>
        ) : !connected ? (
          /* ---------- Connect ---------- */
          <Card className="max-w-xl mx-auto">
            <CardContent className="p-6 space-y-4" dir="rtl">
              <div className="flex items-center gap-2 text-lg font-bold"><Link2 className="w-5 h-5" /> חיבור לאתר המשלוחים</div>
              <p className="text-sm text-slate-600">
                בוורדפרס: <b>אזורי חלוקה → מרכז שליטה → חיבור לאפליקציית TOP ALENA</b>. העתק משם את הכתובת והמפתח והדבק כאן (פעם אחת).
              </p>
              <div>
                <Label>כתובת</Label>
                <Input dir="ltr" placeholder="https://alenabepita.co.il" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div>
                <Label>מפתח שליטה</Label>
                <Input dir="ltr" placeholder="מפתח סודי מהמרכז שליטה" value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
              <Button onClick={connect} disabled={connecting || !url || !key} className="w-full">
                {connecting ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> מתחבר…</> : <>חבר את האתר</>}
              </Button>
            </CardContent>
          </Card>
        ) : !settings ? (
          <Card className="max-w-xl mx-auto"><CardContent className="p-6 text-center" dir="rtl">
            <p className="text-rose-600 font-semibold mb-3">{error || 'מחובר, אך לא הצלחנו לטעון הגדרות'}</p>
            <Button onClick={load} variant="outline">נסה שוב</Button>
          </CardContent></Card>
        ) : (
          /* ---------- Settings ---------- */
          <div className="space-y-5 max-w-2xl mx-auto" dir="rtl">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold">🎁 מועדון והטבות</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>הנחת חבר מועדון (%)</Label>
                    <Input type="number" min="0" max="90" value={settings.club?.member_discount_pct ?? 0}
                      onChange={(e) => setClub('member_discount_pct', e.target.value)} />
                  </div>
                  <div>
                    <Label>₪ לכל נקודה (פדיון)</Label>
                    <Input type="number" min="0" step="0.5" value={settings.club?.coin_value ?? 4}
                      onChange={(e) => setClub('coin_value', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>תמריץ הצטרפות (בכפתור ההתחברות)</Label>
                  <Input value={settings.club?.join_incentive ?? ''} placeholder={settings.club?.join_incentive_effective || ''}
                    onChange={(e) => setClub('join_incentive', e.target.value)} />
                  <p className="text-xs text-slate-500 mt-1">ריק = ברירת המחדל: "{settings.club?.join_incentive_effective || ''}"</p>
                </div>
                <div>
                  <Label>₪ להזמנה לכל נקודה (צבירה)</Label>
                  <Input type="number" min="1" value={settings.club?.earn_per ?? 100}
                    onChange={(e) => setClub('earn_per', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-bold">🎛️ פיצ׳רים באתר</div>
                {Object.entries(settings.features || {}).map(([slug, f]) => (
                  <div key={slug} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0 border-slate-100">
                    <div>
                      <div className="font-semibold text-sm">{f.label || slug}</div>
                      <div className="text-xs text-slate-500">{f.desc || ''}</div>
                    </div>
                    <Switch checked={!!f.enabled} onCheckedChange={(v) => setFeature(slug, v)} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {error && <p className="text-sm font-semibold text-rose-600 text-center">{error}</p>}

            <div className="flex items-center justify-between gap-3 sticky bottom-3">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> שומר…</>
                  : savedAt ? <><Check className="w-4 h-4 ml-2" /> נשמר ✓</>
                  : <><Save className="w-4 h-4 ml-2" /> שמירה</>}
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-400"
                onClick={async () => { await base44.functions.disconnectDeliverySite({}); load(); }}>
                ניתוק
              </Button>
            </div>
          </div>
        )}
      </PageShell>
    </PageGuard>
  );
}
