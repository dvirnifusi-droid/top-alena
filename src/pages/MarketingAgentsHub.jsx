import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Sparkles, Image as ImgIcon, TrendingUp, BookOpen, ChefHat, MessageCircle, DollarSign, CalendarHeart, UtensilsCrossed, Moon, BarChart3, Megaphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const AGENTS = [
  { key: 'copywriter',           label: 'Copywriter',                  group: 'creative', icon: Sparkles,         desc: 'קופי לפוסטים/מודעות/ניוזלטר בקול עלינא' },
  { key: 'visual_designer',      label: 'Visual Designer',             group: 'creative', icon: ImgIcon,          desc: 'תמונות וסרטונים (Midjourney/Ideogram + Canva)' },
  { key: 'trend_spotter',        label: 'Trend-Spotter',               group: 'creative', icon: TrendingUp,       desc: 'זוויות תוכן טרנדיות מ-TikTok/Reels' },
  { key: 'storyteller',          label: 'Storyteller / Newsletter',    group: 'creative', icon: BookOpen,         desc: 'סיפורי מותג, ניוזלטר שבועי/חודשי' },
  { key: 'menu_engineer',        label: 'Menu Engineer',               group: 'creative', icon: ChefHat,          desc: 'ניתוח רווחיות מנות והמלצות תפריט' },
  { key: 'main_media_buyer',     label: 'Main Media Buyer',            group: 'media',    icon: Megaphone,        desc: 'אסטרטגיית מדיה ראשית ותקציבים' },
  { key: 'event_campaigns',      label: 'Event Campaigns',             group: 'media',    icon: CalendarHeart,    desc: 'קמפיינים לאירועים פרטיים' },
  { key: 'lunch_campaigns',      label: 'Lunch Campaigns',             group: 'media',    icon: UtensilsCrossed,  desc: 'קמפיינים לארוחת צהריים/עסקית' },
  { key: 'evening_campaigns',    label: 'Evening / Delivery',          group: 'media',    icon: Moon,             desc: 'ערב ומשלוחים (Wolt/Tabit)' },
  { key: 'optimization_analyst', label: 'Optimization Analyst',        group: 'media',    icon: BarChart3,        desc: 'אופטימיזציה רציפה של קמפיינים חיים' },
  { key: 'conversational',       label: 'Conversational (DM)',         group: 'sales',    icon: MessageCircle,    desc: 'מענה ל-DMs ותגובות באינסטגרם/פייסבוק' },
];

const GROUPS = [
  { key: 'creative', label: 'צוות קריאייטיב', color: 'bg-purple-50 border-purple-200' },
  { key: 'media',    label: 'צוות מדיה',     color: 'bg-amber-50 border-amber-200' },
  { key: 'sales',    label: 'מכירות וצמיחה', color: 'bg-emerald-50 border-emerald-200' },
];

const STATUS_BADGE = {
  running:            { label: 'רץ...',          variant: 'secondary' },
  completed:          { label: 'הושלם',          variant: 'default'   },
  needs_integration:  { label: 'דורש מפתח API',  variant: 'outline'   },
  failed:             { label: 'נכשל',           variant: 'destructive' },
  pending:            { label: 'ממתין',          variant: 'secondary' },
};

function AgentInputForm({ agentKey, onChange, value }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  switch (agentKey) {
    case 'copywriter':
      return (
        <div className="space-y-2">
          <Input placeholder="נושא (למשל: השקת מנת פרגית חדשה)" value={value.topic || ''} onChange={(e) => set('topic', e.target.value)} />
          <Input placeholder="ערוץ (instagram / facebook / sms / email)" value={value.channel || 'instagram'} onChange={(e) => set('channel', e.target.value)} />
          <Input placeholder="קריאה לפעולה (אופציונלי)" value={value.cta || ''} onChange={(e) => set('cta', e.target.value)} />
        </div>
      );
    case 'storyteller':
      return (
        <div className="space-y-2">
          <Input placeholder="period: week / month" value={value.period || 'week'} onChange={(e) => set('period', e.target.value)} />
          <Textarea placeholder="נקודות בולטות מהשבוע (אופציונלי)" value={value.highlights || ''} onChange={(e) => set('highlights', e.target.value)} />
        </div>
      );
    case 'trend_spotter':
      return <Input placeholder="נישה (ברירת מחדל: restaurant_jerusalem)" value={value.niche || ''} onChange={(e) => set('niche', e.target.value)} />;
    case 'menu_engineer':
      return <Textarea rows={6} placeholder="נתוני מכירות: מנה | כמות | מחיר | עלות (שורה למנה)" value={value.sales_data || ''} onChange={(e) => set('sales_data', e.target.value)} />;
    case 'conversational':
      return (
        <div className="space-y-2">
          <Textarea placeholder="הודעה נכנסת מלקוח" value={value.incoming_message || ''} onChange={(e) => set('incoming_message', e.target.value)} />
          <Input placeholder="קונטקסט לקוח (אופציונלי)" value={value.customer_context || ''} onChange={(e) => set('customer_context', e.target.value)} />
        </div>
      );
    default:
      return (
        <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded border border-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>סוכן זה מחובר לפלטפורמות חיצוניות (Meta Ads / Midjourney). הרצה תיצור Run עם סטטוס "דורש מפתח API" — לחיים אמיתיים יש להגדיר את המפתחות שיופיעו ברשימה.</div>
        </div>
      );
  }
}

