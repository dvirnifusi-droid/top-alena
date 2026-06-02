import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Sparkles, Image as ImgIcon, TrendingUp, BookOpen, ChefHat, MessageCircle, DollarSign, CalendarHeart, UtensilsCrossed, Moon, BarChart3, Megaphone, AlertTriangle, CheckCircle2, Key, ArrowLeft, Crown } from 'lucide-react';
import { toast } from 'sonner';

const AGENTS = [
  { key: 'vp_marketing',         label: 'VP Marketing (מנהל שיווק)',   group: 'leadership', icon: Crown,         desc: 'תגיד לו יעד עסקי — הוא ינתח מצב, יבנה תוכנית, ויחלק עבודה לכל הסוכנים' },
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
  { key: 'leadership', label: 'הנהלת שיווק', color: 'bg-gradient-to-br from-violet-50 to-fuchsia-50 border-violet-300' },
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
    case 'vp_marketing':
      return (
        <div className="space-y-2">
          <Textarea
            rows={4}
            placeholder={`תאר את היעד העסקי במילים שלך. דוגמאות:\n• "אני רוצה לקבל 20 הזמנות לערב שישי הקרוב"\n• "השבוע צריך לדחוף את הפרגית בצהריים"\n• "תקציב הקמפיינים נגמר תוך 5 ימים — מה הכי דחוף?"\n• "אני רוצה להתחיל למכור אירועים פרטיים"`}
            value={value.goal || ''}
            onChange={(e) => set('goal', e.target.value)}
            className="min-h-[120px]"
          />
          <div className="text-xs text-slate-500">המנהל יבדוק את הקמפיינים הפעילים שלך (7 ימים אחרונים), ינתח את היעד, ויחליט בעצמו אילו סוכנים להפעיל ובאיזה סדר.</div>
        </div>
      );
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
    case 'visual_designer':
      return (
        <div className="space-y-2">
          <Textarea placeholder="תאר את התמונה הרצויה (למשל: צלחת פרגית ג'וספר עם רוטב טחינה, אש ברקע)" value={value.brief || ''} onChange={(e) => set('brief', e.target.value)} />
          <Input placeholder="סגנון (אופציונלי — ברירת מחדל: food photography Jerusalem-Chic)" value={value.style || ''} onChange={(e) => set('style', e.target.value)} />
        </div>
      );
    case 'main_media_buyer':
    case 'event_campaigns':
    case 'lunch_campaigns':
    case 'evening_campaigns':
    case 'optimization_analyst':
      return (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold mb-1 block">תקופת ניתוח</label>
            <select
              value={value.date_preset || 'last_7d'}
              onChange={(e) => set('date_preset', e.target.value)}
              className="w-full border rounded p-2 text-sm bg-white"
            >
              <option value="today">היום</option>
              <option value="yesterday">אתמול</option>
              <option value="last_7d">7 ימים אחרונים</option>
              <option value="last_14d">14 ימים אחרונים</option>
              <option value="last_30d">30 ימים אחרונים</option>
              <option value="this_month">החודש (מתחילתו)</option>
              <option value="last_month">החודש הקודם</option>
              <option value="lifetime">כל הזמן (lifetime)</option>
            </select>
          </div>
          <Textarea placeholder="מטרה ספציפית להרצה (אופציונלי — למשל: 'תקציב קמפיין אירועים נגמר תוך 3 ימים, מה לעשות?')" value={value.goal || ''} onChange={(e) => set('goal', e.target.value)} />
          <div className="text-xs text-slate-500">חשבון: "pita alena" (1678566132326169)</div>
        </div>
      );
    default:
      return null;
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
  const out = run.output || {};

  // VP Marketing: strategy + numbered plan
  if (out.goal_understood || Array.isArray(out.plan)) {
    return (
      <div className="space-y-4">
        {out.goal_understood && (
          <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-3 rounded">
            <div className="text-xs opacity-80 mb-1">היעד כפי שהמנהל מבין אותו</div>
            <div className="font-semibold">{out.goal_understood}</div>
          </div>
        )}
        {out.context_assessed && (
          <div className="bg-slate-50 border border-slate-200 rounded p-3">
            <div className="text-xs text-slate-500 mb-1">ניתוח מצב נוכחי</div>
            <div className="text-sm">{out.context_assessed}</div>
          </div>
        )}
        {out.strategy && (
          <div className="bg-amber-50 border border-amber-300 rounded p-3">
            <div className="text-xs text-amber-700 mb-1 font-semibold">אסטרטגיה</div>
            <div className="text-sm">{out.strategy}</div>
          </div>
        )}
        {Array.isArray(out.plan) && out.plan.length > 0 && (
          <div>
            <div className="font-semibold mb-2 text-sm">תוכנית פעולה ({out.plan.length} צעדים)</div>
            <div className="space-y-2">
              {out.plan.map((s, i) => (
                <div key={i} className="border-r-4 border-violet-400 bg-white pr-3 pl-2 py-2 rounded-l">
                  <div className="flex items-start gap-2">
                    <div className="bg-violet-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">{s.step || i + 1}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.title}</div>
                      <div className="text-xs text-slate-500 mb-1">סוכן: <strong>{s.agent_type}</strong>{s.depends_on ? ` · אחרי צעד ${s.depends_on}` : ''}</div>
                      {s.reason && <div className="text-xs text-slate-700">{s.reason}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {out.expected_outcome && (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-3">
            <div className="text-xs text-emerald-700 mb-1 font-semibold">תוצאה צפויה</div>
            <div className="text-sm">{out.expected_outcome}</div>
          </div>
        )}
      </div>
    );
  }

  // Media-buying agents return structured headline/key_metrics/actions.
  if (out.headline || Array.isArray(out.actions)) {
    const priorityColor = { high: 'bg-red-50 border-red-300 text-red-900', medium: 'bg-amber-50 border-amber-300 text-amber-900', low: 'bg-slate-50 border-slate-300 text-slate-700' };
    return (
      <div className="space-y-4">
        {out.headline && (
          <div className="bg-slate-900 text-white p-3 rounded">
            <div className="text-xs text-slate-400 mb-1">מצב {out.period ? `· ${out.period}` : ''}</div>
            <div className="font-semibold">{out.headline}</div>
          </div>
        )}
        {out.key_metrics && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center">
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">הוצאה</div><div className="font-bold">₪{Number(out.key_metrics.total_spend_ils || 0).toFixed(0)}</div></div>
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">קליקים</div><div className="font-bold">{out.key_metrics.total_clicks || 0}</div></div>
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">לידים</div><div className="font-bold">{out.key_metrics.total_leads || 0}</div></div>
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">CTR ממוצע</div><div className="font-bold">{Number(out.key_metrics.avg_ctr_pct || 0).toFixed(2)}%</div></div>
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">CPC</div><div className="font-bold">₪{Number(out.key_metrics.cpc_ils || 0).toFixed(2)}</div></div>
            <div className="bg-white border rounded p-2"><div className="text-xs text-slate-500">עלות לליד</div><div className="font-bold">{out.key_metrics.cost_per_lead_ils ? `₪${Number(out.key_metrics.cost_per_lead_ils).toFixed(0)}` : '—'}</div></div>
          </div>
        )}
        {(out.key_metrics?.top_campaign_name || out.key_metrics?.best_ctr_campaign || out.key_metrics?.cheapest_lead_campaign) && (
          <div className="text-xs text-slate-600 space-y-0.5 bg-slate-50 border rounded p-2">
            {out.key_metrics.top_campaign_name && <div>💰 הכי הרבה הוצאה: <strong>{out.key_metrics.top_campaign_name}</strong></div>}
            {out.key_metrics.best_ctr_campaign && <div>🎯 הכי CTR גבוה: <strong>{out.key_metrics.best_ctr_campaign}</strong></div>}
            {out.key_metrics.cheapest_lead_campaign && <div>🏆 הליד הזול ביותר: <strong>{out.key_metrics.cheapest_lead_campaign}</strong></div>}
          </div>
        )}
        {out.campaigns_count != null && (
          <div className="text-xs text-slate-500">
            מבוסס על {out.campaigns_count} קמפיינים ({out.campaigns_with_data || 0} עם נתונים בתקופה)
            {out.dropped_hallucinated_actions > 0 && ` · ${out.dropped_hallucinated_actions} המלצות נחסמו (שמות קמפיינים לא קיימים)`}
          </div>
        )}
        {Array.isArray(out.actions) && out.actions.length > 0 && (
          <div>
            <div className="font-semibold mb-2 text-sm">פעולות מומלצות ({out.actions.length})</div>
            <div className="space-y-2">
              {out.actions.map((a, i) => (
                <div key={i} className={`border rounded p-3 ${priorityColor[a.priority] || priorityColor.medium}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-sm">{i + 1}. {a.action}</div>
                    <span className="text-xs font-bold whitespace-nowrap">{a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'בינוני' : 'רגיל'}</span>
                  </div>
                  {a.campaign_name && <div className="text-xs opacity-70 mb-1">קמפיין: {a.campaign_name}</div>}
                  {a.why && <div className="text-sm mb-1"><strong>למה:</strong> {a.why}</div>}
                  {a.expected_impact && <div className="text-sm"><strong>צפי השפעה:</strong> {a.expected_impact}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Copywriter: variants
  if (Array.isArray(out.variants)) {
    return (
      <div className="space-y-3">
        {out.variants.map((v, i) => (
          <div key={i} className="border rounded p-3 bg-white">
            <div className="text-xs text-slate-500 mb-1">וריאציה {i + 1}</div>
            {v.hook && <div className="font-bold mb-1">{v.hook}</div>}
            {v.body && <div className="text-sm whitespace-pre-wrap mb-2">{v.body}</div>}
            {Array.isArray(v.hashtags) && <div className="text-xs text-blue-600">{v.hashtags.join(' ')}</div>}
          </div>
        ))}
      </div>
    );
  }

  // Storyteller / Newsletter
  if (out.sections) {
    return (
      <div className="space-y-3">
        {out.subject && <div className="font-bold text-lg">{out.subject}</div>}
        {out.intro && <div className="text-sm">{out.intro}</div>}
        {Array.isArray(out.sections) && out.sections.map((s, i) => (
          <div key={i} className="border-r-2 border-violet-300 pr-3">
            <div className="font-semibold">{s.heading}</div>
            <div className="text-sm whitespace-pre-wrap">{s.body}</div>
          </div>
        ))}
        {out.closing && <div className="text-sm italic mt-2">{out.closing}</div>}
      </div>
    );
  }

  // Trend-Spotter
  if (Array.isArray(out.trends)) {
    return (
      <div className="space-y-2">
        {out.trends.map((t, i) => (
          <div key={i} className="border rounded p-3 bg-purple-50">
            <div className="font-bold">{i + 1}. {t.title}</div>
            {t.hook && <div className="text-sm mt-1">{t.hook}</div>}
            {t.why_it_works && <div className="text-xs mt-1 text-slate-600">למה זה עובד: {t.why_it_works}</div>}
            {t.suggested_format && <div className="text-xs mt-1 text-slate-600">פורמט מומלץ: {t.suggested_format}</div>}
          </div>
        ))}
      </div>
    );
  }

  // Menu Engineer
  if (Array.isArray(out.items)) {
    return (
      <div className="space-y-2">
        {out.summary && <div className="bg-amber-50 border border-amber-200 rounded p-2 text-sm">{out.summary}</div>}
        {out.items.map((it, i) => (
          <div key={i} className="border rounded p-2 text-sm">
            <div className="font-semibold flex justify-between">{it.name} <span className="text-xs">{it.category}</span></div>
            {it.recommendation && <div className="text-xs mt-1">{it.recommendation}</div>}
          </div>
        ))}
      </div>
    );
  }

  // Conversational
  if (out.reply) {
    return (
      <div className="space-y-2">
        <div className="bg-emerald-50 border border-emerald-300 rounded p-3">
          <div className="text-xs text-slate-500 mb-1">תשובה מוצעת</div>
          <div className="whitespace-pre-wrap">{out.reply}</div>
        </div>
        {out.needs_human_handoff && <div className="text-xs text-red-700">⚠️ ממליץ להעביר לבן אדם</div>}
        {out.suggested_tag && <div className="text-xs text-slate-500">תיוג מוצע: {out.suggested_tag}</div>}
      </div>
    );
  }

  // Visual Designer
  if (out.image_base64) {
    return (
      <div className="space-y-2">
        <img src={`data:image/png;base64,${out.image_base64}`} alt="generated" className="rounded border max-h-96 mx-auto" />
        {out.prompt_used && <div className="text-xs text-slate-500">Prompt: {out.prompt_used}</div>}
      </div>
    );
  }

  // Fallback — raw JSON only as last resort
  return <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap break-words">{JSON.stringify(out, null, 2)}</pre>;
}

export default function MarketingAgentsHub() {
  const [activeAgent, setActiveAgent] = useState(null);
  const [input, setInput] = useState({});
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [metaToken, setMetaToken] = useState('');
  const [metaTokenSet, setMetaTokenSet] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  useEffect(() => {
    base44.functions.hasIntegrationSecret({ key: 'META_ADS_ACCESS_TOKEN' })
      .then((r) => setMetaTokenSet(!!r?.data?.present))
      .catch(() => {});
  }, []);

  const saveMetaToken = async () => {
    if (!metaToken.trim()) return;
    setSavingToken(true);
    try {
      await base44.functions.setIntegrationSecret({ key: 'META_ADS_ACCESS_TOKEN', value: metaToken.trim(), note: 'pita alena Ad Account (1678566132326169)' });
      setMetaTokenSet(true);
      setMetaToken('');
      toast.success('הטוקן נשמר. סוכני המדיה פעילים.');
      setShowSecrets(false);
    } catch (e) {
      toast.error(`שגיאה: ${e?.message || e}`);
    } finally {
      setSavingToken(false);
    }
  };

  const loadRuns = useCallback(async () => {
    try {
      const res = await base44.functions.listMarketingAgentRuns({ limit: 50 });
      setRuns(res?.data?.runs || []);
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
      const runResult = res?.data?.run || null;
      setLatestRun(runResult);
      if (runResult?.status === 'completed') toast.success(`${activeAgent.label} סיים`);
      else if (runResult?.status === 'needs_integration') toast.info('הסוכן דורש מפתחות API');
      else if (runResult?.status === 'failed') toast.error('הסוכן נכשל');
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSecrets(true)}>
            <Key className="w-4 h-4 ml-1" /> מפתחות API {metaTokenSet ? '✅' : '⚠️'}
          </Button>
          <Button variant="outline" onClick={() => setShowHistory(true)}>היסטוריית הרצות ({runs.length})</Button>
        </div>
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
                  {Array.isArray(latestRun.output?.next_steps) && latestRun.output.next_steps.length > 0 && (
                    <div className="mt-4 pt-3 border-t">
                      <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> פעולות המשך מומלצות
                      </div>
                      <div className="space-y-2">
                        {latestRun.output.next_steps.map((step, i) => {
                          const targetAgent = AGENTS.find((a) => a.key === step.agent_type);
                          if (!targetAgent) return null;
                          const Icon = targetAgent.icon;
                          const pColor = step.priority === 'high' ? 'border-red-300 bg-red-50' : step.priority === 'medium' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50';
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setActiveAgent(targetAgent);
                                setInput(step.input || {});
                                setLatestRun(null);
                              }}
                              className={`w-full text-right border rounded p-2 hover:shadow transition ${pColor}`}
                            >
                              <div className="flex items-start gap-2">
                                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                  <div className="font-semibold text-sm">{targetAgent.label}</div>
                                  <div className="text-xs text-slate-700">{step.reason}</div>
                                </div>
                                <span className="text-xs font-bold whitespace-nowrap">{step.priority === 'high' ? 'דחוף' : step.priority === 'medium' ? 'בינוני' : 'רגיל'}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSecrets} onOpenChange={setShowSecrets}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader><DialogTitle>מפתחות API</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold">META Ads Access Token</label>
                {metaTokenSet && <Badge variant="default" className="text-xs">מוגדר</Badge>}
              </div>
              <p className="text-xs text-slate-500 mb-2">חשבון "pita alena" (1678566132326169). הטוקן נשמר ב-DB ומוצפן ברמת השרת. {metaTokenSet ? 'אפשר להחליף אותו כאן כשצריך.' : 'בלעדיו 5 סוכני המדיה לא פעילים.'}</p>
              <Textarea
                rows={3}
                placeholder="EAA..."
                value={metaToken}
                onChange={(e) => setMetaToken(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={saveMetaToken} disabled={savingToken || !metaToken.trim()} className="mt-2 w-full">
                {savingToken ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Key className="w-4 h-4 ml-2" />}
                שמור טוקן
              </Button>
            </div>
          </div>
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
