import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/shared/PageGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Inbox, Brain, AlertTriangle, CheckCircle, XCircle, Bell, Play, Settings,
  ChevronRight, Loader2, Filter, RefreshCw, Sparkles
} from 'lucide-react';

const ROLE_LABEL = {
  executive: 'הנהלה',
  vp:        'סגני נשיא',
  campaign_crew: 'צוות קמפיין',
  support:   'תמיכה שיווקית',
  operations:'תפעול',
};

const ROLE_COLOR = {
  executive: 'border-[#D9BD83] bg-[#F4ECD8]',
  vp:        'border-[#D9BD83] bg-[#F4ECD8]',
  campaign_crew: 'border-pink-300 bg-[#F4ECD8]',
  support:   'border-[#D9BD83] bg-[#F4ECD8]',
  operations:'border-amber-300 bg-amber-50',
};

const TYPE_BADGE = {
  brief:    { label: '📋 תדריך',  cls: 'bg-[#F4ECD8] text-[#44512C]' },
  result:   { label: '✓ תוצאה',   cls: 'bg-emerald-100 text-emerald-700' },
  info:     { label: 'ℹ️ מידע',    cls: 'bg-slate-100 text-slate-700' },
  approval: { label: '👉 אישור',   cls: 'bg-amber-100 text-amber-700' },
  alert:    { label: '🚨 התראה',  cls: 'bg-red-100 text-red-700' },
};

const STATUS_FILTERS = [
  { value: 'open',      label: 'פתוחים' },
  { value: 'approved',  label: 'אושרו' },
  { value: 'rejected',  label: 'נדחו' },
  { value: 'dismissed', label: 'בוטלו' },
  { value: '',          label: 'הכל' },
];

