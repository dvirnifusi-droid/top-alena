import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SeatingLayout } from '@/entities/SeatingLayout';
import { TableSession } from '@/entities/TableSession';
import { ServiceStep } from '@/entities/ServiceStep';
import { Reservation } from '@/entities/Reservation';
import { Customer } from '@/entities/Customer';
import { QueueEntry } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Save, Loader2, Wand2, Eye, Edit, Wrench, ArrowRight, Settings, Sparkles, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Clock, Users, Phone, ChefHat, CheckCircle, Ban, Calendar, MapPin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { ZoomIn, ZoomOut, X, Maximize2 } from "lucide-react";
import ReservationTool from '../components/reservations/ReservationTool';
import TableIncidentDialog from '../components/seating/TableIncidentDialog';
import TableIncidentHistory from '../components/seating/TableIncidentHistory';
import ReservationSourceBadge from '@/components/shared/ReservationSourceBadge';
import TimePicker from '@/components/shared/TimePicker';
import TablePicker from '@/components/dashboard/TablePicker';
import { base44 } from '@/api/base44Client';
import VoiceControl from '@/components/voice/VoiceControl';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';

// Convert an "HH:mm" clock time to an absolute Date anchored to `ref` (default
// now), rolling early-morning times (before 06:00) to the NEXT day when it's
// currently evening. Without this, plain "HH:mm" string/`setHours` math treats a
// 00:30 end time as ~23h in the PAST, which broke turn-reuse ("frees before")
// checks and the AI/live-stat time math after midnight. Returns null on bad input.
function clockToDate(hhmm, ref = new Date()) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    const d = new Date(ref);
    d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
    if (h < 6 && ref.getHours() >= 18) d.setDate(d.getDate() + 1);
    return d;
}
// True when clock time `a` is at or before clock time `b`, both anchored tonight
// (after-midnight aware). Used for "occupant frees before the next booking".
function clockLdE(a, b, ref = new Date()) {
    const da = clockToDate(a, ref);
    const db = clockToDate(b, ref);
    if (!da || !db) return false;
    return da.getTime() <= db.getTime();
}
// Set of table numbers occupied RIGHT NOW — the union of active sessions AND
// today's `seated` reservations. Several seating paths (queue walk-in, app booker,
// manual "seated") create a seated reservation with NO TableSession, so counting
// sessions alone under-reports occupancy and lets a second party be seated on a
// table that's actually taken.
// "HH:mm" → minutes since midnight, with early-morning (<06:00) rolled to the
// following night so a 00:30 slot sorts AFTER 21:00 on the same restaurant night.
// Date-independent, for comparing two same-date bookings.
function clockToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    let mins = h * 60 + (Number.isNaN(m) ? 0 : m);
    if (h < 6) mins += 24 * 60;
    return mins;
}
// Do two "HH:mm" bookings on the same date overlap in time? Uses end times when
// present, otherwise a `defaultMin`-minute seating. Null-safe (returns false).
function bookingsOverlap(startA, endA, startB, endB, defaultMin = 120) {
    const s1 = clockToMinutes(startA); const s2 = clockToMinutes(startB);
    if (s1 == null || s2 == null) return false;
    const e1 = clockToMinutes(endA) ?? s1 + defaultMin;
    const e2 = clockToMinutes(endB) ?? s2 + defaultMin;
    return s1 < e2 && s2 < e1;
}
function occupiedTableSet(activeSessions = [], reservations = [], ref = new Date()) {
    const todayStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
    const set = new Set();
    for (const s of (activeSessions || [])) {
        if (s?.status && s.status !== 'active') continue;
        String(s?.table_number || '').split(/[,+]/).forEach(p => { const t = p.trim(); if (t) set.add(t); });
    }
    for (const r of (reservations || [])) {
        if (r?.status !== 'seated') continue;
        const rDate = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date;
        if (rDate !== todayStr) continue;
        const tabs = Array.isArray(r.assigned_table) ? r.assigned_table : (r.assigned_table ? [r.assigned_table] : []);
        tabs.forEach(t => set.add(String(t)));
    }
    return set;
}