function RunOutputView({ run }) {
  if (!run) return null;
  if (run.status === 'needs_integration') {
    return (
      <div className="space-y-2">
        <div className="text-sm">סוכן מוכן אבל דורש את המפתחות הבאים:</div>
        <ul className="list-disc pr-5 text-sm">
          {(run.needs_integration || []).map((n, i) => <li key={i} className="font-mono">{n}</li>)}
        </ul>
      </div>
    );
  }
  if (run.status === 'failed') {
    return <div className="text-sm text-red-700">שגיאה: {run.error}</div>;
  }
  return <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap break-words">{JSON.stringify(run.output, null, 2)}</pre>;
}

export default function MarketingAgentsHub() {
  const [activeAgent, setActiveAgent] = useState(null);
  const [input, setInput] = useState({});
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const res = await base44.functions.listMarketingAgentRuns({ limit: 50 });
      setRuns(res?.runs || []);
    } catch (e) {
      console.error('listMarketingAgentRuns failed', e);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const openAgent = (agent) => {
    setActiveAgent(agent);
    setInput({});
    setLatestRun(null);
  };

  const run = async () => {
    if (!activeAgent) return;
    setRunning(true);
    setLatestRun(null);
    try {
      const res = await base44.functions.runMarketingAgent({ agent_type: activeAgent.key, input });
      setLatestRun(res?.run || null);
      if (res?.run?.status === 'completed') toast.success(`${activeAgent.label} סיים`);
      else if (res?.run?.status === 'needs_integration') toast.info('הסוכן דורש מפתחות API');
      else if (res?.run?.status === 'failed') toast.error('הסוכן נכשל');
      loadRuns();
    } catch (e) {
      toast.error(`שגיאה: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6" /> VP Marketing — 11 סוכנים</h1>
          <p className="text-slate-600 text-sm mt-1">צוות שיווק אוטונומי תחת סגן השיווק. סוכנים מבוססי-LLM פעילים מיד; סוכני מדיה ועיצוב חזותי דורשים מפתחות API.</p>
        </div>
        <Button variant="outline" onClick={() => setShowHistory(true)}>היסטוריית הרצות ({runs.length})</Button>
      </div>

      {GROUPS.map((g) => (
        <div key={g.key} className="mb-6">
          <h2 className="text-lg font-semibold mb-3">{g.label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {AGENTS.filter((a) => a.group === g.key).map((a) => {
              const Icon = a.icon;
              const lastRun = runs.find((r) => r.agent_type === a.key);
              return (
                <Card key={a.key} className={`cursor-pointer hover:shadow transition ${g.color}`} onClick={() => openAgent(a)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4" /> {a.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-slate-600 mb-2">{a.desc}</p>
                    {lastRun ? (
                      <Badge variant={STATUS_BADGE[lastRun.status]?.variant || 'secondary'} className="text-xs">
                        {STATUS_BADGE[lastRun.status]?.label || lastRun.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">לא הופעל עדיין</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <Dialog open={!!activeAgent} onOpenChange={(o) => !o && setActiveAgent(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{activeAgent?.label}</DialogTitle>
          </DialogHeader>
          {activeAgent && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{activeAgent.desc}</p>
              <AgentInputForm agentKey={activeAgent.key} value={input} onChange={setInput} />
              <Button onClick={run} disabled={running} className="w-full">
                {running ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Sparkles className="w-4 h-4 ml-2" />}
                הפעל סוכן
              </Button>
              {latestRun && (
                <div className="border rounded p-3 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    {latestRun.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    <Badge variant={STATUS_BADGE[latestRun.status]?.variant}>{STATUS_BADGE[latestRun.status]?.label}</Badge>
                  </div>
                  <RunOutputView run={latestRun} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader><DialogTitle>היסטוריית הרצות</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {runs.length === 0 && <p className="text-sm text-slate-500">אין הרצות עדיין.</p>}
            {runs.map((r) => (
              <div key={r.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{AGENTS.find((a) => a.key === r.agent_type)?.label || r.agent_type}</span>
                  <Badge variant={STATUS_BADGE[r.status]?.variant}>{STATUS_BADGE[r.status]?.label}</Badge>
                </div>
                <div className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('he-IL')}</div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600">פלט</summary>
                  <RunOutputView run={r} />
                </details>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