function fmt(iso) {
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function AgentInbox() {
  return (
    <PageGuard pageName="AgentInbox" pageTitle="תיבת הסוכן">
      <AgentInboxInner />
    </PageGuard>
  );
}

function AgentInboxInner() {
  const [agents, setAgents] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [agentFilter, setAgentFilter] = useState('');
  const [runningAgentId, setRunningAgentId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [agentRes, inboxRes] = await Promise.all([
        base44.functions.listAgents({}),
        base44.functions.listAgentInbox({ status: statusFilter || undefined, agent_name: agentFilter || undefined }),
      ]);
      setAgents(Array.isArray(agentRes?.data) ? agentRes.data : []);
      setInbox(Array.isArray(inboxRes?.data) ? inboxRes.data : []);
    } catch (e) {
      console.error('agent inbox load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, agentFilter]);

  const seed = async () => {
    if (!confirm('לאתחל את עץ 23 הסוכנים? פעולה idempotent — לא יוצרת כפילויות.')) return;
    setSeeding(true);
    try {
      const res = await base44.functions.seedDefaultAgents({});
      alert(`נוצרו ${res?.data?.created ?? 0} סוכנים חדשים (סה"כ ${res?.data?.total ?? 23}).`);
      await load();
    } catch (e) {
      alert('שגיאה ב-seed: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setSeeding(false);
    }
  };

  const runAgent = async (agent) => {
    setRunningAgentId(agent.id);
    try {
      await base44.functions.runAgent({ agent_id: agent.id, trigger: 'manual', input: {} });
      await load();
    } catch (e) {
      alert('שגיאת הרצה: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setRunningAgentId(null);
    }
  };

  const toggleAgent = async (agent) => {
    try {
      await base44.functions.updateAgent({ id: agent.id, is_active: !agent.is_active });
      await load();
    } catch { alert('שגיאה בעדכון'); }
  };

  const act = async (item, action) => {
    try {
      await base44.functions.actOnInboxItem({ id: item.id, action });
      await load();
    } catch { alert('שגיאה'); }
  };

  // group agents by role into a tree
  const grouped = useMemo(() => {
    const order = ['executive', 'vp', 'campaign_crew', 'support', 'operations'];
    const groups = {};
    for (const a of agents) (groups[a.role] = groups[a.role] || []).push(a);
    return order.filter(r => groups[r]).map(r => ({ role: r, agents: groups[r] }));
  }, [agents]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4ECD8] via-white to-[#F4ECD8] p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] text-white flex items-center justify-center shadow-lg">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900">תיבת הסוכן של אלינא</h1>
              <p className="text-slate-500 text-sm">המקום שבו הסוכנים מדווחים, מבקשים אישור, ומציגים תוצאות</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
            </Button>
            {agents.length === 0 && (
              <Button onClick={seed} disabled={seeding} className="bg-[#A04A2E] hover:bg-[#7A3722]">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Sparkles className="w-4 h-4 ml-1" />}
                אתחל 23 סוכנים
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowAgentPanel(s => !s)}>
              {showAgentPanel ? 'הסתר' : 'הצג'} עץ סוכנים
            </Button>
          </div>
        </div>

        <div className={`grid gap-5 ${showAgentPanel ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
          {/* Inbox column */}
          <div>
            {/* Filters */}
            <Card className="mb-4 border-0 shadow-md">
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <div className="flex gap-1 flex-wrap">
                  {STATUS_FILTERS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStatusFilter(s.value)}
                      className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${statusFilter === s.value ? 'bg-[#A04A2E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {agentFilter && (
                  <button onClick={() => setAgentFilter('')} className="text-xs text-[#7A3722] hover:underline mr-auto">
                    × נקה פילטר סוכן: {agentFilter}
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Items */}
            {loading ? (
              <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-400" /></div>
            ) : inbox.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200">
                <CardContent className="text-center py-16 text-slate-400">
                  <Inbox className="w-14 h-14 mx-auto opacity-30 mb-3" />
                  <p className="font-semibold">תיבת הדואר ריקה</p>
                  <p className="text-xs mt-1">כשהסוכנים יתחילו לעבוד, הדיווחים שלהם יופיעו כאן.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {inbox.map(item => {
                  const tBadge = TYPE_BADGE[item.type] || TYPE_BADGE.info;
                  return (
                    <Card key={item.id} className={`border-l-4 ${item.priority === 'critical' ? 'border-l-red-500' : item.priority === 'high' ? 'border-l-amber-500' : 'border-l-purple-400'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tBadge.cls}`}>{tBadge.label}</span>
                              <button onClick={() => setAgentFilter(item.agent_name)} className="text-xs font-bold text-[#7A3722] hover:underline">{item.agent_name}</button>
                              <span className="text-[10px] text-slate-400">{fmt(item.created_date)}</span>
                            </div>
                            <h3 className="font-bold text-slate-800">{item.title}</h3>
                            {item.body && <p className="text-sm text-slate-600 whitespace-pre-wrap mt-1">{item.body}</p>}
                          </div>
                          {item.status === 'open' && (
                            <div className="flex flex-col gap-1 shrink-0">
                              {item.requires_action && (
                                <button onClick={() => act(item, 'approved')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg">✓ אשר</button>
                              )}
                              {item.requires_action && (
                                <button onClick={() => act(item, 'rejected')} className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold px-2.5 py-1 rounded-lg">✕ דחה</button>
                              )}
                              <button onClick={() => act(item, 'dismissed')} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg">סגור</button>
                            </div>
                          )}
                          {item.status !== 'open' && (
                            <span className="text-xs text-slate-400 shrink-0">{
                              item.status === 'approved' ? '✓ אושר' :
                              item.status === 'rejected' ? '✕ נדחה' : '↓ נסגר'
                            }</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Agent tree column */}
          {showAgentPanel && (
            <div>
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[#A04A2E]" />
                    עץ הסוכנים ({agents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
                  {grouped.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">אין סוכנים. לחץ "אתחל 23 סוכנים" כדי להקים אותם.</p>
                  ) : grouped.map(g => (
                    <div key={g.role}>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{ROLE_LABEL[g.role] || g.role}</p>
                      <div className="space-y-1.5">
                        {g.agents.map(a => (
                          <div key={a.id} className={`flex items-center gap-2 border rounded-lg p-2 text-sm ${ROLE_COLOR[g.role] || 'border-slate-200'} ${a.is_active ? '' : 'opacity-50'}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${a.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{a.display_name}</p>
                              <p className="text-[10px] text-slate-500">{a.name} · {a._count?.runs ?? 0} ריצות</p>
                            </div>
                            <button
                              onClick={() => runAgent(a)}
                              disabled={runningAgentId === a.id || !a.is_active}
                              title="הרץ עכשיו"
                              className="p-1 rounded hover:bg-white text-[#7A3722] disabled:opacity-30"
                            >
                              {runningAgentId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => toggleAgent(a)}
                              title={a.is_active ? 'השבת' : 'הפעל'}
                              className="p-1 rounded hover:bg-white text-slate-500"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