// Dialog לעריכת הזמנה - עם כל הפרטים
// Deposit actions for a reservation — send request (J5 hold), manual no-show charge, release.
function DepositSection({ reservation, onDone }) {
    const [busy, setBusy] = useState(false);
    const [nowTick, setNowTick] = useState(Date.now());
    const st = reservation?.deposit_status;
    const amt = reservation?.deposit_amount;
    // Live 5-minute countdown while a deposit request is out (pending).
    useEffect(() => {
        if (st !== 'pending') return;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [st]);
    const sentAt = reservation?.deposit_sent_at ? new Date(reservation.deposit_sent_at).getTime() : null;
    const remainMs = sentAt != null ? Math.max(0, sentAt + 5 * 60 * 1000 - nowTick) : null;
    const remainTxt = remainMs != null ? `${Math.floor(remainMs / 60000)}:${String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0')}` : null;
    const sendDeposit = () => {
        const input = window.prompt('סכום פיקדון לבקש מהלקוח (₪). השאר ריק לסכום לפי ההגדרות:', reservation.deposit_amount ? String(reservation.deposit_amount) : '');
        if (input === null) return; // cancelled
        const amount = parseInt(input, 10);
        run(() => base44.functions.sendDepositRequest({ reservation_id: reservation.id, ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}) }));
    };
    const run = async (fn, confirmMsg) => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        setBusy(true);
        try {
            const res = await fn();
            const d = res?.data || res || {};
            if (d.success === false) alert('שגיאה: ' + (d.error || d.reason || 'לא ידוע'));
            else if (d.link) alert(`✅ נשלחה בקשת פיקדון ללקוח (₪${d.amount}).`);
            else if (d.captured_ils) alert(`💰 חויב פיקדון ₪${d.captured_ils}.`);
            onDone && onDone();
        } catch (e) { alert('שגיאה: ' + (e?.message || e)); }
        finally { setBusy(false); }
    };
    const badge = st === 'authorized' ? { t: '🟢 אשראי נתפס', c: 'bg-green-100 text-green-800' }
        : st === 'pending' ? { t: remainMs === 0 ? '🟠 נשלח אשראי פיקדון · פג תוקף' : `🟠 נשלח אשראי פיקדון · ${remainTxt}`, c: 'bg-amber-100 text-amber-800' }
        : st === 'captured' ? { t: `💰 חויב ₪${reservation.deposit_charge_amount || amt || ''}`, c: 'bg-slate-200 text-slate-700' }
        : st === 'released' ? { t: 'שוחרר', c: 'bg-gray-100 text-gray-500' }
        : st === 'failed' ? { t: '❌ נכשל', c: 'bg-rose-100 text-rose-700' }
        : null;
    return (
        <div className="bg-gray-50 p-3 rounded mt-3">
            <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm">💳 פיקדון{amt ? ` · ₪${amt}` : ''}</span>
                {badge && <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badge.c}`}>{badge.t}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
                {(!st || st === 'failed' || st === 'released') && (
                    <Button size="sm" disabled={busy} onClick={sendDeposit}>שלח בקשת פיקדון</Button>
                )}
                {st === 'pending' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={sendDeposit}>שלח שוב</Button>
                )}
                {st === 'authorized' && (
                    <>
                        <Button size="sm" variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50" disabled={busy} onClick={() => run(() => base44.functions.captureDeposit({ reservation_id: reservation.id }), `לחייב פיקדון ₪${amt} — הלקוח הבריז? זה גובה בפועל מהכרטיס.`)}>חייב (הבריז)</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => base44.functions.releaseDeposit({ reservation_id: reservation.id }), 'לשחרר את תפיסת הפיקדון?')}>שחרר</Button>
                    </>
                )}
            </div>
        </div>
    );
}

function ReservationEditDialog({ open, setOpen, reservation, onUpdate, tables, reservations }) {
    const [editedReservation, setEditedReservation] = useState(null);

    useEffect(() => {
        if (reservation) {
            setEditedReservation({
                ...reservation,
                assigned_table: Array.isArray(reservation.assigned_table)
                    ? reservation.assigned_table
                    : (reservation.assigned_table ? [reservation.assigned_table] : [])
            });
        } else {
            setEditedReservation(null);
        }
    }, [reservation]);

    if (!reservation || !editedReservation) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>טוען נתונים...</DialogTitle>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        );
    }

    const handleSave = async () => {
        if (!editedReservation) return;
        try {
            if (reservation.status !== 'seated' && editedReservation.status === 'seated' && editedReservation.assigned_table && editedReservation.assigned_table.length > 0) {
                await TableSession.create({
                    table_number: editedReservation.assigned_table[0],
                    party_size: editedReservation.party_size,
                    customer_name: editedReservation.customer_name,
                    customer_phone: editedReservation.customer_phone,
                    session_start: new Date().toISOString(),
                    status: 'active',
                    waiter_name: 'מנהל',
                    waiter_id: 'manager_seated',
                    table_style: 'couple'
                });
            }
            await Reservation.update(reservation.id, editedReservation);
            onUpdate();
            setOpen(false);
        } catch (error) {
            console.error('Error saving reservation:', error);
            alert('שגיאה בשמירת ההזמנה');
        }
    };

    const handleSingleTableAssignment = () => {
        onUpdate({ type: 'start_assigning', reservationId: reservation.id });
        setOpen(false);
    };

    const handleMultiTableAssignment = () => {
        onUpdate({ type: 'start_multi_assigning', reservationId: reservation.id });
        setOpen(false);
    };
    
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" className="sm:max-w-[420px] w-full overflow-y-auto p-4" dir="rtl">
                <SheetHeader>
                    <SheetTitle className="text-center bg-emerald-500 text-white py-2 rounded">עריכת הזמנה</SheetTitle>
                </SheetHeader>

                <div className="bg-[#B89556] text-white p-3 rounded flex items-center justify-between mt-2">
                    <Select value={editedReservation.status || 'pending'} onValueChange={value => setEditedReservation({...editedReservation, status: value})}>
                        <SelectTrigger className="w-[180px] bg-[#B89556] text-white border-0 font-bold">
                            <SelectValue placeholder="בחר סטטוס" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="request">בקשה</SelectItem>
                            <SelectItem value="pending">ממתין</SelectItem>
                            <SelectItem value="confirmed">מאושר</SelectItem>
                            <SelectItem value="standby">סטנדבי</SelectItem>
                            <SelectItem value="seated">יושב</SelectItem>
                            <SelectItem value="finishing_soon">מסיים בקרוב</SelectItem>
                            <SelectItem value="completed">סיים</SelectItem>
                            <SelectItem value="cancelled">בוטל</SelectItem>
                            <SelectItem value="no_show">הבריז</SelectItem>
                            <SelectItem value="deleted">מחוק</SelectItem>
                        </SelectContent>
                    </Select>
                    <CheckCircle className="w-5 h-5" />
                </div>

                <DepositSection reservation={reservation} onDone={() => { onUpdate(); setOpen(false); }} />

                <div className="bg-gray-100 p-4 rounded mt-4">
                    <h3 className="font-bold text-center mb-4">פרטי ההזמנה</h3>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-right">
                            <span className="text-[#44512C]">תאריך</span>
                        </div>
                        <div className="text-left">
                            <span>יום ה, {editedReservation.date}</span>
                        </div>

                        <div className="text-right">
                            <span className="text-green-600">מספר אורחים</span>
                        </div>
                        <div className="text-left">
                            <Input 
                                type="number" 
                                value={editedReservation.party_size || 0} 
                                onChange={e => setEditedReservation({...editedReservation, party_size: parseInt(e.target.value)})} 
                                className="h-8"
                            />
                        </div>

                        <div className="text-right">
                            <span>זמן התחלה</span>
                        </div>
                        <div className="text-left">
                            <TimePicker
                                value={editedReservation.time || ''}
                                onChange={v => setEditedReservation({...editedReservation, time: v})}
                            />
                        </div>

                        <div className="text-right">
                            <span>זמן סיום</span>
                        </div>
                        <div className="text-left">
                            <TimePicker
                                value={editedReservation.reservation_end_time || ''}
                                onChange={v => setEditedReservation({...editedReservation, reservation_end_time: v})}
                            />
                        </div>

                        <div className="text-right">
                            <span className="text-green-600">שולחן</span>
                        </div>
                        <div className="text-left">
                            <span>{editedReservation.assigned_table?.join(', ') || 'כללי'}</span>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2">
                        <div className="text-right mb-2">
                            <span className="text-green-600">העברת הזמנה</span>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                onClick={handleSingleTableAssignment}
                                className="flex-1"
                            >
                                <MapPin className="w-4 h-4 ml-2" />
                                שולחן יחיד
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={handleMultiTableAssignment}
                                className="flex-1"
                            >
                                <Users className="w-4 h-4 ml-2" />
                                כמה שולחנות
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="text-right mb-2">
                            <span>בקשות ישיבה</span>
                        </div>
                        <div className="flex gap-2">
                            {(() => {
                                const ds = reservation?.deposit_status;
                                const noShow = reservation?.status === 'no_show';
                                const cfg = ds === 'authorized' ? { c: 'bg-green-100 border-green-400', t: 'אשראי נתפס 🟢' }
                                    : ds === 'captured' ? { c: 'bg-blue-100 border-blue-400', t: 'פיקדון חויב 💰' }
                                    : (noShow && reservation?.deposit_required) ? { c: 'bg-rose-100 border-rose-400', t: 'הבריז — ניתן לחייב 🔴' }
                                    : ds === 'pending' ? { c: 'bg-amber-100 border-amber-400', t: 'ממתין לאשראי 🟡' }
                                    : { c: 'bg-gray-100 border-gray-300', t: 'ללא פיקדון' };
                                return <div className={`border p-2 rounded ${cfg.c}`} title={`פיקדון: ${cfg.t}`}>💳</div>;
                            })()}
                            <div className={`border p-2 rounded ${reservation?.special_occasion ? 'bg-green-100 border-green-400' : 'bg-gray-100 border-gray-300'}`} title={reservation?.special_occasion ? `אירוע: ${reservation.special_occasion}` : 'ללא אירוע'}>🎁</div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-100 p-4 rounded mt-4">
                    <h3 className="font-bold text-center mb-4">אורח</h3>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-green-600">שם</span>
                            <Input 
                                value={editedReservation.customer_name || ''} 
                                onChange={e => setEditedReservation({...editedReservation, customer_name: e.target.value})} 
                                className="w-1/2 h-8"
                            />
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span>טלפון</span>
                            <Input 
                                value={editedReservation.customer_phone || ''} 
                                onChange={e => setEditedReservation({...editedReservation, customer_phone: e.target.value})} 
                                className="w-1/2 h-8"
                            />
                        </div>
                        
                        <div className="text-right">
                            <span className="text-green-600">הערת אורח</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button onClick={handleSave} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                        שמור
                    </Button>
                    <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
                        בטל
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

const GRID_SIZE = 4; // fine snap so tables can be placed precisely (was 20px = too coarse)

const FACILITY_TYPES = {
    restroom: { name: 'שירותים', icon: '🚻', color: 'bg-gray-300 border-gray-500 text-gray-900' },
    kitchen: { name: 'מטבח', icon: '👨‍🍳', color: 'bg-red-300 border-red-500 text-red-900' },
    bar: { name: 'בר', icon: '🍸', color: 'bg-[#D9BD83] border-[#44512C] text-blue-900' },
    reception: { name: 'דלפק קבלה', icon: '🏪', color: 'bg-green-300 border-green-500 text-green-900' },
    storage: { name: 'מחסן', icon: '📦', color: 'bg-[#D9BD83] border-yellow-500 text-yellow-900' },
    entrance: { name: 'כניסה', icon: '🚪', color: 'bg-[#D9BD83] border-[#A04A2E] text-purple-900' },
    stage: { name: 'במה', icon: '🎭', color: 'bg-pink-300 border-[#A04A2E] text-pink-900' },
    cashier: { name: 'קופה', icon: '💳', color: 'bg-emerald-300 border-emerald-500 text-emerald-900' }
};

export default function SeatingSetup() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const isAlena = isMainAlena();
    const [layout, setLayout] = useState(null);
    const [tables, setTables] = useState([]);
    const [facilities, setFacilities] = useState([]);
    // Explicit table-combinations the owner saved per party size.
    // Shape: [{ id, party_size, tables: ['10','11'] }]
    const [combos, setCombos] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [serviceSteps, setServiceSteps] = useState([]);
    const [reservations, setReservations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [viewMode, setViewMode] = useState('map');
    const [selectedFacilityType, setSelectedFacilityType] = useState('restroom');
    const [isResizing, setIsResizing] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);
    const [tableDetailsOpen, setTableDetailsOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [swapping, setSwapping] = useState(null);
    const [assigningTable, setAssigningTable] = useState(null);
    // Non-blocking toast for map feedback (replaces flow-breaking alert() popups).
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const showToast = (text) => {
        setToast(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    };
    const [isSelectingTables, setIsSelectingTables] = useState(false);
    const [selectedTablesForReservation, setSelectedTablesForReservation] = useState([]);
    const [multiAssignReservationId, setMultiAssignReservationId] = useState(null);
    const [editingReservation, setEditingReservation] = useState(null);
    const [isEditReservationOpen, setIsEditReservationOpen] = useState(false);
    const [incidentTableNumber, setIncidentTableNumber] = useState(null);
    const [selectedAreas, setSelectedAreas] = useState(['all']);
    const [selectedFlag, setSelectedFlag] = useState('all');  // flag-color filter
    // Auto-fit to viewport on first load — phones default ~0.3, tablets ~0.6, desktops 1.0
    const [mapZoom, setMapZoom] = useState(() => {
        if (typeof window === 'undefined') return 1;
        const w = window.innerWidth;
        if (w < 500) return 0.32;
        if (w < 900) return 0.55;
        return 1;
    });
    const [showBlueprint, setShowBlueprint] = useState(false); // legacy background drawing toggle (default OFF)
    // Floor-plan photo behind the map. Alena keeps its legacy image; every other
    // tenant uses its OWN (layout.blueprint_url) or gets no overlay at all — it
    // used to be Alena's hardcoded photo for everyone.
    const blueprintUrl = layout?.blueprint_url
        || (isMainAlena() ? 'https://media.base44.com/images/public/68ac71d972dff18b98e30a21/5fc81039d_WhatsAppImage2026-04-10at145322.jpg' : null);
    const [isSmartMapMode, setIsSmartMapMode] = useState(false); // AI overlay state (Phase 4)
    const [quickSeatOpen, setQuickSeatOpen] = useState(false); // walk-in / standby quick-seat flow
    const [quickSeatTable, setQuickSeatTable] = useState(null); // table pre-chosen from the map
    // How many bookings each table card lists (owner setting — Ontopo-style planning
    // wants the whole evening; a packed night may want just now + next).
    const [rowsPerTable, setRowsPerTable] = useState(() => {
        const v = parseInt(localStorage.getItem('map_rows_per_table') || '3', 10);
        return Number.isFinite(v) ? Math.min(6, Math.max(1, v)) : 3;
    });
    useEffect(() => { localStorage.setItem('map_rows_per_table', String(rowsPerTable)); }, [rowsPerTable]);
    // Hostess lens: which tables to spotlight. Non-matching tables dim so the answer
    // to "where can I put this walk-in?" is visible without reading every card.
    const [mapFilter, setMapFilter] = useState('all'); // all | free_now | free_long | arriving
    const [smartReserveOpen, setSmartReserveOpen] = useState(false); // smart-recommended reservation dialog
    const [clockTick, setClockTick] = useState(() => new Date());
    const [aiOpen, setAiOpen] = useState(false); // floating AI assistant widget
    const [aiPrefillQuestion, setAiPrefillQuestion] = useState(''); // when a per-reservation ✨ button is clicked
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);  // slide-up reservations dashboard on mobile
    const [bigMapMode, setBigMapMode] = useState(false);  // hostess fullscreen workflow — map + compact tonight strip
    const [dashboardDrawerOpen, setDashboardDrawerOpen] = useState(false);  // overlay slide-in of full dashboard
    const [smartBookerOpen, setSmartBookerOpen] = useState(false);  // collapsible "+ הזמנה חדשה" panel
    const [isAutoAssigning, setIsAutoAssigning] = useState(false);  // "שבץ הכל" — batch auto-assignment in flight
    const [mobileView, setMobileView] = useState('reservations');  // 'reservations' | 'map' — tab switcher on mobile
    const [queueEntries, setQueueEntries] = useState([]);        // live restaurant queue (walk-ins waiting)
    const [railTab, setRailTab] = useState('tonight');           // 'tonight' | 'full' | 'queue'
    const [queueNewBanner, setQueueNewBanner] = useState(null);   // {id, name, party_size} popup data
    const pageLoadTimeRef = useRef(Date.now());                  // any entry registered AFTER this is "new"
    const seenQueueIdsRef = useRef(new Set());                   // ids we've already shown the banner for
    const initialLoadedRef = useRef(false);                      // full-page spinner shows ONLY on the very first load
    const toggleArea = (key) => {
        if (key === 'all') { setSelectedAreas(['all']); return; }
        setSelectedAreas(prev => {
            const without = prev.filter(a => a !== 'all');
            if (without.includes(key)) {
                const next = without.filter(a => a !== key);
                return next.length === 0 ? ['all'] : next;
            }
            return [...without, key];
        });
    };

    // טוען את המפה והשולחנות — פעם אחת בלבד (לא מאפס כשיש polling)
    const loadLayout = useCallback(async () => {
        // Full-page spinner ONLY on the very first load. Every later refresh
        // (after an assignment, seating, date change…) updates data in place
        // without unmounting the page — no 'טוען הגדרות' flash, no scroll jump.
        if (!initialLoadedRef.current) setIsLoading(true);
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const [layouts, sessions, steps, dateReservations, allCustomers] = await Promise.all([
                SeatingLayout.list(),
                TableSession.filter({ status: 'active' }),
                ServiceStep.list('step_number'),
                Reservation.filter({ date: dateString }, 'time'),
                Customer.list()
            ]);
            
            if (layouts.length > 0) {
                setLayout(layouts[0]);
                setTables(layouts[0].tables || []);
                setFacilities(layouts[0].facilities || []);
                setCombos(Array.isArray(layouts[0].combos) ? layouts[0].combos : []);
            } else {
                setLayout(null);
                setTables([]);
                setFacilities([]);
                setCombos([]);
            }
            
            setActiveSessions(sessions);
            setServiceSteps(steps);
            setReservations((dateReservations || []).map(r => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date })));
            setCustomers(allCustomers);
        } catch (error) {
            console.error('Error loading layout:', error);
        } finally {
            initialLoadedRef.current = true;
            setIsLoading(false);
        }
    }, [selectedDate]);

    // טוען רק נתונים חיים (sessions, הזמנות) — לא נוגע בשולחנות/מפה
    // Stable fingerprint helper so polls that return identical data don't
    // re-create the array (which would force every ReservationCard to re-render
    // and reset scroll/selection in the rail).
    const fingerprintReservations = (arr) =>
        (arr || []).map(r => `${r.id}|${r.status}|${r.assigned_table}|${r.hostess_flag}|${r.time}|${r.party_size}|${r.customer_name}`).join('§');
    const fingerprintSessions = (arr) =>
        (arr || []).map(s => `${s.id}|${s.current_step}|${s.table_number}`).join('§');
    const fingerprintCustomers = (arr) =>
        (arr || []).map(c => `${c.id}|${c.total_visits}`).join('§');

    // True while the SSE push stream is delivering events end-to-end. When live,
    // we slow the safety-net poll right down; when the stream drops we fall back
    // to fast polling automatically.
    const [realtimeConnected, setRealtimeConnected] = useState(false);

    // Guard against overlapping loadLiveData fetches: a slow in-flight refresh
    // returning stale rows would otherwise clobber a newer optimistic edit
    // (looked like "my change reverted / didn't stick until I refreshed"). Run
    // one at a time; if more refreshes are requested mid-flight, run exactly one
    // more afterwards so the final state reflects the last write.
    const liveInFlightRef = useRef(false);
    const livePendingRef = useRef(false);
    const loadLiveData = useCallback(async () => {
        if (liveInFlightRef.current) { livePendingRef.current = true; return; }
        liveInFlightRef.current = true;
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            // HOT PATH — runs after every action + on the 60s poll. Fetch ONLY the
            // two things that change with an action: active sessions + this date's
            // reservations. Both are small and indexed. Customers (a full, unbounded
            // table that changes rarely) are loaded separately in loadCustomers so
            // they never slow down an action's refresh — that fetch was the reason
            // the map appeared "frozen until refresh".
            const [sessions, dateReservations] = await Promise.all([
                TableSession.filter({ status: 'active' }),
                Reservation.filter({ date: dateString }, 'time'),
            ]);
            const newSessions = sessions || [];
            const newRes = (dateReservations || []).map(r => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date }));
            // Only setState when something actually changed — preserves scroll position,
            // popovers, and prevents unnecessary card re-renders during 60s polls.
            setActiveSessions(prev => fingerprintSessions(prev) === fingerprintSessions(newSessions) ? prev : newSessions);
            setReservations(prev => fingerprintReservations(prev) === fingerprintReservations(newRes) ? prev : newRes);
        } catch (error) {
            console.error('Error loading live data:', error);
        } finally {
            liveInFlightRef.current = false;
            if (livePendingRef.current) { livePendingRef.current = false; loadLiveData(); }
        }
    }, [selectedDate]);

    // Customers change rarely (a booking creates one). Kept OUT of loadLiveData's
    // hot path — loaded once on mount (via loadLayout) and refreshed on a slow
    // 5-minute cadence so returning-guest badges stay reasonably fresh without
    // taxing every seating action.
    const loadCustomers = useCallback(async () => {
        try {
            const all = await Customer.list();
            const next = all || [];
            setCustomers(prev => fingerprintCustomers(prev) === fingerprintCustomers(next) ? prev : next);
        } catch (error) {
            console.error('Error loading customers:', error);
        }
    }, []);

    useEffect(() => {
        loadLayout();
    }, [loadLayout]);

    // Live background refresh. loadLiveData is now light (2 small indexed queries),
    // so poll every 12s — new online reservations / walk-ins land on the map on
    // their own. Skip while the tab is hidden (no point, saves load) and refresh
    // the instant the hostess returns to the tab, so it always shows current state.
    useEffect(() => {
        // Push (SSE) delivers changes instantly, so the poll is only a safety net
        // then (45s). Without a live stream it's the primary mechanism (12s).
        const pollMs = realtimeConnected ? 45000 : 12000;
        const tick = () => { if (!document.hidden) loadLiveData(); };
        const interval = setInterval(tick, pollMs);
        const onVisible = () => { if (!document.hidden) loadLiveData(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [loadLiveData, realtimeConnected]);

    // Slow refresh of the rarely-changing customers table — off the action path.
    useEffect(() => {
        const interval = setInterval(loadCustomers, 5 * 60000);
        return () => clearInterval(interval);
    }, [loadCustomers]);

    // The 'voice:data-changed' useEffect moved further down — AFTER loadQueue
    // is declared (otherwise TDZ error 'Cannot access loadQueue before init').

    // Digital clock — tick every second for the top action bar display
    useEffect(() => {
        // 30s tick — second-precision was forcing a full page re-render every
        // second, which caused the reservation rail to flicker / scroll-reset.
        const id = setInterval(() => setClockTick(new Date()), 30000);
        return () => clearInterval(id);
    }, []);

    // --- Poll queue entries every 15s. Pops a banner when a NEW entry arrives.
    const [abandonedEntries, setAbandonedEntries] = useState([]);
    const loadQueue = useCallback(async () => {
        try {
            const all = await QueueEntry.list('-timestamp_register', 80);
            // ACTIVE = pending or active (not yet seated, not abandoned)
            const active = (all || []).filter(q =>
                (q.status === 'pending' || q.status === 'active') && !q.treated
            );
            // ABANDONED = status='abandoned' in the last 6 hours
            const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
            const abandoned = (all || []).filter(q => {
                if (q.status !== 'abandoned') return false;
                const ts = q.timestamp_register ? new Date(q.timestamp_register).getTime() : 0;
                return ts >= sixHoursAgo;
            });
            setQueueEntries(active);
            setAbandonedEntries(abandoned);

            // New-entry detection — fire banner for ANY pending entry that
            // (a) was registered AFTER the page loaded, and (b) we haven't shown yet.
            // This catches the "first new entry on a previously-empty queue" case
            // that the old id-comparison logic missed.
            const pending = active.filter(q => q.status === 'pending');
            const fresh = pending.find(q => {
                if (seenQueueIdsRef.current.has(q.id)) return false;
                const regTs = q.timestamp_register ? new Date(q.timestamp_register).getTime() : 0;
                return regTs >= pageLoadTimeRef.current;
            });
            if (fresh) {
                seenQueueIdsRef.current.add(fresh.id);
                setQueueNewBanner({ id: fresh.id, name: fresh.customer_name, party_size: fresh.party_size, aiSuggestion: null, aiLoading: true });
                // Fetch AI suggestion in background
                (async () => {
                    try {
                        const q = `הגיע ${fresh.customer_name || 'לקוח חדש'} לתור עם ${fresh.party_size || '?'} סועדים. איזה שולחן הכי מתאים להושיב אותם עכשיו וכמה דקות צפי המתנה?`;
                        const res = await base44.functions.aiSeatingAssistant({ question: q });
                        const data = res?.data || res;
                        setQueueNewBanner(prev => prev && prev.id === fresh.id
                            ? { ...prev, aiLoading: false, aiSuggestion: data?.answer || null, aiActions: data?.actions || [] }
                            : prev);
                    } catch (e) {
                        setQueueNewBanner(prev => prev && prev.id === fresh.id ? { ...prev, aiLoading: false } : prev);
                    }
                })();
            }
        } catch (e) { console.warn('queue load failed', e); }
    }, []);

    // Mark a queue entry as abandoned (manual ❌)
    const abandonFromQueue = async (entry) => {
        if (!confirm(`לסמן את ${entry.customer_name} כנטוש?`)) return;
        try {
            await QueueEntry.update(entry.id, {
                status: 'abandoned',
                timestamp_end: new Date().toISOString(),
            });
            await loadQueue();
        } catch (e) { console.warn('abandon failed', e); }
    };

    // Restore an abandoned entry back to the active queue (החזר לתור)
    const restoreToQueue = async (entry) => {
        try {
            await QueueEntry.update(entry.id, {
                status: 'pending',
                treated: false,
                timestamp_end: null,
            });
            await loadQueue();
        } catch (e) { console.warn('restore failed', e); }
    };

    // Approve a pending queue entry — sets status=active with optional wait time + push
    const approveQueueEntry = async (entryId, waitMinutes) => {
        try {
            const now = new Date().toISOString();
            // Compute next sort_order from currently active entries
            const all = await QueueEntry.list('-timestamp_register', 80).catch(() => []);
            const active = (all || []).filter(q => q.status === 'active');
            const maxOrder = Math.max(0, ...active.map(e => e.sort_order ?? 0));
            const patch = {
                status: 'active',
                timestamp_approved: now,
                sort_order: maxOrder + 1,
            };
            const wait = parseInt(waitMinutes);
            if (wait && wait > 0) patch.estimated_wait_time = wait;
            await QueueEntry.update(entryId, patch);
            // Customer-facing queue tracking page (same /q they joined from)
            const queueLink = `${window.location.origin}/q`;
            // Compose message conditionally — wait time line only if entered
            const parts = ['התור שלכם אושר 🎉'];
            if (wait && wait > 0) parts.push(`צפי המתנה: ~${wait} דקות.`);
            parts.push(`לעקוב אחר התור: ${queueLink}`);
            await base44.functions.sendQueuePush({
                entry_id: entryId,
                title: '✅ אושרתם בתור!',
                message: parts.join(' '),
            }).catch(() => {});
            setQueueNewBanner(null);
            await loadQueue();
        } catch (e) {
            console.error('approve failed', e);
            alert('שגיאה באישור התור');
        }
    };

    const rejectQueueEntry = async (entryId) => {
        try {
            await QueueEntry.update(entryId, {
                status: 'abandoned',
                timestamp_end: new Date().toISOString(),
            });
            setQueueNewBanner(null);
            await loadQueue();
        } catch (e) { console.warn('reject failed', e); }
    };

    useEffect(() => {
        loadQueue();
        const pollMs = realtimeConnected ? 45000 : 12000;
        const tick = () => { if (!document.hidden) loadQueue(); };
        const id = setInterval(tick, pollMs);
        const onVisible = () => { if (!document.hidden) loadQueue(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [loadQueue, realtimeConnected]);

    // ── Realtime push (SSE) ────────────────────────────────────────────────
    // One long-lived stream for the page lifetime. On any change signal we
    // refetch via the existing fast paths. Uses fetch streaming (not native
    // EventSource) so the Bearer token rides in a header, not the URL. Refs let
    // the stream survive date changes without reconnecting. Auto-reconnects with
    // backoff; the polling above is the fallback if the stream can't be opened
    // (or a proxy buffers it — we only flip to "live" once bytes actually flow).
    const loadLiveDataRef = useRef(loadLiveData);
    const loadQueueRef = useRef(loadQueue);
    useEffect(() => { loadLiveDataRef.current = loadLiveData; }, [loadLiveData]);
    useEffect(() => { loadQueueRef.current = loadQueue; }, [loadQueue]);
    useEffect(() => {
        let cancelled = false;
        let reader = null;
        let attempt = 0;
        let debTimer = null;
        let live = false;
        const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';
        const setLive = (v) => { if (v !== live) { live = v; if (!cancelled) setRealtimeConnected(v); } };

        const refetch = () => {
            clearTimeout(debTimer);
            // Debounce bursts (seating writes several rows at once).
            debTimer = setTimeout(() => { loadLiveDataRef.current?.(); loadQueueRef.current?.(); }, 250);
        };

        const connect = async () => {
            let token = null;
            try { token = localStorage.getItem('auth_token'); } catch { token = null; }
            if (!token) { if (!cancelled) setTimeout(connect, 4000); return; }
            try {
                const res = await fetch(`${API_BASE}/events/stream`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
                });
                if (!res.ok || !res.body) throw new Error(`sse ${res.status}`);
                reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                while (!cancelled) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    setLive(true);          // bytes flowing end-to-end
                    attempt = 0;
                    buf += decoder.decode(value, { stream: true });
                    let sep;
                    while ((sep = buf.indexOf('\n\n')) !== -1) {
                        const frame = buf.slice(0, sep);
                        buf = buf.slice(sep + 2);
                        if (frame.includes('event: change')) refetch();
                    }
                }
            } catch {
                /* reconnect below */
            } finally {
                setLive(false);
                if (!cancelled) {
                    attempt = Math.min(attempt + 1, 6);
                    setTimeout(connect, 1000 * attempt); // linear backoff, cap 6s
                }
            }
        };
        connect();

        return () => {
            cancelled = true;
            clearTimeout(debTimer);
            try { reader?.cancel(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listen for voice-driven data changes — instant refresh instead of waiting for poll.
    // Mounted HERE because loadQueue (above) must be declared first.
    useEffect(() => {
        const onVoiceChange = () => {
            loadLiveData();
            loadLayout();
            loadQueue();
        };
        window.addEventListener('voice:data-changed', onVoiceChange);
        return () => window.removeEventListener('voice:data-changed', onVoiceChange);
    }, [loadLiveData, loadLayout, loadQueue]);

    // When user opens the queue tab, mark all current ids as seen (dismisses banner)
    useEffect(() => {
        if (railTab === 'queue') {
            queueEntries.forEach(q => seenQueueIdsRef.current.add(q.id));
            setQueueNewBanner(null);
        }
    }, [railTab, queueEntries]);

    // Convert a queue entry → reservation NOW.
    // If a table was already chosen via TablePicker (stored in entry.notes as
    // 'שולחן: X[, Y]'), seat directly at that table and SKIP map assignment.
    // Otherwise enter the assigning-table flow so hostess picks from the map.
    const seatFromQueue = async (entry) => {
        try {
            // Parse pre-picked table(s) from notes
            const m = (entry.notes || '').match(/^שולחן:\s*([\d,\s]+)/);
            const preTables = m
                ? m[1].split(',').map(s => s.trim()).filter(Boolean)
                : null;
            const now = new Date();
            const time = format(now, 'HH:mm');
            const dateStr = format(now, 'yyyy-MM-dd');
            // Cleanup notes — strip the table prefix so it doesn't pollute special_requests
            const cleanNotes = m
                ? (entry.notes || '').replace(/^שולחן:\s*[\d,\s]+/, '').trim()
                : (entry.notes || '');
            // Stamp the end time so the turn timer works for queue-seated guests too
            // (they were created without it, so they never showed מסיים/חריגה).
            const qEndMin = (now.getHours() * 60 + now.getMinutes()) + getSeatingDuration(entry.party_size);
            const created = await Reservation.create({
                customer_name: entry.customer_name,
                customer_phone: entry.phone,
                date: dateStr,
                time,
                party_size: entry.party_size,
                status: 'seated',
                special_requests: cleanNotes || null,
                reservation_end_time: `${String(Math.floor(qEndMin / 60) % 24).padStart(2, '0')}:${String(qEndMin % 60).padStart(2, '0')}`,
                source: 'queue',
                ...(preTables ? { assigned_table: preTables } : {}),
            });
            // Optimistically show the seated reservation right away so the hostess
            // can pick a table without waiting for the queue-update + resync
            // round-trips (those run in the background below).
            setReservations(prev => [
                ...prev,
                { ...created, date: typeof created.date === 'string' ? created.date.slice(0, 10) : created.date },
            ]);
            // Only enter map-assigning mode if no pre-picked table
            if (!preTables) {
                setAssigningTable({ reservationId: created.id });
            }
            // Background: mark the queue entry seated + resync — don't block the UI.
            QueueEntry.update(entry.id, {
                treated: true,
                status: 'seated',
                timestamp_seated: new Date().toISOString(),
            }).then(() => loadQueue()).catch(err => console.warn('queue update failed', err));
            loadLiveData();
        } catch (e) {
            console.error('seat from queue failed', e);
            alert('שגיאה בהושבה מהתור');
        }
    };

    const getTableSession = (tableNumber) => {
        return activeSessions.find(session => {
            if (session.status !== 'active') return false;
            // Support multi-table sessions stored as 'A,B' or 'A+B'
            const parts = String(session.table_number || '').split(/[,+]/).map(s => s.trim());
            return parts.includes(String(tableNumber));
        });
    };

    // A table marked "ניקוי" keeps a session with status 'to_be_cleaned'. getTableSession
    // only matches 'active', so a dirty table used to render exactly like a clean empty
    // one — the hostess would seat the next party onto plates, or שבץ הכל would assign it.
    const getCleaningSession = (tableNumber) => {
        return activeSessions.find(session => {
            if (session.status !== 'to_be_cleaned') return false;
            const parts = String(session.table_number || '').split(/[,+]/).map(s => s.trim());
            return parts.includes(String(tableNumber));
        });
    };

    const getActiveTime = (session) => {
        if (!session || !session.session_start) return '';
        const activeMinutes = Math.round((new Date() - new Date(session.session_start)) / 60000);
        // A session nobody closed keeps counting forever — a table on the live map
        // was showing "367:38" (two weeks). Past a full service that isn't a timer,
        // it's a stuck session, so say so instead of printing a meaningless number.
        if (activeMinutes > 12 * 60) return '⚠️ תקוע';
        if (activeMinutes < 60) return `${activeMinutes} דק'`;
        const hours = Math.floor(activeMinutes / 60);
        const minutes = activeMinutes % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    };

    const getStepInfo = (stepNumber) => {
        return serviceSteps.find(s => s.step_number === stepNumber);
    };

    const showTableDetails = (table) => {
        setSelectedTable(table);
        setTableDetailsOpen(true);
    };

    const createAllTables = async () => {
        setIsLoading(true);
        try {
            if (layout) {
                await SeatingLayout.delete(layout.id);
                }

            const allTables = [
                // === אזור חום (שקט/פנימי) - top-left ===
                { table_number: "10", min_capacity: 5, max_capacity: 11, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 14, y: 52, width: 62, height: 52 },
                { table_number: "11", min_capacity: 5, max_capacity: 11, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 80, y: 52, width: 62, height: 52 },
                { table_number: "12", min_capacity: 12, max_capacity: 12, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 148, y: 42, width: 72, height: 65 },
                { table_number: "13", min_capacity: 5, max_capacity: 11, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 225, y: 52, width: 62, height: 52 },
                { table_number: "9", min_capacity: 2, max_capacity: 3, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 242, y: 115, width: 65, height: 55 },
                { table_number: "8", min_capacity: 2, max_capacity: 3, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 242, y: 178, width: 65, height: 55 },
                { table_number: "20", min_capacity: 5, max_capacity: 12, location: "indoor", area: "אזור חום", combinable_with: [], features: [], x: 14, y: 118, width: 120, height: 68 },
                { table_number: "30", min_capacity: 5, max_capacity: 7, location: "indoor", area: "אזור חום", combinable_with: ["31"], features: [], x: 14, y: 200, width: 95, height: 65 },
                { table_number: "31", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אזור חום", combinable_with: ["30"], features: [], x: 114, y: 200, width: 65, height: 65 },
                { table_number: "40", min_capacity: 4, max_capacity: 5, location: "indoor", area: "אזור חום", combinable_with: ["41"], features: [], x: 14, y: 278, width: 100, height: 68 },
                { table_number: "41", min_capacity: 5, max_capacity: 5, location: "indoor", area: "אזור חום", combinable_with: ["40"], features: [], x: 120, y: 278, width: 100, height: 68 },
                // === כניסה ===
                { table_number: "50", min_capacity: 2, max_capacity: 4, location: "indoor", area: "כניסה", combinable_with: [], features: [], x: 254, y: 282, width: 65, height: 62 },
                { table_number: "60", min_capacity: 1, max_capacity: 2, location: "indoor", area: "כניסה", combinable_with: ["61"], features: [], x: 326, y: 278, width: 70, height: 62 },
                { table_number: "61", min_capacity: 2, max_capacity: 4, location: "indoor", area: "כניסה", combinable_with: ["60"], features: [], x: 326, y: 352, width: 70, height: 62 },
                { table_number: "70", min_capacity: 4, max_capacity: 5, location: "indoor", area: "כניסה", combinable_with: ["71"], features: [], x: 408, y: 278, width: 78, height: 62 },
                { table_number: "71", min_capacity: 2, max_capacity: 5, location: "indoor", area: "כניסה", combinable_with: ["70"], features: [], x: 408, y: 352, width: 78, height: 62 },
                { table_number: "80", min_capacity: 2, max_capacity: 3, location: "indoor", area: "כניסה", combinable_with: ["81"], features: [], x: 497, y: 278, width: 72, height: 62 },
                { table_number: "81", min_capacity: 2, max_capacity: 5, location: "indoor", area: "כניסה", combinable_with: ["80"], features: [], x: 497, y: 352, width: 72, height: 62 },
                // === אזור אדום מרוכזי - שורה 1 ===
                { table_number: "104", min_capacity: 1, max_capacity: 3, location: "indoor", area: "אדום מרוכזי", combinable_with: ["103"], features: [], x: 114, y: 458, width: 82, height: 65 },
                { table_number: "103", min_capacity: 2, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["104"], features: [], x: 205, y: 458, width: 82, height: 65 },
                { table_number: "102", min_capacity: 1, max_capacity: 5, location: "indoor", area: "אדום מרוכזי", combinable_with: ["101"], features: [], x: 318, y: 458, width: 82, height: 65 },
                { table_number: "101", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["100","102"], features: [], x: 410, y: 458, width: 82, height: 65 },
                { table_number: "100", min_capacity: 1, max_capacity: 5, location: "indoor", area: "אדום מרוכזי", combinable_with: ["101"], features: [], x: 502, y: 458, width: 82, height: 65 },
                // === אזור אדום מרוכזי - שורה 2 ===
                { table_number: "154", min_capacity: 2, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["153"], features: [], x: 114, y: 535, width: 82, height: 65 },
                { table_number: "153", min_capacity: 2, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["154"], features: [], x: 205, y: 535, width: 82, height: 65 },
                { table_number: "152", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["151"], features: [], x: 318, y: 535, width: 82, height: 65 },
                { table_number: "151", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["150","152"], features: [], x: 410, y: 535, width: 82, height: 65 },
                { table_number: "150", min_capacity: 1, max_capacity: 5, location: "indoor", area: "אדום מרוכזי", combinable_with: ["151"], features: [], x: 502, y: 535, width: 82, height: 65 },
                // === אזור אדום מרוכזי - שורה 3 ===
                { table_number: "205", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: [], features: [], x: 114, y: 618, width: 78, height: 68 },
                { table_number: "204", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: [], features: [], x: 200, y: 618, width: 78, height: 68 },
                { table_number: "203", min_capacity: 2, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: [], features: [], x: 288, y: 618, width: 78, height: 68 },
                { table_number: "202", min_capacity: 1, max_capacity: 2, location: "indoor", area: "אדום מרוכזי", combinable_with: ["201"], features: [], x: 374, y: 618, width: 82, height: 68 },
                { table_number: "201", min_capacity: 4, max_capacity: 6, location: "indoor", area: "אדום מרוכזי", combinable_with: ["200","202"], features: [], x: 464, y: 618, width: 88, height: 68 },
                { table_number: "200", min_capacity: 1, max_capacity: 5, location: "indoor", area: "אדום מרוכזי", combinable_with: ["201"], features: [], x: 560, y: 618, width: 82, height: 68 },
                // === זוהרה ===
                { table_number: "300", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 654, y: 385, width: 78, height: 65 },
                { table_number: "301", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 654, y: 460, width: 78, height: 65 },
                { table_number: "400", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 744, y: 385, width: 78, height: 65 },
                { table_number: "401", min_capacity: 2, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 744, y: 460, width: 78, height: 65 },
                { table_number: "402", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 654, y: 543, width: 78, height: 65 },
                { table_number: "500", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: ["ספסל"], x: 744, y: 543, width: 78, height: 65 },
                { table_number: "501", min_capacity: 2, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 744, y: 620, width: 78, height: 65 },
                { table_number: "403", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 654, y: 706, width: 78, height: 68 },
                { table_number: "503", min_capacity: 1, max_capacity: 2, location: "indoor", area: "זוהרה", combinable_with: [], features: [], x: 744, y: 706, width: 78, height: 68 },
                // === מספרה ===
                { table_number: "600", min_capacity: 1, max_capacity: 4, location: "indoor", area: "מספרה", combinable_with: [], features: [], x: 840, y: 385, width: 78, height: 65 },
                { table_number: "601", min_capacity: 1, max_capacity: 2, location: "indoor", area: "מספרה", combinable_with: [], features: [], x: 840, y: 460, width: 78, height: 65 },
                // === גבטה ===
                { table_number: "700", min_capacity: 1, max_capacity: 4, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1005, y: 322, width: 80, height: 65 },
                { table_number: "800", min_capacity: 1, max_capacity: 6, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1097, y: 322, width: 80, height: 65 },
                { table_number: "701", min_capacity: 1, max_capacity: 2, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1005, y: 398, width: 80, height: 65 },
                { table_number: "801", min_capacity: 1, max_capacity: 2, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1097, y: 398, width: 80, height: 65 },
                { table_number: "702", min_capacity: 1, max_capacity: 2, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1005, y: 475, width: 80, height: 65 },
                { table_number: "802", min_capacity: 1, max_capacity: 2, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1097, y: 475, width: 80, height: 65 },
                { table_number: "782", min_capacity: 1, max_capacity: 2, location: "indoor", area: "גבטה", combinable_with: [], features: [], x: 1005, y: 553, width: 80, height: 65 },
                // === אזור ורוד ===
                { table_number: "603", min_capacity: 1, max_capacity: 2, location: "indoor", area: "ורוד", combinable_with: [], features: [], x: 1078, y: 565, width: 78, height: 68 },
                { table_number: "703", min_capacity: 1, max_capacity: 2, location: "indoor", area: "ורוד", combinable_with: [], features: [], x: 1078, y: 645, width: 78, height: 68 },
                { table_number: "803", min_capacity: 1, max_capacity: 2, location: "indoor", area: "ורוד", combinable_with: [], features: [], x: 1078, y: 725, width: 78, height: 68 },
                { table_number: "604", min_capacity: 1, max_capacity: 2, location: "indoor", area: "ורוד", combinable_with: [], features: [], x: 1168, y: 565, width: 78, height: 68 },
                { table_number: "704", min_capacity: 1, max_capacity: 5, location: "indoor", area: "ורוד", combinable_with: [], features: [], x: 1168, y: 645, width: 78, height: 68 },
            ];

            const defaultFacilities = [
                { id: 'kitchen-1', type: 'kitchen', name: 'מטבח', x: 355, y: 5, width: 195, height: 130 },
                { id: 'bar-1', type: 'bar', name: 'בר', x: 355, y: 135, width: 230, height: 142 },
                { id: 'restroom-1', type: 'restroom', name: 'שירותים', x: 557, y: 5, width: 175, height: 190 },
            ];

            // Upsert — if a layout already exists, overwrite it. Prevents the
            // dup-row issue that created 11 'מפה ראשית' rows over time.
            const existing = await SeatingLayout.list().catch(() => []);
            if (existing && existing.length > 0) {
                await SeatingLayout.update(existing[0].id, {
                    layout_name: `מפה ראשית - ${brandName}`, tables: allTables, facilities: defaultFacilities,
                });
                // Best-effort cleanup of any leftover duplicates
                for (let i = 1; i < existing.length; i++) {
                    await SeatingLayout.delete(existing[i].id).catch(() => {});
                }
            } else {
                await SeatingLayout.create({ layout_name: `מפה ראשית - ${brandName}`, tables: allTables, facilities: defaultFacilities });
            }
            await loadLayout();
            alert("כל 57 השולחנות ו-3 אלמנטים פיזיים נטענו בהצלחה!");
        } catch (error) {
            console.error('Error creating default layout:', error);
            alert("שגיאה ביצירת השולחנות");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateTable = (index, field, value) => {
        const newTables = [...tables];
        if (field === 'combinable_with' && typeof value === 'string') {
            newTables[index][field] = value.split(',').map(s => s.trim()).filter(s => s);
        } else {
            newTables[index][field] = value;
        }
        setTables(newTables);
    };

    const handleAddTable = () => {
        setTables([...tables, { 
            table_number: '', 
            min_capacity: 2, 
            max_capacity: 4, 
            location: 'indoor', 
            area: 'חדש', 
            combinable_with: [], 
            features: [],
            x: Math.round((100 + Math.random() * 200) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((100 + Math.random() * 200) / GRID_SIZE) * GRID_SIZE,
            width: 70,
            height: 60
        }]);
    };

    const handleRemoveTable = (index) => {
        setTables(tables.filter((_, i) => i !== index));
    };

    // Scan a floor-plan image/sketch → AI extracts tables → append to the map.
    // Shared by the header "סרוק מפה" button and the getting-started screen.
    const runMapScan = async (file) => {
        if (!file) return;
        try {
            const { base44 } = await import('@/api/base44Client');
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const res = await base44.functions.extractSeatingFromImage({ file_url });
            const data = res?.data || res;
            const newTables = (data?.tables || []).map((t, i) => ({
                table_number: t.label || `S${i + 1}`,
                min_capacity: Math.max(1, Math.floor((t.capacity || 2) * 0.5)),
                max_capacity: Math.max(2, t.capacity || 4),
                location: (t.shape === 'outdoor') ? 'outdoor' : 'indoor',
                area: t.shape === 'bar' ? 'בר' : t.shape === 'booth' ? 'פינה' : 'חדש',
                combinable_with: [], features: [],
                x: Math.round(((t.x ?? 50) * 6) / 20) * 20,
                y: Math.round(((t.y ?? 50) * 5) / 20) * 20,
                width: 80, height: 80,
            }));
            if (!newTables.length) {
                const debug = data?._debug ? `\n\n(debug: ${data._debug})` : '';
                alert(`לא זוהו שולחנות בתמונה.${debug}\n\nנסה תמונה ברורה יותר, או ציור ידני של המפה.`);
                return;
            }
            setTables(prev => [...prev, ...newTables]);
            alert(`✅ נוספו ${newTables.length} שולחנות. גרור לתקן ושמור.`);
        } catch (err) { alert('שגיאה: ' + (err?.message || '')); }
    };

    // Align the currently-filtered area(s) into clean ROWS — keeps the tables
    // roughly where they are on the real sketch (doesn't rebuild a generic grid),
    // just snaps each row to a shared Y and evens the horizontal spacing + size.
    // Nothing saves until שמור — reload reverts (= undo).
    const autoTidyArea = () => {
        const targetAreas = selectedAreas.includes('all')
            ? [...new Set(tables.map(t => t.area).filter(Boolean))]
            : selectedAreas;
        if (!targetAreas.length) { alert('בחר אזור בסרגל למעלה (או "הכל") ואז לחץ שוב.'); return; }
        const label = selectedAreas.includes('all') ? 'כל האזורים' : targetAreas.join(', ');
        if (!window.confirm(`ליישר את השולחנות של ${label} לשורות מסודרות?\n(נשמר על הסקיצה — לא בונה רשת חדשה. לביטול: אל תשמור / רענן.)`)) return;
        const ROW_THRESHOLD = 48; // tables within this vertical distance = same row
        const CARD_W = 90, CARD_H = 76, GAP_X = 12;
        const updated = tables.map(t => ({ ...t }));
        for (const area of targetAreas) {
            const zoneTables = updated.filter(t => t.area === area);
            if (!zoneTables.length) continue;
            zoneTables.sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
            const rows = [];
            for (const t of zoneTables) {
                const last = rows[rows.length - 1];
                if (last && Math.abs((t.y || 0) - last.y) <= ROW_THRESHOLD) last.items.push(t);
                else rows.push({ y: t.y || 0, items: [t] });
            }
            for (const row of rows) {
                const rowY = Math.min(...row.items.map(t => t.y || 0));
                const startX = Math.min(...row.items.map(t => t.x || 0));
                row.items.sort((a, b) => (a.x || 0) - (b.x || 0));
                row.items.forEach((t, i) => {
                    t.y = Math.round(rowY);
                    t.x = Math.round(startX + i * (CARD_W + GAP_X));
                    t.width = CARD_W;
                    t.height = CARD_H;
                });
            }
        }
        setTables(updated);
        alert('✅ יושר לשורות. בדוק ואם טוב — לחץ "שמור". לביטול: אל תשמור / רענן.');
    };

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            const layoutData = {
                layout_name: layout?.layout_name || `מפה ראשית - ${brandName}`,
                tables,
                facilities,
                combos,
            };

            // Always check the server, not just local state — guards against
            // creating a duplicate if local state is null due to a race.
            const existing = await SeatingLayout.list().catch(() => []);
            if (existing && existing.length > 0) {
                const targetId = layout?.id || existing[0].id;
                await SeatingLayout.update(targetId, layoutData);
            } else {
                await SeatingLayout.create(layoutData);
            }
            alert("מפת ההושבה נשמרה בהצלחה!");
        } catch (error) {
            console.error('Error saving layout:', error);
            alert("שגיאה בשמירת המפה.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTableDragEnd = (tableNumber, e) => {
        if (isResizing || swapping || assigningTable || isSelectingTables) return;

        const mapContainer = e.currentTarget.parentElement;
        if (!mapContainer) return;

        const rect = mapContainer.getBoundingClientRect();
        
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
            return;
        }

        const newTables = tables.map(table => {
            if (table.table_number === tableNumber) {
                const draggedElement = e.currentTarget;
                const elementWidth = draggedElement.offsetWidth;
                const elementHeight = draggedElement.offsetHeight;

                let newX = x - elementWidth / 2;
                let newY = y - elementHeight / 2;

                const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

                return { 
                    ...table, 
                    x: snappedX, 
                    y: snappedY 
                };
            }
            return table;
        });
        setTables(newTables);
    };

    const handleAddFacility = () => {
        const newFacility = {
            id: Date.now().toString(),
            type: selectedFacilityType,
            name: FACILITY_TYPES[selectedFacilityType].name,
            x: Math.round((200 + Math.random() * 300) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((200 + Math.random() * 300) / GRID_SIZE) * GRID_SIZE,
            width: 80,
            height: 60
        };
        setFacilities([...facilities, newFacility]);
    };

    const handleFacilityDragEnd = (facilityId, e) => {
        if (swapping || assigningTable || isSelectingTables) return;

        const mapContainer = e.currentTarget.parentElement;
        if (!mapContainer) return;

        const rect = mapContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

        const newFacilities = facilities.map(facility => {
            if (facility.id === facilityId) {
                const draggedElement = e.currentTarget;
                const elementWidth = draggedElement.offsetWidth;
                const elementHeight = draggedElement.offsetHeight;

                let newX = x - elementWidth / 2;
                let newY = y - elementHeight / 2;

                const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

                return { ...facility, x: snappedX, y: snappedY };
            }
            return facility;
        });
        setFacilities(newFacilities);
    };

    const handleRemoveFacility = (facilityId) => {
        if (confirm('האם אתה בטוח שברצונך למחוק אלמנט זה?')) {
            setFacilities(facilities.filter(f => f.id !== facilityId));
        }
    };

    const handleTableResize = (tableNumber, newWidth, newHeight) => {
        setTables(prevTables => prevTables.map(table => {
            if (table.table_number === tableNumber) {
                return { 
                    ...table, 
                    width: Math.max(50, newWidth),
                    height: Math.max(40, newHeight)
                };
            }
            return table;
        }));
    };

    const handleTableStatusChange = async (tableNumber, newStatus) => {
        try {
            // Multi-table reservations act as ONE unit: an action on any one of
            // their tables applies to the whole booking. Find the reservation that
            // holds this table (if any) so we can span all of its tables.
            const activeOnTable = reservations.filter(r =>
                Array.isArray(r.assigned_table) &&
                r.assigned_table.map(String).includes(String(tableNumber)) &&
                !['cancelled', 'completed', 'no_show', 'deleted'].includes(r.status || '')
            );
            // Prefer the reservation actually seated now over a later one on the same table.
            const heldReservation = activeOnTable.find(r => r.status === 'seated') || activeOnTable[0] || null;
            const spanTables = heldReservation && Array.isArray(heldReservation.assigned_table) && heldReservation.assigned_table.length
                ? heldReservation.assigned_table.map(String)
                : [String(tableNumber)];

            // Every active session that covers any of those tables (deduped — a
            // multi-table session like "10,11" is shared, count it once).
            const sessions = [];
            const seen = new Set();
            for (const t of spanTables) {
                const s = getTableSession(t);
                if (s && !seen.has(s.id)) { seen.add(s.id); sessions.push(s); }
            }

            if (newStatus === 'available') {
                // Closing a table ends the meal and completes the booking — there is no
                // undo. On a tablet the toolbar sits on every table at once, so a 20px
                // miss used to close out a paying party of 8 silently. Confirm first,
                // and only when someone is actually sitting there.
                const occupied = sessions.length > 0 || heldReservation?.status === 'seated';
                if (occupied) {
                    const who = heldReservation?.customer_name ? ` (${heldReservation.customer_name})` : '';
                    const spanLabel = spanTables.length > 1 ? spanTables.join(' + ') : spanTables[0];
                    if (!window.confirm(`לפנות את שולחן ${spanLabel}${who}?\n\nהמשמרת בשולחן תיסגר וההזמנה תסומן כהושלמה. אי אפשר לבטל.`)) {
                        return;
                    }
                }
                await Promise.all(sessions.map(s => TableSession.update(s.id, {
                    status: 'completed', session_end: new Date().toISOString(),
                })));
                // Free the booking too, so both table cards clear together.
                if (heldReservation && heldReservation.status === 'seated') {
                    patchReservationLocal(heldReservation.id, { status: 'completed' });
                    await Reservation.update(heldReservation.id, { status: 'completed' });
                }
                setTableDetailsOpen(false);
            } else if (newStatus === 'cleaning') {
                await Promise.all(sessions.map(s => TableSession.update(s.id, {
                    status: 'to_be_cleaned', session_end: new Date().toISOString(),
                })));
                setTableDetailsOpen(false);
            }

            loadLiveData();
        } catch (error) {
            console.error('Error updating table status:', error);
            alert('שגיאה בעדכון סטטוס השולחן');
        }
    };

    // Extended status set per Dvir's spec: 10 distinct statuses.
    // `cardBg` and `cardText` are used when rendering the FULL card (strong color
    // for at-a-glance status). `color` and `bgColor` are kept for the small pill
    // version used in filter dropdowns and the status counter chips.
    // cardBg colors softened one shade lighter — easier on the eye in long sessions
    const STATUS_CONFIGS = {
        request:         { label: 'בקשה',          color: 'bg-orange-100 text-orange-800',    bgColor: 'bg-orange-50',    cardBg: 'bg-orange-500',    cardText: 'text-white' },
        pending:         { label: 'ממתין',          color: 'bg-[#F4ECD8] text-yellow-800',    bgColor: 'bg-[#FAF5E8]',    cardBg: 'bg-amber-400',     cardText: 'text-amber-950' },
        confirmed:       { label: 'מאושר',         color: 'bg-[#F4ECD8] text-[#2E3819]',        bgColor: 'bg-[#F4ECD8]',      cardBg: 'bg-[#B89556]',       cardText: 'text-white' },
        standby:         { label: 'סטנדבי',        color: 'bg-[#F4ECD8] text-[#7A3722]',    bgColor: 'bg-[#F4ECD8]',    cardBg: 'bg-[#A04A2E]',    cardText: 'text-white' },
        seated:          { label: 'יושב',           color: 'bg-green-100 text-green-800',      bgColor: 'bg-green-50',     cardBg: 'bg-emerald-500',   cardText: 'text-white' },
        finishing_soon:  { label: 'מסיים בקרוב',   color: 'bg-amber-100 text-amber-800',      bgColor: 'bg-amber-50',     cardBg: 'bg-amber-500',     cardText: 'text-white' },
        completed:       { label: 'סיים',           color: 'bg-gray-100 text-gray-800',        bgColor: 'bg-gray-50',      cardBg: 'bg-slate-500',     cardText: 'text-white' },
        cancelled:       { label: 'בוטל',           color: 'bg-red-100 text-red-700',          bgColor: 'bg-red-50',       cardBg: 'bg-[#A04A2E]',      cardText: 'text-white' },
        no_show:         { label: 'הבריז',          color: 'bg-rose-100 text-rose-900',        bgColor: 'bg-[#F4ECD8]',      cardBg: 'bg-rose-800',      cardText: 'text-white' },
        deleted:         { label: 'מחוק',           color: 'bg-zinc-200 text-zinc-700',        bgColor: 'bg-zinc-100',     cardBg: 'bg-slate-600',     cardText: 'text-white' },
    };
    const getReservationStatusConfig = (status, assigned) => {
        if (status && STATUS_CONFIGS[status]) return STATUS_CONFIGS[status];
        if (!assigned || assigned.length === 0) {
            return { label: 'לא משויך', color: 'bg-orange-100 text-orange-800', bgColor: 'bg-orange-50' };
        }
        return STATUS_CONFIGS.pending;
    };

    // Hostess colored flag — clickable on the card to cycle through states.
    const FLAG_CONFIGS = {
        green:  { color: 'bg-emerald-500', label: 'התקשרנו, מגיע' },
        orange: { color: 'bg-orange-500',  label: 'התקשרנו, מאחר' },
        red:    { color: 'bg-red-500',     label: 'התקשרנו, לא ענה' },
        black:  { color: 'bg-zinc-900',    label: 'בעייתי / מאחר 20+' },
    };
    const FLAG_CYCLE = ['', 'green', 'orange', 'red', 'black'];
    const setHostessFlag = async (reservation, nextFlag) => {
        // optimistic — no global reload
        setReservations(prev => prev.map(r => r.id === reservation.id ? { ...r, hostess_flag: nextFlag || null } : r));
        try {
            await Reservation.update(reservation.id, { hostess_flag: nextFlag || null });
        } catch (e) {
            setReservations(prev => prev.map(r => r.id === reservation.id ? { ...r, hostess_flag: reservation.hostess_flag } : r));
            console.warn('flag save failed', e);
        }
    };

    // Status picker — direct selection from a popover menu
    const STATUS_OPTIONS = ['request', 'pending', 'confirmed', 'standby', 'seated', 'finishing_soon', 'completed', 'cancelled', 'no_show', 'deleted'];
    // Optimistic helper — update one reservation row in local state without
    // triggering the global loading overlay. Avoids the 'טוען הגדרות' flash
    // every time the hostess flips a status or flag.
    const patchReservationLocal = (id, patch) => {
        setReservations(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    };
    const setStatus = async (reservation, status) => {
        patchReservationLocal(reservation.id, { status });
        try {
            await Reservation.update(reservation.id, { status });
        } catch (err) {
            patchReservationLocal(reservation.id, { status: reservation.status });
            console.warn('status save failed', err);
        }
    };

    // === Voice command dispatcher ===========================================
    // Receives a parsed intent + params from VoiceControl, executes against the
    // existing handlers/APIs, returns { ok, message } — message is spoken back.
    const handleVoiceCommand = async (cmd) => {
        try {
            switch (cmd.intent) {
                // ---------- Q&A ----------
                case 'q_next_in_queue': {
                    const pending = (queueEntries || []).filter(q => (q.status === 'pending' || q.status === 'active'));
                    if (pending.length === 0) return { ok: true, message: 'אין אף אחד בתור' };
                    const next = pending[0];
                    return { ok: true, message: `${next.customer_name || 'לקוח'}, ${next.party_size} איש` };
                }
                case 'q_next_reservation': {
                    const upcoming = (reservations || [])
                        .filter(r => (r.status || 'pending') !== 'cancelled' && (r.status || 'pending') !== 'no_show' && (r.status || 'pending') !== 'seated' && r.time)
                        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                    if (upcoming.length === 0) return { ok: true, message: 'אין יותר הזמנות היום' };
                    const r = upcoming[0];
                    return { ok: true, message: `${r.customer_name}, ${r.time?.slice(0,5)}, ${r.party_size} איש` };
                }
                case 'q_queue_count': {
                    const pending = (queueEntries || []).filter(q => (q.status === 'pending' || q.status === 'active'));
                    const totalGuests = pending.reduce((s, q) => s + (q.party_size || 0), 0);
                    return { ok: true, message: `${pending.length} חבורות, ${totalGuests} אנשים` };
                }
                case 'q_free_tables': {
                    const occupied = occupiedTableSet(activeSessions, reservations);
                    const free = (tables || []).filter(t => !occupied.has(String(t.table_number))).length;
                    return { ok: true, message: `${free} שולחנות פנויים` };
                }
                case 'q_who_on_table': {
                    const session = activeSessions.find(s => String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(cmd.table)));
                    if (!session) return { ok: true, message: `שולחן ${cmd.table} פנוי` };
                    const mins = Math.round((Date.now() - new Date(session.session_start).getTime()) / 60000);
                    return { ok: true, message: `${session.customer_name || 'לקוח'}, יושב ${Math.floor(mins/60)} שעות ו-${mins % 60} דקות` };
                }

                // ---------- Table status (find latest reservation on that table) ----------
                case 'table_free':
                case 'table_finishing':
                case 'table_seated':
                case 'table_no_show': {
                    const STATUS_MAP = { table_free: 'completed', table_finishing: 'finishing_soon', table_seated: 'seated', table_no_show: 'no_show' };
                    const newStatus = STATUS_MAP[cmd.intent];
                    const r = (reservations || []).find(r =>
                        Array.isArray(r.assigned_table) &&
                        r.assigned_table.map(String).includes(String(cmd.table)) &&
                        !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                    );
                    if (cmd.intent === 'table_free') {
                        // End any active session on this table
                        const session = activeSessions.find(s => String(s.table_number || '').split(/[,+]/).map(p => p.trim()).includes(String(cmd.table)));
                        if (session) {
                            try { await TableSession.update(session.id, { status: 'completed', session_end: new Date().toISOString() }); } catch {}
                        }
                        if (r) await setStatus(r, 'completed');
                        await loadLayout();
                        return { ok: true, message: `שולחן ${cmd.table} סומן כפנוי` };
                    }
                    if (!r) return { ok: false, message: `אין הזמנה פעילה על שולחן ${cmd.table}` };
                    await setStatus(r, newStatus);
                    return { ok: true, message: `שולחן ${cmd.table} ${newStatus === 'seated' ? 'יושב' : newStatus === 'finishing_soon' ? 'סיום קרוב' : 'no-show'}` };
                }

                // ---------- Flags ----------
                case 'table_flag': {
                    const r = (reservations || []).find(r =>
                        Array.isArray(r.assigned_table) &&
                        r.assigned_table.map(String).includes(String(cmd.table)) &&
                        !['cancelled', 'completed', 'no_show'].includes(r.status || 'pending')
                    );
                    if (!r) return { ok: false, message: `אין הזמנה על שולחן ${cmd.table}` };
                    await setHostessFlag(r, cmd.flag || null);
                    return { ok: true, message: `שולחן ${cmd.table} ${cmd.flag ? 'דגל ' + cmd.flag : 'ללא דגל'}` };
                }

                // ---------- Queue ----------
                case 'queue_add': {
                    await QueueEntry.create({
                        customer_name: cmd.name,
                        party_size: cmd.party_size,
                        seating_preference: cmd.pref || 'no_preference',
                        status: 'pending',
                        timestamp_register: new Date().toISOString(),
                    });
                    await loadQueue();
                    return { ok: true, message: `${cmd.name}, ${cmd.party_size} איש, נוספו לתור` };
                }
                case 'queue_call': {
                    const entry = (queueEntries || []).find(q =>
                        (q.customer_name || '').includes(cmd.name) && (q.status === 'pending' || q.status === 'active')
                    );
                    if (!entry) return { ok: false, message: `${cmd.name} לא נמצא בתור` };
                    try {
                        await QueueEntry.update(entry.id, { seat_called_at: new Date().toISOString() });
                        await base44.functions.sendQueuePush({
                            entry_id: entry.id,
                            title: '🔔 הגיע תורכם!',
                            message: `🔔 ${brandName} קוראת לכם! השולחן שלכם מוכן.`,
                        }).catch(() => {});
                        await loadQueue();
                        return { ok: true, message: `קראתי ל-${cmd.name}` };
                    } catch (e) { return { ok: false, message: 'שגיאה בקריאה' }; }
                }
                case 'queue_arrived': {
                    const entry = (queueEntries || []).find(q =>
                        (q.customer_name || '').includes(cmd.name) && q.status === 'pending'
                    );
                    if (!entry) return { ok: false, message: `${cmd.name} לא בתור` };
                    await QueueEntry.update(entry.id, { status: 'active', timestamp_approved: new Date().toISOString() });
                    await loadQueue();
                    return { ok: true, message: `${cmd.name} אושרה` };
                }
                case 'queue_abandoned': {
                    const entry = (queueEntries || []).find(q =>
                        (q.customer_name || '').includes(cmd.name) && (q.status === 'pending' || q.status === 'active')
                    );
                    if (!entry) return { ok: false, message: `${cmd.name} לא נמצא` };
                    await QueueEntry.update(entry.id, { status: 'abandoned', timestamp_end: new Date().toISOString() });
                    await loadQueue();
                    return { ok: true, message: `${cmd.name} נטוש` };
                }

                // ---------- Seating ----------
                case 'seat_reservation':
                case 'seat_reservation_multi': {
                    const tableIds = cmd.tables || [cmd.table];
                    const r = (reservations || []).find(r =>
                        (r.customer_name || '').includes(cmd.name) &&
                        !['cancelled', 'completed', 'no_show', 'seated'].includes(r.status || 'pending')
                    );
                    if (!r) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות` };
                    await Reservation.update(r.id, { assigned_table: tableIds, status: 'seated' });
                    try {
                        await TableSession.create({
                            table_number: tableIds.join(','),
                            party_size: r.party_size,
                            customer_name: r.customer_name,
                            customer_phone: r.customer_phone,
                            session_start: new Date().toISOString(),
                            status: 'active',
                            waiter_name: 'מנהל',
                            waiter_id: 'manager_seated',
                            table_style: 'couple',
                        });
                    } catch {}
                    await loadLayout();
                    return { ok: true, message: `${cmd.name} ישוב על ${tableIds.join(' ו-')}` };
                }
                case 'seat_next_queue': {
                    const pending = (queueEntries || []).filter(q => q.status === 'pending' || q.status === 'active');
                    if (pending.length === 0) return { ok: false, message: 'אין אף אחד בתור' };
                    const next = pending[0];
                    await QueueEntry.update(next.id, { status: 'seated', timestamp_seated: new Date().toISOString() });
                    await TableSession.create({
                        table_number: String(cmd.table),
                        party_size: next.party_size,
                        customer_name: next.customer_name,
                        customer_phone: next.customer_phone || '',
                        session_start: new Date().toISOString(),
                        status: 'active',
                        waiter_name: 'מנהל',
                        waiter_id: 'manager_seated',
                        table_style: 'couple',
                    });
                    await loadQueue();
                    await loadLayout();
                    return { ok: true, message: `${next.customer_name} ישוב על שולחן ${cmd.table}` };
                }

                // ---------- Communication ----------
                case 'resend_confirmation': {
                    const r = (reservations || []).find(r =>
                        (r.customer_name || '').includes(cmd.name) && (r.status || 'pending') === 'confirmed'
                    );
                    if (!r) return { ok: false, message: `${cmd.name} לא נמצא בהזמנות מאושרות` };
                    // TODO: wire to actual resend endpoint
                    return { ok: true, message: `נשלח אישור ל-${cmd.name}` };
                }

                default:
                    return { ok: false, message: 'פקודה לא מוכרת' };
            }
        } catch (e) {
            console.error('[voice] handler failed', e);
            return { ok: false, message: 'שגיאה: ' + (e?.message || 'נסה שוב') };
        }
    };


    const ReservationCard = ({ reservation, compact = false }) => {
        const statusConfig = getReservationStatusConfig(reservation.status, reservation.assigned_table);
        const customerInfo = reservation.customer_name || `לקוח ${reservation.id?.slice(-4)}`;

        const customer = customers.find(c => c.phone === reservation.customer_phone);
        const isReturning = customer && customer.total_visits > 1;
        const flag = reservation.hostess_flag || '';
        const flagMeta = FLAG_CONFIGS[flag];

        const openEdit = (e) => {
            // open edit only when clicking outside any inline control
            if (e.target.closest('button, [role="menuitem"], [data-popover-trigger]')) return;
            setEditingReservation(reservation);
            setIsEditReservationOpen(true);
        };

        const phoneTel = (reservation.customer_phone || '').replace(/[^\d+]/g, '');

        // Strong status-driven background (Ontopo style)
        const cardBg = statusConfig.cardBg || 'bg-white';
        const cardText = statusConfig.cardText || 'text-gray-900';
        // Source short label (Hebrew)
        const SOURCE_LABEL = {
            instagram: 'אינסטגרם', tiktok: 'TikTok', facebook: 'פייסבוק',
            google: 'גוגל', whatsapp: 'WhatsApp', qr: 'QR', sms: 'SMS',
            email: 'אימייל', direct: 'אונליין ישיר', other: 'אחר',
        };
        const sourceLabel = reservation.source ? (SOURCE_LABEL[reservation.source] || reservation.source) : null;

        // Next reservation after this one on same date (any status, just chronologically next)
        const nextReservation = (() => {
            if (!reservation.time || !reservation.date) return null;
            const sameDay = reservations.filter(o =>
                o.id !== reservation.id &&
                o.date === reservation.date &&
                o.time && o.time > reservation.time &&
                (o.status || 'pending') !== 'cancelled'
            );
            sameDay.sort((a, b) => a.time.localeCompare(b.time));
            return sameDay[0] || null;
        })();

        const askAiForThis = (e) => {
            e.stopPropagation();
            const q = `איזה שולחן הכי טוב להושיב את ${reservation.customer_name || 'הלקוח'} (${reservation.party_size || '?'} סועדים) בשעה ${reservation.time?.slice(0,5) || ''}? קח בחשבון את ההזמנות האחרות והשולחנות הפנויים עכשיו.`;
            setAiPrefillQuestion(q);
            setAiOpen(true);
        };

        // === Compact rail card (Ontopo-style, 6-8 fit in viewport) ===
        if (compact) {
            return (
                <div
                    className={`px-2.5 py-1.5 rounded-lg border-2 border-transparent transition-colors hover:brightness-110 cursor-pointer relative overflow-hidden ${cardBg} ${cardText} ${isReturning ? 'ring-2 ring-pink-300' : ''}`}
                    onClick={openEdit}
                >
                    {flagMeta && (
                        <div className={`absolute top-0 bottom-0 right-0 w-1 ${flagMeta.color}`}></div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        {/* RIGHT in RTL: time + table/status */}
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="font-black text-lg leading-none tabular-nums">{reservation.time?.slice(0, 5) || '--:--'}</div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="font-bold text-sm truncate">{customerInfo}</div>
                                <div className="text-[10px] opacity-80 truncate">
                                    {sourceLabel || 'אונליין'}{isReturning ? ' · חוזר' : ''}
                                </div>
                            </div>
                        </div>
                        {/* LEFT in RTL: party + table + status + flag */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-base font-black opacity-90">👥{reservation.party_size || '?'}</span>
                            {Array.isArray(reservation.assigned_table) && reservation.assigned_table.length > 0 && (
                                <span className="text-[11px] font-bold bg-white/40 rounded px-1">🪑{reservation.assigned_table.join(',')}</span>
                            )}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        data-popover-trigger
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/80 text-amber-900 hover:bg-white shadow-sm"
                                    >{statusConfig.label}</button>
                                </PopoverTrigger>
                                <PopoverContent className="p-1.5 w-44" dir="rtl" align="start">
                                    <div className="text-[10px] font-bold text-gray-500 px-2 py-1">החלף סטטוס:</div>
                                    {STATUS_OPTIONS.map(s => {
                                        const sc = STATUS_CONFIGS[s];
                                        const active = (reservation.status || 'pending') === s;
                                        return (
                                            <button
                                                key={s}
                                                onClick={(e) => { e.stopPropagation(); setStatus(reservation, s); }}
                                                className={`w-full text-right text-xs font-bold px-2 py-1.5 rounded my-0.5 flex items-center gap-2 ${
                                                    active ? sc.color + ' ring-2 ring-indigo-400' : `${sc.color} opacity-75 hover:opacity-100`
                                                }`}
                                            >{sc.label}</button>
                                        );
                                    })}
                                </PopoverContent>
                            </Popover>
                            {flagMeta && (
                                <span title={flagMeta.label} className={`w-2.5 h-2.5 rounded-full ${flagMeta.color} border border-white`}></span>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div
                className={`p-3.5 rounded-xl border-2 border-transparent transition-all hover:shadow-lg cursor-pointer relative overflow-hidden ${cardBg} ${cardText} ${isReturning ? 'ring-2 ring-pink-300 ring-offset-1' : ''}`}
                onClick={openEdit}
            >
                {/* Flag stripe on right edge — full height */}
                {flagMeta && (
                    <div className={`absolute top-0 bottom-0 right-0 w-1.5 ${flagMeta.color}`}></div>
                )}

                {/* TOP ROW (RTL): status pill on RIGHT, time on LEFT */}
                <div className="flex items-start justify-between gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                data-popover-trigger
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors shadow-sm"
                            >
                                {statusConfig.label}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="p-1.5 w-44" dir="rtl" align="start">
                            <div className="text-[10px] font-bold text-gray-500 px-2 py-1">החלף סטטוס:</div>
                            {STATUS_OPTIONS.map(s => {
                                const sc = STATUS_CONFIGS[s];
                                const active = (reservation.status || 'pending') === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={(e) => { e.stopPropagation(); setStatus(reservation, s); }}
                                        className={`w-full text-right text-xs font-bold px-2 py-1.5 rounded my-0.5 flex items-center gap-2 ${
                                            active ? sc.color + ' ring-2 ring-indigo-400' : `${sc.color} opacity-75 hover:opacity-100`
                                        }`}
                                    >
                                        {sc.label}
                                    </button>
                                );
                            })}
                        </PopoverContent>
                    </Popover>
                    <div className="flex items-center gap-1.5">
                        <button
                            data-popover-trigger
                            onClick={askAiForThis}
                            title="שאל את AI לאיזה שולחן להושיב"
                            className="text-base w-7 h-7 rounded-full bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] text-white shadow hover:scale-110 transition-transform flex items-center justify-center"
                        >✨</button>
                        <div className="font-black text-2xl leading-none">
                            {reservation.time?.slice(0, 5) || '--:--'}
                        </div>
                    </div>
                </div>

                {/* MIDDLE ROW: party size │ name (Ontopo style) + flag dot */}
                <div className="mt-2.5 flex items-center gap-2">
                    {/* Party size as big number */}
                    <span className="text-2xl font-black opacity-95">{reservation.party_size || '?'}</span>
                    {/* White divider */}
                    <span className="w-px h-7 bg-white/40"></span>
                    {/* Name */}
                    <div className="font-bold text-lg truncate flex-1 min-w-0">{customerInfo}</div>
                    {/* Flag dot */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                data-popover-trigger
                                onClick={(e) => e.stopPropagation()}
                                title={flagMeta?.label || 'הוסף דגל'}
                                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                                    flagMeta ? `${flagMeta.color} border-white shadow` : 'bg-white/30 border-white/70 hover:bg-white/50'
                                }`}
                            ></button>
                        </PopoverTrigger>
                        <PopoverContent className="p-2 w-52" dir="rtl" align="end">
                            <div className="text-[10px] font-bold text-gray-500 mb-1.5">בחר דגל:</div>
                            {Object.entries(FLAG_CONFIGS).map(([k, v]) => (
                                <button
                                    key={k}
                                    onClick={(e) => { e.stopPropagation(); setHostessFlag(reservation, k); }}
                                    className={`w-full flex items-center gap-2 text-xs font-bold px-2 py-1.5 rounded my-0.5 hover:bg-gray-100 ${flag === k ? 'bg-gray-100 ring-2 ring-indigo-400' : ''}`}
                                >
                                    <span className={`w-3 h-3 rounded-full ${v.color}`}></span>
                                    <span className="text-gray-800">{v.label}</span>
                                </button>
                            ))}
                            {flag && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setHostessFlag(reservation, ''); }}
                                    className="w-full text-[11px] text-gray-500 hover:text-red-600 py-1 mt-1 border-t"
                                >ניקוי דגל</button>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* TABLE + PHONE row */}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-sm opacity-90">
                    {phoneTel ? (
                        <a
                            href={`tel:${phoneTel}`}
                            onClick={(e) => e.stopPropagation()}
                            data-popover-trigger
                            className="text-xs hover:underline opacity-80 hover:opacity-100"
                            dir="ltr"
                        >
                            {reservation.customer_phone}
                        </a>
                    ) : <span></span>}
                    {Array.isArray(reservation.assigned_table) && reservation.assigned_table.length > 0 && (
                        <span className="flex items-center gap-1 font-bold">
                            <span className="text-base">🪑</span>
                            <span className="text-lg">{reservation.assigned_table.join(',')}</span>
                        </span>
                    )}
                </div>

                {/* SOURCE + EXTRAS row */}
                {(sourceLabel || reservation.special_occasion || reservation.special_requests || isReturning) && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] opacity-90">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {sourceLabel && <span>הזמנה {sourceLabel}{reservation.campaign ? ` · ${reservation.campaign}` : ''}</span>}
                            {reservation.special_occasion && <span>· 🎉 {reservation.special_occasion}</span>}
                        </div>
                        {isReturning && (
                            <span className="bg-pink-200 text-pink-900 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0">חוזר</span>
                        )}
                    </div>
                )}
                {reservation.special_requests && (
                    <div className="mt-1 italic text-[11px] opacity-75 truncate" title={reservation.special_requests}>
                        "{reservation.special_requests}"
                    </div>
                )}

                {/* NEXT reservation chip */}
                {nextReservation && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold bg-white/40 backdrop-blur-sm rounded-full px-2 py-1 w-fit">
                        <span>⏭️</span>
                        <span>הבא: {nextReservation.time?.slice(0,5)} · {nextReservation.customer_name || 'לקוח'} ({nextReservation.party_size || '?'})</span>
                    </div>
                )}
            </div>
        );
    };

    // ── יישר מפה ────────────────────────────────────────────────────────────
    // Zones are computed as the bounding box of their tables, so when tables from
    // different areas are interleaved physically the boxes overlap and the pastel
    // fills mix into mud. Laying each area out as its own packed block is what
    // actually makes the background clean — it removes the overlap at the source.
    // Only mutates local state; nothing persists until the owner presses שמור.
    const TIDY_W = 104, TIDY_H = 78, TIDY_GAP = 14, TIDY_ZONE_PAD = 46, TIDY_CANVAS = 1400;
    const handleTidyMap = () => {
        if (!tables.length) return;
        if (!window.confirm('ליישר את המפה?\n\nכל שולחן יוצמד לרשת ויקבל גודל אחיד, וכל אזור יסודר כבלוק נפרד בלי חפיפה.\nהשינוי לא נשמר עד שתלחץ "שמור מפה".')) return;

        // Keep each area's existing reading order (top-to-bottom, right-to-left).
        const byArea = {};
        for (const t of tables) {
            const a = t.area || 'ללא אזור';
            (byArea[a] = byArea[a] || []).push(t);
        }
        const areas = Object.entries(byArea).map(([area, list]) => {
            const sorted = [...list].sort((p, q) =>
                (Math.round((p.y || 0) / 60) - Math.round((q.y || 0) / 60)) || ((q.x || 0) - (p.x || 0)));
            const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(sorted.length * 1.7))));
            const rows = Math.ceil(sorted.length / cols);
            return {
                area, sorted, cols, rows,
                w: cols * TIDY_W + (cols - 1) * TIDY_GAP + TIDY_ZONE_PAD * 2,
                h: rows * TIDY_H + (rows - 1) * TIDY_GAP + TIDY_ZONE_PAD * 2,
            };
        }).sort((a, b) => b.h - a.h); // tallest blocks first so rows pack tightly

        // Shelf-pack the area blocks so no two zones can overlap.
        const next = [];
        let cursorX = 20, cursorY = 20, shelfH = 0;
        for (const blk of areas) {
            if (cursorX + blk.w > TIDY_CANVAS && cursorX > 20) {
                cursorX = 20; cursorY += shelfH + 28; shelfH = 0;
            }
            blk.sorted.forEach((t, i) => {
                const c = i % blk.cols, r = Math.floor(i / blk.cols);
                next.push({
                    ...t,
                    x: cursorX + TIDY_ZONE_PAD + c * (TIDY_W + TIDY_GAP),
                    y: cursorY + TIDY_ZONE_PAD + r * (TIDY_H + TIDY_GAP),
                    width: TIDY_W,
                    height: TIDY_H,
                });
            });
            cursorX += blk.w + 24;
            shelfH = Math.max(shelfH, blk.h);
        }
        setTables(next);
        alert('המפה יושרה ✅\n\nלחץ "שמור מפה" כדי לשמור — או פשוט רענן את הדף כדי לבטל.');
    };

    const getSeatingDuration = (size) => {
        if (size >= 9) return 165;
        if (size >= 6) return 150;
        return 120;
    };

    const getReservationCalculatedEndTime = (reservation) => {
        if (!reservation || !reservation.time || !reservation.date) return null;
        const seatingDuration = getSeatingDuration(reservation.party_size);
        const startTime = new Date(`${reservation.date}T${reservation.time}`);
        const endTime = new Date(startTime.getTime() + seatingDuration * 60 * 1000);
        return endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    };

    const getFirstName = (fullName) => {
        if (!fullName) return '';
        return fullName.split(' ')[0];
    };

    const ReservationsDashboard = ({ hideDatePicker = false } = {}) => {
        const [timeFilter, setTimeFilter] = useState('');
        const [timeBucket, setTimeBucket] = useState('all'); // all|morning|noon|evening|night
        // Apply time bucket → set time filter to first hour digit of range
        const TIME_BUCKETS = {
            all:     { label: 'הכל',      test: () => true },
            morning: { label: 'בוקר',     test: (t) => t >= '06:00' && t < '12:00' },
            noon:    { label: 'צהריים',   test: (t) => t >= '12:00' && t < '17:00' },
            evening: { label: 'ערב',      test: (t) => t >= '17:00' && t < '22:00' },
            night:   { label: 'לילה',     test: (t) => t >= '22:00' || t < '06:00' },
        };
        const [searchTerm, setSearchTerm] = useState('');
        // Compact list density — 6-8 cards per viewport. Persisted across renders.
        const [compactMode, setCompactMode] = useState(() => {
            try { return localStorage.getItem('seating_compact_mode') !== 'off'; } catch { return true; }
        });
        const toggleCompact = () => {
            setCompactMode(v => {
                const next = !v;
                try { localStorage.setItem('seating_compact_mode', next ? 'on' : 'off'); } catch {}
                return next;
            });
        };

        const filteredReservations = reservations.filter(r => {
            const statusMatch = selectedStatus === 'all' || (r.status || 'pending') === selectedStatus;
            const timeMatch = !timeFilter || (r.time && r.time.startsWith(timeFilter));
            const bucketMatch = timeBucket === 'all' || (r.time && TIME_BUCKETS[timeBucket]?.test(r.time));
            const flagMatch = selectedFlag === 'all'
                || (selectedFlag === 'none' && !r.hostess_flag)
                || (r.hostess_flag === selectedFlag);
            const q = searchTerm.trim().toLowerCase();
            const searchMatch = !q || (
                (r.customer_name || '').toLowerCase().includes(q) ||
                (r.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
            );
            return statusMatch && timeMatch && bucketMatch && flagMatch && searchMatch;
        });

        const flagCounts = reservations.reduce((c, r) => {
            const f = r.hostess_flag || 'none';
            c[f] = (c[f] || 0) + 1;
            return c;
        }, {});

        const totalGuests = filteredReservations.reduce((sum, res) => sum + (res.party_size || 0), 0);

        const statusCounts = reservations.reduce((counts, reservation) => {
            const status = reservation.status || 'pending';
            counts[status] = (counts[status] || 0) + 1;
            counts.total = (counts.total || 0) + 1;
            return counts;
        }, {});

        return (
            <div className="bg-white rounded-lg p-4 shadow-sm border">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-[#44512C]" />
                        הזמנות ({filteredReservations.length}) - סה"כ {totalGuests} אורחים
                    </h3>
                    
                    {!hideDatePicker && (
                    <div className="flex items-center gap-1.5">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Calendar className="w-4 h-4 ml-2" />
                                    {format(selectedDate, 'dd/MM/yyyy')}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <CalendarComponent
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={date => { if(date) setSelectedDate(date)}}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant="outline" size="sm"
                            className={format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-slate-900 text-white' : ''}
                            onClick={() => setSelectedDate(new Date())}
                        >היום</Button>
                    </div>
                    )}
                </div>

                {/* Search box — name or phone */}
                <div className="mb-2 relative">
                    <Input
                        type="search"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="🔍 חפש לפי שם או טלפון..."
                        className="w-full pr-3"
                    />
                </div>

                {/* Hour bucket filter — quick chips, no typing */}
                <div className="mb-2 flex flex-wrap gap-1">
                    {['all','morning','noon','evening','night'].map(k => {
                        const active = timeBucket === k;
                        const emoji = { all: '🕐', morning: '🌅', noon: '☀️', evening: '🌙', night: '🌃' }[k];
                        return (
                            <button
                                key={k}
                                onClick={() => setTimeBucket(k)}
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors
                                    ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'}`}
                            >{emoji} {TIME_BUCKETS[k].label}</button>
                        );
                    })}
                </div>

                <div className="flex gap-2 mb-4">
                    <Input
                        type="time"
                        value={timeFilter}
                        onChange={e => setTimeFilter(e.target.value)}
                        className="w-24"
                        placeholder="שעה"
                    />
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="flex-1">
                            <SelectValue placeholder="בחר סטטוס" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">הכל ({statusCounts.total || 0})</SelectItem>
                            <SelectItem value="request">בקשה ({statusCounts.request || 0})</SelectItem>
                            <SelectItem value="pending">ממתין ({statusCounts.pending || 0})</SelectItem>
                            <SelectItem value="confirmed">מאושר ({statusCounts.confirmed || 0})</SelectItem>
                            <SelectItem value="standby">סטנדבי ({statusCounts.standby || 0})</SelectItem>
                            <SelectItem value="seated">יושב ({statusCounts.seated || 0})</SelectItem>
                            <SelectItem value="finishing_soon">מסיים בקרוב ({statusCounts.finishing_soon || 0})</SelectItem>
                            <SelectItem value="completed">סיים ({statusCounts.completed || 0})</SelectItem>
                            <SelectItem value="cancelled">בוטל ({statusCounts.cancelled || 0})</SelectItem>
                            <SelectItem value="no_show">הבריז ({statusCounts.no_show || 0})</SelectItem>
                            <SelectItem value="deleted">מחוק ({statusCounts.deleted || 0})</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Flag filter — colored pill row */}
                <div className="mb-4 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">דגל:</span>
                    {[
                        { k: 'all',    label: 'הכל',  cls: 'bg-gray-100 text-gray-700 border-gray-200' },
                        { k: 'none',   label: '○',    cls: 'bg-white text-gray-500 border-gray-300', title: 'בלי דגל' },
                        { k: 'green',  label: '●',    cls: 'bg-emerald-500 text-white border-emerald-700', title: 'התקשרנו, מגיע' },
                        { k: 'orange', label: '●',    cls: 'bg-orange-500 text-white border-orange-700', title: 'התקשרנו, מאחר' },
                        { k: 'red',    label: '●',    cls: 'bg-red-500 text-white border-red-700', title: 'התקשרנו, לא ענה' },
                        { k: 'black',  label: '●',    cls: 'bg-zinc-900 text-white border-zinc-700', title: 'בעייתי' },
                    ].map(f => {
                        const count = f.k === 'all'
                            ? reservations.length
                            : (flagCounts[f.k] || 0);
                        const active = selectedFlag === f.k;
                        return (
                            <button
                                key={f.k}
                                onClick={() => setSelectedFlag(f.k)}
                                title={f.title || f.label}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all
                                    ${f.cls} ${active ? 'ring-2 ring-indigo-500 ring-offset-1 scale-105' : 'opacity-70 hover:opacity-100'}`}
                            >
                                {f.label} <span className="opacity-80">({count})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Density toggle */}
                <div className="flex items-center justify-end mb-1.5 gap-1">
                    <button
                        onClick={toggleCompact}
                        title={compactMode ? 'הצג קלפים גדולים' : 'הצג קלפים קומפקטיים'}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors
                            ${compactMode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200'}`}
                    >{compactMode ? '☰ קומפקטי' : '▦ מורחב'}</button>
                </div>
                <div className={`overflow-y-auto ${compactMode ? 'space-y-1 max-h-[calc(100vh-180px)]' : 'space-y-2 max-h-[calc(100vh-200px)]'}`}>
                    {filteredReservations.length > 0 ? (
                        filteredReservations.map(reservation => (
                            <ReservationCard key={reservation.id} reservation={reservation} compact={compactMode} />
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p>אין הזמנות</p>
                            {selectedStatus !== 'all' && (
                                <p className="text-sm">עם הסינון הנוכחי</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const handleReleaseTable = async (tableNumber) => {
        const session = getTableSession(tableNumber);
        if (!session) return;
        if (!window.confirm(`לשחרר את שולחן ${tableNumber}?\n\nהמשמרת בשולחן תיסגר. אי אפשר לבטל.`)) return;
        try {
            await TableSession.update(session.id, { 
                status: 'completed',
                session_end: new Date().toISOString() 
            });
            setTableDetailsOpen(false);
            loadLiveData();
        } catch (error) {
            console.error('Error releasing table:', error);
            alert('שגיאה בשחרור השולחן');
        }
    };

    const handleMoveToTable = async (fromTable, toTable) => {
        const session = getTableSession(fromTable);
        if (!session) return;

        try {
            await TableSession.update(session.id, {
                table_number: toTable,
                notes: (session.notes ? session.notes + ' | ' : '') + `הועבר משולחן ${fromTable} בשעה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}`
            });
            // Keep a seated reservation's table assignment in sync, else the guest
            // still lights up the OLD table (shown on two tables at once).
            const movedRes = reservations.find(r =>
                Array.isArray(r.assigned_table) && r.assigned_table.map(String).includes(String(fromTable)) &&
                r.date === format(new Date(), 'yyyy-MM-dd') && r.status === 'seated'
            );
            if (movedRes) {
                const next = [...new Set(movedRes.assigned_table.map(String).map(t => t === String(fromTable) ? String(toTable) : t))];
                await Reservation.update(movedRes.id, { assigned_table: next });
            }
            setTableDetailsOpen(false);
            loadLiveData();
        } catch (error) {
            console.error('Error moving table:', error);
            alert('שגיאה בהעברת השולחן');
        }
    };

    const TableDetailsDialog = ({ table, session }) => {
        if (!table) return null;

        const progress = session ? Math.round(((session.steps_completed?.length || 0) / 23) * 100) : 0;
        const currentStepInfo = getStepInfo(session?.current_step);
        
        const futureReservations = reservations.filter(r => 
            Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) && 
            (r.status === 'confirmed' || r.status === 'pending') &&
            new Date(`${r.date}T${r.time}`) > new Date()
        ).sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        const availableTables = tables.filter(t => t.table_number !== table.table_number && !getTableSession(t.table_number));

        // A guest seated via a RESERVATION (not a live session) — so we can offer
        // edit / move for them too (the session path is handled separately below).
        const seatedRes = reservations.find(r =>
            Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) &&
            r.date === format(new Date(), 'yyyy-MM-dd') && r.status === 'seated'
        );

        const handleEditReservation = (reservation) => {
            setEditingReservation(reservation);
            setIsEditReservationOpen(true);
            setTableDetailsOpen(false);
        };

        const handleMoveReservation = (reservation) => {
            startMultiTableSelection(reservation.id);
            setTableDetailsOpen(false);
        };
        
        const handleMoveToSpecificTable = async (targetTable) => {
            if (!session) return;

            try {
                await TableSession.update(session.id, {
                    table_number: targetTable,
                    notes: (session.notes ? session.notes + ' | ' : '') + `הועבר משולחן ${table.table_number} בשעה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                });
                // Move a seated reservation's assignment too, so it doesn't stay on the old table.
                if (seatedRes && Array.isArray(seatedRes.assigned_table)) {
                    const next = [...new Set(seatedRes.assigned_table.map(String).map(t => t === String(table.table_number) ? String(targetTable) : t))];
                    await Reservation.update(seatedRes.id, { assigned_table: next });
                }
                setTableDetailsOpen(false);
                loadLiveData();
            } catch (error) {
                console.error('Error moving table:', error);
                alert('שגיאה בהעברת השולחן');
            }
        };

        return (
            <DialogContent className="w-full h-full sm:h-auto max-w-full sm:max-w-[700px] sm:max-h-[85vh] overflow-y-auto rounded-none sm:rounded-lg" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="text-xl">פרטי שולחן {table.table_number}</DialogTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => { setTableDetailsOpen(false); setIncidentTableNumber(table.table_number); }}
                    >
                        🚨 פתח תקרית
                    </Button>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <Label className="text-sm font-semibold text-gray-600">מיקום</Label>
                            <div className="text-lg">{table.location === 'indoor' ? '🏠 פנים' : '🌿 חוץ'}</div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <Label className="text-sm font-semibold text-gray-600">קיבולת</Label>
                            <div className="text-lg">{table.min_capacity === table.max_capacity ? table.max_capacity : `${table.min_capacity}-${table.max_capacity}`} מקומות</div>
                        </div>
                    </div>

                    {/* Table shape — moved here from the card hover menu (freed that spot for "move table") */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <Label className="text-sm font-semibold text-gray-600">צורת שולחן</Label>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant={table.shape !== 'round' ? 'default' : 'outline'}
                                onClick={() => setTables(prev => prev.map(t => t.table_number === table.table_number ? { ...t, shape: 'rect' } : t))}
                            >⬛ מרובע</Button>
                            <Button
                                size="sm"
                                variant={table.shape === 'round' ? 'default' : 'outline'}
                                onClick={() => setTables(prev => prev.map(t => t.table_number === table.table_number ? { ...t, shape: 'round' } : t))}
                            >⭕ עגול</Button>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400 -mt-4 px-1">שינוי הצורה נשמר בלחיצה על "שמור מפה".</p>

                    {/* Remove this table from the WHOLE system — map, every priority list, auto-assign */}
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <Button
                            variant="outline"
                            className="w-full text-red-700 border-red-300 hover:bg-red-100"
                            onClick={() => {
                                const num = String(table.table_number);
                                if (session || seatedRes) {
                                    alert('לא ניתן להסיר שולחן שיושבים עליו כרגע. שחרר אותו קודם.');
                                    return;
                                }
                                if (!window.confirm(`להסיר את שולחן ${num} מהמערכת לגמרי?\n\nהוא ייעלם מהמפה, מכל רשימות העדיפות ומהשיבוץ האוטומטי.\n(יש ללחוץ "שמור מפה" אחר כך כדי לשמור.)`)) return;
                                // Drop the table, scrub it from every other table's combinable_with,
                                // and remove any priority entry (combo) that referenced it.
                                setTables(prev => prev
                                    .filter(t => String(t.table_number) !== num)
                                    .map(t => ({ ...t, combinable_with: (Array.isArray(t.combinable_with) ? t.combinable_with : []).filter(x => String(x) !== num) })));
                                setCombos(prev => prev.filter(c => !((Array.isArray(c.tables) ? c.tables : []).map(String).includes(num))));
                                setTableDetailsOpen(false);
                            }}
                        >
                            <Trash2 className="w-4 h-4 ml-2" />
                            הסר שולחן מהמערכת
                        </Button>
                        <p className="text-[11px] text-red-500 mt-1.5 text-center">לשולחן שכבר לא קיים במסעדה. נשמר בלחיצה על "שמור מפה".</p>
                    </div>

                    {futureReservations.length > 0 && (
                        <div className="border rounded-lg p-4 bg-[#F4ECD8]">
                            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-[#44512C]" />
                                הזמנות עתידיות ({futureReservations.length})
                            </h3>
                            <div className="space-y-2">
                                {futureReservations.map((reservation) => (
                                    <div key={reservation.id} className="bg-white p-3 rounded border border-[#E8D9B5] flex justify-between items-center group">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-[#2E3819]">{reservation.customer_name}</span>
                                                <span className="text-sm text-gray-600">({reservation.party_size} אנשים)</span>
                                                <span className="text-sm text-[#44512C]">
                                                    {format(new Date(reservation.date), 'dd/MM')} בשעה {reservation.time?.slice(0, 5)}
                                                </span>
                                            </div>
                                            {reservation.special_requests && (
                                                <div className="text-xs text-gray-500 mt-1">"{reservation.special_requests}"</div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleEditReservation(reservation)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleMoveReservation(reservation)}>
                                                <ArrowRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {!session && seatedRes && (
                        <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                            <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                                <Users className="w-5 h-5 text-green-600" />
                                יושבים כעת: {seatedRes.customer_name} <span className="text-sm text-gray-500">({seatedRes.party_size} · {seatedRes.time?.slice(0, 5)})</span>
                            </h3>
                            <p className="text-xs text-gray-500 mb-3">אפשר לערוך את ההזמנה או להעביר את היושבים לשולחן אחר.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Button variant="outline" onClick={() => handleEditReservation(seatedRes)}>
                                    <Edit className="w-4 h-4 ml-2" /> ערוך הזמנה
                                </Button>
                                <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => handleMoveReservation(seatedRes)}>
                                    <ArrowRight className="w-4 h-4 ml-2" /> העבר לשולחן אחר
                                </Button>
                            </div>
                        </div>
                    )}

                    {session ? (
                        <>
                            <div className="border rounded-lg p-4 bg-[#F4ECD8]">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-[#44512C]" />
                                    פרטי הפגישה הפעילה
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">שם הלקוח</Label>
                                        <div className="text-lg">{session.customer_name || 'לא צוין'}</div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">מספר אנשים</Label>
                                        <div className="text-lg">{session.party_size}</div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">מלצר אחראי</Label>
                                        <div className="text-lg">{session.waiter_name}</div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600 flex items-center gap-1">
                                            <Phone className="w-4 h-4" />
                                            טלפון לקוח
                                        </Label>
                                        <div className="text-lg">{session.customer_phone || 'לא צוין'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-orange-50">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <Wrench className="w-5 h-5 text-orange-600" />
                                    פעולות על השולחן
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Button 
                                        onClick={() => handleReleaseTable(table.table_number)}
                                        variant="outline"
                                        className="bg-[#F4ECD8] border-[#D9BD83] text-yellow-800 hover:bg-yellow-200"
                                    >
                                        <Ban className="w-4 h-4 ml-2" />
                                        הוצא מישיבה
                                    </Button>
                                    <Button 
                                        onClick={() => handleTableStatusChange(table.table_number, 'cleaning')}
                                        variant="outline"
                                        className="bg-[#F4ECD8] border-[#D9BD83] text-yellow-800 hover:bg-yellow-200"
                                    >
                                        <Ban className="w-4 h-4 ml-2" />
                                        העבר לניקוי
                                    </Button>
                                    
                                    <div className="md:col-span-2">
                                        <h4 className="font-bold text-md mb-2 flex items-center gap-2">
                                            <ArrowRight className="w-4 h-4 text-orange-600" />
                                            העברת הזמנה לשולחן אחר:
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                                            {availableTables.length > 0 ? (
                                                availableTables.map(availableTable => (
                                                    <Button 
                                                        key={availableTable.table_number}
                                                        variant="outline" 
                                                        size="sm"
                                                        className="justify-between"
                                                        onClick={() => handleMoveToSpecificTable(availableTable.table_number)}
                                                    >
                                                        <span>{availableTable.table_number}</span>
                                                        <span className="text-xs">({availableTable.min_capacity}-{availableTable.max_capacity})</span>
                                                    </Button>
                                                ))
                                            ) : (
                                                <p className="text-gray-500 text-sm col-span-3">אין שולחנות פנויים כרגע להעברה.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-green-50">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-green-600" />
                                    זמני הפגישה
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">התחיל בשעה</Label>
                                        <div className="text-lg">
                                            {session.session_start ? 
                                                new Date(session.session_start).toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'}) 
                                                : 'לא ידוע'
                                            }
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">זמן פעיל</Label>
                                        <div className="text-lg font-bold text-green-600">{getActiveTime(session)}</div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">זמן סיום מעורב</Label>
                                        <div className="text-lg">
                                            {session.session_end ? 
                                                new Date(session.session_end).toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'}) 
                                                : 'עדיין פעיל'
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-[#F4ECD8]">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <ChefHat className="w-5 h-5 text-[#A04A2E]" />
                                    התקדמות השירות
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold">שלב נוכחי: {session.current_step}/23</span>
                                        <span className="text-lg font-bold text-[#A04A2E]">{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-3" />
                                    <div className="bg-white p-3 rounded border">
                                        <div className="font-semibold text-[#7A3722]">{currentStepInfo?.step_name || 'שלב לא ידוע'}</div>
                                        <div className="text-sm text-gray-600 mt-1">{currentStepInfo?.description || ''}</div>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        <span className="font-semibold">שלבים שהושלמו:</span> {session.steps_completed?.length || 0}
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-orange-50">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <ChefHat className="w-5 h-5 text-orange-600" />
                                    פרטי הזמנה
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">סגנון השולחן</Label>
                                        <div className="text-lg capitalize">{session.table_style?.replace('_', ' ') || 'רגיל'}</div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">בקשות מיוחדות</Label>
                                        <div className="text-sm bg-white p-2 rounded border">
                                            {session.special_requests || 'אין בקשות מיוחדות'}
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-600">הערות</Label>
                                        <div className="text-sm bg-white p-2 rounded border">
                                            {session.notes || 'אין הערות'}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 p-3 bg-[#F4ECD8] rounded-lg">
                                    <div className="text-sm text-yellow-800">
                                        💡 <strong>הערה:</strong> מערכת ההזמנות עדיין לא מחוברת. בעתיד כאן יופיעו פרטי המנות שהוזמנו ומה עדיין חסר.
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <div className="text-6xl mb-4">😴</div>
                            <h3 className="text-xl font-bold text-gray-600 mb-2">השולחן פנוי</h3>
                            <p className="text-gray-500 mb-4">אין פעילות כרגע בשולחן זה</p>
                            {/* The most common hostess gesture — "guest at the door, this table
                                is open" — had no path from the map at all: the empty state was a
                                dead end and she had to leave the table, open הושבה מהירה and find
                                it again in a grid. */}
                            <Button
                                onClick={() => {
                                    setQuickSeatTable(table);
                                    setTableDetailsOpen(false);
                                    setQuickSeatOpen(true);
                                }}
                                className="bg-[#A04A2E] hover:bg-[#7A3722] text-white font-bold gap-2 px-6 py-5 text-base"
                            >
                                🪑 הושב כאן
                            </Button>
                            <p className="text-[11px] text-gray-400 mt-2">
                                מזמין מזדמן או אורח מהתור — {table.min_capacity}-{table.max_capacity} סועדים
                            </p>
                        </div>
                    )}

                    <div className="border rounded-lg p-4 bg-red-50">
                        <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-red-700">
                            📜 היסטוריית תקריות
                        </h3>
                        <TableIncidentHistory tableNumber={table.table_number} />
                    </div>
                </div>
            </DialogContent>
        );
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /> טוען הגדרות...</div>;
    
    const handleStartSwap = (tableNumber) => {
        setSwapping({ from: tableNumber });
        setAssigningTable(null);
        setIsSelectingTables(false);
        setSelectedTablesForReservation([]);
        setMultiAssignReservationId(null);
        // The yellow "מצב החלפה" banner already states this — no blocking alert.
    };

    const handleSwapTables = async (fromTable, toTable) => {
        if (!fromTable || !toTable || fromTable === toTable) {
            setSwapping(null);
            return;
        }

        const sessionFrom = getTableSession(fromTable);
        const sessionTo = getTableSession(toTable);

        try {
            const updates = [];
            if (sessionFrom) {
                updates.push(TableSession.update(sessionFrom.id, { table_number: toTable }));
            }
            if (sessionTo) {
                updates.push(TableSession.update(sessionTo.id, { table_number: fromTable }));
            }
            const reservationsToUpdate = reservations.filter(r =>
                (Array.isArray(r.assigned_table) && (r.assigned_table.includes(fromTable) || r.assigned_table.includes(toTable))) &&
                (r.status === 'confirmed' || r.status === 'pending' || r.status === 'seated')
            );
            for (const res of reservationsToUpdate) {
                let newAssignedTable = res.assigned_table ? [...res.assigned_table] : [];
                let changed = false;

                const tempAssigned = new Set(newAssignedTable);

                if (tempAssigned.has(fromTable)) {
                    tempAssigned.delete(fromTable);
                    tempAssigned.add(toTable);
                    changed = true;
                } else if (tempAssigned.has(toTable)) {
                    tempAssigned.delete(toTable);
                    tempAssigned.add(fromTable);
                    changed = true;
                }
                
                if (changed) {
                    updates.push(Reservation.update(res.id, { assigned_table: Array.from(tempAssigned) }));
                }
            }

            await Promise.all(updates);
            showToast(`✅ שולחנות ${fromTable} ו-${toTable} הוחלפו`);
        } catch (error) {
            console.error("Error swapping tables:", error);
            showToast("שגיאה בהחלפת שולחנות");
        } finally {
            setSwapping(null);
            loadLayout();
        }
    };

    const startMultiTableSelection = (reservationId) => {
        const resToAssign = reservations.find(r => r.id === reservationId);
        if (!resToAssign) {
            console.error("Reservation not found for multi-assignment:", reservationId);
            return;
        }
        setMultiAssignReservationId(reservationId);
        setIsSelectingTables(true);
        setSelectedTablesForReservation(resToAssign.assigned_table || []);
        setIsEditReservationOpen(false);
        // No blocking alert — the persistent purple banner at the top already
        // says we're in multi-select mode. Keep the flow uninterrupted.
    };

    const saveMultiTableAssignment = async () => {
        if (!multiAssignReservationId) return;
        const id = multiAssignReservationId;
        const chosen = [...selectedTablesForReservation];
        patchReservationLocal(id, { assigned_table: chosen });  // instant map update
        cancelMultiTableAssignment();
        try {
            await Reservation.update(id, { assigned_table: chosen });
            loadLiveData();  // silent resync, no spinner
        } catch (error) {
            console.error('Error saving multi-table assignment:', error);
            alert('שגיאה בשמירת שיוך השולחנות המרובה.');
            loadLiveData();
        }
    };

    const cancelMultiTableAssignment = () => {
        setIsSelectingTables(false);
        setSelectedTablesForReservation([]);
        setMultiAssignReservationId(null);
    };

    const handleTableClick = async (table) => {
        const tableNumber = table.table_number;

        if (swapping && swapping.from) {
            handleSwapTables(swapping.from, tableNumber);
        } else if (isSelectingTables && multiAssignReservationId) { 
            const currentSelection = [...selectedTablesForReservation];
            const index = currentSelection.indexOf(tableNumber);
            
            const activeSession = getTableSession(tableNumber);
            const now = new Date();
            const currentDate = format(now, 'yyyy-MM-dd');
            
            const seatedReservation = reservations.find(r => 
                Array.isArray(r.assigned_table) && r.assigned_table.includes(tableNumber) &&
                r.date === currentDate &&
                r.status === 'seated'
            );

            const isReallyOccupied = activeSession || seatedReservation;

            const movingRes = reservations.find(r => r.id === multiAssignReservationId);
            // The reservation's OWN current table is always toggleable — clicking it
            // DESELECTS it (so you can move the guest off it). It's "occupied" by the
            // very guest you're moving, so the occupancy block must not apply here.
            const isOwnTable = movingRes && Array.isArray(movingRes.assigned_table) && movingRes.assigned_table.map(String).includes(String(tableNumber));

            if (isReallyOccupied && !isOwnTable) {
                // Allow if the reservation we're moving starts AFTER the current
                // occupant's end time (the table frees up in time — turn re-use).
                const occEnd = seatedReservation?.reservation_end_time || null;
                const freesBefore = movingRes?.time && occEnd && clockLdE(occEnd, movingRes.time);
                if (!freesBefore) {
                    const occupantName = activeSession ? (activeSession.customer_name || 'לקוח') : (seatedReservation?.customer_name || 'לקוח');
                    showToast(`🚫 שולחן ${tableNumber} תפוס — ${occupantName}${occEnd ? ` עד ${occEnd}` : ''}`);
                    return;
                }
            }

            if (index > -1) {
                currentSelection.splice(index, 1);
            } else {
                currentSelection.push(tableNumber);
            }
            setSelectedTablesForReservation(currentSelection);
            return;
        } else if (assigningTable) {
            const resToAssign = reservations.find(r => r.id === assigningTable.reservationId);
            if (!resToAssign) {
                showToast('ההזמנה לא נמצאה.');
                setAssigningTable(null);
                return;
            }

            const activeSession = getTableSession(table.table_number);
            const now = new Date();
            const currentDate = format(now, 'yyyy-MM-dd');
            
            const seatedReservation = reservations.find(r => 
                Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) &&
                r.date === currentDate &&
                r.status === 'seated'
            );

            const isReallyOccupied = activeSession || seatedReservation;

            if (isReallyOccupied) {
                // Allow if the reservation we're assigning starts AFTER the current
                // occupant's end time (the table frees up in time — turn re-use).
                const occEnd = seatedReservation?.reservation_end_time || null;
                const freesBefore = resToAssign?.time && occEnd && clockLdE(occEnd, resToAssign.time);
                if (!freesBefore) {
                    const occupantName = activeSession ? (activeSession.customer_name || 'לקוח') : (seatedReservation?.customer_name || 'לקוח');
                    showToast(`🚫 שולחן ${table.table_number} תפוס — ${occupantName}${occEnd ? ` עד ${occEnd}` : ''}`);
                    setAssigningTable(null);
                    return;
                }
            }

            const conflictingReservation = reservations.find(r =>
                r.id !== resToAssign.id &&
                Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) &&
                r.date === resToAssign.date &&
                // Any TIME-OVERLAP, not just an identical start time — a 20:30
                // booking conflicts with a 20:00 party that sits ~2h.
                bookingsOverlap(resToAssign.time, resToAssign.reservation_end_time, r.time, r.reservation_end_time) &&
                (r.status === 'confirmed' || r.status === 'seated' || r.status === 'pending')
            );

            if (conflictingReservation) {
                if (confirm(`⚠️ קונפליקט! שולחן ${table.table_number} כבר משויך להזמנה של ${conflictingReservation.customer_name} באותה שעה. האם ברצונך להעביר את ההזמנה של ${conflictingReservation.customer_name} למצב "לא משויך" ולהושיב את ${resToAssign.customer_name} במקומה?`)) {
                    patchReservationLocal(conflictingReservation.id, { assigned_table: [] });
                    await Reservation.update(conflictingReservation.id, { assigned_table: [] });
                } else {
                    setAssigningTable(null);
                    return;
                }
            }

            const rid = assigningTable.reservationId;
            patchReservationLocal(rid, { assigned_table: [table.table_number] });  // instant, no alert
            setAssigningTable(null);
            try {
                await Reservation.update(rid, { assigned_table: [table.table_number] });
                loadLiveData();  // silent resync, no spinner
            } catch (e) {
                console.error('assign failed', e);
                loadLiveData();
            }
        } else {
            showTableDetails(table);
        }
    };

    // "שבץ הכל" — assign every unassigned reservation for the selected date, by the
    // owner's priority list, on the server (overlap-safe, no double-booking).
    const handleAutoAssignAll = async () => {
        if (isAutoAssigning) return;
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        if (!window.confirm(`לשבץ אוטומטית את כל ההזמנות ללא שולחן בתאריך ${format(selectedDate, 'dd/MM')} — לפי סדר העדיפות שהגדרת?`)) return;
        setIsAutoAssigning(true);
        try {
            const res = await base44.functions.autoAssignAllReservations({ date: dateStr });
            const d = res?.data || res || {};
            await loadLiveData();
            let msg = `✅ שובצו ${d.assigned_count || 0} הזמנות.`;
            if (d.failed_count > 0) {
                const names = (d.failed || []).map(f => `${f.customer_name} (${f.time}, ${f.party_size})`).join('\n');
                msg += `\n\n⚠️ ${d.failed_count} ללא שולחן פנוי מתאים:\n${names}`;
            }
            window.alert(msg);
        } catch (e) {
            console.error('auto-assign all failed', e);
            window.alert('שגיאה בשיבוץ האוטומטי: ' + (e?.message || e));
        } finally {
            setIsAutoAssigning(false);
        }
    };

    const handleUpdateReservation = (updateInfo) => {
        if (updateInfo && updateInfo.type === 'start_assigning') {
            setAssigningTable({ reservationId: updateInfo.reservationId });
            setIsSelectingTables(false);
            setSelectedTablesForReservation([]);
            setMultiAssignReservationId(null);
            setSwapping(null);
        } else if (updateInfo && updateInfo.type === 'start_multi_assigning') {
            startMultiTableSelection(updateInfo.reservationId);
            setAssigningTable(null);
            setSwapping(null);
        } else {
            loadLiveData();
        }
    };

    // ─── LIVE STATUS computed from current state ────────────────────────────
    // Tables actively seated, guests inside now, and reservations arriving in
    // the next 60 / 240 minutes. The hostess sees this AT A GLANCE.
    const liveStats = (() => {
        const now = new Date();
        const occupiedTables = occupiedTableSet(activeSessions, reservations).size;
        const guestsInside = activeSessions.reduce((s, sess) => s + (sess.party_size || 0), 0);
        let arriving1h = 0, arriving4h = 0, guestsArriving1h = 0;
        for (const r of (reservations || [])) {
            if (!r.time) continue;
            if (r.status === 'cancelled' || r.status === 'no_show' || r.status === 'seated') continue;
            const resAt = clockToDate(String(r.time), now); // after-midnight aware
            if (!resAt) continue;
            const diffMin = (resAt.getTime() - now.getTime()) / 60000;
            if (diffMin >= -10 && diffMin <= 60) { arriving1h++; guestsArriving1h += (r.party_size || 0); }
            else if (diffMin > 60 && diffMin <= 240) { arriving4h++; }
        }
        const totalReservationsToday = (reservations || []).filter(r => r.status !== 'cancelled').length;
        return { occupiedTables, guestsInside, arriving1h, guestsArriving1h, arriving4h, totalReservationsToday };
    })();

    return (
        <div
            dir="rtl"
            className={bigMapMode
                // z-50 matches the sidebar; DOM source-order puts us above it.
                // Radix dialogs/popovers render in body portals AFTER us — they
                // stack above us too. Won't fight either side.
                ? 'fixed inset-0 z-50 bg-white overflow-auto p-2'
                : 'p-3 md:p-6 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen'
            }
        >
            {/* === LIVE STATUS BAR — hidden in fullscreen big-map mode === */}
            {!bigMapMode && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-3 md:p-4 mb-3 grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
                <LiveStat
                    icon="🪑" label="שולחנות תפוסים"
                    value={liveStats.occupiedTables}
                    sub={`${tables.length} סה״כ`}
                    accent="emerald"
                />
                <LiveStat
                    icon="👥" label="אנשים במסעדה"
                    value={liveStats.guestsInside}
                    sub="כעת"
                    accent="blue"
                />
                <LiveStat
                    icon="⏱️" label="מגיעים בעוד שעה"
                    value={liveStats.arriving1h}
                    sub={liveStats.guestsArriving1h ? `${liveStats.guestsArriving1h} סועדים` : '—'}
                    accent="amber"
                    pulse={liveStats.arriving1h > 0}
                />
                <LiveStat
                    icon="📅" label="ב-4 שעות הבאות"
                    value={liveStats.arriving4h}
                    sub="הזמנות"
                    accent="violet"
                />
                <LiveStat
                    icon="📊" label="סה״כ היום"
                    value={liveStats.totalReservationsToday}
                    sub={format(selectedDate, 'dd/MM', { locale: he })}
                    accent="slate"
                />
            </div>
            )}


            {toast && (
                <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm font-bold max-w-[90vw] text-center animate-in fade-in slide-in-from-top-2">
                    {toast}
                </div>
            )}
            {isSelectingTables && (
                <div className="fixed top-0 left-0 right-0 bg-purple-400 text-white p-2 text-center z-50 font-bold flex items-center justify-center gap-4">
                    מצב שיוך שולחנות מרובים: בחר שולחנות עבור הזמנה {multiAssignReservationId?.slice(-4)}.
                    שולחנות נבחרים: {selectedTablesForReservation.length > 0 ? selectedTablesForReservation.join(', ') : 'אף אחד'}
                    <Button variant="ghost" size="sm" onClick={saveMultiTableAssignment} className="bg-white text-[#7A3722] hover:bg-gray-100">
                        שמור שיוך
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelMultiTableAssignment}>
                        בטל
                    </Button>
                </div>
            )}
            {assigningTable && (
                <div className="fixed top-0 left-0 right-0 bg-emerald-500 text-white p-2 text-center z-50 font-bold flex items-center justify-center gap-4">
                    🔀 העברת שולחן — לחץ על שולחן היעד
                    <Button variant="ghost" size="sm" onClick={() => setAssigningTable(null)} className="bg-white text-emerald-700 hover:bg-gray-100">
                        בטל
                    </Button>
                </div>
            )}
            {swapping && (
                <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-black p-2 text-center z-50 font-bold">
                    מצב החלפה: בחר שולחן להחלפה עם שולחן {swapping.from}. <Button variant="ghost" size="sm" onClick={() => setSwapping(null)}>בטל</Button>
                </div>
            )}
            <Card className={bigMapMode ? 'border-0 shadow-none bg-transparent' : ''}>
                {!bigMapMode && (
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-base sm:text-xl">ניהול הושבה</CardTitle>
                                <CardDescription className="hidden sm:block">כל השולחנות והאלמנטים הפיזיים במסעדה.</CardDescription>
                            </div>
                            <div className="flex gap-1 sm:gap-2">
                                {viewMode === 'map' && (
                                    <Button
                                        variant={bigMapMode ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setBigMapMode(v => !v)}
                                        className={`hidden md:flex ${bigMapMode ? 'bg-[#A04A2E] hover:bg-[#7A3722] text-white' : ''}`}
                                    >
                                        <Maximize2 className="w-4 h-4 ml-1" />
                                        {bigMapMode ? 'צא ממפה גדולה' : 'מפה גדולה'}
                                    </Button>
                                )}
                                <Button variant={viewMode === 'list' ? 'secondary' : 'outline'} size="icon" className="h-9 w-9" onClick={() => { setViewMode('list'); setBigMapMode(false); }}><Edit className="w-4 h-4"/></Button>
                                <Button variant={viewMode === 'map' ? 'secondary' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setViewMode('map')}><Eye className="w-4 h-4"/></Button>
                                {/* ⚙️ Settings — every setup action in ONE menu (scan, reservation settings, reset map) */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-9">
                                            <Settings className="w-4 h-4 sm:ml-1" />
                                            <span className="hidden sm:inline text-xs">הגדרות</span>
                                            <span className="hidden sm:inline text-[10px] opacity-60 mr-1">▾</span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64" dir="rtl">
                                        <div className="space-y-2 p-1">
                                            <label className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-sm cursor-pointer">
                                                <Sparkles className="w-4 h-4" /> סרוק מפה מתמונה (AI)
                                                <input
                                                    type="file"
                                                    accept="image/*,.pdf"
                                                    onChange={async (e) => { const file = e.target.files?.[0]; await runMapScan(file); e.target.value = ''; }}
                                                    className="hidden"
                                                />
                                            </label>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start h-9 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                                onClick={() => window.open(window.location.origin + '/ReservationsAnalytics', '_blank')}
                                            >
                                                📊 דאשבורד הזמנות
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start h-9 bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                                                onClick={() => window.open(window.location.origin + '/PublicReservationSettings', '_blank')}
                                            >
                                                <Settings className="w-4 h-4 ml-2" /> הגדרות הזמנות
                                            </Button>
                                            {isAlena && (
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-start h-9 text-red-700 border-red-300 hover:bg-red-50"
                                                    onClick={createAllTables}
                                                >
                                                    <Wand2 className="w-4 h-4 ml-2" /> איפוס מפה
                                                </Button>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Button onClick={handleSaveLayout} disabled={isSaving} size="sm">
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span className="hidden sm:inline mr-1">שמור</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                )}
                <CardContent className={bigMapMode ? 'p-0' : ''}>
                    {tables.length === 0 && facilities.length === 0 ? (
                        <div className="max-w-3xl mx-auto py-10 px-4">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#F4ECD8] to-amber-100 flex items-center justify-center text-3xl mb-3">🗺️</div>
                                <h2 className="text-2xl font-black text-slate-800">בוא נבנה את מפת ההושבה שלך</h2>
                                <p className="text-slate-500 mt-1">בחר איך להתחיל — תמיד אפשר לגרור, לערוך ולשמור אחר כך.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Scan with AI */}
                                <label className="cursor-pointer group rounded-2xl border-2 border-amber-200 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-50 transition-colors p-5 text-center flex flex-col items-center">
                                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition-transform">✨</div>
                                    <div className="font-bold text-slate-800">סרוק תמונה / סקיצה</div>
                                    <div className="text-xs text-slate-500 mt-1">צלם או העלה תרשים — הבינה תזהה את השולחנות</div>
                                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; runMapScan(f); }} />
                                </label>
                                {/* Add manually */}
                                <button onClick={() => { handleAddTable(); setViewMode('list'); }} className="group rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 hover:border-emerald-400 hover:bg-emerald-50 transition-colors p-5 text-center flex flex-col items-center">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition-transform">➕</div>
                                    <div className="font-bold text-slate-800">הוסף שולחן ידנית</div>
                                    <div className="text-xs text-slate-500 mt-1">התחל שולחן-שולחן ומקם על המפה</div>
                                </button>
                                {/* Template (Alena) or onboarding hint */}
                                {isAlena ? (
                                    <button onClick={createAllTables} className="group rounded-2xl border-2 border-[#D9BD83] bg-[#F4ECD8]/60 hover:border-[#A04A2E] hover:bg-[#F4ECD8] transition-colors p-5 text-center flex flex-col items-center">
                                        <div className="w-12 h-12 rounded-xl bg-[#F4ECD8] flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition-transform">🏛️</div>
                                        <div className="font-bold text-slate-800">טען את 41 השולחנות</div>
                                        <div className="text-xs text-slate-500 mt-1">המפה המלאה של {brandName} + אלמנטים</div>
                                    </button>
                                ) : (
                                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center flex flex-col items-center justify-center">
                                        <div className="text-2xl mb-2">💬</div>
                                        <div className="font-bold text-slate-700 text-sm">או דרך ההטמעה</div>
                                        <div className="text-xs text-slate-500 mt-1">שלח סקיצת הושבה בוואטסאפ ונבנה לך אוטומטית</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        viewMode === 'list' ? (
                            <div className="space-y-4">
                                <div className="text-sm text-gray-600 mb-4">
                                    סה"כ: {tables.length} שולחנות | פנים: {tables.filter(t => t.location === 'indoor').length} | חוץ: {tables.filter(t => t.location === 'outdoor').length} | אלמנטים: {facilities.length}
                                </div>
                                {tables.map((table, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center p-3 border rounded-lg">
                                        <Input value={table.table_number} onChange={e => handleUpdateTable(index, 'table_number', e.target.value)} placeholder="מס' שולחן" />
                                        <Input type="number" value={table.min_capacity} onChange={e => handleUpdateTable(index, 'min_capacity', parseInt(e.target.value))} placeholder="קיבולת מינ'" />
                                        <Input type="number" value={table.max_capacity} onChange={e => handleUpdateTable(index, 'max_capacity', parseInt(e.target.value))} placeholder="קיבולת מקס'" />
                                        <Select value={table.location} onValueChange={value => handleUpdateTable(index, 'location', value)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="indoor">🏠 פנים</SelectItem>
                                                <SelectItem value="outdoor">🌿 חוץ</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input value={table.area} onChange={e => handleUpdateTable(index, 'area', e.target.value)} placeholder="אזור" />
                                        <Input 
                                            value={Array.isArray(table.combinable_with) ? table.combinable_with.join(',') : ''} 
                                            onChange={e => handleUpdateTable(index, 'combinable_with', e.target.value)} 
                                            placeholder="שולחנות לחיבור (פסיק)" 
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveTable(index)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                    </div>
                                ))}
                                <Button variant="outline" onClick={handleAddTable}><Plus className="w-4 h-4 ml-2" />הוסף שולחן</Button>
                                <label className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-sm cursor-pointer">
                                  <Sparkles className="w-4 h-4" />
                                  סרוק מפה מתמונה (AI)
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                        const res = await base44.functions.extractSeatingFromImage({ file_url });
                                        const data = res?.data || res;
                                        const newTables = (data?.tables || []).map((t, i) => ({
                                          table_number: t.label || `S${i + 1}`,
                                          min_capacity: Math.max(1, Math.floor((t.capacity || 2) * 0.5)),
                                          max_capacity: Math.max(2, t.capacity || 4),
                                          location: (t.shape === 'outdoor') ? 'outdoor' : 'indoor',
                                          area: t.shape === 'bar' ? 'בר' : t.shape === 'booth' ? 'פינה' : 'חדש',
                                          combinable_with: [],
                                          features: [],
                                          x: Math.round(((t.x ?? 50) * 6) / 20) * 20,
                                          y: Math.round(((t.y ?? 50) * 5) / 20) * 20,
                                          width: 80,
                                          height: 80,
                                        }));
                                        if (!newTables.length) { alert('לא זוהו שולחנות בתמונה'); return; }
                                        setTables([...tables, ...newTables]);
                                        alert(`✅ נוספו ${newTables.length} שולחנות. גרור כדי להזיז ושמור.`);
                                      } catch (err) {
                                        alert('שגיאה: ' + (err?.message || ''));
                                      } finally {
                                        e.target.value = '';
                                      }
                                    }}
                                    className="hidden"
                                  />
                                </label>

                                {/* Party-size breakdown: derive from min/max/combinable_with */}
                                <TableCombosBreakdown
                                    tables={tables}
                                    combos={combos}
                                    onAddCombo={(partySize, tableIds, flexSlots) => {
                                        if (!partySize) return;
                                        const fixedCount = Array.isArray(tableIds) ? tableIds.length : 0;
                                        const flexCount = Array.isArray(flexSlots) ? flexSlots.length : 0;
                                        // Allow ranking single tables too (1 = unified priority list with combos)
                                        if (fixedCount + flexCount < 1) return;
                                        const sorted = [...(tableIds || [])].map(String).sort();
                                        const slots = (flexSlots || []).map(f => ({
                                            key: f.key, label: f.label, table_max: f.table_max,
                                            exclude_tables: Array.isArray(f.exclude_tables) ? [...f.exclude_tables].map(String).sort() : [],
                                        }));
                                        const slotKey = slots.map(s => `${s.key}|${(s.exclude_tables||[]).join(',')}`).sort().join(';');
                                        const key = `${partySize}:${sorted.join('-')}:${slotKey}`;
                                        if (combos.some(c => {
                                            const ck = `${c.party_size}:${[...(c.tables||[])].map(String).sort().join('-')}:${(c.flex_slots||[]).map(s=>`${s.key}|${(s.exclude_tables||[]).join(',')}`).sort().join(';')}`;
                                            return ck === key;
                                        })) return;
                                        // New combo gets the next priority for its party size (lowest priority = last in line)
                                        const samePartyCount = combos.filter(c => Number(c.party_size) === Number(partySize)).length;
                                        setCombos(prev => [...prev, {
                                            id: `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                                            party_size: Number(partySize),
                                            tables: sorted,
                                            flex_slots: slots,
                                            priority: samePartyCount + 1, // 1-based, new combos go to bottom
                                        }]);
                                    }}
                                    onRemoveCombo={(comboId) => {
                                        setCombos(prev => prev.filter(c => c.id !== comboId));
                                    }}
                                    onReorderCombo={(comboId, direction) => {
                                        // direction: 'up' (higher rank) or 'down'. Re-sequences ALL priorities
                                        // for that party size to 1..N after the move — so ties/gaps in old data
                                        // can never freeze the swap ("לא נותן להחליף").
                                        setCombos(prev => {
                                            const target = prev.find(c => c.id === comboId);
                                            if (!target) return prev;
                                            const psize = Number(target.party_size);
                                            const sameSize = prev
                                                .filter(c => Number(c.party_size) === psize)
                                                .sort((a, b) => (a.priority || 999) - (b.priority || 999) || String(a.id).localeCompare(String(b.id)));
                                            const idx = sameSize.findIndex(c => c.id === comboId);
                                            const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
                                            if (swapIdx < 0 || swapIdx >= sameSize.length) return prev;
                                            const reordered = [...sameSize];
                                            const [moved] = reordered.splice(idx, 1);
                                            reordered.splice(swapIdx, 0, moved);
                                            const priorityById = new Map(reordered.map((c, i) => [c.id, i + 1]));
                                            return prev.map(c => priorityById.has(c.id) ? { ...c, priority: priorityById.get(c.id) } : c);
                                        });
                                    }}
                                    onSetConnection={(numA, numB, connect) => {
                                        const next = tables.map(t => ({ ...t, combinable_with: Array.isArray(t.combinable_with) ? [...t.combinable_with] : [] }));
                                        const a = next.find(t => String(t.table_number) === String(numA));
                                        const b = next.find(t => String(t.table_number) === String(numB));
                                        if (!a || !b) return;
                                        const addUnique = (arr, v) => arr.includes(v) ? arr : [...arr, v];
                                        const removeAll = (arr, v) => arr.filter(x => String(x) !== String(v));
                                        a.combinable_with = connect ? addUnique(a.combinable_with.map(String), String(numB)) : removeAll(a.combinable_with, numB);
                                        b.combinable_with = connect ? addUnique(b.combinable_with.map(String), String(numA)) : removeAll(b.combinable_with, numA);
                                        setTables(next);
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                            {/* Mobile tab switcher — sticky at top of content */}
                            <div className="lg:hidden sticky top-0 z-30 bg-gray-50 -mx-3 px-3 py-2 mb-2 flex gap-1 border-b border-gray-200">
                                <button
                                    onClick={() => setMobileView('reservations')}
                                    className={`flex-1 text-sm font-bold py-2 rounded-lg border transition-colors flex items-center justify-center gap-1
                                        ${mobileView === 'reservations'
                                            ? 'bg-[#A04A2E] border-[#7A3722] text-white shadow'
                                            : 'bg-white border-gray-200 text-gray-600'}`}
                                >📋 הזמנות</button>
                                <button
                                    onClick={() => setMobileView('map')}
                                    className={`flex-1 text-sm font-bold py-2 rounded-lg border transition-colors flex items-center justify-center gap-1
                                        ${mobileView === 'map'
                                            ? 'bg-[#A04A2E] border-[#7A3722] text-white shadow'
                                            : 'bg-white border-gray-200 text-gray-600'}`}
                                >🗺️ מפה</button>
                            </div>

                            <div className={`grid grid-cols-1 gap-4 lg:gap-4 ${bigMapMode ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                                {/* Full sidebar — hidden in big-map mode; replaced by compact strip */}
                                {!bigMapMode && (
                                <div className={`lg:order-1 space-y-4 ${
                                    mobileView === 'reservations'
                                        ? 'block'
                                        : 'hidden lg:block'
                                }`}>
                                    <ReservationsDashboard />
                                    <ReservationTool customers={customers} onReservationCreated={loadLayout} />
                                </div>
                                )}

                                {/* Right rail — only in big-map mode. Toggles between compact
                                    'tonight' strip and the full ReservationsDashboard inline (no overlay). */}
                                {bigMapMode && (
                                <div className="hidden md:flex flex-col gap-2 lg:order-1 overflow-y-auto pl-1" style={{ maxHeight: 'calc(100vh - 110px)' }}>
                                    {/* AI Assistant moved to a floating widget — see bottom of page render */}

                                    {/* Tab toggle at top — 3 tabs: tonight / full / queue */}
                                    <div className="sticky top-0 z-20 bg-gray-50 pt-1 pb-1.5 flex gap-1">
                                        <button
                                            onClick={() => { setRailTab('tonight'); setDashboardDrawerOpen(false); }}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${railTab === 'tonight'
                                                    ? 'bg-[#A04A2E] border-[#7A3722] text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#D9BD83]'}`}
                                        >🌙 הערב</button>
                                        <button
                                            onClick={() => { setRailTab('full'); setDashboardDrawerOpen(true); }}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${railTab === 'full'
                                                    ? 'bg-[#A04A2E] border-[#7A3722] text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#D9BD83]'}`}
                                        >📅 לוח מלא</button>
                                        <button
                                            onClick={() => { setRailTab('queue'); setDashboardDrawerOpen(false); }}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors relative
                                                ${railTab === 'queue'
                                                    ? 'bg-emerald-600 border-emerald-700 text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'}`}
                                        >
                                            🚶 תור {queueEntries.length > 0 && <span className={`ml-0.5 inline-block min-w-[18px] h-4 px-1 rounded-full text-[10px] font-black ${railTab === 'queue' ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'}`}>{queueEntries.length}</span>}
                                            {queueNewBanner && railTab !== 'queue' && (
                                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => { setRailTab('live'); setDashboardDrawerOpen(false); }}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${railTab === 'live'
                                                    ? 'bg-[#A04A2E] border-[#7A3722] text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#D9BD83]'}`}
                                        >📋 חי</button>
                                        <button
                                            onClick={() => { setRailTab('ai'); setDashboardDrawerOpen(false); }}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${railTab === 'ai'
                                                    ? 'bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] border-[#A04A2E] text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#D9BD83]'}`}
                                        >✨ AI</button>
                                    </div>

                                    {/* AI tab — inline, full-rail height */}
                                    {railTab === 'ai' && (
                                        <div className="flex-1 overflow-hidden">
                                            <AiAssistantPanel
                                                tables={tables}
                                                reservations={reservations}
                                                activeSessions={activeSessions}
                                                queueEntries={queueEntries}
                                                customers={customers}
                                                combos={combos}
                                                onSeatReservation={async (tableNums, reservationId) => {
                                                    if (!reservationId || !tableNums?.length) return;
                                                    try {
                                                        const tableJoined = tableNums.map(String).join(',');
                                                        await Reservation.update(reservationId, {
                                                            assigned_table: tableNums,
                                                            status: 'seated',
                                                        });
                                                        const res = reservations.find(r => r.id === reservationId);
                                                        if (res) {
                                                            await TableSession.create({
                                                                table_number: tableJoined, // multi-table session
                                                                party_size: res.party_size,
                                                                customer_name: res.customer_name,
                                                                customer_phone: res.customer_phone,
                                                                session_start: new Date().toISOString(),
                                                                status: 'active',
                                                                waiter_name: 'מנהל',
                                                                waiter_id: 'manager_seated',
                                                                table_style: 'couple',
                                                            });
                                                        }
                                                        await loadLiveData();
                                                    } catch (e) { alert('שגיאה בהושבה: ' + (e?.message || e)); }
                                                }}
                                                onSeatWalkIn={async (tableNums, name, phone, partySize) => {
                                                    if (!tableNums?.length || !name) return;
                                                    try {
                                                        await TableSession.create({
                                                            table_number: tableNums.map(String).join(','), // multi-table session
                                                            party_size: Number(partySize) || 2,
                                                            customer_name: name,
                                                            customer_phone: phone || '',
                                                            session_start: new Date().toISOString(),
                                                            status: 'active',
                                                            waiter_name: 'מנהל',
                                                            waiter_id: 'manager_seated',
                                                            table_style: 'couple',
                                                        });
                                                        await loadLiveData();
                                                    } catch (e) { alert('שגיאה בהושבה: ' + (e?.message || e)); }
                                                }}
                                                onSwitchToListMode={() => { setViewMode('list'); setBigMapMode(false); }}
                                                inlinePanel
                                            />
                                        </div>
                                    )}

                                    {/* Date picker — always visible in big-map mode so hostess can switch days fast */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-1.5">
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="text-xs">
                                                    <Calendar className="w-3.5 h-3.5 ml-1" />
                                                    {format(selectedDate, 'EEE dd/MM', { locale: he })}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <CalendarComponent
                                                    mode="single"
                                                    selected={selectedDate}
                                                    onSelect={(d) => d && setSelectedDate(d)}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <Button
                                            variant="outline" size="sm"
                                            className={`text-xs ${format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-slate-900 text-white' : ''}`}
                                            onClick={() => setSelectedDate(new Date())}
                                        >היום</Button>
                                        <Button
                                            size="sm"
                                            className="text-xs bg-emerald-600 hover:bg-emerald-700 mr-auto"
                                            onClick={() => setSmartBookerOpen(v => !v)}
                                        >
                                            <Plus className="w-3.5 h-3.5 ml-1" />
                                            הזמנה חדשה
                                        </Button>
                                    </div>

                                    {/* Collapsible Smart Booker */}
                                    {smartBookerOpen && (
                                        <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg p-2">
                                            <ReservationTool customers={customers} onReservationCreated={() => { loadLiveData(); setSmartBookerOpen(false); }} />
                                        </div>
                                    )}

                                    {railTab === 'full' && <ReservationsDashboard hideDatePicker />}
                                    {railTab === 'tonight' && (
                                        <CompactTonightStrip
                                            reservations={reservations}
                                            selectedDate={selectedDate}
                                            onEdit={(r) => { setEditingReservation(r); setIsEditReservationOpen(true); }}
                                            onOpenFullDashboard={() => { setDashboardDrawerOpen(true); setRailTab('full'); }}
                                        />
                                    )}
                                    {railTab === 'queue' && (
                                        <CompactQueueStrip
                                            queueEntries={queueEntries}
                                            abandonedEntries={abandonedEntries}
                                            onSeat={seatFromQueue}
                                            onAbandon={abandonFromQueue}
                                            onRestore={restoreToQueue}
                                            onRefresh={loadQueue}
                                            onApprove={approveQueueEntry}
                                            onReject={rejectQueueEntry}
                                        />
                                    )}
                                    {railTab === 'live' && (
                                        <LiveAccordionPanel
                                            reservations={reservations}
                                            queueEntries={queueEntries}
                                            selectedDate={selectedDate}
                                            onEditReservation={(r) => { setEditingReservation(r); setIsEditReservationOpen(true); }}
                                        />
                                    )}
                                </div>
                                )}

                                <div className={`${bigMapMode ? 'lg:col-span-3 lg:order-2' : 'lg:col-span-2 lg:order-2'} space-y-3 ${
                                    mobileView === 'map' ? 'block' : 'hidden lg:block'
                                }`}>
                                    {/* UNIFIED HEADER BAR — actions, area filter, tools all in one strip */}
                                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-2 flex flex-wrap items-center gap-2">
                                        {/* Section 1 — Primary actions */}
                                        <div className="flex gap-1.5 shrink-0">
                                            {bigMapMode && (
                                                <button
                                                    onClick={() => setBigMapMode(false)}
                                                    title="צא ממצב מפה גדולה"
                                                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs sm:text-sm px-3 h-9 rounded-lg flex items-center gap-1"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    צא ממפה גדולה
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setSmartReserveOpen(true)}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-3 h-9 rounded-lg flex items-center gap-1"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                הזמנה חדשה
                                            </button>
                                            <button
                                                onClick={() => setQuickSeatOpen(true)}
                                                className="bg-[#44512C] hover:bg-[#44512C] text-white font-bold text-xs sm:text-sm px-3 h-9 rounded-lg flex items-center gap-1"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                הושבה מהירה
                                            </button>
                                            <button
                                                onClick={handleAutoAssignAll}
                                                disabled={isAutoAssigning}
                                                title="משבץ אוטומטית את כל ההזמנות של היום שאין להן שולחן — לפי סדר העדיפות שהגדרת, בלי כפילות"
                                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-bold text-xs sm:text-sm px-3 h-9 rounded-lg flex items-center gap-1"
                                            >
                                                {isAutoAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                                שבץ הכל
                                            </button>
                                        </div>

                                        {/* Divider */}
                                        <div className="hidden md:block h-7 w-px bg-gray-200" />

                                        {/* Section 2 — Area filter grouped into ONE dropdown (was 8 inline buttons) */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="h-9 shrink-0">
                                                    <MapPin className="w-3.5 h-3.5 ml-1" />
                                                    <span className="text-xs max-w-[130px] truncate">
                                                        {selectedAreas.includes('all') ? 'כל האזורים' : selectedAreas.join(', ')}
                                                    </span>
                                                    <span className="text-[10px] opacity-60 mr-1">▾</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64" dir="rtl">
                                                <div className="text-[11px] font-bold text-gray-500 mb-2">סנן לפי אזור</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[{ key: 'all', label: 'הכל' }, ...Array.from(new Set((tables || []).map(t => t.area).filter(Boolean))).map(a => ({ key: a, label: a }))].map(area => {
                                                        const active = selectedAreas.includes(area.key);
                                                        return (
                                                            <button
                                                                key={area.key}
                                                                onClick={() => toggleArea(area.key)}
                                                                className={`px-2.5 h-8 rounded-lg text-xs font-bold transition-colors
                                                                    ${active
                                                                        ? 'bg-slate-900 text-white shadow-sm'
                                                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                                            >{area.label}</button>
                                                        );
                                                    })}
                                                </div>
                                            </PopoverContent>
                                        </Popover>

                                        {/* Spacer — pushes tools + clock to the far edge */}
                                        <div className="flex-1 min-w-0" />

                                        {/* Section 3 — ALL tools in one menu + clock */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" size="sm" className="h-9">
                                                        <Wrench className="w-3.5 h-3.5 ml-1" />
                                                        <span className="text-xs">כלים</span>
                                                        <span className="text-[10px] opacity-60 mr-1">▾</span>
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-64" dir="rtl">
                                                    <div className="space-y-2 p-1">
                                                        <Button variant="outline" className="w-full justify-start h-9 border-[#D9BD83] text-[#7A3722] hover:bg-[#F4ECD8]" onClick={autoTidyArea} title="יישר את שולחנות האזור לשורות מסודרות (נשמר על הסקיצה)">
                                                            📐 יישר שורות
                                                        </Button>
                                                        <Button variant="outline" className="w-full justify-start h-9 bg-[#F4ECD8] border-[#E8D9B5] text-[#44512C] hover:bg-[#F4ECD8]" onClick={() => window.open(window.location.origin + '/PublicReservation', '_blank')}>
                                                            <Eye className="w-3.5 h-3.5 ml-1.5" /> עמוד הזמנות ציבורי
                                                        </Button>
                                                        <div className="border-t pt-2 mt-1 space-y-2">
                                                            <h4 className="font-bold text-sm">הוסף אלמנט למפה</h4>
                                                            <Select value={selectedFacilityType} onValueChange={setSelectedFacilityType}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="בחר סוג אלמנט" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {Object.entries(FACILITY_TYPES).map(([key, facility]) => (
                                                                        <SelectItem key={key} value={key}>
                                                                            {facility.icon} {facility.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <Button onClick={handleAddFacility} variant="outline" className="w-full">
                                                                <Plus className="w-4 h-4 ml-2" />
                                                                הוסף
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                            {/* Realtime push status — green "live" when the SSE stream is
                                                delivering, muted "syncing" when it's on the poll fallback. */}
                                            <div
                                                className={`hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold shrink-0 border ${
                                                    realtimeConnected
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-gray-100 text-gray-500 border-gray-200'
                                                }`}
                                                title={realtimeConnected
                                                    ? 'עדכונים בזמן אמת פעילים — הזמנות נכנסות לבד'
                                                    : 'מסתנכרן ברקע — מתחבר מחדש'}
                                            >
                                                <span className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                                {realtimeConnected ? 'חי' : 'מסתנכרן'}
                                            </div>
                                            {/* Clock */}
                                            <div className="hidden sm:block text-center px-2.5 py-1 bg-gradient-to-bl from-slate-900 to-slate-700 text-white rounded-lg shrink-0">
                                                <div className="text-base font-black tabular-nums leading-none">{format(clockTick, 'HH:mm')}</div>
                                                <div className="text-[9px] opacity-80 mt-0.5">{format(clockTick, 'EEE dd/MM', { locale: he })}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Zoom controls — small floating cluster, hidden on print */}
                                    <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm w-fit">
                                        <button
                                            onClick={() => setMapZoom(z => Math.max(0.2, z - 0.1))}
                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                            title="הקטן"
                                        ><ZoomOut className="w-4 h-4"/></button>
                                        <button
                                            onClick={() => {
                                                // התאם למסך: phone→0.32, tablet→0.55, desktop→1.0
                                                const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
                                                setMapZoom(w < 500 ? 0.32 : w < 900 ? 0.55 : 1);
                                            }}
                                            className="px-2 h-8 text-xs font-bold hover:bg-gray-100 rounded min-w-[3rem]"
                                            title="התאם למסך"
                                        >{Math.round(mapZoom * 100)}%</button>
                                        <button
                                            onClick={() => setMapZoom(z => Math.min(1.6, z + 0.1))}
                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                            title="הגדל"
                                        ><ZoomIn className="w-4 h-4"/></button>
                                        <span className="text-[10px] text-gray-400 mr-2 hidden md:inline">גרור לתזוזה</span>
                                        <span className="w-px h-5 bg-gray-200 mx-1"></span>

                                        {/* HOSTESS LENS — "where can I seat them, and for how long?" as one
                                            menu instead of a row of chips, so the runway thresholds all fit. */}
                                        <select
                                            value={mapFilter}
                                            onChange={(e) => setMapFilter(e.target.value)}
                                            className={`text-[10px] font-bold rounded px-1.5 py-1 border transition-colors ${
                                                mapFilter === 'all'
                                                    ? 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                                    : 'bg-[#A04A2E] text-white border-[#A04A2E]'
                                            }`}
                                            title="הצג רק שולחנות שמתאימים למה שאני מחפשת"
                                        >
                                            <option value="all">🔎 כל השולחנות</option>
                                            <option value="free_now">פנוי עכשיו</option>
                                            <option value="free_30">פנוי ל-30 דק׳</option>
                                            <option value="free_45">פנוי ל-45 דק׳</option>
                                            <option value="free_60">פנוי לשעה</option>
                                            <option value="free_90">פנוי לשעה וחצי</option>
                                            <option value="free_120">פנוי לשעתיים</option>
                                            <option value="free_999">פנוי לכל הערב</option>
                                            <option value="arriving">מגיעים בשעה הקרובה</option>
                                        </select>

                                        {/* How many bookings each card lists */}
                                        <span className="text-[10px] text-gray-400 mr-1 hidden md:inline">שורות</span>
                                        <select
                                            value={rowsPerTable}
                                            onChange={(e) => setRowsPerTable(parseInt(e.target.value, 10))}
                                            className="text-[10px] font-bold border border-gray-200 rounded px-1 py-1 bg-white text-gray-600 hover:border-gray-400"
                                            title="כמה הזמנות להציג בכל שולחן"
                                        >
                                            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                        <span className="w-px h-5 bg-gray-200 mx-1"></span>
                                        <button
                                            onClick={handleTidyMap}
                                            className="text-[10px] font-bold px-2 py-1 rounded transition-colors bg-white text-gray-600 border border-gray-200 hover:border-[#A04A2E] hover:text-[#A04A2E]"
                                            title="הצמד את כל השולחנות לרשת, גודל אחיד, וכל אזור כבלוק נפרד בלי חפיפה"
                                        >📐 יישר מפה</button>
                                        <button
                                            onClick={() => setShowBlueprint(v => !v)}
                                            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                                                showBlueprint ? 'bg-zinc-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
                                            }`}
                                            title="הצג/הסתר שרטוט רקע"
                                        >🗺️ שרטוט</button>
                                        <button
                                            onClick={() => setIsSmartMapMode(v => !v)}
                                            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                                                isSmartMapMode ? 'bg-[#A04A2E] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-400'
                                            }`}
                                            title="הצג המלצות AI"
                                        >✨ AI</button>
                                    </div>
                                    <div className="w-full border rounded-lg bg-gray-100 overscroll-contain" style={{
                                        // Bounded scroll inside the card; iOS momentum + horizontal+vertical pan.
                                        height: bigMapMode ? 'calc(100vh - 110px)' : '70vh',
                                        minHeight: '55vh',
                                        overflow: 'auto',
                                        WebkitOverflowScrolling: 'touch',
                                        touchAction: 'pan-x pan-y',
                                    }}>
                                    {/* Outer wrapper takes the *visual* (scaled) dimensions so scrollbars match.
                                        Inner element renders at native 1400×850 and is scaled with transform. */}
                                    <div style={{ width: `${1400 * mapZoom}px`, height: `${850 * mapZoom}px` }}>
                                    <div
                                        className="relative bg-stone-50"
                                        style={{
                                            width: '1400px',
                                            height: '850px',
                                            // Blueprint overlay only when toggled — clean white-ish canvas by default
                                            // blueprintUrl is the tenant's OWN floor-plan photo. It used
                                            // to be Alena's hardcoded image, which meant any other
                                            // restaurant pressing "שרטוט" saw Alena's dining room.
                                            ...(showBlueprint && blueprintUrl ? {
                                                backgroundImage: `url('${blueprintUrl}')`,
                                                backgroundSize: '100% 100%',
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'center',
                                            } : {}),
                                            transform: `scale(${mapZoom})`,
                                            transformOrigin: 'top right',
                                        }}
                                        >
                                        {/* ZONE BACKDROPS — computed bounding boxes per area, soft pastel fills.
                                            Renders BEFORE tables/facilities so they sit underneath. */}
                                        {!showBlueprint && (() => {
                                            // Alena's zones keep their established hues; ANY other name gets a
                                            // deterministic pastel from its own text, so a new tenant's areas are
                                            // backdropped and labelled too (they used to get nothing at all —
                                            // a flat sea of unlabelled rectangles).
                                            const NAMED = {
                                                'אזור חום':     { h: 32,  name: 'אזור חום' },
                                                'כניסה':         { h: 155, name: 'כניסה' },
                                                'אדום מרוכזי':   { h: 350, name: 'אזור אדום מרכזי' },
                                                'זוהרה':         { h: 265, name: 'זוהרה' },
                                                'מספרה':         { h: 45,  name: 'מספרה' },
                                                'גבטה':          { h: 225, name: 'גבטה' },
                                                'ורוד':          { h: 330, name: 'אזור ורוד' },
                                            };
                                            const hueOf = (s) => {
                                                let x = 0;
                                                for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360;
                                                return x;
                                            };
                                            const styleFor = (area) => {
                                                const hit = NAMED[area];
                                                const h = hit ? hit.h : hueOf(area);
                                                return {
                                                    // Much lighter than before — overlapping zones used to mix into mud.
                                                    bg: `hsl(${h} 62% 96%)`,
                                                    edge: `hsl(${h} 45% 86%)`,
                                                    label: `hsl(${h} 45% 34%)`,
                                                    name: hit ? hit.name : area,
                                                };
                                            };
                                            const byArea = {};
                                            tables.forEach(t => {
                                                if (!t.area) return;
                                                if (!byArea[t.area]) byArea[t.area] = [];
                                                byArea[t.area].push(t);
                                            });
                                            const PADDING = 26;
                                            return Object.entries(byArea).map(([area, ts]) => {
                                                const zone = styleFor(area);
                                                const minX = Math.min(...ts.map(t => t.x || 0)) - PADDING;
                                                const minY = Math.min(...ts.map(t => t.y || 0)) - PADDING - 20; // room for the label chip
                                                const maxX = Math.max(...ts.map(t => (t.x || 0) + (t.width || 80))) + PADDING;
                                                const maxY = Math.max(...ts.map(t => (t.y || 0) + (t.height || 80))) + PADDING;
                                                return (
                                                    <div
                                                        key={area}
                                                        style={{
                                                            position: 'absolute',
                                                            left: minX, top: minY,
                                                            width: maxX - minX, height: maxY - minY,
                                                            background: zone.bg,
                                                            borderRadius: 14,
                                                            border: `1px solid ${zone.edge}`,
                                                            pointerEvents: 'none',
                                                        }}
                                                    >
                                                        {/* Label as a solid chip at the TOP of the zone. It used to sit
                                                            bottom-right at 12px/0.75 opacity, where it collided with the
                                                            last row of tables and vanished at tablet zoom. */}
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: 6, right: 10,
                                                                fontSize: 12,
                                                                fontWeight: 500,
                                                                color: zone.label,
                                                                background: '#ffffffd9',
                                                                border: `1px solid ${zone.edge}`,
                                                                borderRadius: 999,
                                                                padding: '1px 9px',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >{zone.name}</div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                        {facilities.map((facility) => {
                                            const facilityType = FACILITY_TYPES[facility.type];
                                            if (!facilityType) return null;
                                            return (
                                                <div
                                                    key={facility.id}
                                                    draggable={!swapping && !assigningTable && !isSelectingTables}
                                                    onDragEnd={(e) => handleFacilityDragEnd(facility.id, e)}
                                                    style={{ position: 'absolute', left: facility.x || 50, top: facility.y || 50, width: facility.width || 80, height: facility.height || 60 }}
                                                    className={`flex flex-col items-center justify-center rounded-lg shadow-lg border-2 transition-all hover:scale-105 ${facilityType.color} relative group ${swapping || assigningTable || isSelectingTables ? 'cursor-not-allowed' : 'cursor-grab'}`}
                                                >
                                                    <span className="text-2xl">{facilityType.icon}</span>
                                                    <span className="font-bold text-xs mt-1 text-inherit">{facility.name}</span>
                                                    <button onClick={() => handleRemoveFacility(facility.id)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                                                    {/* Facilities could only be dragged or deleted — there was no way to
                                                        resize the kitchen/bar/restrooms to match the real room. Pointer
                                                        events (not mouse) so it works on the hostess's tablet, and the
                                                        handle stays visible on touch where there is no hover. */}
                                                    <div
                                                        className="absolute -bottom-1 -left-1 w-4 h-4 bg-gray-700 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70 transition-opacity touch-none"
                                                        title="גרור לשינוי גודל"
                                                        onPointerDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.currentTarget.setPointerCapture?.(e.pointerId);
                                                            const startX = e.clientX, startY = e.clientY;
                                                            const startW = facility.width || 80, startH = facility.height || 60;
                                                            const move = (ev) => {
                                                                const w = Math.max(40, Math.round((startW - (ev.clientX - startX)) / GRID_SIZE) * GRID_SIZE);
                                                                const h = Math.max(40, Math.round((startH + (ev.clientY - startY)) / GRID_SIZE) * GRID_SIZE);
                                                                setFacilities(prev => prev.map(f => f.id === facility.id ? { ...f, width: w, height: h } : f));
                                                            };
                                                            const up = () => {
                                                                document.removeEventListener('pointermove', move);
                                                                document.removeEventListener('pointerup', up);
                                                            };
                                                            document.addEventListener('pointermove', move);
                                                            document.addEventListener('pointerup', up);
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}

                                    {tables.filter(t => selectedAreas.includes('all') || selectedAreas.includes(t.area)).map((table) => {
                                        // Active sessions ("who's sitting NOW") only belong on TODAY's map.
                                        // When viewing another date, show only that date's reservations.
                                        const mapIsToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                        const session = mapIsToday ? getTableSession(table.table_number) : null;
                                        const progress = session ? Math.round(((session.steps_completed?.length || 0) / 23) * 100) : 0;

                                        const futureReservationsForTable = reservations.filter(r => {
                                            if (!r.assigned_table) return false;
                                            
                                            const assignedTables = Array.isArray(r.assigned_table) 
                                                ? r.assigned_table 
                                                : r.assigned_table ? [r.assigned_table] : [];
                                            
                                            const isAssignedToTable = assignedTables.includes(table.table_number);
                                            if (!isAssignedToTable) return false;
                                            
                                            const validStatuses = ['confirmed', 'pending', 'seated'];
                                            const hasValidStatus = validStatuses.includes(r.status);
                                            if (!hasValidStatus) return false;
                                            
                                            const reservationDate = new Date(r.date);
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            reservationDate.setHours(0, 0, 0, 0);
                                            if (reservationDate < today) return false;
                                            // TODAY: drop bookings whose time already passed, or a lunch booking
                                            // still renders as "the next one" late at night (seen live on table 81:
                                            // a guest seated until 03:59 showed 12:00 as their next booking).
                                            // 30-min grace so a guest running late doesn't vanish off the map.
                                            if (reservationDate.getTime() === today.getTime() && r.status !== 'seated' && r.time) {
                                                const [rh, rm] = String(r.time).split(':').map(Number);
                                                const n = new Date();
                                                if (Number.isFinite(rh) && (rh * 60 + (rm || 0)) < (n.getHours() * 60 + n.getMinutes() - 30)) return false;
                                            }
                                            return true;
                                        }).sort((a, b) => {
                                            const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
                                            const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
                                            return dateA - dateB;
                                        });

                                        const now = new Date();
                                        const currentDate = format(now, 'yyyy-MM-dd');
                                        
                                        const seatedReservation = reservations.find(r => 
                                            Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) &&
                                            r.date === currentDate &&
                                            r.status === 'seated'
                                        );

                                        // Compute end time for the currently-seated reservation (if any)
                                        // to drive the "finishing soon" amber state in the last 30 min.
                                        let minutesUntilEnd = null;
                                        let computedEndTime = seatedReservation?.reservation_end_time || null;
                                        // Walk-ins and queue-seated guests are created WITHOUT
                                        // reservation_end_time, so the whole turn-timer chain
                                        // (מסיים / חריגה / countdown) never fired for them — on a busy
                                        // night that's half the room showing as an undifferentiated
                                        // wall of green. Derive the end time when it's missing.
                                        if (!computedEndTime && seatedReservation) {
                                            computedEndTime = getReservationCalculatedEndTime(seatedReservation);
                                        }
                                        if (!computedEndTime && session?.session_start) {
                                            const st = new Date(session.session_start);
                                            if (!isNaN(st)) {
                                                const guests = Number(session.party_size) || Number(table.max_capacity) || 2;
                                                const e = new Date(st.getTime() + getSeatingDuration(guests) * 60000);
                                                computedEndTime = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
                                            }
                                        }
                                        if (computedEndTime) {
                                            const [eh, em] = computedEndTime.split(':').map(Number);
                                            const end = new Date();
                                            end.setHours(eh, em || 0, 0, 0);
                                            // If end-time is past midnight (e.g. 01:00 dinner), assume tomorrow
                                            if (eh < 6 && now.getHours() >= 18) end.setDate(end.getDate() + 1);
                                            minutesUntilEnd = Math.round((end.getTime() - now.getTime()) / 60000);
                                        }
                                        const isFinishingSoon = minutesUntilEnd !== null && minutesUntilEnd <= 30 && minutesUntilEnd > 0;
                                        const isOvertime     = minutesUntilEnd !== null && minutesUntilEnd <= 0;

                                        // Next reservation for this table TODAY (after current seated session)
                                        let nextSeating = null;
                                        if (seatedReservation) {
                                            const seatedEnd = computedEndTime || seatedReservation.time;
                                            nextSeating = futureReservationsForTable.find(r =>
                                                r.id !== seatedReservation.id &&
                                                r.date === currentDate &&
                                                (r.time || '99:99') > seatedEnd
                                            );
                                        }

                                        let tableColorClass = '';
                                        const isReallyOccupied = !!session || !!seatedReservation;
                                        // Dirty table awaiting bussing — must NOT look available.
                                        const cleaningSession = !isReallyOccupied ? getCleaningSession(table.table_number) : null;

                                        // ── Runway: how long is this table actually free? ──────────────
                                        // The question a hostess asks at the door is "can I put them here,
                                        // and for how long?" — so a free table says until when it's free
                                        // instead of just "פנוי".
                                        const nowMin = now.getHours() * 60 + now.getMinutes();
                                        const nextBooking = futureReservationsForTable.find(r =>
                                            r.date === currentDate && r.time && (r.time.slice(0, 5) > format(now, 'HH:mm'))
                                        );
                                        const freeUntilMin = (!isReallyOccupied && !cleaningSession && nextBooking?.time)
                                            ? Math.max(0, (Number(nextBooking.time.slice(0, 2)) * 60 + Number(nextBooking.time.slice(3, 5))) - nowMin)
                                            : null;
                                        const isFreeNow = !isReallyOccupied && !cleaningSession;
                                        const arrivingSoon = !isReallyOccupied && nextBooking && freeUntilMin !== null && freeUntilMin <= 60;
                                        // "free for at least N minutes" — the hostess picks the runway she needs
                                        // (a quick 45-min turn vs a relaxed two-hour table). null runway = free all night.
                                        const freeForAtLeast = (min) => isFreeNow && (freeUntilMin === null || freeUntilMin >= min);
                                        const matchesFilter =
                                            mapFilter === 'all' ? true
                                            : mapFilter === 'free_now' ? isFreeNow
                                            : mapFilter === 'arriving' ? !!arrivingSoon
                                            : mapFilter.startsWith('free_') ? freeForAtLeast(parseInt(mapFilter.slice(5), 10) || 0)
                                            : true;

                                        // Upcoming reservation TODAY → "Reserved" state (soft yellow)
                                        const upcomingToday = !isReallyOccupied && futureReservationsForTable.find(r => r.date === currentDate);

                                        // 3 primary states + 2 derived: Available / Reserved / Seated / FinishingSoon / Overtime
                                        if (isFinishingSoon) {
                                            tableColorClass = 'bg-amber-200 border-amber-500 text-amber-900 animate-pulse';
                                        } else if (isOvertime) {
                                            tableColorClass = 'bg-[#A04A2E] border-rose-700 text-white';
                                        } else if (isReallyOccupied) {
                                            // SEATED — light green (distinct from white "available")
                                            tableColorClass = 'bg-green-50 border-green-500 text-green-900';
                                        } else if (cleaningSession) {
                                            // CLEANING — slate, clearly not available (dashed border +
                                            // 🧹 glyph below) so nobody is seated onto dirty plates.
                                            tableColorClass = 'bg-slate-200 border-slate-500 border-dashed text-slate-700';
                                        } else if (upcomingToday) {
                                            // RESERVED — pastel yellow
                                            tableColorClass = 'bg-[#FAF5E8] border-yellow-400 text-yellow-900';
                                        } else {
                                            // AVAILABLE — clean white w/ soft green border (indoor) or soft amber (outdoor)
                                            tableColorClass = table.location === 'indoor'
                                                ? 'bg-white border-emerald-400 text-emerald-900'
                                                : 'bg-stone-50 border-amber-500 text-amber-900';
                                        }
                                        // Smart-map mode: dim non-recommended (placeholder — no recommendations yet)
                                        if (isSmartMapMode) {
                                            tableColorClass += ' opacity-40';
                                        }
                                        // Hostess lens — fade what she isn't looking for right now.
                                        if (!matchesFilter) {
                                            tableColorClass += ' opacity-25 saturate-50';
                                        }

                                        if (isSelectingTables && selectedTablesForReservation.includes(table.table_number)) {
                                            tableColorClass += ' ring-4 ring-purple-500 ring-offset-2';
                                        }

                                        // A table occupied NOW is still a valid target if the reservation
                                        // being moved starts AFTER the current occupant's end time (turn re-use).
                                        const movingResId = isSelectingTables ? multiAssignReservationId : (assigningTable ? assigningTable.reservationId : null);
                                        const movingRes = movingResId ? reservations.find(r => r.id === movingResId) : null;
                                        const freesBeforeMove = !!(movingRes?.time && computedEndTime && clockLdE(computedEndTime, movingRes.time));
                                        // The reservation's OWN current table must always stay clickable so you can
                                        // DESELECT it (to move off it) — it's "occupied" by the guest you're moving.
                                        const isOwnMovingTable = !!(movingRes && Array.isArray(movingRes.assigned_table) && movingRes.assigned_table.map(String).includes(String(table.table_number)));
                                        const isBlockedForInteraction = (isSelectingTables || assigningTable) && isReallyOccupied && !freesBeforeMove && !isOwnMovingTable;
                                        if (isBlockedForInteraction) {
                                            tableColorClass += ' opacity-50 cursor-not-allowed';
                                        }

                                        return (
                                            <div
                                                key={table.table_number}
                                                draggable={!isResizing && !swapping && !assigningTable && !isSelectingTables && !isBlockedForInteraction}
                                                onDragEnd={(e) => handleTableDragEnd(table.table_number, e)}
                                                onClick={() => {
                                                    if (!isBlockedForInteraction) {
                                                        handleTableClick(table);
                                                    }
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: table.x || 50,
                                                    top: table.y || 50,
                                                    width: table.width || 80,
                                                    height: table.height || 100,
                                                    // Balanced minimum: wide enough for the name on its own line,
                                                    // tall enough for 2 sittings, still fits the real layout.
                                                    minWidth: 90,
                                                    minHeight: 76,
                                                }}
                                                className={`${table.shape === 'round' ? 'rounded-full' : 'rounded-lg'} shadow-md border-[2.5px] transition-all hover:scale-[1.06] hover:shadow-lg hover:z-20 relative group ${
                                                    isBlockedForInteraction ? 'cursor-not-allowed' : (swapping || assigningTable || isSelectingTables ? 'cursor-crosshair' : 'cursor-pointer')
                                                } ${tableColorClass}`}
                                            >
                                                {isBlockedForInteraction && (
                                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold z-10">
                                                        ✕
                                                    </div>
                                                )}

                                                {!isBlockedForInteraction && (
                                                    <div className="absolute -top-8 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10">
                                                        <div className="bg-white border shadow-lg rounded-lg p-1 flex gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleTableStatusChange(table.table_number, 'available');
                                                                }}
                                                                className="px-2 py-1 text-xs rounded bg-green-100 hover:bg-green-200 text-green-800"
                                                                title="שנה לפנוי"
                                                            >
                                                                פנוי
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleTableStatusChange(table.table_number, 'cleaning');
                                                                }}
                                                                className="px-2 py-1 text-xs rounded bg-[#F4ECD8] hover:bg-yellow-200 text-yellow-800"
                                                                title="שנה לניקוי"
                                                            >
                                                                ניקוי
                                                            </button>
                                                            {(isReallyOccupied || upcomingToday) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // Move flow: open multi-table selection so you can pick ONE
                                                                        // target (deselect the current) OR several tables to combine,
                                                                        // then click "שמור שיוך" — exactly like the full move flow.
                                                                        const resToMove = seatedReservation || upcomingToday || futureReservationsForTable[0];
                                                                        if (resToMove) {
                                                                            setAssigningTable(null);
                                                                            setSwapping(null);
                                                                            startMultiTableSelection(resToMove.id);
                                                                        } else {
                                                                            // Walk-in session with no reservation → move via details panel
                                                                            showTableDetails(table);
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-800 flex items-center"
                                                                    title="העברת שולחן — בחר שולחן/ות ואז 'שמור שיוך'"
                                                                >
                                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="h-full px-1 py-0.5 flex flex-col text-center overflow-hidden relative">
                                                    {/* Status icon in corner — replaces verbose text */}
                                                    {isFinishingSoon && (
                                                        <span className="absolute top-0 left-1 text-base animate-pulse" title="מסיים בקרוב">⏰</span>
                                                    )}
                                                    {isOvertime && (
                                                        <span className="absolute top-0 left-1 text-base" title="באיחור">⚠️</span>
                                                    )}
                                                    {cleaningSession && (
                                                        <span className="absolute top-0 left-1 text-base" title="ממתין לניקוי">🧹</span>
                                                    )}

                                                    {/* HEADER BAR — a real titled strip (number + capacity) with its own
                                                        tint and a divider. The number used to float in the same box as the
                                                        content, which made every card read as loose text on a rectangle
                                                        instead of an object with a name. */}
                                                    <div className="flex justify-between items-center leading-none -mx-1 px-1.5 py-[3px] mb-0.5 bg-black/10 border-b border-black/10">
                                                        <span className="text-[11px] font-normal leading-none opacity-70 whitespace-nowrap tabular-nums">
                                                            {table.min_capacity}-{table.max_capacity}
                                                        </span>
                                                        <div className="font-medium text-[15px] leading-none tabular-nums">{table.table_number}</div>
                                                    </div>

                                                    {/* MIDDLE: the ESSENTIAL — guests + name + time (no other lines) */}
                                                    <div className="flex-1 flex flex-col justify-center items-center leading-tight">
                                                        {isReallyOccupied ? (
                                                            <div className="w-full flex flex-col gap-0.5">
                                                                {/* Seated guest — LIGHT GREEN chip */}
                                                                <div className="w-full bg-green-200 text-green-900 rounded px-1 py-0.5 leading-tight">
                                                                    <div className="font-black text-[11px] truncate">{getFirstName(session?.customer_name || seatedReservation?.customer_name) || '—'}</div>
                                                                    <div className="text-[10px] font-normal opacity-90 flex items-center justify-between tabular-nums">
                                                                        {/* dir=ltr — a time RANGE flips visually inside an RTL card
                                                                            ("01:59–03:59" rendered as "03:59-01:59"). */}
                                                                        <span dir="ltr">{session ? getActiveTime(session) : `${seatedReservation?.time?.slice(0, 5) || ''}${computedEndTime ? `–${computedEndTime}` : ''}`}</span>
                                                                        <span>×{session?.party_size || seatedReservation?.party_size}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Upcoming bookings AFTER the seated guest — how many show is an
                                                                    owner setting (planning the whole evening vs a packed night). */}
                                                                {(() => {
                                                                    const after = futureReservationsForTable.filter(r => r.id !== seatedReservation?.id);
                                                                    // An occupied table must still answer "and then what?" — either
                                                                    // who's booked after them, or that it opens up. Without this the
                                                                    // card was a dead end for every seated table.
                                                                    if (!after.length) {
                                                                        return (
                                                                            <div className="w-full text-[10px] font-normal opacity-60 leading-tight">
                                                                                אין הזמנה אחריהם
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return after.slice(0, Math.max(1, rowsPerTable - 1)).map(res => (
                                                                        <div key={res.id} className="w-full bg-[#44512C]/15 text-[#44512C] rounded px-1 flex items-center justify-between text-[11px] font-normal leading-tight tabular-nums">
                                                                            <span dir="ltr">{res.time?.slice(0, 5)}</span>
                                                                            <span className="truncate mx-1">{getFirstName(res.customer_name)}</span>
                                                                            <span>×{res.party_size}</span>
                                                                        </div>
                                                                    ));
                                                                })()}
                                                            </div>
                                                        ) : futureReservationsForTable.length > 0 ? (
                                                            <div className="w-full flex flex-col gap-0.5">
                                                                {/* Reserved-but-empty RIGHT NOW: the table is bookable until the
                                                                    guest arrives, and that window is exactly what decides whether
                                                                    a walk-in fits. Without it the card only said "שמור" and hid
                                                                    a usable table. */}
                                                                {freeUntilMin !== null && freeUntilMin > 0 && (
                                                                    <div className={`w-full text-[10px] font-normal leading-tight tabular-nums ${freeUntilMin <= 45 ? 'text-amber-800' : 'opacity-60'}`}>
                                                                        פנוי עוד {freeUntilMin} דק׳
                                                                    </div>
                                                                )}
                                                                {(() => {
                                                                    const res = futureReservationsForTable[0];
                                                                    return (
                                                                        <div className="w-full bg-[#44512C] text-white rounded px-1 py-0.5 leading-tight">
                                                                            <div className="font-black text-[11px] truncate">{getFirstName(res.customer_name) || 'שמור'}</div>
                                                                            <div className="text-[10px] font-normal opacity-90 flex items-center justify-between tabular-nums"><span dir="ltr">{res.time?.slice(0, 5)}</span><span>×{res.party_size}</span></div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {futureReservationsForTable.slice(1, rowsPerTable).map(res => (
                                                                    <div key={res.id} className="w-full bg-[#44512C]/15 text-[#44512C] rounded px-1 flex items-center justify-between text-[11px] font-normal leading-tight tabular-nums">
                                                                        <span dir="ltr">{res.time?.slice(0, 5)}</span>
                                                                        <span className="truncate mx-1">{getFirstName(res.customer_name)}</span>
                                                                        <span>×{res.party_size}</span>
                                                                    </div>
                                                                ))}
                                                                {futureReservationsForTable.length > rowsPerTable && (
                                                                    <div className="text-[10px] text-[#44512C] font-normal leading-none">+{futureReservationsForTable.length - rowsPerTable} עוד</div>
                                                                )}
                                                            </div>
                                                        ) : cleaningSession ? (
                                                            <div className="text-[11px] font-normal opacity-80">ממתין לניקוי</div>
                                                        ) : (
                                                            // A free table answers the door question: free until WHEN.
                                                            // "פנוי" alone doesn't tell her if she can seat a walk-in.
                                                            <div className="flex flex-col items-center gap-0.5 leading-tight">
                                                                <div className="flex items-center gap-1 text-[11px] font-normal opacity-75">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-current inline-block"></span>
                                                                    פנוי
                                                                </div>
                                                                {freeUntilMin !== null ? (
                                                                    <div className={`text-[10px] font-normal tabular-nums ${freeUntilMin < 60 ? 'opacity-90' : 'opacity-60'}`}>
                                                                        עד <span dir="ltr">{nextBooking.time?.slice(0, 5)}</span>
                                                                        {freeUntilMin < 60 ? ` · ${freeUntilMin} דק׳` : ''}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[10px] font-normal opacity-50">כל הערב</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* BOTTOM: progress / countdown bar */}
                                                    {session ? (
                                                        <div className="w-full bg-red-200 rounded-full h-1 mt-0.5">
                                                            <div className="bg-red-600 h-1 rounded-full" style={{width: `${progress}%`}}></div>
                                                        </div>
                                                    ) : seatedReservation && minutesUntilEnd !== null && minutesUntilEnd > 0 ? (
                                                        // Visual countdown — fills as time toward end gets close
                                                        (() => {
                                                            const totalMins = computedEndTime && seatedReservation.time
                                                                ? (() => {
                                                                    const [sh, sm] = seatedReservation.time.split(':').map(Number);
                                                                    const [eh, em] = computedEndTime.split(':').map(Number);
                                                                    return Math.max(1, (eh*60+(em||0)) - (sh*60+(sm||0)));
                                                                })()
                                                                : 120;
                                                            const usedPct = Math.min(100, Math.max(0, Math.round(((totalMins - minutesUntilEnd) / totalMins) * 100)));
                                                            return (
                                                                <div className="w-full bg-black/15 rounded-full h-1 mt-0.5">
                                                                    <div
                                                                        className={`h-1 rounded-full transition-all ${isFinishingSoon ? 'bg-amber-700' : 'bg-red-600'}`}
                                                                        style={{ width: `${usedPct}%` }}
                                                                    ></div>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : null}
                                                </div>
                                                
                                                {!isBlockedForInteraction && (
                                                    <div
                                                        className="absolute -bottom-1 -right-1 w-3 h-3 bg-gray-600 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity rounded-sm"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (swapping || assigningTable || isSelectingTables) return; 
                                                            setIsResizing(table.table_number);
                                                            
                                                            const startX = e.clientX;
                                                            const startY = e.clientY;
                                                            const startWidth = table.width || 80;
                                                            const startHeight = table.height || 100;
                                                            
                                                            const handleMouseMove = (moveEvent) => {
                                                                const newWidth = Math.round((startWidth + (moveEvent.clientX - startX)) / GRID_SIZE) * GRID_SIZE;
                                                                const newHeight = Math.round((startHeight + (moveEvent.clientY - startY)) / GRID_SIZE) * GRID_SIZE;
                                                                handleTableResize(table.table_number, newWidth, newHeight);
                                                            };
                                                            
                                                            const handleMouseUp = () => {
                                                                setIsResizing(null);
                                                                document.removeEventListener('mousemove', handleMouseMove);
                                                                document.removeEventListener('mouseup', handleMouseUp);
                                                            };
                                                            
                                                            document.addEventListener('mousemove', handleMouseMove);
                                                            document.addEventListener('mouseup', handleMouseUp);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                        
                                        <div className="absolute bottom-2 left-2 text-[11px] text-gray-700 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 flex items-center gap-x-2.5 gap-y-1 flex-wrap max-w-[95%]">
                                            <span className="text-gray-400">🖱️ גרור / לחץ</span>
                                            <span className="w-px h-3 bg-gray-300"></span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-2 bg-white border-emerald-300 inline-block"></span>פנוי</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-2 bg-[#FAF5E8] border-yellow-400 inline-block"></span>שמור</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-2 bg-green-100 border-green-500 inline-block"></span>יושבים</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-2 bg-amber-200 border-amber-500 inline-block"></span>מסיים</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border-2 bg-[#A04A2E] border-rose-700 inline-block"></span>חריגה</span>
                                        </div>
                                    </div> {/* close inner map */}
                                    </div> {/* close dimensional wrapper */}
                                    </div> {/* close overflow scroll wrapper */}
                                </div>
                            </div>
                            </>
                        )
                    )}

                    <Dialog open={tableDetailsOpen} onOpenChange={setTableDetailsOpen}>
                        <TableDetailsDialog 
                            table={selectedTable} 
                            session={selectedTable ? getTableSession(selectedTable.table_number) : null} 
                        />
                    </Dialog>
                     <TableIncidentDialog
                        open={!!incidentTableNumber}
                        onClose={() => setIncidentTableNumber(null)}
                        tableNumber={incidentTableNumber}
                    />
                    <ReservationEditDialog
                        open={isEditReservationOpen}
                        setOpen={setIsEditReservationOpen}
                        reservation={editingReservation}
                        onUpdate={handleUpdateReservation}
                        tables={tables}
                        reservations={reservations}
                    />
                </CardContent>
            </Card>

            {/* Mobile FAB removed — replaced by the tab switcher above the grid */}

            {/* === FLOATING AI ASSISTANT === */}
            {/* FAB — bottom-right corner. Shows badge if there are auto-recs. */}
            <button
                onClick={() => setAiOpen(true)}
                className="fixed bottom-4 right-4 z-[55] w-14 h-14 rounded-full bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] text-white shadow-2xl flex items-center justify-center text-2xl hover:scale-105 transition-transform"
                title="עוזר AI"
            >✨</button>

            {/* Voice control is now mounted globally in Layout.jsx — no per-page button needed. */}


            {aiOpen && (
                <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm" onClick={() => { setAiOpen(false); setAiPrefillQuestion(''); }}>
                    <div className="absolute bottom-0 right-0 max-w-md w-full sm:bottom-4 sm:right-4 sm:rounded-2xl bg-white shadow-2xl overflow-hidden" dir="rtl" onClick={e => e.stopPropagation()}>
                        <AiAssistantPanel
                            tables={tables}
                            reservations={reservations}
                            activeSessions={activeSessions}
                            queueEntries={queueEntries}
                            customers={customers}
                            onSwitchToListMode={() => { setViewMode('list'); setBigMapMode(false); setAiOpen(false); }}
                            prefillQuestion={aiPrefillQuestion}
                            onClose={() => { setAiOpen(false); setAiPrefillQuestion(''); }}
                            inDrawer
                        />
                    </div>
                </div>
            )}

            {/* QUICK SEAT (walk-in) flow */}
            {/* "+ הזמנה חדשה" from the map toolbar — opens the booker as a modal
                (works in every layout incl. big-map mode). */}
            {smartReserveOpen && (
                <Dialog open={smartReserveOpen} onOpenChange={setSmartReserveOpen}>
                    <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto" dir="rtl">
                        <DialogHeader>
                            <DialogTitle>הזמנה חדשה</DialogTitle>
                        </DialogHeader>
                        <ReservationTool customers={customers} onReservationCreated={() => { loadLiveData(); setSmartReserveOpen(false); }} />
                    </DialogContent>
                </Dialog>
            )}

            {quickSeatOpen && (
                <QuickSeatDialog
                    open={quickSeatOpen}
                    onClose={() => { setQuickSeatOpen(false); setQuickSeatTable(null); }}
                    preselectTable={quickSeatTable}
                    tables={tables}
                    reservations={reservations}
                    activeSessions={activeSessions}
                    onSeat={async (params) => {
                        const { name, phone, party_size, table_number, source_label } = params;
                        const now = new Date();
                        const dateStr = format(now, 'yyyy-MM-dd');
                        const time = format(now, 'HH:mm');
                        try {
                            const size = parseInt(party_size);
                            // Stamp the end time so the turn timer ("מסיים"/"חריגה" + countdown)
                            // works for walk-ins too. Without it these guests rendered as flat
                            // green forever and the hostess had no idea who was nearly done.
                            const endMin = (now.getHours() * 60 + now.getMinutes()) + getSeatingDuration(size);
                            const reservation_end_time =
                                `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                            const created = await Reservation.create({
                                customer_name: name,
                                customer_phone: phone || null,
                                date: dateStr,
                                time,
                                party_size: size,
                                status: 'seated',
                                assigned_table: [table_number],
                                reservation_end_time,
                                source: source_label || 'walkin',
                            });
                            await loadLiveData();
                            setQuickSeatOpen(false);
                            setQuickSeatTable(null);
                        } catch (e) {
                            alert('שגיאה בהושבה: ' + (e?.message || e));
                        }
                    }}
                />
            )}

            {/* Queue popup banner — fires when a NEW walk-in joins the queue.
                Inline אשר/דחה buttons so hostess approves/rejects without leaving. */}
            {queueNewBanner && (
                <QueueApprovalBanner
                    banner={queueNewBanner}
                    onApprove={approveQueueEntry}
                    onReject={rejectQueueEntry}
                    onDismiss={() => setQueueNewBanner(null)}
                    onOpenTab={() => { setRailTab('queue'); setBigMapMode(true); }}
                />
            )}

            {/* Dashboard drawer — modal overlay only when NOT in big-map mode.
                In big-map mode the dashboard renders inline in the right rail. */}
            {dashboardDrawerOpen && !bigMapMode && (
                <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDashboardDrawerOpen(false)}>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white p-4 overflow-y-auto shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        dir="rtl"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-black">לוח הזמנות מלא</h3>
                            <button onClick={() => setDashboardDrawerOpen(false)} className="p-2 -m-2 rounded-full hover:bg-gray-100">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <ReservationsDashboard />
                            <ReservationTool customers={customers} onReservationCreated={loadLayout} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// === CompactTonightStrip — narrow right rail for big-map mode ================
// Shows TODAY's evening reservations only (>= 17:00), grouped chronologically.
// Each row is tap/click-to-edit. There's also a button to open the full dashboard.
function CompactTonightStrip({ reservations, selectedDate, onEdit, onOpenFullDashboard }) {
    const [searchTerm, setSearchTerm] = useState('');
    const todayStr = format(new Date(selectedDate), 'yyyy-MM-dd');
    const q = searchTerm.trim().toLowerCase();
    const tonight = (reservations || [])
        .filter(r => {
            const d = (r.date instanceof Date) ? format(r.date, 'yyyy-MM-dd') : String(r.date || '').slice(0, 10);
            if (d !== todayStr) return false;
            if (r.status === 'cancelled' || r.status === 'deleted') return false;
            // A no-show STAYS on the board (owner rule): it's auto-marked 30 min
            // after the slot, and hiding it would take the ₪ hold — and the
            // decision to charge or release it — off the owner's main view.
            // Search must still apply to timeless rows, so it runs before the
            // time cutoff, not after.
            if (q) {
                const nameMatch = (r.customer_name || '').toLowerCase().includes(q);
                const phoneMatch = (r.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
                if (!nameMatch && !phoneMatch) return false;
            }
            if (!r.time) return true;
            if (String(r.time) < '17:00') return false;
            return true;
        })
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const totalGuests = tonight.reduce((s, r) => s + (r.party_size || 0), 0);

    // Status pill color
    const statusPill = (s) => {
        if (s === 'seated') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (s === 'confirmed') return 'bg-[#F4ECD8] text-[#44512C] border-[#E8D9B5]';
        if (s === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };
    const statusLabel = (s) => {
        if (s === 'seated') return 'יושב';
        if (s === 'confirmed') return 'אושר';
        if (s === 'pending') return 'ממתין';
        return s || '—';
    };

    return (
        <>
            {/* Sticky header */}
            <div className="sticky top-0 bg-white border-2 border-indigo-200 rounded-2xl p-3 z-10 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold text-[#A04A2E] uppercase tracking-wider">הזמנות הערב</div>
                        <div className="text-2xl font-black text-gray-900">{tonight.length}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500">סה״כ סועדים</div>
                        <div className="text-2xl font-black text-gray-900">{totalGuests}</div>
                    </div>
                </div>
                {/* Search */}
                <input
                    type="search"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="🔍 חפש לפי שם או טלפון..."
                    className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:border-indigo-400 focus:outline-none"
                />
            </div>

            {/* List — wrapped in a block container with vertical spacing so the
                cards don't become direct flex-items of the rail column (which
                shrinks/overlaps them under many rows). */}
            {tonight.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
                    <div className="text-3xl mb-1">🌙</div>
                    <div className="text-sm text-gray-500">אין הזמנות הערב</div>
                </div>
            ) : (
                <div className="space-y-1.5">
                {tonight.map((r) => {
                    const flagColor = {
                        green:  'bg-emerald-500',
                        orange: 'bg-orange-500',
                        red:    'bg-red-500',
                        black:  'bg-zinc-900',
                    }[r.hostess_flag] || null;
                    return (
                    <button
                        key={r.id}
                        onClick={() => onEdit && onEdit(r)}
                        className="w-full text-right bg-white hover:bg-[#F4ECD8] border border-gray-200 hover:border-indigo-400 rounded-xl p-2.5 transition-colors relative overflow-hidden"
                    >
                        {flagColor && (
                            <div className={`absolute top-0 bottom-0 right-0 w-1 ${flagColor}`}></div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <div className="font-black text-sm text-gray-900 leading-tight">{r.time || '--:--'}</div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusPill(r.status)}`}>
                                {statusLabel(r.status)}
                            </span>
                        </div>
                        <div className="font-bold text-sm text-gray-800 truncate mt-0.5">{r.customer_name || 'אורח'}</div>
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-0.5">
                            <span className="flex items-center gap-0.5"><Users className="w-3 h-3"/>{r.party_size || '?'}</span>
                            {r.assigned_table && (
                                <span className="font-bold text-[#A04A2E]">
                                    🪑 {Array.isArray(r.assigned_table) ? r.assigned_table.join(',') : r.assigned_table}
                                </span>
                            )}
                            {r.special_occasion && (
                                <span className="text-[#A04A2E]" title={r.special_occasion}>🎂</span>
                            )}
                        </div>
                    </button>
                    );
                })}
                </div>
            )}
        </>
    );
}

// === QueueApprovalBanner — popup with אשר/דחה inline, no need to leave page ===
// === TableCombosBreakdown ===
// For each party size N=2..12 (and 12+ for events), shows which standalone tables fit
// and which connected combinations reach the target. Derived from each table's
// min_capacity/max_capacity/combinable_with — no extra config needed.
function TableCombosBreakdown({ tables, combos = [], onAddCombo, onRemoveCombo, onReorderCombo, onSetConnection }) {
    const [open, setOpen] = React.useState(false);
    const [addMode, setAddMode] = React.useState(false);
    const [pickedTables, setPickedTables] = React.useState([]); // multi-select
    const [pickedSize, setPickedSize] = React.useState(''); // 3..40 or '' (auto)
    const [flexSlots, setFlexSlots] = React.useState([]); // [{key, label, table_max}] — wildcards
    // Each option = a ceiling on the candidate table's max_capacity.
    // table_max=2 means "ONLY a table whose max_capacity is 2" — i.e. a real 2-seater,
    // not a 4-seater that happens to fit 2. This prevents wasting a #200 (4-seater)
    // as a 'זוגי' slot.
    const FLEX_OPTIONS = [
        { key: 'max2', label: 'שולחן זוגי (max 2)',    table_max: 2 },
        { key: 'max3', label: 'שולחן שלישייה (max 3)', table_max: 3 },
        { key: 'max4', label: 'שולחן רביעייה (max 4)', table_max: 4 },
        { key: 'max5', label: 'שולחן חמישייה (max 5)', table_max: 5 },
        { key: 'max6', label: 'שולחן שישייה (max 6)',  table_max: 6 },
    ];
    // Diagnostic: how many real tables match each ceiling. Cheap — recompute per render.
    const flexCounts = (() => {
        const out = {};
        for (const opt of FLEX_OPTIONS) {
            out[opt.key] = (tables || []).filter(t => Number(t?.max_capacity) === opt.table_max).length;
        }
        return out;
    })();
    const addFlex = (key) => {
        const opt = FLEX_OPTIONS.find(o => o.key === key);
        if (!opt) return;
        // Start with empty exclude list — all matching tables are eligible by default
        setFlexSlots(prev => [...prev, { ...opt, exclude_tables: [] }]);
    };
    const removeFlex = (idx) => setFlexSlots(prev => prev.filter((_, i) => i !== idx));
    const toggleExcludeInFlex = (slotIdx, tableNum) => {
        setFlexSlots(prev => prev.map((slot, i) => {
            if (i !== slotIdx) return slot;
            const ex = Array.isArray(slot.exclude_tables) ? slot.exclude_tables : [];
            const s = String(tableNum);
            return { ...slot, exclude_tables: ex.includes(s) ? ex.filter(x => x !== s) : [...ex, s] };
        }));
    };
    // Get all tables matching a slot's table_max
    const matchingTablesForSlot = (slot) =>
        (tables || []).filter(t => Number(t?.max_capacity) === Number(slot.table_max))
                      .map(t => String(t.table_number))
                      .sort((a, b) => {
                          const na = parseInt(a), nb = parseInt(b);
                          if (!isNaN(na) && !isNaN(nb)) return na - nb;
                          return a.localeCompare(b);
                      });

    const allNums = (tables || []).map(t => String(t.table_number)).filter(Boolean);
    // Sort numerically for a stable grid.
    const sortedNums = [...allNums].sort((a, b) => {
        const na = parseInt(a), nb = parseInt(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
    });

    const togglePicked = (n) => {
        const s = String(n);
        setPickedTables(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };
    const disconnectPair = (idA, idB) => {
        if (!onSetConnection) return;
        if (!window.confirm(`לנתק את החיבור בין שולחן ${idA} ל-${idB}?`)) return;
        onSetConnection(idA, idB, false);
    };
    const disconnectCombo = (ids) => {
        if (!onSetConnection) return;
        if (ids.length === 2) return disconnectPair(ids[0], ids[1]);
        if (!window.confirm(`לנתק את כל החיבורים בין השולחנות: ${ids.map(i=>'#'+i).join(', ')}?`)) return;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i+1; j < ids.length; j++) {
                onSetConnection(ids[i], ids[j], false);
            }
        }
    };
    const addConnection = () => {
        const totalPicked = pickedTables.length + flexSlots.length;
        if (totalPicked < 1) {
            window.alert('בחר לפחות שולחן אחד או וויילדקארד');
            return;
        }
        // A SINGLE table (no pair to connect) only enters the list as a priority
        // entry — which needs a party size. Without one it would silently do nothing.
        if (totalPicked === 1 && !pickedSize) {
            window.alert('כדי להוסיף שולחן בודד לעדיפויות — בחר קודם לכמה סועדים 👥');
            return;
        }
        // Connect ALL pairs of FIXED picked tables — wildcards don't create graph edges.
        for (let i = 0; i < pickedTables.length; i++) {
            for (let j = i + 1; j < pickedTables.length; j++) {
                onSetConnection?.(pickedTables[i], pickedTables[j], true);
            }
        }
        // Save as explicit combo with the picked party size and flex slots
        if (pickedSize && onAddCombo) {
            onAddCombo(pickedSize, pickedTables, flexSlots);
        }
        // Keep party size — clear tables + flex for next combo
        setPickedTables([]);
        setFlexSlots([]);
    };
    const finishAdding = () => {
        setAddMode(false); setPickedTables([]); setPickedSize(''); setFlexSlots([]);
    };

    // Stable fingerprint so memoization actually works.
    const tablesFingerprint = React.useMemo(
        () => JSON.stringify((tables || []).map(t => [t?.table_number, t?.min_capacity, t?.max_capacity, t?.combinable_with])),
        [tables]
    );
    // Derived structures — recompute only when fingerprint changes.
    const { valid, byNum, adj } = React.useMemo(() => {
        const v = (tables || []).filter(t => t && t.table_number != null && t.min_capacity != null && t.max_capacity != null);
        const bn = new Map(v.map(t => [String(t.table_number), t]));
        const ad = new Map();
        v.forEach(t => ad.set(String(t.table_number), new Set((Array.isArray(t.combinable_with) ? t.combinable_with : []).map(String))));
        return { valid: v, byNum: bn, adj: ad };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tablesFingerprint]);

    if (valid.length === 0) return null;

    const isConnected = (subset) => {
        if (subset.length <= 1) return true;
        const inSet = new Set(subset);
        const seen = new Set([subset[0]]);
        const queue = [subset[0]];
        while (queue.length) {
            const cur = queue.shift();
            for (const nb of (adj.get(cur) || new Set())) {
                if (inSet.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
            }
        }
        return seen.size === subset.length;
    };

    // CRITICAL: only compute breakdown when section is OPEN. Otherwise C(57,k)
    // enumeration on every parent re-render freezes the whole page.
    // Also enumerate per connected-component only (massive prune for sparse graphs).
    const computeBreakdown = React.useCallback(() => {
        const SIZES = [2,3,4,5,6,7,8,9,10,11,12];
        const out = {};
        for (const n of SIZES) out[n] = { singles: [], combos: [] };

        // Singles
        for (const t of valid) {
            const lo = t.min_capacity || 0, hi = t.max_capacity || 0;
            for (const n of SIZES) {
                if (n >= lo && n <= hi) out[n].singles.push(String(t.table_number));
            }
        }

        // Build connected components — only enumerate within each (massive prune).
        const visited = new Set();
        const components = [];
        const allNums = valid.map(t => String(t.table_number));
        for (const num of allNums) {
            if (visited.has(num)) continue;
            const comp = [];
            const stack = [num];
            while (stack.length) {
                const cur = stack.pop();
                if (visited.has(cur)) continue;
                visited.add(cur);
                comp.push(cur);
                for (const nb of (adj.get(cur) || new Set())) {
                    if (!visited.has(nb)) stack.push(nb);
                }
            }
            if (comp.length >= 2) components.push(comp);
        }

        const seen = new Set();
        const eventOut = [];

        for (const comp of components) {
            const enumerate = (start, current, sumMin, sumMax, maxSize) => {
                if (current.length >= 2 && isConnected(current)) {
                    const sorted = [...current].sort();
                    const key = sorted.join('-');
                    if (!seen.has(key)) {
                        seen.add(key);
                        // 2..12 buckets
                        for (const n of SIZES) {
                            if (n >= sumMin && n <= sumMax) {
                                out[n].combos.push({ ids: sorted, sumMin, sumMax });
                            }
                        }
                        // Event bucket (13+)
                        if (sumMax >= 13) eventOut.push({ ids: sorted, sumMin, sumMax });
                    }
                }
                if (current.length >= maxSize) return;
                for (let i = start; i < comp.length; i++) {
                    const t = byNum.get(comp[i]);
                    if (!t) continue;
                    current.push(comp[i]);
                    enumerate(i + 1, current, sumMin + (t.min_capacity || 0), sumMax + (t.max_capacity || 0), maxSize);
                    current.pop();
                }
            };
            // Cap maxSize: 4 for normal buckets, 6 for event-size (only enumerated within tiny components anyway)
            enumerate(0, [], 0, 0, Math.min(6, comp.length));
        }

        for (const n of SIZES) {
            out[n].combos.sort((a, b) => a.sumMax - b.sumMax || a.ids.length - b.ids.length);
            out[n].combos = out[n].combos.slice(0, 8);
        }
        eventOut.sort((a, b) => b.sumMax - a.sumMax || a.ids.length - b.ids.length);
        return { byN: out, events: eventOut.slice(0, 30) };
    }, [valid, adj, byNum]);

    // Only compute when actually open. Returns empty until then.
    const { byN: breakdown, events: eventCombos } = React.useMemo(
        () => open ? computeBreakdown() : { byN: {}, events: [] },
        [open, computeBreakdown]
    );

    const Chip = ({ children, color = 'gray' }) => {
        const COLORS = {
            gray: 'bg-gray-100 text-gray-700 border-gray-300',
            green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            blue: 'bg-[#F4ECD8] text-[#2E3819] border-[#D9BD83]',
            purple: 'bg-[#F4ECD8] text-[#7A3722] border-[#D9BD83]',
        };
        return <span className={`inline-block text-xs font-bold px-2 py-1 rounded-full border ${COLORS[color]}`}>{children}</span>;
    };

    return (
        <div className="mt-6 border-2 border-indigo-200 rounded-2xl bg-gradient-to-b from-[#F4ECD8]/40 to-white" dir="rtl">
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between p-4 hover:bg-[#F4ECD8]/60 rounded-2xl">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🪑</span>
                    <div className="text-right">
                        <div className="font-black text-base text-indigo-900">צירופי שולחנות לפי מס׳ סועדים</div>
                        <div className="text-[11px] text-gray-500">נגזר אוטומטית מקיבולת השולחנות + שולחנות לחיבור. מעדכן את עצמו לפי הקיבולת שהוגדרה למעלה.</div>
                    </div>
                </div>
                <span className="text-[#A04A2E] text-lg">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="p-4 space-y-3 border-t border-indigo-200">
                    {/* Reverse selector — pick tables → see party-size range */}
                    <TableComboSelector tables={valid} adj={adj} byNum={byNum} isConnected={isConnected} />

                    {/* Edit toolbar */}
                    {onSetConnection && (
                        <div className="bg-white border border-indigo-200 rounded-xl p-3">
                            {!addMode ? (
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] text-gray-600">
                                        ✏️ עריכת עדיפויות: ❌ על צ׳יפ = הסר מהעדיפויות. <strong>+ הוסף לעדיפויות</strong> = שולחן בודד או חיבור.
                                    </div>
                                    <button
                                        onClick={() => setAddMode(true)}
                                        className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow"
                                    >➕ הוסף לעדיפויות</button>
                                </div>
                            ) : (
                                <div>
                                    {/* Party-size picker (3-40) — informational only, helps you focus the right scenario */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold text-gray-700">👥 לכמה סועדים?</span>
                                        <select
                                            value={pickedSize}
                                            onChange={e => setPickedSize(e.target.value)}
                                            className="text-xs border border-gray-300 rounded px-2 py-1 min-w-[80px]"
                                        >
                                            <option value="">(ללא — חישוב אוטומטי)</option>
                                            {Array.from({length: 38}, (_, i) => i + 3).map(n => (
                                                <option key={n} value={n}>{n} סועדים</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Multi-select table grid */}
                                    <div className="mb-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-gray-700">🪑 בחר שולחן אחד או יותר (לבד או בחיבור):</span>
                                            {(pickedTables.length > 0 || flexSlots.length > 0) && (
                                                <span className="text-[11px] font-bold text-emerald-700">
                                                    נבחרו: {[...pickedTables.map(n => '#' + n), ...flexSlots.map(f => `🃏${f.label}`)].join(' + ')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto bg-gray-50 p-2 rounded border border-gray-200">
                                            {sortedNums.map(n => {
                                                const isSelected = pickedTables.includes(n);
                                                return (
                                                    <button
                                                        key={n}
                                                        onClick={() => togglePicked(n)}
                                                        className={`text-xs font-bold px-2 py-1 rounded-full border transition-colors
                                                            ${isSelected
                                                                ? 'bg-emerald-600 text-white border-emerald-700 shadow'
                                                                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'}`}
                                                    >#{n}</button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Wildcard slots — fill at seating time with whichever free table fits */}
                                    <div className="mb-2 p-2 bg-[#F4ECD8] border border-purple-200 rounded">
                                        <div className="text-xs font-bold text-[#7A3722] mb-1">🃏 הוסף שולחן וויילדקארד (פנוי בזמן אמת):</div>
                                        <div className="text-[10px] text-[#7A3722] mb-1.5">
                                            ההגבלה היא לפי <strong>max_capacity של השולחן עצמו</strong>: "זוגי" = רק שולחנות שה-max שלהם הוא 2 (לא רביעייה שמכילה 2).
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {FLEX_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.key}
                                                    onClick={() => addFlex(opt.key)}
                                                    disabled={flexCounts[opt.key] === 0}
                                                    title={flexCounts[opt.key] === 0 ? 'אין שולחנות עם max זה במפה' : `יש ${flexCounts[opt.key]} שולחנות במפה עם max=${opt.table_max}`}
                                                    className={`text-[11px] font-bold px-2 py-1 rounded-full border
                                                        ${flexCounts[opt.key] === 0
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-white text-purple-900 border-[#D9BD83] hover:bg-[#F4ECD8]'}`}
                                                >+ {opt.label} <span className="opacity-60">({flexCounts[opt.key]})</span></button>
                                            ))}
                                        </div>
                                        {flexSlots.length > 0 && (
                                            <div className="mt-2 space-y-2">
                                                {flexSlots.map((f, i) => {
                                                    const matching = matchingTablesForSlot(f);
                                                    const excluded = new Set((f.exclude_tables || []).map(String));
                                                    const includedCount = matching.filter(t => !excluded.has(t)).length;
                                                    return (
                                                        <div key={i} className="bg-white border border-[#D9BD83] rounded p-1.5">
                                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                                <span className="text-[11px] font-bold text-purple-900">
                                                                    🃏 {f.label} <span className="opacity-70">— זמינים {includedCount}/{matching.length}</span>
                                                                </span>
                                                                <button onClick={() => removeFlex(i)} className="w-4 h-4 rounded-full bg-purple-200 hover:bg-red-500 hover:text-white text-purple-900 text-[10px] flex items-center justify-center">×</button>
                                                            </div>
                                                            <div className="text-[9px] text-gray-500 mb-1">לחץ על שולחן כדי להוציא אותו מהמועמדים (למשל אם בגובה אחר):</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {matching.map(t => {
                                                                    const isExcluded = excluded.has(t);
                                                                    return (
                                                                        <button
                                                                            key={t}
                                                                            onClick={() => toggleExcludeInFlex(i, t)}
                                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors
                                                                                ${isExcluded
                                                                                    ? 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                                                                                    : 'bg-[#F4ECD8] text-purple-900 border-[#D9BD83] hover:bg-purple-200'}`}
                                                                            title={isExcluded ? 'מוחרג — לחץ כדי להחזיר' : 'לחץ כדי להוציא'}
                                                                        >#{t}</button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <div className="mt-1 text-[10px] text-[#7A3722]">
                                            דוגמה: 700+701 + שולחן זוגי פנוי → בזמן אמת ה-AI יציע איזה שולחן 2 לקחת.
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={addConnection}
                                            disabled={(pickedTables.length + flexSlots.length) < 1}
                                            className="text-xs font-bold px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                        >הוסף לעדיפויות {(pickedTables.length + flexSlots.length) > 0 ? `(${pickedTables.length + flexSlots.length})` : ''}</button>
                                        <button onClick={finishAdding} className="text-xs px-3 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800">סיים</button>
                                    </div>
                                    {pickedSize && (
                                        <div className="mt-2 text-[10px] text-emerald-700 font-bold">
                                            📌 המערכת נשארת על {pickedSize} סועדים — בחר את העדיפות הבאה ולחץ "הוסף לעדיפויות" שוב.
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="mt-1.5 text-[10px] text-amber-700">
                                ⚠️ זכור ללחוץ <strong>שמור</strong> למעלה כדי לשמור את השינויים ל-DB.
                            </div>
                        </div>
                    )}

                    {/* Build a set of "table-id sets" that the owner has explicitly claimed
                        for SOME party size. These get suppressed from the auto-derived suggestions
                        at every OTHER party size — so a combo saved as "3 סועדים" stops appearing
                        as a generic suggestion under 2 and 4. */}
                    {(() => null)()}
                    {[2,3,4,5,6,7,8,9,10,11,12].map(n => {
                        const b = breakdown[n] || { singles: [], combos: [] };
                        const explicitCombos = combos
                            .filter(c => Number(c.party_size) === n)
                            .sort((a, b) => (a.priority || 999) - (b.priority || 999));
                        // Set of "tableId|tableId|..." keys claimed explicitly for ANY party size
                        const claimedKeys = new Set(
                            combos.map(c => [...(c.tables||[])].map(String).sort().join('|'))
                        );
                        // Filter out auto-derived combos whose table set is already claimed
                        const autoCombos = (b.combos || []).filter(ac => {
                            const key = [...(ac.ids||[])].map(String).sort().join('|');
                            return !claimedKeys.has(key);
                        });
                        // Filter out auto-derived singles whose table is already in an explicit list
                        const claimedSingles = new Set(
                            combos
                                .filter(c => (c.tables||[]).length === 1 && (c.flex_slots||[]).length === 0)
                                .map(c => String(c.tables[0]))
                        );
                        const autoSingles = (b.singles || []).filter(t => !claimedSingles.has(String(t)));
                        return (
                            <div key={n} className="border border-gray-200 rounded-xl p-3 bg-white">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-black text-sm text-gray-900">👥 {n} סועדים</div>
                                    <div className="text-[11px] text-gray-500">
                                        {explicitCombos.length > 0 && <span className="text-emerald-700 font-bold">📌 {explicitCombos.length} בעדיפות · </span>}
                                        {autoSingles.length} לבד · {autoCombos.length} בחיבור
                                    </div>
                                </div>

                                {/* Explicit owner-saved priority list — singles AND combos, sorted by rank */}
                                {explicitCombos.length > 0 && (
                                    <div className="mb-2">
                                        <div className="text-[10px] font-bold text-emerald-700 mb-1">📌 רשימת עדיפויות הושבה (שולחנות וחיבורים — ה-AI ינסה מלמעלה למטה)</div>
                                        <div className="space-y-1">
                                            {explicitCombos.map((c, idx) => {
                                                const fixedParts = (c.tables || []).map(id => `#${id}`);
                                                const flexParts = (c.flex_slots || []).map(s => {
                                                    const exCount = Array.isArray(s.exclude_tables) ? s.exclude_tables.length : 0;
                                                    const baseLabel = s.label || `max ${s.table_max || s.max}`;
                                                    return exCount > 0 ? `🃏${baseLabel} (פרט ל-${exCount})` : `🃏${baseLabel}`;
                                                });
                                                const parts = [...fixedParts, ...flexParts];
                                                return (
                                                    <div key={c.id} className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-black text-emerald-900 w-5 text-center">{idx + 1}.</span>
                                                        {onReorderCombo && (
                                                            <div className="flex flex-col gap-0">
                                                                <button
                                                                    onClick={() => onReorderCombo(c.id, 'up')}
                                                                    disabled={idx === 0}
                                                                    title="עלה בעדיפות"
                                                                    className="text-[10px] leading-none px-1 rounded hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >▲</button>
                                                                <button
                                                                    onClick={() => onReorderCombo(c.id, 'down')}
                                                                    disabled={idx === explicitCombos.length - 1}
                                                                    title="ירד בעדיפות"
                                                                    className="text-[10px] leading-none px-1 rounded hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >▼</button>
                                                            </div>
                                                        )}
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border bg-emerald-100 text-emerald-900 border-emerald-400">
                                                            {parts.join(' + ')}
                                                            {onRemoveCombo && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`להסיר את החיבור השמור ${parts.join(' + ')} ל-${n} סועדים?`)) onRemoveCombo(c.id); }}
                                                                    title="הסר חיבור שמור"
                                                                    className="ml-0.5 w-4 h-4 rounded-full bg-emerald-200 hover:bg-red-500 hover:text-white text-emerald-900 text-[10px] flex items-center justify-center"
                                                                >×</button>
                                                            )}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {autoSingles.length > 0 && (
                                    <div className="mb-2">
                                        <div className="text-[10px] font-bold text-gray-500 mb-1">🪑 לבד — לחץ ★ כדי להעלות לרשימת העדיפות</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {autoSingles.map(id => (
                                                <span key={id} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border bg-green-100 text-green-800 border-green-300">
                                                    #{id}
                                                    {onAddCombo && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAddCombo(n, [id], []); }}
                                                            title={`הוסף את #${id} לרשימת העדיפות של ${n} סועדים`}
                                                            className="ml-0.5 w-4 h-4 rounded-full bg-green-200 hover:bg-emerald-600 hover:text-white text-green-900 text-[10px] flex items-center justify-center"
                                                        >★</button>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {autoCombos.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-500 mb-1">🔗 בחיבור (אוטומטי)</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {autoCombos.map((c, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border bg-[#F4ECD8] text-[#2E3819] border-[#D9BD83]">
                                                    {c.ids.map(id => `#${id}`).join(' + ')}
                                                    <span className="opacity-60">({c.sumMin}-{c.sumMax})</span>
                                                    {onAddCombo && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAddCombo(n, c.ids, []); }}
                                                            title={`הוסף את החיבור ${c.ids.map(id => '#'+id).join('+')} לעדיפות של ${n} סועדים`}
                                                            className="ml-0.5 w-4 h-4 rounded-full bg-[#E8D9B5] hover:bg-emerald-600 hover:text-white text-emerald-900 text-[10px] flex items-center justify-center"
                                                        >★</button>
                                                    )}
                                                    {onSetConnection && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); disconnectCombo(c.ids); }}
                                                            title="נתק חיבור"
                                                            className="ml-0.5 w-4 h-4 rounded-full bg-[#E8D9B5] hover:bg-red-500 hover:text-white text-blue-900 text-[10px] flex items-center justify-center"
                                                        >×</button>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {autoSingles.length === 0 && autoCombos.length === 0 && explicitCombos.length === 0 && (
                                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠️ אין שולחן או חיבור שמתאים ל-{n} סועדים</div>
                                )}
                            </div>
                        );
                    })}

                    {/* Event combos: 13+ guests */}
                    <div className="border-2 border-purple-200 rounded-xl p-3 bg-[#F4ECD8]/40">
                        <div className="flex items-center justify-between mb-2">
                            <div className="font-black text-sm text-purple-900">🎉 לאירועים — 13+ סועדים</div>
                            <div className="text-[11px] text-[#7A3722]">{eventCombos.length} אפשרויות</div>
                        </div>
                        {eventCombos.length === 0 ? (
                            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                ⚠️ לא נמצאו צירופים של 13+ סועדים. ודא ש-`combinable_with` מוגדר נכון על שולחנות צמודים.
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {eventCombos.map((c, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border bg-[#F4ECD8] text-[#7A3722] border-[#D9BD83]">
                                        {c.ids.map(id => `#${id}`).join(' + ')}
                                        <span className="opacity-60">({c.sumMin}-{c.sumMax})</span>
                                        {onSetConnection && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); disconnectCombo(c.ids); }}
                                                title="נתק חיבור"
                                                className="ml-0.5 w-4 h-4 rounded-full bg-purple-200 hover:bg-red-500 hover:text-white text-purple-900 text-[10px] flex items-center justify-center"
                                            >×</button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="mt-2 text-[10px] text-gray-500">
                            המודול לאירועים יכול לבקש המלצה לכמות סועדים ספציפית דרך <code className="bg-white px-1 rounded">getTableCombosForPartySize</code>.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// === TableComboSelector — pick tables, see how many guests they seat together ===
function TableComboSelector({ tables, adj, byNum, isConnected }) {
    const [selected, setSelected] = React.useState([]);

    const toggle = (num) => {
        const n = String(num);
        setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
    };
    const clear = () => setSelected([]);

    let sumMin = 0, sumMax = 0;
    for (const n of selected) {
        const t = byNum.get(n);
        if (t) { sumMin += (t.min_capacity || 0); sumMax += (t.max_capacity || 0); }
    }
    const connected = selected.length <= 1 ? true : isConnected(selected);

    // Sort tables by number (numeric where possible)
    const sortedTables = [...tables].sort((a, b) => {
        const na = parseInt(a.table_number), nb = parseInt(b.table_number);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.table_number).localeCompare(String(b.table_number));
    });

    return (
        <div className="bg-white border-2 border-emerald-200 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-base">🔍</span>
                    <span className="font-black text-sm text-emerald-800">בדוק שילוב — בחר שולחנות, רואה למה הם מתאימים</span>
                </div>
                {selected.length > 0 && (
                    <button onClick={clear} className="text-[11px] text-gray-500 hover:text-red-600">נקה ({selected.length})</button>
                )}
            </div>

            {selected.length > 0 && (
                <div className={`mb-2 p-2 rounded-lg ${connected ? 'bg-emerald-50 border border-emerald-300' : 'bg-amber-50 border border-amber-300'}`}>
                    {connected ? (
                        <div className="text-sm font-bold text-emerald-900">
                            ✅ {selected.map(s => `#${s}`).join(' + ')} → מתאים ל-<span className="text-lg">{sumMin}-{sumMax}</span> סועדים
                        </div>
                    ) : (
                        <div className="text-xs font-bold text-amber-900">
                            ⚠️ {selected.map(s => `#${s}`).join(' + ')} — השולחנות לא מחוברים בפועל ({sumMin}-{sumMax} סועדים אם תחבר אותם)
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {sortedTables.map(t => {
                    const n = String(t.table_number);
                    const isSelected = selected.includes(n);
                    return (
                        <button
                            key={n}
                            onClick={() => toggle(n)}
                            className={`text-xs font-bold px-2 py-1 rounded-full border transition-colors
                                ${isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'}`}
                            title={`קיבולת ${t.min_capacity}-${t.max_capacity}`}
                        >#{t.table_number}</button>
                    );
                })}
            </div>
            {selected.length === 0 && (
                <div className="mt-1 text-[10px] text-gray-500">לחץ על שולחנות לבחירה — סכום הקיבולת יחושב אוטומטית.</div>
            )}
        </div>
    );
}

function QueueApprovalBanner({ banner, onApprove, onReject, onDismiss, onOpenTab }) {
    // Empty by default — hostess must actively enter a wait time for it to
    // appear in the customer's push. Avoids accidentally sending '~15 דקות'
    // when not intended.
    const [waitTime, setWaitTime] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleApprove = async () => {
        setSubmitting(true);
        await onApprove(banner.id, waitTime);
        setSubmitting(false);
    };
    const handleReject = async () => {
        if (!window.confirm(`לדחות את ${banner.name}?`)) return;
        setSubmitting(true);
        await onReject(banner.id);
        setSubmitting(false);
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] bg-white border-2 border-emerald-400 rounded-2xl shadow-2xl p-4 min-w-[320px] max-w-md animate-in slide-in-from-bottom" dir="rtl">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <div className="text-2xl">🔔</div>
                    <div>
                        <div className="font-black text-sm text-emerald-700">לקוח חדש בתור</div>
                        <div className="text-base font-bold text-gray-900">
                            {banner.name} · 👥 {banner.party_size}
                        </div>
                    </div>
                </div>
                <button
                    onClick={onDismiss}
                    className="text-gray-400 hover:text-gray-700"
                    title="סגור"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* AI suggestion */}
            {(banner.aiLoading || banner.aiSuggestion) && (
                <div className="mb-2 bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border border-indigo-200 rounded-lg p-2">
                    <div className="flex items-center gap-1 text-[10px] font-black text-[#7A3722] mb-1">
                        <span>✨</span><span>הצעה של AI:</span>
                    </div>
                    {banner.aiLoading ? (
                        <div className="text-xs text-[#A04A2E] animate-pulse">חושב...</div>
                    ) : (
                        <div className="text-xs text-gray-800 whitespace-pre-wrap leading-snug">{banner.aiSuggestion}</div>
                    )}
                </div>
            )}

            {/* Wait time input */}
            <div className="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <span className="text-xs font-bold text-amber-800">⏱️ זמן המתנה משוער:</span>
                <input
                    type="number"
                    min="0"
                    max="180"
                    value={waitTime}
                    onChange={(e) => setWaitTime(e.target.value)}
                    placeholder="ריק = ללא"
                    className="w-20 text-center text-sm font-bold border border-amber-300 rounded px-1 py-0.5"
                />
                <span className="text-xs font-bold text-amber-800">דק׳</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <button
                    onClick={handleApprove}
                    disabled={submitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-black py-2 rounded-lg text-sm flex items-center justify-center gap-1"
                >✅ אשר</button>
                <button
                    onClick={handleReject}
                    disabled={submitting}
                    className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-black py-2 rounded-lg text-sm flex items-center justify-center gap-1"
                >❌ דחה</button>
            </div>

            {/* Secondary link */}
            <button
                onClick={() => { onOpenTab(); onDismiss(); }}
                className="mt-2 w-full text-[11px] text-[#A04A2E] hover:text-indigo-800"
            >
                פתח טאב התור לפרטים נוספים →
            </button>
        </div>
    );
}

// === AiAssistantPanel — rule-based real-time recommendations ===============
// Pure JS engine (no LLM). Detects high-value opportunities and surfaces them:
//   - Upcoming large party → suggest table combinations (combinable_with)
//   - Table finishing soon + queue waiting → suggest pairing
//   - Returning customer in queue → suggest area
//   - Critical wait times in queue
//   - Empty hot zone in busy hour
function AiAssistantPanel({ tables, reservations, activeSessions, queueEntries, customers, combos, onSwitchToListMode, prefillQuestion, onClose, inDrawer, inlinePanel, onSeatReservation, onSeatWalkIn }) {
    // State for "הושב" flow per action
    const [seatActionFor, setSeatActionFor] = useState(null); // { tableNums, label }
    const [seatMode, setSeatMode] = useState('pick'); // 'pick' | 'existing' | 'walkin'
    const [walkInName, setWalkInName] = useState('');
    const [walkInPhone, setWalkInPhone] = useState('');
    const [walkInSize, setWalkInSize] = useState(2);
    const [existingSearch, setExistingSearch] = useState('');
    const openSeatAction = (action) => {
        // Parse table from action — supports "10" / "10,11" / "100+101"
        const raw = String(action.table || '');
        const nums = raw.split(/[,+\s]+/).map(s => s.trim()).filter(Boolean);
        setSeatActionFor({ tableNums: nums, label: action.label || `שולחן ${raw}` });
        setSeatMode('pick');
        setWalkInName(''); setWalkInPhone(''); setWalkInSize(2);
        setExistingSearch('');
    };
    const closeSeatAction = () => { setSeatActionFor(null); };
    const submitExisting = async (reservationId) => {
        await onSeatReservation?.(seatActionFor.tableNums, reservationId);
        closeSeatAction();
    };
    const submitWalkIn = async () => {
        if (!walkInName.trim()) { alert('נא למלא שם'); return; }
        await onSeatWalkIn?.(seatActionFor.tableNums, walkInName.trim(), walkInPhone.trim(), walkInSize);
        closeSeatAction();
    };
    // Filter pending reservations matching today, not seated yet
    const todayPending = (reservations || []).filter(r => {
        const isPending = (r.status || 'pending') === 'pending' || (r.status || 'pending') === 'confirmed';
        if (!isPending) return false;
        if (!existingSearch.trim()) return true;
        const q = existingSearch.trim().toLowerCase();
        return (r.customer_name || '').toLowerCase().includes(q) ||
               (r.customer_phone || '').includes(q.replace(/\D/g, ''));
    }).slice(0, 20);
    const [collapsed, setCollapsed] = useState(false);
    const [chatQuestion, setChatQuestion] = useState(prefillQuestion || '');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatAnswer, setChatAnswer] = useState(null); // { answer, actions }
    const [chatElapsed, setChatElapsed] = useState(0);
    const chatAbortRef = useRef(null);

    // Tick a seconds counter while loading so the user sees progress (not stuck).
    useEffect(() => {
        if (!chatLoading) { setChatElapsed(0); return; }
        const start = Date.now();
        const id = setInterval(() => setChatElapsed(Math.floor((Date.now() - start) / 1000)), 250);
        return () => clearInterval(id);
    }, [chatLoading]);

    const runAi = async (question) => {
        setChatLoading(true);
        setChatAnswer(null);
        // AbortController so user-side cancellation works even if network hangs.
        const ctrl = new AbortController();
        chatAbortRef.current = ctrl;
        // 18s hard ceiling matching backend (12s LLM + 6s slack for DB+network).
        const hardTimeout = setTimeout(() => ctrl.abort(), 18_000);
        try {
            const tok = localStorage.getItem('auth_token') || '';
            const r = await fetch('/api/fn/aiSeatingAssistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ question }),
                signal: ctrl.signal,
            });
            const data = await r.json();
            setChatAnswer(data);
        } catch (e) {
            const aborted = ctrl.signal.aborted;
            setChatAnswer({
                answer: aborted
                    ? '⏱️ ה-AI לא ענה בזמן. נסה שוב או נסח שאלה קצרה יותר.'
                    : 'שגיאה: ' + (e?.message || e),
                actions: [],
            });
        } finally {
            clearTimeout(hardTimeout);
            setChatLoading(false);
            chatAbortRef.current = null;
        }
    };
    const cancelAi = () => {
        chatAbortRef.current?.abort();
    };
    const now = new Date();
    const recs = [];

    // Auto-ask if prefilled
    useEffect(() => {
        if (prefillQuestion && prefillQuestion.trim()) {
            setChatQuestion(prefillQuestion);
            runAi(prefillQuestion);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillQuestion]);

    const askAi = () => {
        if (!chatQuestion.trim()) return;
        runAi(chatQuestion);
    };

    // 1. Tables finishing in next 30 min + queue waiting
    const occupiedFinishingSoon = (reservations || []).filter(r => {
        if (r.status !== 'seated' || !r.reservation_end_time) return false;
        const end = clockToDate(r.reservation_end_time, now); // after-midnight aware
        if (!end) return false;
        const minsLeft = (end.getTime() - now.getTime()) / 60000;
        return minsLeft >= 0 && minsLeft <= 30;
    });
    if (occupiedFinishingSoon.length > 0 && queueEntries.length > 0) {
        const t = occupiedFinishingSoon[0];
        const q = queueEntries.find(qe => qe.party_size <= t.party_size);
        if (q) {
            recs.push({
                icon: '⏰',
                level: 'amber',
                title: `שולחן ${Array.isArray(t.assigned_table) ? t.assigned_table.join(',') : t.assigned_table} מתפנה בקרוב`,
                detail: `אפשר לשבץ את ${q.customer_name} (${q.party_size}) ברגע שיתפנה`,
            });
        }
    }

    // 2. Large party in next 2h needing combined tables
    const upcomingLarge = (reservations || []).filter(r => {
        if (!r.time || r.status !== 'confirmed') return false;
        if (r.party_size < 6) return false;
        const start = clockToDate(r.time, now); // after-midnight aware
        if (!start) return false;
        const mins = (start.getTime() - now.getTime()) / 60000;
        return mins >= 0 && mins <= 120;
    });
    upcomingLarge.forEach(r => {
        const combinableTables = (tables || []).filter(t =>
            Array.isArray(t.combinable_with) && t.combinable_with.length > 0 &&
            (t.max_capacity || 0) + (t.combinable_with[0] ? 2 : 0) >= r.party_size
        );
        if (combinableTables.length > 0) {
            const combo = combinableTables[0];
            const partnerNum = combo.combinable_with[0];
            recs.push({
                icon: '🔗',
                level: 'blue',
                title: `${r.party_size} סועדים מגיעים ב-${r.time}`,
                detail: `שקול חיבור ${combo.table_number} + ${partnerNum} עבור ${r.customer_name}`,
            });
        }
    });

    // 3. Returning customers in queue
    (queueEntries || []).forEach(q => {
        const customer = customers.find(c => c.phone === q.phone);
        if (customer && (customer.total_visits || customer.visit_count || 0) >= 3) {
            recs.push({
                icon: '⭐',
                level: 'violet',
                title: `${q.customer_name} — לקוח חוזר (${customer.total_visits || customer.visit_count} ביקורים)`,
                detail: 'שווה תשומת לב מיוחדת',
            });
        }
    });

    // 4. CONFLICT: seated table overstaying + incoming reservation for same table
    const todayStr = format(now, 'yyyy-MM-dd');
    (reservations || []).forEach(r => {
        if (r.status !== 'seated' || !r.reservation_end_time || !r.assigned_table) return;
        const end = clockToDate(r.reservation_end_time, now); // after-midnight aware
        if (!end) return;
        const minsLate = (now.getTime() - end.getTime()) / 60000;
        if (minsLate < -5) return; // not late yet
        const assigned = Array.isArray(r.assigned_table) ? r.assigned_table : [r.assigned_table];
        const blocker = (reservations || []).find(r2 =>
            r2.id !== r.id &&
            r2.status === 'confirmed' &&
            r2.date === todayStr &&
            r2.assigned_table &&
            (Array.isArray(r2.assigned_table) ? r2.assigned_table : [r2.assigned_table]).some(t => assigned.includes(t)) &&
            r2.time
        );
        if (blocker) {
            const blkStart = clockToDate(blocker.time, now) || now; // after-midnight aware
            const minsTilBlocker = (blkStart.getTime() - now.getTime()) / 60000;
            recs.push({
                icon: '🚨',
                level: 'red',
                title: `שולחן ${assigned.join(',')} ${minsLate > 0 ? `מאחר ${Math.round(minsLate)} דק׳` : 'אמור לסיים'}`,
                detail: `${blocker.customer_name} מגיעים ב-${blocker.time} (בעוד ${Math.max(0, Math.round(minsTilBlocker))} דק׳) — שווה לסיים עכשיו או להעביר לשולחן אחר`,
            });
        } else if (minsLate > 15) {
            recs.push({
                icon: '⏱️',
                level: 'amber',
                title: `שולחן ${assigned.join(',')} מאחר ${Math.round(minsLate)} דק׳`,
                detail: `${r.customer_name} מעבר לזמן, אבל אין הזמנה אחרת על השולחן`,
            });
        }
    });

    // 5. Long wait in queue
    const longWait = (queueEntries || []).find(q => {
        if (!q.timestamp_register) return false;
        const min = (Date.now() - new Date(q.timestamp_register).getTime()) / 60000;
        return min >= 25;
    });
    if (longWait) {
        recs.push({
            icon: '🚨',
            level: 'red',
            title: `${longWait.customer_name} ממתינים ${Math.round((Date.now() - new Date(longWait.timestamp_register).getTime()) / 60000)} דק׳`,
            detail: 'שווה לעדכן או לקרוא להם',
        });
    }

    if (recs.length === 0) {
        recs.push({
            icon: '✨',
            level: 'green',
            title: 'הכל תקין לעת עתה',
            detail: 'אין המלצות דחופות. המשך לעקוב.',
        });
    }

    const levelStyle = {
        amber:  'bg-amber-50 border-amber-300 text-amber-900',
        blue:   'bg-[#F4ECD8] border-[#D9BD83] text-blue-900',
        violet: 'bg-[#F4ECD8] border-[#D9BD83] text-violet-900',
        red:    'bg-red-50 border-red-400 text-red-900',
        green:  'bg-emerald-50 border-emerald-300 text-emerald-900',
    };

    const wrapperCls = inlinePanel
        ? 'h-full bg-gradient-to-b from-[#F4ECD8] to-white border-2 border-indigo-200 rounded-2xl shadow-sm flex flex-col overflow-y-auto'
        : inDrawer
            ? 'bg-gradient-to-b from-[#F4ECD8] to-white max-h-[80vh] overflow-y-auto'
            : 'sticky top-0 z-30 bg-gradient-to-b from-[#F4ECD8] to-white border-2 border-indigo-200 rounded-2xl shadow-sm';

    return (
        <div className={wrapperCls}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-200/50 sticky top-0 bg-[#F4ECD8] z-10">
                <div className="flex items-center gap-1.5">
                    <span className="text-base">✨</span>
                    <span className="text-sm font-black text-[#7A3722]">עוזר AI</span>
                    {recs.length > 0 && (
                        <span className="text-[9px] font-bold bg-[#A04A2E] text-white px-1.5 py-0.5 rounded-full">{recs.length}</span>
                    )}
                </div>
                {onClose ? (
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4"/></button>
                ) : (
                    <button onClick={() => setCollapsed(c => !c)} className="text-xs text-[#A04A2E]">{collapsed ? '▼' : '▲'}</button>
                )}
            </div>
            {!collapsed && (
                <div className="px-2 pb-2 space-y-1.5">
                    {/* Real-time auto recommendations */}
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {recs.map((r, i) => (
                            <div key={i} className={`border rounded-lg p-2 ${levelStyle[r.level] || levelStyle.green}`}>
                                <div className="text-xs font-black flex items-center gap-1">
                                    <span>{r.icon}</span>
                                    <span>{r.title}</span>
                                </div>
                                <div className="text-[10px] mt-0.5 opacity-90">{r.detail}</div>
                            </div>
                        ))}
                    </div>

                    {/* Chat input — ask AI for help with any dilemma */}
                    <div className="pt-1.5 border-t border-indigo-200">
                        <div className="text-[10px] font-bold text-[#7A3722] mb-1">💬 שאל את ה-AI:</div>
                        <div className="flex gap-1">
                            <input
                                value={chatQuestion}
                                onChange={e => setChatQuestion(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) askAi(); }}
                                placeholder='לדוגמה: "איפה לשבת קבוצה של 6?"'
                                disabled={chatLoading}
                                className="flex-1 text-xs border border-[#D9BD83] rounded-lg px-2 py-1 focus:outline-none focus:border-[#A04A2E]"
                            />
                            {chatLoading ? (
                                <button
                                    onClick={cancelAi}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 rounded-lg whitespace-nowrap"
                                    title="בטל"
                                >✕ בטל</button>
                            ) : (
                                <button
                                    onClick={askAi}
                                    disabled={!chatQuestion.trim()}
                                    className="bg-[#A04A2E] hover:bg-[#7A3722] disabled:bg-gray-300 text-white text-xs font-bold px-3 rounded-lg"
                                >שלח</button>
                            )}
                        </div>
                        {chatLoading && (
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#7A3722]">
                                <span className="animate-pulse">🤔 חושב...</span>
                                <span className="font-mono">{chatElapsed}s</span>
                                {chatElapsed >= 10 && <span className="text-amber-600">(טוען לאט — אפשר לבטל)</span>}
                            </div>
                        )}
                        {chatAnswer && (
                            <div className={`mt-1.5 bg-white border border-indigo-200 rounded-lg ${inlinePanel ? 'p-3' : 'p-2'}`}>
                                <div className={`${inlinePanel ? 'text-sm' : 'text-[11px]'} text-gray-800 leading-relaxed`}>{chatAnswer.answer}</div>
                                {Array.isArray(chatAnswer.actions) && chatAnswer.actions.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        {chatAnswer.actions.map((a, i) => (
                                            <div key={i} className="flex items-center justify-between gap-2 bg-[#F4ECD8] border border-indigo-200 rounded-lg p-2">
                                                <div className="text-xs font-bold text-indigo-900 flex-1 min-w-0">
                                                    {a.label}
                                                    {a.table && <span className="block text-[10px] opacity-70">🪑 שולחן {a.table}</span>}
                                                    {a.customer && <span className="block text-[10px] opacity-70">👤 {a.customer}</span>}
                                                </div>
                                                {a.table && (onSeatReservation || onSeatWalkIn) && (
                                                    <button
                                                        onClick={() => openSeatAction(a)}
                                                        className="text-xs font-black px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow whitespace-nowrap"
                                                    >🪑 הושב</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Seat action dialog */}
                        {seatActionFor && (
                            <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={closeSeatAction}>
                                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4" dir="rtl" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="font-black text-base">🪑 הושב על {seatActionFor.tableNums.map(t=>'#'+t).join('+')}</div>
                                        <button onClick={closeSeatAction} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
                                    </div>
                                    {seatMode === 'pick' && (
                                        <div className="space-y-2">
                                            <button onClick={() => setSeatMode('existing')} className="w-full text-right p-3 rounded-lg bg-[#F4ECD8] hover:bg-[#F4ECD8] border border-indigo-200">
                                                <div className="font-bold text-sm">📅 צרף להזמנה קיימת</div>
                                                <div className="text-[11px] text-gray-600">בחר לקוח מתוך ההזמנות של היום</div>
                                            </button>
                                            <button onClick={() => setSeatMode('walkin')} className="w-full text-right p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                                                <div className="font-bold text-sm">🚶 הזמנה חדשה (walk-in)</div>
                                                <div className="text-[11px] text-gray-600">מלא שם ומספר טלפון</div>
                                            </button>
                                        </div>
                                    )}
                                    {seatMode === 'existing' && (
                                        <div className="space-y-2">
                                            <input
                                                value={existingSearch}
                                                onChange={e => setExistingSearch(e.target.value)}
                                                placeholder="🔍 חפש לפי שם או טלפון..."
                                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-[#A04A2E]"
                                                autoFocus
                                            />
                                            <div className="max-h-72 overflow-y-auto space-y-1">
                                                {todayPending.length === 0 ? (
                                                    <div className="text-xs text-gray-500 text-center py-3">אין הזמנות פתוחות תואמות</div>
                                                ) : todayPending.map(r => (
                                                    <button
                                                        key={r.id}
                                                        onClick={() => submitExisting(r.id)}
                                                        className="w-full text-right p-2 rounded border border-gray-200 hover:border-indigo-400 hover:bg-[#F4ECD8]"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div>
                                                                <div className="text-sm font-bold">{r.customer_name || 'ללא שם'}</div>
                                                                <div className="text-[10px] text-gray-500">{r.customer_phone} · 👥{r.party_size}</div>
                                                            </div>
                                                            <div className="text-xs font-black text-[#7A3722]">{r.time?.slice(0,5)}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <button onClick={() => setSeatMode('pick')} className="text-[10px] text-gray-500 underline">← חזרה</button>
                                        </div>
                                    )}
                                    {seatMode === 'walkin' && (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[11px] font-bold text-gray-700">שם מלא:</label>
                                                <input value={walkInName} onChange={e => setWalkInName(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" autoFocus />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-bold text-gray-700">טלפון:</label>
                                                <input value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" inputMode="tel" />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-bold text-gray-700">מס׳ סועדים:</label>
                                                <input type="number" min="1" max="20" value={walkInSize} onChange={e => setWalkInSize(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <button onClick={submitWalkIn} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black py-2 rounded-lg">🪑 הושב</button>
                                                <button onClick={() => setSeatMode('pick')} className="text-[10px] text-gray-500 underline px-2">← חזרה</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick link: settings */}
                    <button
                        onClick={onSwitchToListMode}
                        className="w-full text-[10px] text-[#A04A2E] hover:text-indigo-800 underline text-center pt-1"
                    >🔗 הגדר חיבורי שולחנות (עבור לתצוגת רשימה)</button>
                </div>
            )}
        </div>
    );
}

// === LiveAccordionPanel — combined view: בתור / מגיעים / יושבים / סיימו ====
function LiveAccordionPanel({ reservations, queueEntries, selectedDate, onEditReservation }) {
    const [open, setOpen] = useState({ waiting: true, arriving: true, seated: true, finished: false });
    const todayStr = format(new Date(selectedDate), 'yyyy-MM-dd');
    const now = new Date();
    const todayRes = (reservations || []).filter(r => {
        const d = r.date instanceof Date ? format(r.date, 'yyyy-MM-dd') : String(r.date).slice(0, 10);
        return d === todayStr;
    });
    // Buckets
    const waiting = queueEntries;
    const arriving = todayRes
        .filter(r => r.status === 'confirmed' || r.status === 'pending')
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const seated = todayRes
        .filter(r => r.status === 'seated' || r.status === 'finishing_soon')
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const finished = todayRes
        .filter(r => r.status === 'completed' || r.status === 'cancelled' || r.status === 'no_show')
        .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
        .slice(0, 10);

    const Section = ({ k, title, count, accent, children }) => (
        <div className={`border rounded-xl ${accent}`}>
            <button
                onClick={() => setOpen(p => ({ ...p, [k]: !p[k] }))}
                className="w-full flex items-center justify-between px-3 py-2"
            >
                <div className="flex items-center gap-2 text-sm font-black">
                    {title}
                    <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full">{count}</span>
                </div>
                <span className="text-xs">{open[k] ? '▲' : '▼'}</span>
            </button>
            {open[k] && (
                <div className="px-2 pb-2 space-y-1.5">{children}</div>
            )}
        </div>
    );

    const ResRow = ({ r }) => (
        <button
            onClick={() => onEditReservation?.(r)}
            className="w-full text-right bg-white hover:bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs flex items-center justify-between gap-2"
        >
            <span className="font-bold">{r.time?.slice(0, 5)}</span>
            <span className="font-bold flex-1 truncate text-right">{r.customer_name}</span>
            <span className="text-gray-500">👥{r.party_size}</span>
            {Array.isArray(r.assigned_table) && r.assigned_table.length > 0 && (
                <span className="text-[#A04A2E] font-bold">🪑{r.assigned_table.join(',')}</span>
            )}
        </button>
    );

    return (
        <>
            <Section k="waiting" title="⏳ בתור" count={waiting.length} accent="bg-emerald-50 border-emerald-200">
                {waiting.length === 0 ? <div className="text-[11px] text-gray-400 text-center py-2">אין לקוחות בתור</div>
                    : waiting.map(q => (
                        <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-2 text-xs flex items-center gap-2">
                            <span className="font-bold flex-1 truncate">{q.customer_name}</span>
                            <span>👥{q.party_size}</span>
                        </div>
                    ))}
            </Section>
            <Section k="arriving" title="📅 מגיעים" count={arriving.length} accent="bg-[#F4ECD8] border-[#E8D9B5]">
                {arriving.length === 0 ? <div className="text-[11px] text-gray-400 text-center py-2">אין הזמנות פתוחות</div>
                    : arriving.map(r => <ResRow key={r.id} r={r} />)}
            </Section>
            <Section k="seated" title="🪑 יושבים" count={seated.length} accent="bg-[#F4ECD8] border-rose-200">
                {seated.length === 0 ? <div className="text-[11px] text-gray-400 text-center py-2">אין יושבים כעת</div>
                    : seated.map(r => <ResRow key={r.id} r={r} />)}
            </Section>
            <Section k="finished" title="✓ סיימו" count={finished.length} accent="bg-gray-50 border-gray-200">
                {finished.length === 0 ? <div className="text-[11px] text-gray-400 text-center py-2">אין סיומים היום</div>
                    : finished.map(r => <ResRow key={r.id} r={r} />)}
            </Section>
        </>
    );
}

// === QuickSeatDialog — walk-in / standby / casual quick seat ================
// Rule-based recommendation engine: given a party size, find available tables
// (no active session, no overlapping reservation) and rank by fit.
function QuickSeatDialog({ open, onClose, tables, reservations, activeSessions, onSeat, preselectTable }) {
    const [step, setStep] = useState('intake'); // intake | pick
    const [partySize, setPartySize] = useState(2);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [sourceLabel, setSourceLabel] = useState('walkin'); // walkin | queue | standby
    // Opened from a specific table on the map ("הושב כאן") → that table is already
    // chosen and the party size defaults to what it seats.
    const [selectedTable, setSelectedTable] = useState(preselectTable?.table_number || null);

    if (!open) return null;

    // Build availability map
    const now = new Date();
    // Multi-table sessions stored as 'A,B' or 'A+B' — expand into individual table numbers
    const occupied = occupiedTableSet(activeSessions, reservations, now);
    const todayStr = format(now, 'yyyy-MM-dd');
    const todayReservations = (reservations || []).filter(r => {
        const d = r.date instanceof Date ? format(r.date, 'yyyy-MM-dd') : String(r.date).slice(0,10);
        return d === todayStr && ['confirmed','seated','pending'].includes(r.status);
    });
    const tableHasUpcomingSoon = (tableNum) => {
        const inNext2h = todayReservations.find(r => {
            const assigned = Array.isArray(r.assigned_table) ? r.assigned_table : (r.assigned_table ? [r.assigned_table] : []);
            if (!assigned.includes(tableNum)) return false;
            if (!r.time) return false;
            const [h, m] = r.time.split(':').map(Number);
            const start = new Date(now); start.setHours(h, m||0, 0, 0);
            const diffMin = (start.getTime() - now.getTime()) / 60000;
            return diffMin >= 0 && diffMin <= 120;
        });
        return inNext2h;
    };

    // RULE-BASED RECOMMENDATIONS:
    //   1. min_capacity <= party_size <= max_capacity (exact fit, no over-allocation)
    //   2. Not currently occupied (no active session)
    //   3. No upcoming reservation in the next 2 hours
    //   4. Sort: indoor first, then by capacity ascending (no wasted seats)
    const size = parseInt(partySize) || 0;
    const recommendations = (tables || [])
        .map(t => {
            const occ = occupied.has(t.table_number);
            const conflict = tableHasUpcomingSoon(t.table_number);
            const fits = (t.min_capacity || 1) <= size && size <= (t.max_capacity || 99);
            return { t, occ, conflict, fits };
        })
        .filter(x => x.fits)
        .sort((a, b) => {
            // available > conflict > occupied
            const aScore = (a.occ ? 2 : 0) + (a.conflict ? 1 : 0);
            const bScore = (b.occ ? 2 : 0) + (b.conflict ? 1 : 0);
            if (aScore !== bScore) return aScore - bScore;
            // prefer indoor
            if (a.t.location !== b.t.location) return a.t.location === 'indoor' ? -1 : 1;
            // smallest still-fitting capacity first
            return (a.t.max_capacity || 99) - (b.t.max_capacity || 99);
        });

    const handleConfirm = () => {
        if (!name.trim()) { alert('יש להזין שם'); return; }
        if (!selectedTable) { alert('יש לבחור שולחן'); return; }
        onSeat({ name: name.trim(), phone: phone.trim(), party_size: size, table_number: selectedTable, source_label: sourceLabel });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[55] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900">⚡ הושבה מהירה</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
                </div>

                {/* Source */}
                <div className="flex gap-1.5 flex-wrap">
                    {[
                        { k: 'walkin',  l: '🚶 מזדמן' },
                        { k: 'queue',   l: '📋 מתור' },
                        { k: 'standby', l: '⏳ סטנדבי' },
                    ].map(s => (
                        <button key={s.k} onClick={() => setSourceLabel(s.k)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                                ${sourceLabel === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-300'}`}
                        >{s.l}</button>
                    ))}
                </div>

                {/* Party size chips */}
                <div>
                    <Label className="text-xs font-bold text-gray-600 mb-1 block">כמות סועדים</Label>
                    <div className="flex flex-wrap gap-1">
                        {[1,2,3,4,5,6,8,10,12,15].map(n => (
                            <button key={n} onClick={() => setPartySize(n)}
                                className={`min-w-[42px] h-10 px-3 rounded-xl font-bold text-sm border transition-all
                                    ${partySize === n ? 'bg-[#44512C] text-white border-[#44512C] shadow scale-105'
                                                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}
                            >{n}</button>
                        ))}
                    </div>
                </div>

                {/* Name + phone */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-xs font-bold text-gray-600">שם</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="שם הלקוח" />
                    </div>
                    <div>
                        <Label className="text-xs font-bold text-gray-600">טלפון (אופציונלי)</Label>
                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="050…" dir="ltr" className="text-right" />
                    </div>
                </div>

                {/* Recommendations */}
                <div>
                    <Label className="text-xs font-bold text-gray-600 mb-1 block">
                        🎯 שולחנות מומלצים ({recommendations.length})
                    </Label>
                    {recommendations.length === 0 ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                            ⚠️ אין שולחן מתאים ל-{size} סועדים כרגע. שקול לחבר שני שולחנות, או הוסף לתור.
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
                            {recommendations.slice(0, 18).map(({ t, occ, conflict }) => {
                                const status = occ ? 'תפוס' : conflict ? `הזמנה ב-${conflict.time}` : 'פנוי';
                                const statusColor = occ ? 'text-red-600' : conflict ? 'text-amber-700' : 'text-emerald-700';
                                const tn = t.table_number;
                                const active = selectedTable === tn;
                                const disabled = occ;
                                return (
                                    <button
                                        key={tn}
                                        disabled={disabled}
                                        onClick={() => setSelectedTable(tn)}
                                        className={`p-2 rounded-lg border text-center transition-all
                                            ${active ? 'bg-[#44512C] text-white border-[#44512C] shadow'
                                                : disabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                                : 'bg-white border-gray-200 hover:border-blue-400'}`}
                                    >
                                        <div className="font-black text-base">{tn}</div>
                                        <div className="text-[9px] opacity-70">{t.area}</div>
                                        <div className={`text-[9px] mt-0.5 ${active ? 'opacity-90' : statusColor}`}>{status}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Button
                    onClick={handleConfirm}
                    disabled={!selectedTable || !name.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-black py-3"
                >
                    🪑 הושב בשולחן {selectedTable || '?'}
                </Button>
            </div>
        </div>
    );
}

// Geofence — the restaurant's OWN coordinates (RestaurantProfile.restaurant_lat/lng,
// set on /LocationSettings). These used to be Alena's hardcoded coordinates, so for
// every other tenant EVERY waiting guest was flagged "רחוק" and the signal became
// noise. When a tenant hasn't set a location we simply don't show the flag.
let QUEUE_RESTAURANT_LAT = null;
let QUEUE_RESTAURANT_LNG = null;
const QUEUE_MAX_DISTANCE_M = 100;
export function setQueueGeofenceOrigin(lat, lng) {
  QUEUE_RESTAURANT_LAT = Number.isFinite(Number(lat)) ? Number(lat) : null;
  QUEUE_RESTAURANT_LNG = Number.isFinite(Number(lng)) ? Number(lng) : null;
}
function queueCalcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function queueIsFarAway(entry) {
    if (!entry?.last_location_lat || !entry?.last_location_lng) return false;
    if (QUEUE_RESTAURANT_LAT == null || QUEUE_RESTAURANT_LNG == null) return false; // location not configured → no flag
    return queueCalcDistance(QUEUE_RESTAURANT_LAT, QUEUE_RESTAURANT_LNG, entry.last_location_lat, entry.last_location_lng) > QUEUE_MAX_DISTANCE_M;
}

// === CompactQueueStrip — third tab in big-map rail, walk-ins waiting now ====
function CompactQueueStrip({ queueEntries, abandonedEntries, onSeat, onAbandon, onRestore, onRefresh, onApprove, onReject }) {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const [showAbandoned, setShowAbandoned] = useState(true);
    const [sizeFilter, setSizeFilter] = useState('all');
    const [waitTimeInput, setWaitTimeInput] = useState({}); // {entryId: '15'}
    const now = Date.now();
    // AI seating suggestions per queue entry — keyed by entry.id, on-demand only
    const [aiSuggestions, setAiSuggestions] = useState({}); // {entryId: {loading, answer, actions}}

    const fetchAiSuggestion = async (entry) => {
        setAiSuggestions(prev => ({ ...prev, [entry.id]: { loading: true } }));
        const prefMap = { inside: 'בפנים', outside: 'בחוץ', no_preference: 'ללא העדפת מיקום' };
        const prefText = prefMap[entry.seating_preference] || 'ללא העדפת מיקום';
        const durationText = (entry.table_duration_preference === 'one_hour_only' || entry.table_duration_preference === 'one_hour')
            ? 'מסכימים לשולחן לשעה בלבד'
            : 'צריך שולחן לזמן רגיל (לא מוגבל לשעה)';
        const noteText = entry.customer_notes ? ` הערה: "${entry.customer_notes}"` : '';
        const question = `הגיע ${entry.customer_name || 'לקוח'} לתור עם ${entry.party_size || '?'} סועדים, ${prefText}, ${durationText}.${noteText} איזה שולחן הכי מתאים להושיב אותם עכשיו?`;
        try {
            const tok = localStorage.getItem('auth_token') || '';
            const r = await fetch('/api/fn/aiSeatingAssistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ question }),
            });
            const data = await r.json();
            setAiSuggestions(prev => ({ ...prev, [entry.id]: { loading: false, answer: data.answer, actions: data.actions || [] } }));
        } catch (e) {
            setAiSuggestions(prev => ({ ...prev, [entry.id]: { loading: false, error: String(e?.message || e) } }));
        }
    };

    const toggleTreated = async (entry) => {
        try { await QueueEntry.update(entry.id, { treated: !entry.treated }); onRefresh?.(); } catch {}
    };
    // Ring the customer: set seat_called_at + send push if subscribed
    const callGuest = async (entry) => {
        try {
            await QueueEntry.update(entry.id, { seat_called_at: new Date().toISOString() });
            await base44.functions.sendQueuePush({
                entry_id: entry.id,
                title: '🔔 הגיע תורכם!',
                message: `🔔 ${brandName} קוראת לכם! השולחן שלכם מוכן — יש לכם 3 דקות להגיע למארחת.`,
            }).catch(() => {}); // push is best-effort
            onRefresh?.();
        } catch (e) { console.warn('call guest failed', e); }
    };
    // Check if the guest is nearby — sends a push asking the customer's app to share location
    const checkProximity = async (entry) => {
        try {
            await QueueEntry.update(entry.id, {
                proximity_check_at: new Date().toISOString(),
                proximity_response: 'pending',
            });
            await base44.functions.sendQueuePush({
                entry_id: entry.id,
                title: '📍 בדיקת מיקום',
                message: `${brandName} רוצים לוודא שאתם בסביבה — האם אתם קרובים?`,
            }).catch(() => {});
            onRefresh?.();
        } catch (e) { console.warn('proximity check failed', e); }
    };

    // Distinct party sizes for filter chips
    const sizeCounts = queueEntries.reduce((acc, q) => {
        const k = String(q.party_size || '?');
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    const sizeKeys = Object.keys(sizeCounts).sort((a, b) => Number(a) - Number(b));

    const visibleActive = sizeFilter === 'all'
        ? queueEntries
        : queueEntries.filter(q => String(q.party_size) === sizeFilter);

    return (
        <>
            {/* Sticky header */}
            <div className="sticky top-0 bg-white border-2 border-emerald-200 rounded-2xl p-3 z-10 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">תור פעיל</div>
                        <div className="text-2xl font-black text-gray-900">{queueEntries.length}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500">סה״כ סועדים</div>
                        <div className="text-2xl font-black text-gray-900">
                            {queueEntries.reduce((s, q) => s + (q.party_size || 0), 0)}
                        </div>
                    </div>
                </div>

                {/* Size filter chips */}
                {sizeKeys.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        <button
                            onClick={() => setSizeFilter('all')}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sizeFilter === 'all' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-gray-600 border-gray-200'}`}
                        >הכל ({queueEntries.length})</button>
                        {sizeKeys.map(k => (
                            <button
                                key={k}
                                onClick={() => setSizeFilter(k)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sizeFilter === k ? 'bg-[#A04A2E] text-white border-[#7A3722]' : 'bg-white text-gray-600 border-gray-200'}`}
                            >👥 {k} · {sizeCounts[k]}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Active list */}
            {visibleActive.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
                    <div className="text-3xl mb-1">🚶</div>
                    <div className="text-sm text-gray-500">אין לקוחות בתור</div>
                </div>
            ) : (
                visibleActive.map((q, idx) => {
                    const waitMin = q.timestamp_register
                        ? Math.max(0, Math.floor((now - new Date(q.timestamp_register).getTime()) / 60000))
                        : 0;
                    const waitColor = waitMin >= 25 ? 'bg-red-500 text-white'
                        : waitMin >= 15 ? 'bg-amber-500 text-white'
                        : 'bg-emerald-500 text-white';
                    const phoneClean = (q.phone || '').replace(/\D/g, '');
                    const farAway = queueIsFarAway(q);
                    const proxYes = q.proximity_response === 'yes';
                    const proxNo = q.proximity_response === 'no';
                    const proxPending = q.proximity_response === 'pending';
                    // Border color reflects proximity status
                    const borderColor = proxNo ? 'border-purple-400 bg-[#F4ECD8]'
                        : proxYes ? 'border-emerald-400 bg-emerald-50'
                        : farAway ? 'border-red-400 bg-red-50'
                        : idx === 0 ? 'border-[#D9BD83] bg-[#F4ECD8]/40'
                        : 'border-gray-200 bg-white';
                    return (
                        <div key={q.id} className={`border-2 rounded-xl p-3 shadow-sm ${borderColor}`}>
                            {/* TOP ROW: position number badge + wait time pill */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`w-7 h-7 rounded-xl text-white flex items-center justify-center font-black text-sm
                                        ${idx === 0 ? 'bg-gradient-to-br from-[#44512C] to-[#A04A2E]' : 'bg-[#44512C]'}`}>
                                        {idx + 1}
                                    </span>
                                    {q.treated && <span title="טופל">🎁</span>}
                                    {proxYes && <span title="כן באזור">🟢</span>}
                                    {proxPending && !proxNo && !proxYes && <span title="ממתין לתגובה" className="animate-pulse">🟡</span>}
                                    {proxNo && <span title="לא באזור">🟣</span>}
                                    {farAway && !proxNo && !proxYes && <span title="רחוק">📍❌</span>}
                                </div>
                                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${waitColor}`}>
                                    {waitMin} דק׳
                                </span>
                            </div>

                            {/* NAME ROW: party | name */}
                            <div className="mt-1.5 flex items-center gap-2">
                                <span className="text-2xl font-black text-gray-800">{q.party_size}</span>
                                <span className="w-px h-7 bg-gray-300"></span>
                                <div className="font-bold text-base text-gray-900 truncate flex-1">{q.customer_name}</div>
                            </div>

                            {/* PHONE — displayed prominently as clickable tel: link */}
                            {phoneClean && (
                                <a
                                    href={`tel:${phoneClean}`}
                                    className="mt-1 block text-sm font-bold text-[#A04A2E] hover:text-rose-700 underline"
                                    dir="ltr"
                                >📞 {q.phone}</a>
                            )}

                            {/* PENDING — needs approval first. Inline אשר/דחה. */}
                            {q.status === 'pending' && (
                                <div className="mt-2 bg-amber-50 border-2 border-amber-300 rounded-lg p-2">
                                    <div className="text-[10px] font-bold text-amber-900 mb-1.5">⏳ ממתין לאישור</div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <span className="text-[10px] font-bold text-amber-800">⏱️ צפי:</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="180"
                                            placeholder="ריק = ללא"
                                            value={waitTimeInput[q.id] || ''}
                                            onChange={e => setWaitTimeInput(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            className="w-16 text-center text-xs font-bold border border-amber-300 rounded px-1 py-0.5"
                                        />
                                        <span className="text-[10px] font-bold text-amber-800">דק׳</span>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => onApprove(q.id, waitTimeInput[q.id])}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded"
                                        >✅ אשר</button>
                                        <button
                                            onClick={() => onReject(q.id)}
                                            className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1.5 rounded"
                                        >❌ דחה</button>
                                    </div>
                                </div>
                            )}

                            {/* SEATING PREFERENCE */}
                            <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px]">
                                {q.seating_preference === 'inside' && <span className="bg-[#F4ECD8] text-[#44512C] px-1.5 py-0.5 rounded-full font-bold">🏠 בפנים</span>}
                                {q.seating_preference === 'outside' && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">🌳 בחוץ</span>}
                                {(!q.seating_preference || q.seating_preference === 'no_preference') && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">🤷 לא משנה</span>}
                                {(q.table_duration_preference === 'one_hour_only' || q.table_duration_preference === 'one_hour')
                                    ? <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full font-bold border border-orange-300">✅ שולחן לשעה</span>
                                    : <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">❌ צריך יותר</span>}
                            </div>

                            {q.customer_notes && (
                                <div className="mt-1 bg-[#FAF5E8] border border-yellow-200 rounded px-1.5 py-1 text-[10px] text-yellow-900">
                                    💬 {q.customer_notes}
                                </div>
                            )}

                            {/* AI seating suggestion — on-demand. Click button to fetch. */}
                            {!aiSuggestions[q.id] ? (
                                <button
                                    onClick={() => fetchAiSuggestion(q)}
                                    className="mt-2 w-full text-xs font-bold py-2 rounded-lg bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] text-white shadow hover:scale-[1.02] transition-transform flex items-center justify-center gap-1"
                                >✨ קבל הצעת AI להושבה</button>
                            ) : (
                                <div className="mt-2 bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border border-indigo-200 rounded-lg p-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1 text-[10px] font-black text-[#7A3722]">
                                            <span>✨</span><span>הצעת AI להושבה:</span>
                                        </div>
                                        {!aiSuggestions[q.id].loading && (
                                            <button
                                                onClick={() => fetchAiSuggestion(q)}
                                                title="חשב שוב"
                                                className="text-[10px] text-[#A04A2E] hover:text-indigo-900"
                                            >🔄</button>
                                        )}
                                    </div>
                                    {aiSuggestions[q.id].loading ? (
                                        <div className="text-[11px] text-[#A04A2E] animate-pulse">חושב...</div>
                                    ) : aiSuggestions[q.id].error ? (
                                        <div className="text-[11px] text-amber-700">לא הצלחתי לקבל הצעה — נסה ידני</div>
                                    ) : (
                                        <>
                                            <div className="text-[11px] text-gray-800 leading-snug mb-1.5">{aiSuggestions[q.id].answer}</div>
                                            {Array.isArray(aiSuggestions[q.id].actions) && aiSuggestions[q.id].actions.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {aiSuggestions[q.id].actions.map((a, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={async () => {
                                                                const tables = String(a.table || '').split(/[,+\s]+/).map(s => s.trim()).filter(Boolean);
                                                                if (!tables.length) return;
                                                                try {
                                                                    // Mark queue as seated by setting timestamp_seated + status='seated'
                                                                    await QueueEntry.update(q.id, {
                                                                        status: 'seated',
                                                                        timestamp_seated: new Date().toISOString(),
                                                                    });
                                                                    // Create TableSession for the walk-in
                                                                    await TableSession.create({
                                                                        // Multi-table support: join as "200,201" so map highlights both
                                                                        table_number: tables.join(','),
                                                                        party_size: q.party_size,
                                                                        customer_name: q.customer_name,
                                                                        customer_phone: q.customer_phone || '',
                                                                        session_start: new Date().toISOString(),
                                                                        status: 'active',
                                                                        waiter_name: 'מנהל',
                                                                        waiter_id: 'manager_seated',
                                                                        table_style: 'couple',
                                                                    });
                                                                    onRefresh?.();
                                                                } catch (e) { alert('שגיאה בהושבה: ' + (e?.message || e)); }
                                                            }}
                                                            className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                                                        >🪑 {a.label || `הושב על ${a.table}`}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* TABLE PICKER — only when status='active' (after approval) */}
                            {q.status === 'active' && (
                                <div className="mt-2">
                                    <TablePicker entry={q} onSave={onRefresh} />
                                </div>
                            )}

                            {/* PRIMARY ACTION — only for active. Pending uses approve/reject above. */}
                            {q.status === 'active' && (
                                <button
                                    onClick={() => onSeat(q)}
                                    className="mt-1 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1"
                                >🪑 הושב · בחר שולחן במפה</button>
                            )}

                            {/* SECONDARY ACTIONS row */}
                            <div className="mt-1.5 flex items-center justify-between gap-1">
                                <button
                                    onClick={() => callGuest(q)}
                                    title="קרא לאורח (פוש)"
                                    className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 flex items-center justify-center"
                                >🔔</button>
                                <button
                                    onClick={() => checkProximity(q)}
                                    title="בדוק אם בסביבה"
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                        proxYes ? 'bg-emerald-200' : proxNo ? 'bg-purple-200' : proxPending ? 'bg-yellow-200 animate-pulse' : 'bg-[#F4ECD8] hover:bg-[#E8D9B5]'
                                    }`}
                                >📍</button>
                                <button
                                    onClick={() => toggleTreated(q)}
                                    title={q.treated ? 'בטל סימון פינוק' : 'סמן כפינוק (🎁)'}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${q.treated ? 'bg-pink-200' : 'bg-gray-100 hover:bg-[#F4ECD8]'}`}
                                >🎁</button>
                                <a
                                    href={`/QueueDashboard`}
                                    target="_blank"
                                    title="היסטוריה / בונוס מטבעות (לוח תור מלא)"
                                    className="w-8 h-8 rounded-lg bg-[#F4ECD8] hover:bg-purple-200 text-[#7A3722] flex items-center justify-center text-sm"
                                >🕓</a>
                                <button
                                    onClick={() => onAbandon(q)}
                                    title="סמן כנטוש"
                                    className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center"
                                >❌</button>
                            </div>
                        </div>
                    );
                })
            )}

            {/* Link to full dashboard for advanced features */}
            <a
                href="/QueueDashboard"
                target="_blank"
                className="text-[11px] text-[#A04A2E] hover:text-indigo-800 underline mt-2 inline-block"
            >פתח לוח תור מלא ↗ (גרירה, בדיקת אזור, מטבעות)</a>

            {/* Recently abandoned section (collapsible) */}
            {abandonedEntries.length > 0 && (
                <div className="mt-3">
                    <button
                        onClick={() => setShowAbandoned(v => !v)}
                        className="w-full text-right text-xs font-bold text-rose-700 bg-[#F4ECD8] hover:bg-rose-100 border border-rose-200 rounded-lg px-3 py-2 flex items-center justify-between"
                    >
                        <span>{showAbandoned ? '▲' : '▼'}</span>
                        <span>נטשו לאחרונה ({abandonedEntries.length})</span>
                    </button>
                    {showAbandoned && (
                        <div className="mt-2 space-y-2">
                            {abandonedEntries.map(q => {
                                const waitMin = q.timestamp_register
                                    ? Math.max(0, Math.floor((now - new Date(q.timestamp_register).getTime()) / 60000))
                                    : 0;
                                return (
                                    <div key={q.id} className="bg-[#F4ECD8] border border-rose-200 rounded-xl p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-black">{q.party_size}</span>
                                            <span className="w-px h-5 bg-rose-200"></span>
                                            <div className="font-bold text-sm flex-1 truncate">{q.customer_name}</div>
                                        </div>
                                        {q.phone && (
                                            <a href={`tel:${q.phone.replace(/\D/g, '')}`} className="text-[11px] text-[#A04A2E]" dir="ltr">
                                                {q.phone}
                                            </a>
                                        )}
                                        <div className="text-[10px] text-gray-500 mt-0.5">לפני {waitMin} דק׳</div>
                                        <button
                                            onClick={() => onRestore(q)}
                                            className="mt-2 w-full bg-[#44512C] hover:bg-[#44512C] text-white text-xs font-bold py-1.5 rounded"
                                        >↩ החזר לתור</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

// === LiveStat — compact KPI tile for the top status bar ====================
function LiveStat({ icon, label, value, sub, accent = 'slate', pulse = false }) {
    const colorMap = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        blue:    'border-[#E8D9B5] bg-[#F4ECD8] text-blue-900',
        amber:   'border-amber-200 bg-amber-50 text-amber-900',
        violet:  'border-violet-200 bg-[#F4ECD8] text-violet-900',
        slate:   'border-slate-200 bg-slate-50 text-slate-900',
    };
    return (
        <div className={`border rounded-xl p-2 md:p-3 ${colorMap[accent] || colorMap.slate} ${pulse ? 'animate-pulse' : ''}`}>
            <div className="flex items-center justify-between">
                <span className="text-xl md:text-2xl">{icon}</span>
                <span className="text-2xl md:text-3xl font-black tabular-nums">{value}</span>
            </div>
            <div className="text-[10px] md:text-xs font-bold opacity-80 mt-1 leading-tight">{label}</div>
            {sub && <div className="text-[10px] opacity-60 leading-tight">{sub}</div>}
        </div>
    );
}