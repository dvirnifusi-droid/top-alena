import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Employee } from '@/entities/Employee';
import { User } from '@/entities/User';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Plus, CalendarDays, Check, X, Clock, Loader2, Pencil } from 'lucide-react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import PageGuard from '../components/shared/PageGuard';

const LEAVE_TYPES = {
    vacation: { label: 'חופשה', color: 'bg-[#F4ECD8] text-[#2E3819]', emoji: '🏖️' },
    sick: { label: 'מחלה', color: 'bg-red-100 text-red-800', emoji: '🤒' },
    personal: { label: 'אישי', color: 'bg-[#F4ECD8] text-[#7A3722]', emoji: '👤' },
    military: { label: 'מילואים', color: 'bg-green-100 text-green-800', emoji: '🎖️' },
    other: { label: 'אחר', color: 'bg-gray-100 text-gray-800', emoji: '📝' },
};

const STATUS_CONFIG = {
    pending: { label: 'ממתין לאישור', color: 'bg-[#F4ECD8] text-yellow-800', icon: Clock },
    approved: { label: 'מאושר', color: 'bg-green-100 text-green-800', icon: Check },
    rejected: { label: 'נדחה', color: 'bg-red-100 text-red-800', icon: X },
};

function EditDatesDialog({ open, onClose, req, onSaved }) {
    const [startDate, setStartDate] = useState(req?.start_date || '');
    const [endDate, setEndDate] = useState(req?.end_date || '');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (req) { setStartDate(req.start_date); setEndDate(req.end_date); }
    }, [req]);

    const handleSave = async () => {
        if (!startDate || !endDate) return;
        setLoading(true);
        await base44.entities.LeaveRequest.update(req.id, { start_date: startDate, end_date: endDate });
        setLoading(false);
        onSaved();
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-sm">
                <DialogHeader><DialogTitle>עריכת תאריכי חופשה</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>מתאריך</Label>
                        <Input type="date" className="mt-1" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <Label>עד תאריך</Label>
                        <Input type="date" className="mt-1" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button onClick={handleSave} disabled={!startDate || !endDate || loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null} שמור
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LeaveRequestCard({ req, isManager, onApprove, onReject, onEdit, actionLoading }) {
     const leaveType = LEAVE_TYPES[req.leave_type] || LEAVE_TYPES.other;
     const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
     const StatusIcon = statusCfg.icon;

     const days = req.start_date && req.end_date
         ? eachDayOfInterval({ start: parseISO(req.start_date), end: parseISO(req.end_date) }).length
         : 0;

     return (
         <Card className={`border-r-4 ${req.status === 'approved' ? 'border-r-green-400' : req.status === 'rejected' ? 'border-r-red-400' : 'border-r-yellow-400'}`}>
             <CardContent className="p-3 md:p-4">
                 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                     <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 flex-wrap mb-1">
                             <span className="text-lg">{leaveType.emoji}</span>
                             <span className="font-bold text-gray-900 text-sm sm:text-base">{isManager ? req.employee_name : leaveType.label}</span>
                             {isManager && <Badge className={`${leaveType.color} text-xs`}>{leaveType.label}</Badge>}
                             <Badge className={`${statusCfg.color} text-xs`}>
                                 <StatusIcon className="w-3 h-3 ml-1" />
                                 {statusCfg.label}
                             </Badge>
                         </div>
                         <p className="text-xs sm:text-sm text-gray-600">
                             📅 {req.start_date && format(parseISO(req.start_date), 'dd/MM/yyyy')}
                             {req.end_date !== req.start_date && ` - ${format(parseISO(req.end_date), 'dd/MM/yyyy')}`}
                             <span className="mr-2 text-gray-500">({days} {days === 1 ? 'יום' : 'ימים'})</span>
                         </p>
                         {req.reason && <p className="text-xs sm:text-sm text-gray-500 mt-1 italic">"{req.reason}"</p>}
                         {req.manager_notes && <p className="text-xs sm:text-sm text-amber-700 mt-1 bg-amber-50 rounded px-2 py-1">📝 {req.manager_notes}</p>}
                     </div>
                     {isManager && (
                         <div className="flex gap-1 sm:gap-2 flex-shrink-0 w-full sm:w-auto">
                             {req.status === 'pending' && (
                                 <>
                                     <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8 flex-1 sm:flex-none" onClick={() => onApprove(req)} disabled={!!actionLoading}>
                                         {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                     </Button>
                                     <Button size="sm" variant="outline" className="border-red-300 text-red-600 h-8 flex-1 sm:flex-none" onClick={() => onReject(req)} disabled={!!actionLoading}>
                                         {actionLoading === req.id + '_r' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                     </Button>
                                 </>
                             )}
                             <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(req)}>
                                 <Pencil className="w-3 h-3" />
                             </Button>
                         </div>
                     )}
                 </div>
             </CardContent>
         </Card>
     );
 }

function NewLeaveRequestDialog({ open, onClose, currentEmployee, onSaved }) {
    const [form, setForm] = useState({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!form.start_date || !form.end_date) return;
        setLoading(true);
        await base44.entities.LeaveRequest.create({
            employee_id: currentEmployee?.id,
            employee_name: currentEmployee?.full_name,
            leave_type: form.leave_type,
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason,
            status: 'pending',
        });
        setLoading(false);
        onSaved();
        onClose();
        setForm({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-[#44512C]" />
                        בקשת חופשה / מחלה
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>סוג היעדרות</Label>
                        <Select value={form.leave_type} onValueChange={v => setForm(f => ({ ...f, leave_type: v }))}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>מתאריך</Label>
                            <Input type="date" className="mt-1" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))} />
                        </div>
                        <div>
                            <Label>עד תאריך</Label>
                            <Input type="date" className="mt-1" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <Label>סיבה (אופציונלי)</Label>
                        <Textarea className="mt-1" rows={2} placeholder="הוסף הערה..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                    </div>
                </div>
                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button onClick={handleSubmit} disabled={!form.start_date || !form.end_date || loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Plus className="w-4 h-4 ml-2" />}
                        שלח בקשה
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RejectDialog({ open, onClose, onConfirm, loading }) {
    const [notes, setNotes] = useState('');
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-sm">
                <DialogHeader><DialogTitle>דחיית בקשה</DialogTitle></DialogHeader>
                <div>
                    <Label>סיבת הדחייה (אופציונלי)</Label>
                    <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button variant="destructive" onClick={() => onConfirm(notes)} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null} דחה בקשה
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LeaveCalendar({ requests }) {
    const approved = requests.filter(r => r.status === 'approved');
    const today = new Date();
    const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // 0=ראשון, 6=שבת - מתחילים מיום א׳
    const startPad = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    // ממלאים שארית השורה האחרונה
    while (days.length % 7 !== 0) days.push(null);

    const getEmployeesOnLeave = (date) => {
        if (!date) return [];
        const ds = format(date, 'yyyy-MM-dd');
        return approved.filter(r => r.start_date <= ds && r.end_date >= ds);
    };

    const DAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm sm:text-base">לוח חופשות מאושרות</CardTitle>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setMonthDate(new Date(year, month - 1, 1))}>{'>'}</Button>
                        <span className="text-xs sm:text-sm font-medium min-w-[90px] text-center">{format(monthDate, 'MMMM yyyy', { locale: he })}</span>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setMonthDate(new Date(year, month + 1, 1))}>{'<'}</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-1 sm:px-6">
                <table className="w-full table-fixed border-collapse">
                    <thead>
                        <tr>
                            {DAYS_HE.map(d => (
                                <th key={d} className="text-center text-xs font-bold text-gray-500 py-1 w-[14.28%]">{d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: days.length / 7 }, (_, wi) => (
                            <tr key={wi}>
                                {days.slice(wi * 7, wi * 7 + 7).map((date, ci) => {
                                    const onLeave = date ? getEmployeesOnLeave(date) : [];
                                    const isToday = date && format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                                    return (
                                        <td key={ci} className={`align-top p-0.5 border text-xs ${!date ? 'border-transparent' : isToday ? 'border-blue-400 bg-[#F4ECD8]' : 'border-gray-100'}`} style={{height: '44px'}}>
                                            {date && (
                                                <>
                                                    <div className={`font-bold text-xs leading-none mb-0.5 ${isToday ? 'text-[#44512C]' : 'text-gray-700'}`}>{date.getDate()}</div>
                                                    {onLeave.slice(0, 1).map((r, j) => (
                                                        <div key={j} className={`rounded px-0.5 truncate text-[9px] leading-tight ${LEAVE_TYPES[r.leave_type]?.color || 'bg-gray-100'}`}>
                                                            {r.employee_name.split(' ')[0]}
                                                        </div>
                                                    ))}
                                                    {onLeave.length > 1 && (
                                                        <div className="text-[9px] text-gray-400">+{onLeave.length - 1}</div>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
}

function LeaveRequestsInner() {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newOpen, setNewOpen] = useState(false);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const isAdmin = currentUser?.role === 'admin';

    const loadData = async () => {
        setLoading(true);
        const user = await User.me();
        setCurrentUser(user);
        const allEmps = await Employee.filter({ status: 'active' });
        const myEmp = allEmps.find(e => e.email?.toLowerCase() === user.email?.toLowerCase());
        setCurrentEmployee(myEmp);

        let reqs;
        if (user.role === 'admin') {
            reqs = await base44.entities.LeaveRequest.list('-created_date', 100);
        } else if (myEmp) {
            reqs = await base44.entities.LeaveRequest.filter({ employee_id: myEmp.id });
        } else {
            reqs = [];
        }
        setRequests(reqs);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleApprove = async (req) => {
        setActionLoading(req.id);
        await base44.entities.LeaveRequest.update(req.id, { status: 'approved' });
        setActionLoading(null);
        loadData();
    };

    const handleReject = async (notes) => {
        setActionLoading(rejectTarget.id + '_r');
        await base44.entities.LeaveRequest.update(rejectTarget.id, { status: 'rejected', manager_notes: notes });
        setActionLoading(null);
        setRejectTarget(null);
        loadData();
    };

    const pendingReqs = requests.filter(r => r.status === 'pending');
    const pastReqs = requests.filter(r => r.status !== 'pending');

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

    return (
         <div className="p-4 md:p-8 max-w-5xl mx-auto" dir="rtl">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 flex-wrap">
                        <CalendarDays className="w-6 h-6 md:w-7 md:h-7 text-[#44512C] flex-shrink-0" />
                        {isAdmin ? 'ניהול בקשות חופשה' : 'הבקשות שלי'}
                    </h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">{isAdmin ? 'אשר או דחה בקשות חופשה ומחלה של עובדים' : 'הגש בקשת חופשה, מחלה או היעדרות'}</p>
                </div>
                {(currentEmployee || currentUser) && (
                    <Button onClick={() => setNewOpen(true)} className="w-full md:w-auto">
                        <Plus className="w-4 h-4 ml-2" />
                        בקשה חדשה
                    </Button>
                )}
            </div>

            {isAdmin && <LeaveCalendar requests={requests} />}

            <div className="mt-6 space-y-6">
                {pendingReqs.length > 0 && (
                    <div>
                        <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-yellow-500" />
                            ממתין לאישור ({pendingReqs.length})
                        </h2>
                        <div className="space-y-3">
                            {pendingReqs.map(r => (
                                <LeaveRequestCard key={r.id} req={r} isManager={isAdmin} onApprove={handleApprove} onReject={setRejectTarget} onEdit={setEditTarget} actionLoading={actionLoading} />
                            ))}
                        </div>
                    </div>
                )}

                {pastReqs.length > 0 && (
                    <div>
                        <h2 className="font-bold text-gray-800 mb-3">היסטוריה</h2>
                        <div className="space-y-3">
                            {pastReqs.map(r => (
                                <LeaveRequestCard key={r.id} req={r} isManager={isAdmin} onApprove={handleApprove} onReject={setRejectTarget} onEdit={setEditTarget} actionLoading={actionLoading} />
                            ))}
                        </div>
                    </div>
                )}

                {requests.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>אין בקשות חופשה</p>
                    </div>
                )}
            </div>

            {currentEmployee && (
                <NewLeaveRequestDialog open={newOpen} onClose={() => setNewOpen(false)} currentEmployee={currentEmployee || currentUser} onSaved={loadData} />
            )}

            <RejectDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} onConfirm={handleReject} loading={actionLoading === rejectTarget?.id + '_r'} />
            {editTarget && <EditDatesDialog open={!!editTarget} onClose={() => setEditTarget(null)} req={editTarget} onSaved={loadData} />}
        </div>
    );
}

export default function LeaveRequestsPage() {
    return (
        <PageGuard pageName="LeaveRequests" pageTitle="בקשות חופשה">
            <LeaveRequestsInner />
        </PageGuard>
    );
}