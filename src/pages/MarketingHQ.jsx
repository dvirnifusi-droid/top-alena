// Marketing HQ — the command center. Live KPIs + the advisor's ranked, one-click
// action list. Each "campaign" action fires the existing sendCustomerCampaign
// (consent / 24h throttle / opt-out already enforced server-side).
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles, Send, ExternalLink } from 'lucide-react';

function KpiTile({ label, value, sub, tone }) {
  const toneCls = tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="bg-white rounded-xl border p-3 flex-1 min-w-[130px]">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function MarketingHQ() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [exec, setExec] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const r = await base44.functions.getMarketingHQ({});
      setData(r?.data || r || {});
    } catch (e) { setErr(e?.message || 'שגיאה בטעינת מטה השיווק'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openExec = async (a) => {
    setExec(a); setMessage(a.default_message || ''); setPreview(null);
    try {
      const r = await base44.functions.previewCustomerSegment({ segment: a.segment });
      const p = r?.data || r || {};
      setPreview({ count: p.count ?? 0, throttled: p.throttled_out ?? 0 });
    } catch { setPreview({ count: a.count ?? 0, throttled: 0 }); }
  };

  const doSend = async () => {
    if (!exec) return;
    setSending(true);
    try {
      await base44.functions.sendCustomerCampaign({
        segment: exec.segment,
        message_template: message,
        channel: exec.channel || 'whatsapp',
        campaign_key: `hq_${exec.id}`,
        campaign_label: exec.title,
      });
      setExec(null);
      setToast(`✅ נשלח: ${exec.title}`);
      setTimeout(() => setToast(''), 3000);
      load();
    } catch (e) {
      setToast('❌ השליחה נכשלה: ' + (e?.message || ''));
      setTimeout(() => setToast(''), 4000);
    } finally { setSending(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (err) return <div className="p-4 text-red-600 text-sm">{err}</div>;

  const k = data?.kpis || {};
  const rev = k.revenue || {};
  const actions = data?.actions || [];

  return (
    <div dir="rtl" className="space-y-4">
      {toast && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm border border-emerald-200">{toast}</div>}

      <Card className="p-4 bg-gradient-to-l from-[#A04A2E] to-[#7A3722] text-white border-0">
        <div className="flex items-start gap-3">
          <Sparkles className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold opacity-90 mb-1">מנהל השיווק שלך אומר</div>
            <div className="text-base leading-relaxed">{data?.headline}</div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <KpiTile label="חברי מועדון פעילים" value={(k.active_members ?? 0).toLocaleString('he-IL')} />
        <KpiTile
          label="הכנסה השבוע"
          value={`₪${(rev.current ?? 0).toLocaleString('he-IL')}`}
          sub={rev.pct != null ? `${rev.pct >= 0 ? '▲' : '▼'} ${Math.abs(rev.pct)}% מול שבוע שעבר` : 'אין נתוני שבוע קודם'}
          tone={rev.pct == null ? '' : rev.pct >= 0 ? 'up' : 'down'}
        />
        <KpiTile label="לקוחות נוטשים" value={(k.lapsed ?? 0).toLocaleString('he-IL')} sub="60–90 יום" />
        <KpiTile label="ימי הולדת השבוע" value={k.birthdays_7d ?? 0} />
        <KpiTile
          label="% מסירה בקמפיינים"
          value={k.delivery_pct != null ? `${k.delivery_pct}%` : '—'}
          sub={k.delivery_pct != null ? `${k.delivery_tracked} נמדדו` : 'לא נמדד'}
        />
      </div>

      <div>
        <div className="text-base font-bold mb-2 text-[#44512C]">📋 פעולות מומלצות לשבוע</div>
        {actions.length === 0 ? (
          <Card className="p-6 text-center text-slate-500 text-sm">אין פעולות דחופות כרגע — הנתונים יציבים. 🌿</Card>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => (
              <Card key={a.id} className="p-3 flex items-center gap-3">
                <div className="text-2xl flex-shrink-0">{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500">{a.why}{a.impact ? ` · ${a.impact}` : ''}</div>
                </div>
                {a.kind === 'campaign' ? (
                  <Button size="sm" onClick={() => openExec(a)} className="bg-[#A04A2E] hover:bg-[#7A3722] flex-shrink-0">
                    <Send className="w-4 h-4 ml-1" /> בצע
                  </Button>
                ) : (
                  <a href={a.link || '#'} className="flex-shrink-0">
                    <Button size="sm" variant="outline"><ExternalLink className="w-4 h-4 ml-1" /> פתח</Button>
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!exec} onOpenChange={(v) => { if (!sending && !v) setExec(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{exec?.icon} {exec?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              {preview == null
                ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> בודק כמה לקוחות…</span>
                : <>יישלח ל-<strong>{preview.count}</strong> לקוחות (עם הסכמה לדיוור){preview.throttled ? ` · ${preview.throttled} דולגו (קיבלו ב-24ש' האחרונות)` : ''}.</>}
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">ההודעה (אפשר לערוך · <code>{'{name}'}</code> = שם הלקוח):</div>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            </div>
            <div className="text-xs text-slate-400">ערוץ: וואטסאפ · קישור הסרה מהדיוור מתווסף אוטומטית.</div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExec(null)} disabled={sending}>ביטול</Button>
            <Button
              onClick={doSend}
              disabled={sending || !message.trim() || (preview && preview.count === 0)}
              className="bg-[#A04A2E] hover:bg-[#7A3722]"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : `שלח ל-${preview?.count ?? '…'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
