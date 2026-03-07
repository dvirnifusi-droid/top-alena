import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { WorkShift } from '@/entities/WorkShift';
import { Employee } from '@/entities/Employee';
import { Bell, X, ArrowLeftRight, Calendar, Check, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { sendWhatsApp } from '@/functions/sendWhatsApp';

// For employees: shows schedule-change notifications + incoming swap requests
// For managers (isManager=true): shows pending swap requests to approve
export default function ShiftNotificationBell({ currentEmployee, isManager = false }) {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [swapRequests, setSwapRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null); // req.id

    const loadData = async () => {
        setLoading(true);
        try {
            if (isManager) {
                const pending = await base44.entities.ShiftSwapRequest.filter({ status: 'pending' });
                setSwapRequests(pending);
            } else if (currentEmployee) {
                // Load swap requests targeting this employee (pending ones)
                const allRequests = await base44.entities.ShiftSwapRequest.filter({ target_employee_id: currentEmployee.id, status: 'pending' });
                setSwapRequests(allRequests);
                // Load recent schedule updates - shifts updated in last 24h
                const recentShifts = await base44.entities.WorkShift.list('-updated_date', 20);
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const myRecentChanges = recentShifts.filter(s => {
                    const updated = new Date(s.updated_date);
                    if (updated < yesterday) return false;
                    return (s.assigned_staff || []).some(a => a.employee_id === currentEmployee.id);
                });
                setNotifications(myRecentChanges);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (currentEmployee || isManager) loadData();
    }, [currentEmployee?.id, isManager]);

    // Real-time subscription to WorkShift changes (schedule updates for employee)
    useEffect(() => {
        if (!currentEmployee && !isManager) return;
        const unsub = base44.entities.WorkShift.subscribe(() => loadData());
        const unsub2 = base44.entities.ShiftSwapRequest.subscribe(() => loadData());
        return () => { unsub(); unsub2(); };
    }, [currentEmployee?.id, isManager]);

    const totalCount = swapRequests.length + (isManager ? 0 : notifications.length);

    const handleApprove = async (req) => {
        setActionLoading(req.id);
        try {
            // 1. Update swap request status
            await base44.entities.ShiftSwapRequest.update(req.id, { status: 'approved_by_manager' });

            // 2. Update the WorkShift - swap requester with target employee
            if (req.requester_employee_id && req.target_employee_id && req.shift_date && req.shift_type) {
                const shifts = await WorkShift.filter({ date: req.shift_date, shift_type: req.shift_type });
                if (shifts.length > 0) {
                    const shift = shifts[0];
                    const updatedStaff = (shift.assigned_staff || []).map(a => {
                        if (a.employee_id === req.requester_employee_id) {
                            return { ...a, employee_id: req.target_employee_id, employee_name: req.target_name };
                        }
                        return a;
                    });
                    await WorkShift.update(shift.id, { assigned_staff: updatedStaff });
                }
            }
        } finally {
            setActionLoading(null);
            loadData();
        }
    };

    const handleReject = async (req) => {
        setActionLoading(req.id + '_reject');
        try {
            await base44.entities.ShiftSwapRequest.update(req.id, { status: 'rejected_by_manager' });
        } finally {
            setActionLoading(null);
            loadData();
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => { setOpen(o => !o); if (!open) loadData(); }}
                className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
                title={isManager ? 'בקשות החלפת משמרת' : 'התראות'}
            >
                <Bell className={`w-6 h-6 ${totalCount > 0 ? 'text-orange-500' : 'text-gray-500'}`} />
                {totalCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs rounded-full border-2 border-white">
                        {totalCount}
                    </Badge>
                )}
            </button>

            {open && (
                <div className="absolute left-0 top-12 z-50 w-80 bg-white border rounded-xl shadow-xl" dir="rtl">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                        <span className="font-bold text-sm">{isManager ? 'בקשות החלפת משמרת' : 'התראות'}</span>
                        <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-gray-400" /></button>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {/* Swap requests */}
                        {swapRequests.length > 0 && (
                            <div>
                                {swapRequests.map(req => (
                                    <div key={req.id} className="px-4 py-3 border-b bg-orange-50">
                                        <div className="flex items-start gap-2">
                                            <ArrowLeftRight className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {isManager
                                                        ? `${req.requester_name} מבקש להחליף עם ${req.target_name}`
                                                        : `${req.requester_name} מציע לך להחליף משמרת`}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {req.shift_date && format(new Date(req.shift_date), 'EEEE dd/MM', { locale: he })} · {req.shift_type === 'lunch' ? 'צהריים' : 'ערב'} · {req.position}
                                                </p>
                                                {req.message && <p className="text-xs text-gray-600 mt-1 italic">"{req.message}"</p>}
                                                {isManager && (
                                                    <div className="flex gap-2 mt-2">
                                                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleApprove(req)}>
                                                            <Check className="w-3 h-3 ml-1" />אשר
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600" onClick={() => handleReject(req)}>
                                                            <XCircle className="w-3 h-3 ml-1" />דחה
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Schedule change notifications (employee only) */}
                        {!isManager && notifications.map(shift => (
                            <div key={shift.id} className="px-4 py-3 border-b">
                                <div className="flex items-start gap-2">
                                    <Calendar className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">סידור עבודה עודכן</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {shift.date && format(new Date(shift.date), 'EEEE dd/MM', { locale: he })} · {shift.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {totalCount === 0 && !loading && (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">אין התראות חדשות</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}