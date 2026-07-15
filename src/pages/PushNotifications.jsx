import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bell, Send, Users, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { sendPushoverNotification } from '@/functions/sendPushoverNotification';
import { format } from 'date-fns';

export default function PushNotifications() {
    const [employees, setEmployees] = useState([]);
    const [todayShiftEmployeeIds, setTodayShiftEmployeeIds] = useState([]);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [mode, setMode] = useState('all_admins'); // all_admins | today_shift | department | custom
    const [department, setDepartment] = useState('floor');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [emps, workShifts] = await Promise.all([
            base44.entities.Employee.filter({ status: 'active' }),
            base44.entities.WorkShift.filter({ date: format(new Date(), 'yyyy-MM-dd') }),
        ]);
        setEmployees(emps);

        const todayIds = new Set();
        for (const ws of workShifts) {
            for (const s of (ws.assigned_staff || [])) {
                if (s.employee_id) todayIds.add(s.employee_id);
            }
        }
        setTodayShiftEmployeeIds([...todayIds]);
    };

    const getTargetEmployees = () => {
        if (mode === 'all_admins') {
            return employees.filter(e => e.pushover_user_key && e.role === 'admin');
        }
        if (mode === 'today_shift') {
            return employees.filter(e => e.pushover_user_key && todayShiftEmployeeIds.includes(e.id));
        }
        if (mode === 'department') {
            return employees.filter(e => e.pushover_user_key && e.department === department);
        }
        if (mode === 'custom') {
            return employees.filter(e => e.pushover_user_key && selectedEmployeeIds.includes(e.id));
        }
        return [];
    };

    const targets = getTargetEmployees();

    const handleSend = async () => {
        if (!message.trim() || targets.length === 0) return;
        setSending(true);
        setResult(null);
        const keys = targets.map(e => e.pushover_user_key);
        const res = await sendPushoverNotification({
            user_keys: keys,
            title: title.trim() || 'TOP APOLLO',
            message: message.trim(),
        });
        setSending(false);
        setResult({ ok: true, count: keys.length });
        setMessage('');
        setTitle('');
    };

    const toggleEmployee = (id) => {
        setSelectedEmployeeIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const empWithKey = employees.filter(e => e.pushover_user_key);
    const empWithoutKey = employees.filter(e => !e.pushover_user_key);

    return (
        <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
            <PageHeader title="שליחת Push ידני" subtitle="שלח הודעת Push לעובדים או קבוצות" icon={Bell} />

            {/* בחירת קהל יעד */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" /> קהל יעד
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { key: 'all_admins', label: '👑 מנהלים בלבד' },
                            { key: 'today_shift', label: '📅 עובדים בסידור היום' },
                            { key: 'department', label: '🏢 מחלקה' },
                            { key: 'custom', label: '✋ בחירה ידנית' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => { setMode(opt.key); setSelectedEmployeeIds([]); }}
                                className={`px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-all text-right ${mode === opt.key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:border-primary/40'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {mode === 'department' && (
                        <div className="flex gap-2 mt-2">
                            {[
                                { key: 'floor', label: '🛎️ פלור' },
                                { key: 'kitchen', label: '🍳 מטבח' },
                            ].map(d => (
                                <button
                                    key={d.key}
                                    onClick={() => setDepartment(d.key)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${department === d.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'}`}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {mode === 'custom' && (
                        <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                            {empWithKey.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">אין עובדים עם Pushover מוגדר</p>
                            )}
                            {empWithKey.map(emp => (
                                <label key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedEmployeeIds.includes(emp.id)}
                                        onChange={() => toggleEmployee(emp.id)}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm font-medium">{emp.full_name}</span>
                                    {emp.department && <Badge variant="outline" className="text-xs">{emp.department === 'floor' ? 'פלור' : 'מטבח'}</Badge>}
                                </label>
                            ))}
                        </div>
                    )}

                    {/* נמענים שנבחרו */}
                    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${targets.length > 0 ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                        {targets.length > 0 ? (
                            <><CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /><span className="text-green-800 font-medium">יישלח ל-{targets.length} עובדים: {targets.map(e => e.full_name).join(', ')}</span></>
                        ) : (
                            <><AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0" /><span className="text-orange-800">אין עובדים עם Pushover בקבוצה זו</span></>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* תוכן ההודעה */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="w-4 h-4" /> תוכן ההודעה
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">כותרת (אופציונלי)</label>
                        <Input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="TOP APOLLO"
                            className="text-right"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">הודעה *</label>
                        <Textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="כתוב את ההודעה כאן..."
                            rows={4}
                            className="text-right"
                        />
                    </div>

                    {result && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                            <CheckCircle className="w-4 h-4" />
                            <span>ההודעה נשלחה ל-{result.count} עובדים! ✅</span>
                        </div>
                    )}

                    <Button
                        onClick={handleSend}
                        disabled={sending || !message.trim() || targets.length === 0}
                        className="w-full"
                    >
                        <Send className="w-4 h-4 ml-2" />
                        {sending ? 'שולח...' : `שלח ל-${targets.length} עובדים`}
                    </Button>
                </CardContent>
            </Card>

            {/* עובדים ללא Pushover */}
            {empWithoutKey.length > 0 && (
                <Card className="border-orange-200">
                    <CardContent className="p-4">
                        <p className="text-sm text-orange-700 font-medium mb-2">⚠️ {empWithoutKey.length} עובדים ללא Pushover מוגדר:</p>
                        <div className="flex flex-wrap gap-1">
                            {empWithoutKey.map(e => (
                                <Badge key={e.id} variant="outline" className="text-xs border-orange-300 text-orange-600">{e.full_name}</Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}