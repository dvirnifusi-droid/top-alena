import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, CheckCircle, Clock, XCircle, Star, MessageSquare, AlertTriangle, Bell, ChevronDown, ChevronUp, Send, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { sendPushoverNotification } from '@/functions/sendPushoverNotification';
import { sendDeliveryMessage } from '@/functions/sendDeliveryMessage';
import CandidateAiScore from '@/components/ai/CandidateAiScore';

const STATUS_LABELS = {
    approved: { label: 'סיים בהצלחה', color: 'bg-green-100 text-green-800' },
    pending: { label: 'ממתין / באמצע', color: 'bg-[#F4ECD8] text-yellow-800' },
    rejected: { label: 'נדחה', color: 'bg-red-100 text-red-800' },
};

const INCOMPLETE_STAGE_LABELS = {
    no_name: 'לא הזין שם',
    no_role: 'לא בחר תפקיד',
    no_experience: 'לא ענה על ניסיון',
    no_shifts: 'לא ענה על משמרות',
    no_weekend: 'לא ענה על סופ"ש',
    partial: 'מילא חלקית',
};

function StarRating({ value, onChange }) {
    const [hover, setHover] = useState(0);
    return (
        <div className="flex gap-0.5 items-center">
            {[1, 2, 3, 4, 5].map(s => (
                <button
                    key={s}
                    onClick={() => onChange(s === value ? 0 : s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(0)}
                    className="focus:outline-none"
                    title={`${s} כוכבים`}
                >
                    <Star
                        className={`w-4 h-4 transition-colors ${
                            s <= (hover || value)
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-slate-300'
                        }`}
                    />
                </button>
            ))}
        </div>
    );
}

const DEFAULT_FOLLOWUP_MESSAGE = `שלום {שם}! 😊
תודה שהשתתפת בראיון הדיגיטלי שלנו למסעדה שלנו.
אנחנו בוחנים את המועמדות שלך ונחזור אליך בהקדם.
אם יש לך שאלות, אל תהסס/י לכתוב כאן.

– הצוות ❤️`;

const INTERVIEW_MESSAGE_TEMPLATE = `שלום {שם}! 🌿

עברנו על הפרטים שלך ואנחנו מאוד מתרשמים!
נשמח לזמן אותך לראיון פרונטלי במסעדת עלינא.

📅 תאריכים אפשריים:
{לוז}

אנא עדכן/י אותנו מה מתאים לך — נאשר ונשלח כתובת 🙏

– הצוות ❤️`;

function InterviewScheduleModal({ candidate, onClose }) {
    const [schedule, setSchedule] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSend = async () => {
        if (!schedule.trim()) return;
        setSending(true);
        setError('');
        const msg = INTERVIEW_MESSAGE_TEMPLATE
            .replace('{שם}', candidate.full_name || 'מועמד')
            .replace('{לוז}', schedule.trim());
        const res = await sendDeliveryMessage({ channel: 'whatsapp', recipients: [{ phone: candidate.phone }], message: msg });
        const result = res?.data?.results?.[0];
        if (result?.status === 'sent') {
            setSent(true);
            setTimeout(() => onClose(), 2000);
        } else {
            setError(result?.error || 'שגיאה בשליחה');
        }
        setSending(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-slate-800 mb-1 text-base">📅 תיאום ראיון פרונטלי</h3>
                <p className="text-xs text-slate-500 mb-3">
                    שליחת הצעת ראיון ל<b>{candidate.full_name}</b> ({candidate.phone})
                </p>
                <label className="text-xs font-semibold text-slate-600 block mb-1">הלוח זמנים המוצע (כתוב כל אפשרות בשורה נפרדת):</label>
                <textarea
                    value={schedule}
                    onChange={e => setSchedule(e.target.value)}
                    placeholder={`לדוגמה:\n• יום שלישי 20/5 בשעה 16:00\n• יום רביעי 21/5 בשעה 11:00\n• יום חמישי 22/5 בשעה 14:00`}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 h-28"
                    autoFocus
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={onClose} variant="outline" className="flex-1">ביטול</Button>
                    <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={sending || !schedule.trim() || sent}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                        {sent ? '✅ נשלח!' : sending ? 'שולח...' : '📲 שלח וואטסאפ'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CandidateRow({ candidate, onRatingChange, onNoteChange, onSendPush }) {
    const [expanded, setExpanded] = useState(false);
    const [note, setNote] = useState(candidate.notes || '');
    const [saving, setSaving] = useState(false);
    const [pushSent, setPushSent] = useState(false);
    const [waSending, setWaSending] = useState(false);
    const [waSent, setWaSent] = useState(false);
    const [waError, setWaError] = useState('');
    const [showInterviewModal, setShowInterviewModal] = useState(false);

    const handleSendWhatsApp = async (e) => {
        e.stopPropagation();
        if (!candidate.phone) { setWaError('אין מספר טלפון'); return; }
        setWaSending(true);
        setWaError('');
        const msg = DEFAULT_FOLLOWUP_MESSAGE.replace('{שם}', candidate.full_name || 'מועמד');
        const res = await sendDeliveryMessage({ channel: 'whatsapp', recipients: [{ phone: candidate.phone }], message: msg });
        const result = res?.data?.results?.[0];
        if (result?.status === 'sent') {
            setWaSent(true);
            setTimeout(() => setWaSent(false), 4000);
        } else {
            setWaError(result?.error || 'שגיאה בשליחה');
        }
        setWaSending(false);
    };

    const saveNote = async () => {
        setSaving(true);
        await base44.entities.JobCandidate.update(candidate.id, { notes: note });
        setSaving(false);
        onNoteChange(candidate.id, note);
    };

    const handlePush = async () => {
        await onSendPush(candidate);
        setPushSent(true);
        setTimeout(() => setPushSent(false), 3000);
    };

    const isIncomplete = candidate.status === 'pending' && !candidate.score;
    const statusInfo = STATUS_LABELS[candidate.status] || STATUS_LABELS.pending;

    // Determine what stage they stopped at
    const getStopStage = (c) => {
        if (!c.full_name) return INCOMPLETE_STAGE_LABELS.no_name;
        if (!c.role_applied) return INCOMPLETE_STAGE_LABELS.no_role;
        if (!c.experience) return INCOMPLETE_STAGE_LABELS.no_experience;
        if (!c.shifts_per_week) return INCOMPLETE_STAGE_LABELS.no_shifts;
        if (c.weekend_availability === undefined || c.weekend_availability === null) return INCOMPLETE_STAGE_LABELS.no_weekend;
        return INCOMPLETE_STAGE_LABELS.partial;
    };

    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* שורה ראשית */}
            <div
                className="flex items-center gap-3 p-3 bg-white hover:bg-[#FAF5E8] cursor-pointer"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">
                            {candidate.full_name || <span className="text-slate-400 italic">ללא שם</span>}
                        </span>
                        {candidate.phone && (
                            <span className="flex items-center gap-1">
                                <a
                                    href={`tel:${candidate.phone}`}
                                    onClick={e => e.stopPropagation()}
                                    className="text-xs text-[#44512C] font-mono hover:underline flex items-center gap-0.5"
                                    title="התקשר"
                                >
                                    <Phone className="w-3 h-3" />{candidate.phone}
                                </a>
                                <a
                                    href={`https://wa.me/${candidate.phone.replace(/\D/g, '').replace(/^0/, '972')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded px-1 py-0.5 font-semibold"
                                    title="פתח וואטסאפ"
                                >
                                    💬
                                </a>
                            </span>
                        )}
                        {candidate.role_applied && (
                            <span className="text-xs text-slate-500">· {candidate.role_applied}</span>
                        )}
                        {candidate.city && (
                            <span className="text-xs text-slate-400">· {candidate.city}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={`text-xs px-2 py-0 ${statusInfo.color}`}>
                            {statusInfo.label}
                        </Badge>
                        {isIncomplete && (
                            <Badge className="text-xs px-2 py-0 bg-orange-100 text-orange-800">
                                ⚠️ עצר: {getStopStage(candidate)}
                            </Badge>
                        )}
                        {candidate.score > 0 && (
                            <span className="text-xs text-slate-500">ציון: {candidate.score}</span>
                        )}
                    </div>
                </div>

                {/* דירוג כוכבים */}
                <div onClick={e => e.stopPropagation()}>
                    <StarRating
                        value={candidate._rating || 0}
                        onChange={(val) => onRatingChange(candidate.id, val)}
                    />
                </div>

                {/* פוש לא סיים */}
                {isIncomplete && (
                    <button
                        onClick={e => { e.stopPropagation(); handlePush(); }}
                        title="שלח התראה על מועמד שלא סיים"
                        className={`p-1.5 rounded-lg transition-colors ${pushSent ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    >
                        <Bell className="w-4 h-4" />
                    </button>
                )}

                {/* שלח וואטסאפ לסיים ראיון */}
                {candidate.status === 'approved' && candidate.phone && (
                    <button
                        onClick={handleSendWhatsApp}
                        disabled={waSending}
                        title="שלח הודעת וואטסאפ עדכון"
                        className={`p-1.5 rounded-lg transition-colors text-xs flex items-center gap-1 ${
                            waSent ? 'bg-green-100 text-green-700' :
                            waError ? 'bg-red-100 text-red-600' :
                            'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                    >
                        <Send className="w-4 h-4" />
                        {waSending ? '...' : waSent ? '✓' : waError ? '!' : ''}
                    </button>
                )}

                {/* תיאום ראיון פרונטלי - רק למועמדים מדורגים */}
                {candidate._rating > 0 && candidate.phone && (
                    <button
                        onClick={e => { e.stopPropagation(); setShowInterviewModal(true); }}
                        title="שלח הצעת ראיון פרונטלי"
                        className="p-1.5 rounded-lg bg-[#F4ECD8] text-[#7A3722] hover:bg-[#F4ECD8] transition-colors text-xs font-semibold flex items-center gap-1"
                    >
                        📅
                    </button>
                )}

                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
            </div>

            {showInterviewModal && (
                <InterviewScheduleModal candidate={candidate} onClose={() => setShowInterviewModal(false)} />
            )}

            {/* פרטים מורחבים */}
            {expanded && (
            <div className="p-3 bg-[#FAF5E8] border-t border-slate-200 space-y-3">
            <CandidateAiScore candidate={candidate} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {candidate.phone && (
                            <span className="text-slate-600 col-span-2 sm:col-span-1">
                                📱 טלפון: <a href={`tel:${candidate.phone}`} className="font-bold text-[#44512C] hover:underline">{candidate.phone}</a>
                            </span>
                        )}
                        {candidate.age && <span className="text-slate-600">גיל: <b>{candidate.age}</b></span>}
                        {candidate.shifts_per_week && <span className="text-slate-600">משמרות/שבוע: <b>{candidate.shifts_per_week}</b></span>}
                        {candidate.weekend_availability !== undefined && candidate.weekend_availability !== null && (
                            <span className="text-slate-600">סופ"ש: <b>{candidate.weekend_availability ? 'כן' : 'לא'}</b></span>
                        )}
                        {candidate.start_date && <span className="text-slate-600">התחלה: <b>{candidate.start_date}</b></span>}
                        {candidate.source && <span className="text-slate-600">מקור: <b>{candidate.source}</b></span>}
                        {candidate.created_date && (
                            <span className="text-slate-600">תאריך: <b>{new Date(candidate.created_date).toLocaleDateString('he-IL')}</b></span>
                        )}
                    </div>
                    {candidate.experience && (
                        <p className="text-sm text-slate-700 bg-white rounded-lg p-2 border">
                            <b>ניסיון:</b> {candidate.experience}
                        </p>
                    )}

                    {/* הערות */}
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> הערות אישיות
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="רשום דגשים לאחר עיון בראיון..."
                            className="w-full text-sm border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            rows={2}
                        />
                        <Button
                            size="sm"
                            onClick={saveNote}
                            disabled={saving || note === (candidate.notes || '')}
                            className="mt-1 h-7 text-xs"
                        >
                            {saving ? 'שומר...' : 'שמור הערה'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RecruitmentDashboard() {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ratings, setRatings] = useState({});
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [bulkSending, setBulkSending] = useState(false);
    const [bulkResult, setBulkResult] = useState('');

    const loadCandidates = useCallback(async () => {
        setLoading(true);
        const all = await base44.entities.JobCandidate.list('-created_date', 200);
        setCandidates(all);
        // טען דירוגים מה-notes אם קיים (שמורים כ metadata קטן)
        const r = {};
        all.forEach(c => {
            if (c._rating) r[c.id] = c._rating;
        });
        setRatings(r);
        setLoading(false);
    }, []);

    useEffect(() => { loadCandidates(); }, [loadCandidates]);

    const handleRatingChange = async (id, val) => {
        setRatings(prev => ({ ...prev, [id]: val }));
        await base44.entities.JobCandidate.update(id, { score: val * 20 }); // 1-5 כוכבים → 20-100 ציון
    };

    const handleNoteChange = (id, note) => {
        setCandidates(prev => prev.map(c => c.id === id ? { ...c, notes: note } : c));
    };

    const handleBulkWhatsApp = async () => {
        const toSend = candidates.filter(c => c.status === 'approved' && c.phone);
        if (toSend.length === 0) { setBulkResult('אין מועמדים שסיימו עם מספר טלפון'); return; }
        setBulkSending(true);
        setBulkResult('');
        let sent = 0, failed = 0;
        for (const c of toSend) {
            const msg = DEFAULT_FOLLOWUP_MESSAGE.replace('{שם}', c.full_name || 'מועמד');
            const res = await sendDeliveryMessage({ channel: 'whatsapp', recipients: [{ phone: c.phone }], message: msg });
            const result = res?.data?.results?.[0];
            if (result?.status === 'sent') sent++; else failed++;
        }
        setBulkResult(`✅ נשלחו ${sent} הודעות${failed > 0 ? ` | ❌ ${failed} נכשלו` : ''}`);
        setBulkSending(false);
        setTimeout(() => setBulkResult(''), 6000);
    };

    const handleSendPush = async (candidate) => {
        const stageStopped = (() => {
            if (!candidate.full_name) return 'לא הזין שם';
            if (!candidate.role_applied) return 'לא בחר תפקיד';
            if (!candidate.experience) return 'לא ענה על ניסיון';
            if (!candidate.shifts_per_week) return 'לא ענה על משמרות';
            return 'מילא חלקית';
        })();
        await sendPushoverNotification({
            title: '⚠️ מועמד לא סיים תהליך גיוס',
            message: `${candidate.full_name || 'מועמד ללא שם'} (${candidate.role_applied || 'תפקיד לא ידוע'}) עצר בשלב: ${stageStopped}.\nניתן לשלוח לו הודעה ולעודד אותו להמשיך.`,
        });
    };

    // פילטור
    const filtered = candidates.filter(c => {
        if (statusFilter === 'approved' && c.status !== 'approved') return false;
        if (statusFilter === 'pending' && c.status !== 'pending') return false;
        if (statusFilter === 'rejected' && c.status !== 'rejected') return false;
        if (statusFilter === 'incomplete') {
            if (c.status !== 'pending' || c.score) return false;
        }
        if (dateFrom) {
            const cDate = new Date(c.created_date);
            if (cDate < new Date(dateFrom)) return false;
        }
        if (dateTo) {
            const cDate = new Date(c.created_date);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59);
            if (cDate > to) return false;
        }
        return true;
    });

    // סטטיסטיקות
    const total = candidates.length;
    const completed = candidates.filter(c => c.status === 'approved').length;
    const pending = candidates.filter(c => c.status === 'pending').length;
    const rejected = candidates.filter(c => c.status === 'rejected').length;
    const incomplete = candidates.filter(c => c.status === 'pending' && !c.score).length;

    const statsItems = [
        { label: 'סה״כ', value: total, icon: Users, color: 'text-[#44512C]', bg: 'bg-[#F4ECD8]', filter: 'all' },
        { label: 'סיימו', value: completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', filter: 'approved' },
        { label: 'ממתינים', value: pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-[#FAF5E8]', filter: 'pending' },
        { label: 'לא סיימו', value: incomplete, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', filter: 'incomplete' },
        { label: 'נדחו', value: rejected, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', filter: 'rejected' },
    ];

    const enriched = filtered.map(c => ({ ...c, _rating: ratings[c.id] || (c.score ? Math.round(c.score / 20) : 0) }));

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        📋 לוח בקרת גיוס – בוט וואטסאפ
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        {bulkResult && <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">{bulkResult}</span>}
                        <Button
                            size="sm"
                            onClick={handleBulkWhatsApp}
                            disabled={bulkSending}
                            className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                        >
                            <Send className="w-3 h-3" />
                            {bulkSending ? 'שולח...' : `📲 שלח וואטסאפ לכל שסיימו (${candidates.filter(c => c.status === 'approved' && c.phone).length})`}
                        </Button>
                    </div>
                </div>

                {/* סטטיסטיקות קליקביליות */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                    {statsItems.map(({ label, value, icon: Icon, color, bg, filter }) => (
                        <button
                            key={label}
                            onClick={() => setStatusFilter(f => f === filter ? 'all' : filter)}
                            className={`rounded-xl p-2.5 ${bg} flex flex-col items-center gap-1 border-2 transition-all ${statusFilter === filter ? 'border-indigo-400 shadow-md' : 'border-transparent'}`}
                        >
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className={`text-xl font-black ${color}`}>{loading ? '...' : value}</span>
                            <span className="text-xs text-slate-600 text-center leading-tight">{label}</span>
                        </button>
                    ))}
                </div>

                {/* פס התקדמות */}
                {!loading && total > 0 && (
                    <div className="mb-4 bg-[#FAF5E8] rounded-lg p-3">
                        <div className="flex justify-between text-sm text-slate-600 mb-1">
                            <span>אחוז השלמה</span>
                            <span className="font-bold">{Math.round((completed / total) * 100)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
                        </div>
                    </div>
                )}

                {/* פילטר תאריכים */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs font-semibold text-slate-600">📅 סינון לפי תאריך:</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                    <span className="text-xs text-slate-400">עד</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                    {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-red-500 hover:underline">נקה</button>
                    )}
                    <span className="text-xs text-slate-400 mr-auto">{filtered.length} מועמדים</span>
                </div>

                {/* רשימת מועמדים */}
                {loading ? (
                    <p className="text-center text-slate-400 py-6">טוען...</p>
                ) : enriched.length === 0 ? (
                    <p className="text-center text-slate-400 py-6">אין מועמדים בסינון זה</p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {enriched.map(c => (
                            <CandidateRow
                                key={c.id}
                                candidate={c}
                                onRatingChange={handleRatingChange}
                                onNoteChange={handleNoteChange}
                                onSendPush={handleSendPush}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}