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
import TablePicker from '@/components/dashboard/TablePicker';
import { base44 } from '@/api/base44Client';
import VoiceControl from '@/components/voice/VoiceControl';

// Dialog לעריכת הזמנה - עם כל הפרטים
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
                            <Input 
                                type="time" 
                                value={editedReservation.time || ''} 
                                onChange={e => setEditedReservation({...editedReservation, time: e.target.value})} 
                                className="h-8"
                            />
                        </div>

                        <div className="text-right">
                            <span>זמן סיום</span>
                        </div>
                        <div className="text-left">
                            <Input
                                type="time"
                                value={editedReservation.reservation_end_time || ''}
                                onChange={e => setEditedReservation({...editedReservation, reservation_end_time: e.target.value})}
                                className="h-8"
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
                            <div className="bg-green-100 border border-green-300 p-2 rounded">💳</div>
                            <div className="bg-green-100 border border-green-300 p-2 rounded">🎁</div>
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
    const [isSmartMapMode, setIsSmartMapMode] = useState(false); // AI overlay state (Phase 4)
    const [quickSeatOpen, setQuickSeatOpen] = useState(false); // walk-in / standby quick-seat flow
    const [smartReserveOpen, setSmartReserveOpen] = useState(false); // smart-recommended reservation dialog
    const [clockTick, setClockTick] = useState(() => new Date());
    const [aiOpen, setAiOpen] = useState(false); // floating AI assistant widget
    const [aiPrefillQuestion, setAiPrefillQuestion] = useState(''); // when a per-reservation ✨ button is clicked
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);  // slide-up reservations dashboard on mobile
    const [bigMapMode, setBigMapMode] = useState(false);  // hostess fullscreen workflow — map + compact tonight strip
    const [dashboardDrawerOpen, setDashboardDrawerOpen] = useState(false);  // overlay slide-in of full dashboard
    const [smartBookerOpen, setSmartBookerOpen] = useState(false);  // collapsible "+ הזמנה חדשה" panel
    const [mobileView, setMobileView] = useState('reservations');  // 'reservations' | 'map' — tab switcher on mobile
    const [queueEntries, setQueueEntries] = useState([]);        // live restaurant queue (walk-ins waiting)
    const [railTab, setRailTab] = useState('tonight');           // 'tonight' | 'full' | 'queue'
    const [queueNewBanner, setQueueNewBanner] = useState(null);   // {id, name, party_size} popup data
    const pageLoadTimeRef = useRef(Date.now());                  // any entry registered AFTER this is "new"
    const seenQueueIdsRef = useRef(new Set());                   // ids we've already shown the banner for
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
        setIsLoading(true);
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

    const loadLiveData = useCallback(async () => {
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const [sessions, dateReservations, allCustomers] = await Promise.all([
                TableSession.filter({ status: 'active' }),
                Reservation.filter({ date: dateString }, 'time'),
                Customer.list()
            ]);
            const newSessions = sessions || [];
            const newRes = (dateReservations || []).map(r => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date }));
            const newCustomers = allCustomers || [];
            // Only setState when something actually changed — preserves scroll position,
            // popovers, and prevents unnecessary card re-renders during 60s polls.
            setActiveSessions(prev => fingerprintSessions(prev) === fingerprintSessions(newSessions) ? prev : newSessions);
            setReservations(prev => fingerprintReservations(prev) === fingerprintReservations(newRes) ? prev : newRes);
            setCustomers(prev => fingerprintCustomers(prev) === fingerprintCustomers(newCustomers) ? prev : newCustomers);
        } catch (error) {
            console.error('Error loading live data:', error);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadLayout();
    }, [loadLayout]);

    useEffect(() => {
        const interval = setInterval(loadLiveData, 60000);
        return () => clearInterval(interval);
    }, [loadLiveData]);

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
        const id = setInterval(loadQueue, 15000);
        return () => clearInterval(id);
    }, [loadQueue]);

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
            const created = await Reservation.create({
                customer_name: entry.customer_name,
                customer_phone: entry.phone,
                date: dateStr,
                time,
                party_size: entry.party_size,
                status: 'seated',
                special_requests: cleanNotes || null,
                source: 'queue',
                ...(preTables ? { assigned_table: preTables } : {}),
            });
            await QueueEntry.update(entry.id, {
                treated: true,
                status: 'seated',
                timestamp_seated: new Date().toISOString(),
            });
            await loadQueue();
            await loadLayout();
            // Only enter map-assigning mode if no pre-picked table
            if (!preTables) {
                setAssigningTable({ reservationId: created.id });
            }
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

    const getActiveTime = (session) => {
        if (!session || !session.session_start) return '';
        const activeMinutes = Math.round((new Date() - new Date(session.session_start)) / 60000);
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
                    layout_name: "מפה ראשית - עלינא", tables: allTables, facilities: defaultFacilities,
                });
                // Best-effort cleanup of any leftover duplicates
                for (let i = 1; i < existing.length; i++) {
                    await SeatingLayout.delete(existing[i].id).catch(() => {});
                }
            } else {
                await SeatingLayout.create({ layout_name: "מפה ראשית - עלינא", tables: allTables, facilities: defaultFacilities });
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

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            const layoutData = {
                layout_name: layout?.layout_name || "מפה ראשית - עלינא",
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
            const session = getTableSession(tableNumber);
            
            if (newStatus === 'available' && session) {
                await TableSession.update(session.id, { 
                    status: 'completed', 
                    session_end: new Date().toISOString() 
                });
                setTableDetailsOpen(false);
            } else if (newStatus === 'cleaning' && session) {
                await TableSession.update(session.id, { 
                    status: 'to_be_cleaned', 
                    session_end: new Date().toISOString() 
                });
                setTableDetailsOpen(false);
            }
            
            loadLayout();
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
                    const occupied = new Set(activeSessions.flatMap(s => String(s.table_number || '').split(/[,+]/).map(p => p.trim())));
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
                            message: '🔔 עלינא קוראת לכם! השולחן שלכם מוכן.',
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

    const ReservationsDashboard = () => {
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
        
        try {
            await TableSession.update(session.id, { 
                status: 'completed',
                session_end: new Date().toISOString() 
            });
            setTableDetailsOpen(false);
            loadLayout();
            alert(`שולחן ${tableNumber} שוחרר בהצלחה`);
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
                notes: (session.notes ? session.notes + ' | ' : '') + `הועבר משולחן ${fromTable} בשעה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit'})}`
            });
            setTableDetailsOpen(false);
            loadLayout();
            alert(`הפגישה הועברה משולחן ${fromTable} לשולחן ${toTable} בהצלחה`);
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
                    notes: (session.notes ? session.notes + ' | ' : '') + `הועבר משולחן ${table.table_number} בשעה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit'})}`
                });
                setTableDetailsOpen(false);
                loadLayout();
                alert(`הפגישה הועברה משולחן ${table.table_number} לשולחן ${targetTable} בהצלחה`);
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
                            <p className="text-gray-500">אין פעילות כרגע בשולחן זה</p>
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
        alert(`בחר שולחן להחלפה עם שולחן ${tableNumber}`);
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
                (r.status === 'confirmed' || r.status === 'pending')
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
            alert(`שולחנות ${fromTable} ו-${toTable} הוחלפו בהצלחה!`);
        } catch (error) {
            console.error("Error swapping tables:", error);
            alert("שגיאה בהחלפת שולחנות.");
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
        alert(`בחר שולחנות להזמנה של ${resToAssign.customer_name}. לחץ על שולחנות במפה. לחץ שוב כדי לבטל בחירה.`);
    };

    const saveMultiTableAssignment = async () => {
        if (!multiAssignReservationId) return;
    
        try {
            await Reservation.update(multiAssignReservationId, { assigned_table: selectedTablesForReservation });
            alert(`הזמנה שויכה לשולחנות: ${selectedTablesForReservation.join(', ')}`);
            cancelMultiTableAssignment();
            loadLayout();
        } catch (error) {
            console.error('Error saving multi-table assignment:', error);
            alert('שגיאה בשמירת שיוך השולחנות המרובה.');
        }
    };
    
    const cancelMultiTableAssignment = () => {
        setIsSelectingTables(false);
        setSelectedTablesForReservation([]);
        setMultiAssignReservationId(null);
        alert('שיוך שולחנות מרובה בוטל.');
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

            if (isReallyOccupied) {
                const occupantName = activeSession ? (activeSession.customer_name || 'לקוח') : (seatedReservation?.customer_name || 'לקוח');
                alert(`🚫 שולחן ${tableNumber} תפוס כעת על ידי ${occupantName}, לא ניתן לבחור אותו.`);
                return;
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
                alert('ההזמנה לא נמצאה.');
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
                const occupantName = activeSession ? (activeSession.customer_name || 'לקוח') : (seatedReservation?.customer_name || 'לקוח');
                alert(`🚫 שולחן ${table.table_number} תפוס כעת על ידי ${occupantName}, לא ניתן לשייך אליו הזמנה.`);
                setAssigningTable(null);
                return;
            }

            const conflictingReservation = reservations.find(r => 
                r.id !== resToAssign.id &&
                Array.isArray(r.assigned_table) && r.assigned_table.includes(table.table_number) &&
                r.date === resToAssign.date &&
                r.time === resToAssign.time &&
                (r.status === 'confirmed' || r.status === 'seated' || r.status === 'pending')
            );

            if (conflictingReservation) {
                if (confirm(`⚠️ קונפליקט! שולחן ${table.table_number} כבר משויך להזמנה של ${conflictingReservation.customer_name} באותה שעה. האם ברצונך להעביר את ההזמנה של ${conflictingReservation.customer_name} למצב "לא משויך" ולהושיב את ${resToAssign.customer_name} במקומה?`)) {
                    await Reservation.update(conflictingReservation.id, { assigned_table: [] });
                } else {
                    setAssigningTable(null);
                    return;
                }
            }
            
            await Reservation.update(assigningTable.reservationId, { assigned_table: [table.table_number] });
            alert(`✅ הזמנה עבור ${resToAssign.customer_name} שויכה לשולחן ${table.table_number}`);
            setAssigningTable(null);
            loadLayout();
        } else {
            showTableDetails(table);
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
            loadLayout();
        }
    };

    // ─── LIVE STATUS computed from current state ────────────────────────────
    // Tables actively seated, guests inside now, and reservations arriving in
    // the next 60 / 240 minutes. The hostess sees this AT A GLANCE.
    const liveStats = (() => {
        const now = new Date();
        const occupiedTables = activeSessions.length;
        const guestsInside = activeSessions.reduce((s, sess) => s + (sess.party_size || 0), 0);
        let arriving1h = 0, arriving4h = 0, guestsArriving1h = 0;
        for (const r of (reservations || [])) {
            if (!r.time) continue;
            if (r.status === 'cancelled' || r.status === 'no_show' || r.status === 'seated') continue;
            const [h, m] = String(r.time).split(':').map(Number);
            const resAt = new Date(now); resAt.setHours(h, m || 0, 0, 0);
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
                : 'p-3 md:p-6 bg-gray-50 min-h-screen'
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

            {/* Floating exit button — only in fullscreen big-map mode */}
            {bigMapMode && (
                <button
                    onClick={() => setBigMapMode(false)}
                    className="fixed top-3 left-3 z-[55] bg-zinc-900 hover:bg-zinc-800 text-white rounded-full pl-3 pr-4 py-2 shadow-2xl flex items-center gap-1.5 text-sm font-bold"
                >
                    <X className="w-4 h-4" />
                    סגור מצב מסך מלא
                </button>
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
            {swapping && (
                <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-black p-2 text-center z-50 font-bold">
                    מצב החלפה: בחר שולחן להחלפה עם שולחן {swapping.from}. <Button variant="ghost" size="sm" onClick={() => setSwapping(null)}>בטל</Button>
                </div>
            )}
            {assigningTable && (
                 <div className="fixed top-0 left-0 right-0 bg-blue-400 text-white p-2 text-center z-50 font-bold">
                    מצב שיוך: בחר שולחן מהמפה לשייך להזמנה. <Button variant="ghost" size="sm" onClick={() => setAssigningTable(null)}>בטל</Button>
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
                                        className={`hidden lg:flex ${bigMapMode ? 'bg-[#A04A2E] hover:bg-[#7A3722] text-white' : ''}`}
                                    >
                                        <Maximize2 className="w-4 h-4 ml-1" />
                                        {bigMapMode ? 'צא ממפה גדולה' : 'מפה גדולה'}
                                    </Button>
                                )}
                                <Button variant={viewMode === 'list' ? 'secondary' : 'outline'} size="icon" className="h-9 w-9" onClick={() => { setViewMode('list'); setBigMapMode(false); }}><Edit className="w-4 h-4"/></Button>
                                <Button variant={viewMode === 'map' ? 'secondary' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setViewMode('map')}><Eye className="w-4 h-4"/></Button>
                                <Button onClick={handleSaveLayout} disabled={isSaving} size="sm">
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span className="hidden sm:inline mr-1">שמור</span>
                                </Button>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(window.location.origin + '/PublicReservationSettings', '_blank')}
                                className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 text-xs"
                            >
                                <Settings className="w-3 h-3 ml-1" />
                                הגדרות הזמנות
                            </Button>
                            <Button variant="outline" size="sm" onClick={createAllTables} className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100 text-xs">
                                <Wand2 className="w-3 h-3 ml-1" />
                                איפוס מפה
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                )}
                <CardContent className={bigMapMode ? 'p-0' : ''}>
                    {tables.length === 0 && facilities.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="mb-4">לא נמצאו שולחנות או אלמנטים. האם ברצונך לטעון את כל 41 השולחנות של עלינא ואלמנטים בסיסיים?</p>
                            <Button onClick={createAllTables} className="bg-green-600 hover:bg-green-700">
                                     <Wand2 className="w-4 h-4 ml-2" /> 
                                     כן, טען את כל השולחנות ואלמנטים (41 שולחנות)
                                 </Button>
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
                                        // direction: 'up' (lower priority number = higher rank) or 'down'
                                        setCombos(prev => {
                                            const target = prev.find(c => c.id === comboId);
                                            if (!target) return prev;
                                            const sameSize = prev
                                                .filter(c => Number(c.party_size) === Number(target.party_size))
                                                .sort((a, b) => (a.priority || 999) - (b.priority || 999));
                                            const idx = sameSize.findIndex(c => c.id === comboId);
                                            const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
                                            if (swapIdx < 0 || swapIdx >= sameSize.length) return prev;
                                            const a = sameSize[idx], b = sameSize[swapIdx];
                                            return prev.map(c => {
                                                if (c.id === a.id) return { ...c, priority: b.priority || (swapIdx + 1) };
                                                if (c.id === b.id) return { ...c, priority: a.priority || (idx + 1) };
                                                return c;
                                            });
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
                                    <ReservationTool onReservationCreated={loadLayout} />
                                </div>
                                )}

                                {/* Right rail — only in big-map mode. Toggles between compact
                                    'tonight' strip and the full ReservationsDashboard inline (no overlay). */}
                                {bigMapMode && (
                                <div className="hidden lg:flex flex-col gap-2 lg:order-1 overflow-y-auto pl-1" style={{ maxHeight: 'calc(100vh - 110px)' }}>
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
                                                        await loadLayout();
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
                                                        await loadLayout();
                                                    } catch (e) { alert('שגיאה בהושבה: ' + (e?.message || e)); }
                                                }}
                                                onSwitchToListMode={() => { setViewMode('list'); setBigMapMode(false); }}
                                                inlinePanel
                                            />
                                        </div>
                                    )}

                                    {/* Date picker — always visible in big-map mode so hostess can switch days fast */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center justify-between">
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
                                            size="sm"
                                            className="text-xs bg-emerald-600 hover:bg-emerald-700"
                                            onClick={() => setSmartBookerOpen(v => !v)}
                                        >
                                            <Plus className="w-3.5 h-3.5 ml-1" />
                                            הזמנה חדשה
                                        </Button>
                                    </div>

                                    {/* Collapsible Smart Booker */}
                                    {smartBookerOpen && (
                                        <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg p-2">
                                            <ReservationTool onReservationCreated={() => { loadLayout(); setSmartBookerOpen(false); }} />
                                        </div>
                                    )}

                                    {railTab === 'full' && <ReservationsDashboard />}
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
                                        </div>

                                        {/* Divider */}
                                        <div className="hidden md:block h-7 w-px bg-gray-200" />

                                        {/* Section 2 — Area filter (scrollable on overflow) */}
                                        <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto whitespace-nowrap py-0.5">
                                            {[
                                                { key: 'all', label: 'הכל' },
                                                { key: 'אזור חום', label: 'אזור חום' },
                                                { key: 'כניסה', label: 'כניסה' },
                                                { key: 'אדום מרוכזי', label: 'אדום מרוכזי' },
                                                { key: 'זוהרה', label: 'זוהרה' },
                                                { key: 'מספרה', label: 'מספרה' },
                                                { key: 'גבטה', label: 'גבטה' },
                                                { key: 'ורוד', label: 'ורוד' },
                                            ].map(area => {
                                                const active = selectedAreas.includes(area.key);
                                                return (
                                                    <button
                                                        key={area.key}
                                                        onClick={() => toggleArea(area.key)}
                                                        className={`px-2.5 h-8 rounded-lg text-xs font-bold transition-colors shrink-0
                                                            ${active
                                                                ? 'bg-slate-900 text-white shadow-sm'
                                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                                    >{area.label}</button>
                                                );
                                            })}
                                        </div>

                                        {/* Divider */}
                                        <div className="hidden md:block h-7 w-px bg-gray-200" />

                                        {/* Section 3 — Tools + view links + clock */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => window.open(window.location.origin + '/PublicReservation', '_blank')}
                                                className="bg-[#F4ECD8] border-[#E8D9B5] text-[#44512C] hover:bg-[#F4ECD8] hidden md:flex h-9"
                                            >
                                                <Eye className="w-3.5 h-3.5 ml-1" />
                                                <span className="text-xs">הזמנות</span>
                                            </Button>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="h-9">
                                                    <Wrench className="w-3.5 h-3.5 ml-1" />
                                                    <span className="text-xs">כלים</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-60" dir="rtl">
                                                <div className="space-y-4 p-4">
                                                    <h4 className="font-bold">הוסף אלמנטים</h4>
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
                                            </PopoverContent>
                                        </Popover>
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
                                            ...(showBlueprint ? {
                                                backgroundImage: `url('https://media.base44.com/images/public/68ac71d972dff18b98e30a21/5fc81039d_WhatsAppImage2026-04-10at145322.jpg')`,
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
                                            const ZONE_STYLES = {
                                                'אזור חום':     { bg: 'rgba(217,178,138,0.25)', label: '#7c5e3a', name: 'אזור חום' },
                                                'כניסה':         { bg: 'rgba(167,243,208,0.35)', label: '#065f46', name: 'כניסה' },
                                                'אדום מרוכזי':   { bg: 'rgba(254,205,211,0.35)', label: '#9f1239', name: 'אזור אדום מרכזי' },
                                                'זוהרה':         { bg: 'rgba(167,139,250,0.20)', label: '#5b21b6', name: 'זוהרה' },
                                                'מספרה':         { bg: 'rgba(250,204,21,0.20)', label: '#92400e', name: 'מספרה' },
                                                'גבטה':          { bg: 'rgba(165,180,252,0.30)', label: '#1e3a8a', name: 'גבטה' },
                                                'ורוד':          { bg: 'rgba(251,207,232,0.35)', label: '#9d174d', name: 'אזור ורוד' },
                                            };
                                            const byArea = {};
                                            tables.forEach(t => {
                                                if (!t.area || !ZONE_STYLES[t.area]) return;
                                                if (!byArea[t.area]) byArea[t.area] = [];
                                                byArea[t.area].push(t);
                                            });
                                            const PADDING = 24;
                                            return Object.entries(byArea).map(([area, ts]) => {
                                                const zone = ZONE_STYLES[area];
                                                const minX = Math.min(...ts.map(t => t.x || 0)) - PADDING;
                                                const minY = Math.min(...ts.map(t => t.y || 0)) - PADDING;
                                                const maxX = Math.max(...ts.map(t => (t.x || 0) + (t.width || 80))) + PADDING;
                                                const maxY = Math.max(...ts.map(t => (t.y || 0) + (t.height || 80))) + PADDING + 18;
                                                return (
                                                    <div
                                                        key={area}
                                                        style={{
                                                            position: 'absolute',
                                                            left: minX, top: minY,
                                                            width: maxX - minX, height: maxY - minY,
                                                            background: zone.bg,
                                                            borderRadius: 16,
                                                            border: `1px dashed ${zone.label}30`,
                                                            pointerEvents: 'none',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                bottom: 4, right: 12,
                                                                fontSize: 12,
                                                                fontWeight: 800,
                                                                color: zone.label,
                                                                letterSpacing: '0.02em',
                                                                opacity: 0.75,
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
                                                </div>
                                            );
                                        })}

                                    {tables.filter(t => selectedAreas.includes('all') || selectedAreas.includes(t.area)).map((table) => {
                                       const session = getTableSession(table.table_number);
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
                                            
                                            return reservationDate >= today;
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
                                        if (seatedReservation?.time && computedEndTime) {
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

                                        // Upcoming reservation TODAY → "Reserved" state (soft yellow)
                                        const upcomingToday = !isReallyOccupied && futureReservationsForTable.find(r => r.date === currentDate);

                                        // 3 primary states + 2 derived: Available / Reserved / Seated / FinishingSoon / Overtime
                                        if (isFinishingSoon) {
                                            tableColorClass = 'bg-amber-200 border-amber-500 text-amber-900 animate-pulse';
                                        } else if (isOvertime) {
                                            tableColorClass = 'bg-[#A04A2E] border-rose-700 text-white';
                                        } else if (isReallyOccupied) {
                                            // SEATED — pastel pink/red
                                            tableColorClass = 'bg-rose-100 border-rose-400 text-rose-900';
                                        } else if (upcomingToday) {
                                            // RESERVED — pastel yellow
                                            tableColorClass = 'bg-[#FAF5E8] border-yellow-400 text-yellow-900';
                                        } else {
                                            // AVAILABLE — clean white w/ soft green border (indoor) or soft amber (outdoor)
                                            tableColorClass = table.location === 'indoor'
                                                ? 'bg-white border-emerald-300 text-emerald-900'
                                                : 'bg-stone-50 border-amber-400 text-amber-900';
                                        }
                                        // Smart-map mode: dim non-recommended (placeholder — no recommendations yet)
                                        if (isSmartMapMode) {
                                            tableColorClass += ' opacity-40';
                                        }

                                        if (isSelectingTables && selectedTablesForReservation.includes(table.table_number)) {
                                            tableColorClass += ' ring-4 ring-purple-500 ring-offset-2';
                                        }

                                        const isBlockedForInteraction = (isSelectingTables || assigningTable) && isReallyOccupied;
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
                                                    height: table.height || 100
                                                }}
                                                className={`rounded-lg shadow-lg border-2 transition-all hover:scale-105 relative group ${
                                                    isBlockedForInteraction ? 'cursor-not-allowed' : (swapping || assigningTable || isSelectingTables ? 'cursor-crosshair' : 'cursor-pointer')
                                                } ${tableColorClass}`}
                                            >
                                                {isBlockedForInteraction && (
                                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold z-10">
                                                        ✕
                                                    </div>
                                                )}

                                                {!isBlockedForInteraction && (
                                                    <div className="absolute -top-8 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
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

                                                    {/* TOP corners: capacity badge + table number — clear and out of the way */}
                                                    <div className="flex justify-between items-start leading-none">
                                                        <Badge variant="secondary" className="text-[10px] px-1 py-0 leading-none font-bold">
                                                            {table.min_capacity}-{table.max_capacity}
                                                        </Badge>
                                                        <div className="font-black text-base leading-none">{table.table_number}</div>
                                                    </div>

                                                    {/* MIDDLE: the ESSENTIAL — guests + name + time (no other lines) */}
                                                    <div className="flex-1 flex flex-col justify-center items-center leading-tight">
                                                        {isReallyOccupied ? (
                                                            <>
                                                                {session ? (
                                                                    <>
                                                                        <div className="text-base font-black">👥{session.party_size} · {getFirstName(session.customer_name) || '—'}</div>
                                                                        <div className="text-xs font-bold opacity-90">{getActiveTime(session)}</div>
                                                                    </>
                                                                ) : seatedReservation ? (
                                                                    <>
                                                                        <div className="text-base font-black">👥{seatedReservation.party_size} · {getFirstName(seatedReservation.customer_name) || '—'}</div>
                                                                        <div className="text-xs font-bold opacity-90">
                                                                            {seatedReservation.time}{computedEndTime ? `–${computedEndTime}` : ''}
                                                                        </div>
                                                                    </>
                                                                ) : null}
                                                                {/* NEXT seating chip — only if exists, smaller line */}
                                                                {nextSeating && (
                                                                    <div className="mt-0.5 w-full bg-[#44512C] text-white rounded px-1 text-[11px] font-bold truncate leading-tight">
                                                                        ↓ {nextSeating.time?.slice(0,5)} · {getFirstName(nextSeating.customer_name)} ×{nextSeating.party_size}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : futureReservationsForTable.length > 0 ? (
                                                            <div className="w-full flex flex-col gap-0.5">
                                                                {futureReservationsForTable.slice(0, 2).map(res => (
                                                                    <div key={res.id} className="w-full bg-[#44512C] text-white px-1 rounded text-[11px] font-bold flex items-center justify-between leading-tight">
                                                                        <span>{res.time?.slice(0, 5)}</span>
                                                                        <span className="truncate mx-1">{getFirstName(res.customer_name)}</span>
                                                                        <span>×{res.party_size}</span>
                                                                    </div>
                                                                ))}
                                                                {futureReservationsForTable.length > 2 && (
                                                                    <div className="text-[11px] text-[#44512C] font-black">
                                                                        +{futureReservationsForTable.length - 2}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm font-black">פנוי</div>
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
                                        
                                        <div className="absolute bottom-2 left-2 text-xs text-gray-600 bg-white/80 p-2 rounded">
                                            💡 גרור שולחנות לשינוי מיקום · 🖱️ לחץ לפרטים · 🔴 תפוס · 🟢 פנוי פנים · 🟡 פנוי חוץ · 🩷 חוזר
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
            {quickSeatOpen && (
                <QuickSeatDialog
                    open={quickSeatOpen}
                    onClose={() => setQuickSeatOpen(false)}
                    tables={tables}
                    reservations={reservations}
                    activeSessions={activeSessions}
                    onSeat={async (params) => {
                        const { name, phone, party_size, table_number, source_label } = params;
                        const now = new Date();
                        const dateStr = format(now, 'yyyy-MM-dd');
                        const time = format(now, 'HH:mm');
                        try {
                            const created = await Reservation.create({
                                customer_name: name,
                                customer_phone: phone || null,
                                date: dateStr,
                                time,
                                party_size: parseInt(party_size),
                                status: 'seated',
                                assigned_table: [table_number],
                                source: source_label || 'walkin',
                            });
                            await loadLayout();
                            setQuickSeatOpen(false);
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
                            <ReservationTool onReservationCreated={loadLayout} />
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
            if (r.status === 'cancelled' || r.status === 'no_show' || r.status === 'deleted') return false;
            if (!r.time) return true;
            if (String(r.time) < '17:00') return false;
            if (q) {
                const nameMatch = (r.customer_name || '').toLowerCase().includes(q);
                const phoneMatch = (r.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
                if (!nameMatch && !phoneMatch) return false;
            }
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

            {/* List */}
            {tonight.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
                    <div className="text-3xl mb-1">🌙</div>
                    <div className="text-sm text-gray-500">אין הזמנות הערב</div>
                </div>
            ) : (
                tonight.map((r) => {
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
                })
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
                                            disabled={pickedTables.length < 2}
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
                                        <div className="text-[10px] font-bold text-gray-500 mb-1">🪑 לבד (אוטומטי — לא בעדיפויות)</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {autoSingles.map(id => <Chip key={id} color="green">#{id}</Chip>)}
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
        const [eh, em] = r.reservation_end_time.split(':').map(Number);
        const end = new Date(); end.setHours(eh, em || 0, 0, 0);
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
        const [h, m] = r.time.split(':').map(Number);
        const start = new Date(); start.setHours(h, m || 0, 0, 0);
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
        const [eh, em] = r.reservation_end_time.split(':').map(Number);
        const end = new Date(); end.setHours(eh, em || 0, 0, 0);
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
            const [bh, bm] = blocker.time.split(':').map(Number);
            const blkStart = new Date(); blkStart.setHours(bh, bm || 0, 0, 0);
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
function QuickSeatDialog({ open, onClose, tables, reservations, activeSessions, onSeat }) {
    const [step, setStep] = useState('intake'); // intake | pick
    const [partySize, setPartySize] = useState(2);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [sourceLabel, setSourceLabel] = useState('walkin'); // walkin | queue | standby
    const [selectedTable, setSelectedTable] = useState(null);

    if (!open) return null;

    // Build availability map
    const now = new Date();
    // Multi-table sessions stored as 'A,B' or 'A+B' — expand into individual table numbers
    const occupied = new Set(activeSessions.flatMap(s =>
        String(s.table_number || '').split(/[,+]/).map(p => p.trim()).filter(Boolean)
    ));
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

// Geofence constants — matches QueueDashboard's calculation
const QUEUE_RESTAURANT_LAT = 31.964780873771108;
const QUEUE_RESTAURANT_LNG = 34.79326668650769;
const QUEUE_MAX_DISTANCE_M = 100;
function queueCalcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function queueIsFarAway(entry) {
    if (!entry?.last_location_lat || !entry?.last_location_lng) return false;
    return queueCalcDistance(QUEUE_RESTAURANT_LAT, QUEUE_RESTAURANT_LNG, entry.last_location_lat, entry.last_location_lng) > QUEUE_MAX_DISTANCE_M;
}

// === CompactQueueStrip — third tab in big-map rail, walk-ins waiting now ====
function CompactQueueStrip({ queueEntries, abandonedEntries, onSeat, onAbandon, onRestore, onRefresh, onApprove, onReject }) {
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
                message: '🔔 עלינא קוראת לכם! השולחן שלכם מוכן — יש לכם 3 דקות להגיע למארחת.',
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
                message: 'עלינא רוצים לוודא שאתם בסביבה — האם אתם קרובים?',
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