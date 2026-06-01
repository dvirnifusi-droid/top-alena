import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, RefreshCw, Inbox, Bell, CheckCircle2, XCircle, Activity, ScrollText } from 'lucide-react';
import { AgentMessage, DecisionLog } from '@/entities/all';
import { runCEOBrief, loadRegistry, systemStatusLine } from '@/agents';

const TEMPLATE_STYLES = {
  A: { ring: 'ring-blue-400',   pill: 'bg-blue-100 text-blue-800',   icon: '📊', label: 'סיכום' },
  B: { ring: 'ring-yellow-400', pill: 'bg-yellow-100 text-yellow-800', icon: '🟡', label: 'דרושה אישור' },
  C: { ring: 'ring-red-500',    pill: 'bg-red-100 text-red-800',     icon: '🔴', label: 'התראה קריטית' },
  D: { ring: 'ring-green-500',  pill: 'bg-green-100 text-green-800', icon: '🟢', label: 'הישג' },
};

const PRIORITY_LABEL = {
  1: 'P1 — בטיחות',
  2: 'P2 — תזרים',
  3: 'P3 — מותג',
  4: 'P4 — מרג׳ין',
  5: 'P5 — צמיחה',
  6: 'P6 — יעילות',
};

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch { return iso; }
}

function MessageCard({ msg, onRespond }) {
  const t = msg.owner_template || 'A';
  const style = TEMPLATE_STYLES[t] || TEMPLATE_STYLES.A;
  const body = msg.payload?.hebrew_message || msg.payload?.summary || '';
  const needsResponse = msg.requires_response && !msg.owner_response;

  return (
    <Card className={`relative ring-2 ${style.ring}`} dir="rtl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-xl">{style.icon}</span>
            <span>{msg.payload?.summary || msg.topic}</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge className={style.pill}>{style.label}</Badge>
            <Badge variant="outline">{PRIORITY_LABEL[msg.priority_tier] || `P${msg.priority_tier}`}</Badge>
          </div>
        </div>
        <CardDescription className="text-xs">
          {msg.from_agent} • {fmtTime(msg.created_date)}
          {msg.payload?.data_quality && <> • איכות נתונים: {msg.payload.data_quality}</>}
          {typeof msg.payload?.confidence === 'number' && <> • ביטחון: {(msg.payload.confidence * 100).toFixed(0)}%</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{body}</pre>
        {needsResponse && (
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={() => onRespond(msg, 'yes')} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 ml-1" /> כן, מאשר
            </Button>
            <Button size="sm" variant="outline" onClick={() => onRespond(msg, 'no')}>
              <XCircle className="w-4 h-4 ml-1" /> לא
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRespond(msg, 'comment')}>
              פרט / שאל
            </Button>
          </div>
        )}
        {msg.owner_response && (
          <div className="mt-3 text-xs text-muted-foreground">
            תשובתך: {msg.owner_response.answer} {msg.owner_response.note ? `— ${msg.owner_response.note}` : ''} ({fmtTime(msg.responded_at)})
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentInboxPage() {
  const [messages, setMessages] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
    const [msgs, decs, reg] = await Promise.all([
      safe(() => AgentMessage.filter({ owner_visible: true }, '-created_date', 100), []),
      safe(() => DecisionLog.list('-created_date', 100), []),
      safe(() => loadRegistry(), []),
    ]);
    setMessages(msgs || []);
    setDecisions(decs || []);
    setRegistry(reg || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const runBrief = async (slot = 'manual') => {
    setRunning(true);
    setLastError(null);
    try {
      const res = await runCEOBrief({ slot });
      if (!res.ok) setLastError(res.error || 'נכשל ללא פירוט');
      setLastRun({ at: new Date().toISOString(), ok: res.ok, template: res.brief?.template });
      await loadAll();
    } catch (e) {
      setLastError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const respond = async (msg, answer) => {
    let note = '';
    if (answer === 'comment') {
      note = window.prompt('כתוב הערה / שאלה לסוכן:') || '';
      if (!note) return;
    }
    try {
      await AgentMessage.update(msg.id || msg.msg_id, {
        owner_response: { answer, note },
        responded_at: new Date().toISOString(),
      });
      await loadAll();
    } catch (e) {
      setLastError(e?.message || String(e));
    }
  };

  const pendingApprovals = messages.filter(m => m.requires_response && !m.owner_response);
  const reports = messages.filter(m => !(m.requires_response && !m.owner_response));
  const liveCount = registry.filter(a => a.status === 'LIVE').length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Inbox className="w-7 h-7 text-blue-600" />
            תיבת הסוכן — Agent Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {systemStatusLine(registry)} {lastRun && <> • הרצה אחרונה: {fmtTime(lastRun.at)} ({lastRun.template || 'שגיאה'})</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
          <Button onClick={() => runBrief('manual')} disabled={running} className="bg-blue-600 hover:bg-blue-700">
            {running ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Play className="w-4 h-4 ml-2" />}
            הפעל CEO Brief עכשיו
          </Button>
        </div>
      </div>

      {lastError && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="pt-4 text-red-700 text-sm">
            שגיאה אחרונה: {lastError}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="reports" dir="rtl">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl mb-4">
          <TabsTrigger value="reports"><Bell className="w-4 h-4 ml-1" /> דיווחים ({reports.length})</TabsTrigger>
          <TabsTrigger value="pending">
            <CheckCircle2 className="w-4 h-4 ml-1" />
            ממתינות {pendingApprovals.length ? <Badge className="mr-1 bg-yellow-500">{pendingApprovals.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="system"><Activity className="w-4 h-4 ml-1" /> מצב מערכת ({liveCount}/{registry.length})</TabsTrigger>
          <TabsTrigger value="log"><ScrollText className="w-4 h-4 ml-1" /> לוג החלטות</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-3">
          {loading && <Loader2 className="w-6 h-6 animate-spin mx-auto" />}
          {!loading && reports.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              אין עדיין דיווחים. לחץ "הפעל CEO Brief עכשיו" כדי לקבל את הראשון.
            </CardContent></Card>
          )}
          {reports.map(m => <MessageCard key={m.id || m.msg_id} msg={m} onRespond={respond} />)}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          {!loading && pendingApprovals.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              אין בקשות ממתינות. הכל בשליטה ✓
            </CardContent></Card>
          )}
          {pendingApprovals.map(m => <MessageCard key={m.id || m.msg_id} msg={m} onRespond={respond} />)}
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>מצב הסוכנים</CardTitle>
              <CardDescription>
                {liveCount}/{registry.length} פעילים. סוכנים DORMANT — עוד לא הוקמו (לפי תוכנית הקמה הדרגתית).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>סוכן</TableHead>
                    <TableHead>תפקיד</TableHead>
                    <TableHead>מדווח ל</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>פעימה אחרונה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registry.map(a => (
                    <TableRow key={a.codename}>
                      <TableCell className="font-mono text-xs">{a.codename}</TableCell>
                      <TableCell>{a.role}</TableCell>
                      <TableCell className="font-mono text-xs">{a.parent_agent_id || '—'}</TableCell>
                      <TableCell>
                        <Badge className={
                          a.status === 'LIVE' ? 'bg-green-100 text-green-800' :
                          a.status === 'FAILING' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-600'
                        }>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{fmtTime(a.last_heartbeat)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle>לוג החלטות</CardTitle>
              <CardDescription>אודיט של כל החלטה שה-CEO קיבל. בסיס לבדיקה שבועית.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>זמן</TableHead>
                    <TableHead>טריגר</TableHead>
                    <TableHead>החלטה</TableHead>
                    <TableHead>השפעה ₪</TableHead>
                    <TableHead>אושר?</TableHead>
                    <TableHead>תוצאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">אין רישומים עדיין.</TableCell></TableRow>
                  )}
                  {decisions.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{fmtTime(d.created_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.trigger_agent}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={d.decision_summary}>{d.decision_summary || d.decision}</TableCell>
                      <TableCell className="text-xs">{d.ils_impact_estimate ?? '—'}</TableCell>
                      <TableCell className="text-xs">{d.owner_approved === true ? '✓' : d.owner_approved === false ? '✗' : '—'}</TableCell>
                      <TableCell><Badge variant="outline">{d.outcome || 'PENDING'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
