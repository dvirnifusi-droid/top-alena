import React, { useState, useEffect, useCallback } from 'react';
import { SeatingLayout } from '@/entities/SeatingLayout';
import { TableSession } from '@/entities/TableSession';
import { ServiceStep } from '@/entities/ServiceStep';
import { Reservation } from '@/entities/Reservation';
import { Customer } from '@/entities/Customer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Save, Loader2, Wand2, Eye, Edit, Wrench, ArrowRight, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[500px]" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="text-center bg-green-500 text-white py-2 rounded-t">שמור</DialogTitle>
                </DialogHeader>
                
                <div className="bg-cyan-400 text-white p-3 rounded flex items-center justify-between">
                    <Select value={editedReservation.status || 'pending'} onValueChange={value => setEditedReservation({...editedReservation, status: value})}>
                        <SelectTrigger className="w-[180px] bg-cyan-400 text-white border-0 font-bold">
                            <SelectValue placeholder="בחר סטטוס" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="confirmed">מוזמן</SelectItem>
                            <SelectItem value="seated">יושב</SelectItem>
                            <SelectItem value="completed">הסתיים</SelectItem>
                            <SelectItem value="cancelled">בוטל</SelectItem>
                            <SelectItem value="no_show">לא הגיע</SelectItem>
                            <SelectItem value="pending">ממתין לשולחן</SelectItem>
                        </SelectContent>
                    </Select>
                    <CheckCircle className="w-5 h-5" />
                </div>

                <div className="bg-gray-100 p-4 rounded mt-4">
                    <h3 className="font-bold text-center mb-4">פרטי ההזמנה</h3>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-right">
                            <span className="text-blue-600">תאריך</span>
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
                            <span>{editedReservation.reservation_end_time || 'לא מוגדר'}</span>
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
                    <Button onClick={handleSave} className="flex-1 bg-green-500 hover:bg-green-600">
                        שמור
                    </Button>
                    <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
                        בטל
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const GRID_SIZE = 20;

const FACILITY_TYPES = {
    restroom: { name: 'שירותים', icon: '🚻', color: 'bg-gray-300 border-gray-500 text-gray-900' },
    kitchen: { name: 'מטבח', icon: '👨‍🍳', color: 'bg-red-300 border-red-500 text-red-900' },
    bar: { name: 'בר', icon: '🍸', color: 'bg-blue-300 border-blue-500 text-blue-900' },
    reception: { name: 'דלפק קבלה', icon: '🏪', color: 'bg-green-300 border-green-500 text-green-900' },
    storage: { name: 'מחסן', icon: '📦', color: 'bg-yellow-300 border-yellow-500 text-yellow-900' },
    entrance: { name: 'כניסה', icon: '🚪', color: 'bg-purple-300 border-purple-500 text-purple-900' },
    stage: { name: 'במה', icon: '🎭', color: 'bg-pink-300 border-pink-500 text-pink-900' },
    cashier: { name: 'קופה', icon: '💳', color: 'bg-emerald-300 border-emerald-500 text-emerald-900' }
};

export default function SeatingSetup() {
    const [layout, setLayout] = useState(null);
    const [tables, setTables] = useState([]);
    const [facilities, setFacilities] = useState([]);
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
    const [mapZoom, setMapZoom] = useState(1);     // 0.5–1.5 — scales the 1400×850 map canvas
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);  // slide-up reservations dashboard on mobile
    const [bigMapMode, setBigMapMode] = useState(false);  // hostess fullscreen workflow — map + compact tonight strip
    const [dashboardDrawerOpen, setDashboardDrawerOpen] = useState(false);  // overlay slide-in of full dashboard
    const [smartBookerOpen, setSmartBookerOpen] = useState(false);  // collapsible "+ הזמנה חדשה" panel
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
            } else {
                setLayout(null);
                setTables([]);
                setFacilities([]);
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
    const loadLiveData = useCallback(async () => {
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const [sessions, dateReservations, allCustomers] = await Promise.all([
                TableSession.filter({ status: 'active' }),
                Reservation.filter({ date: dateString }, 'time'),
                Customer.list()
            ]);
            setActiveSessions(sessions);
            setReservations((dateReservations || []).map(r => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date })));
            setCustomers(allCustomers);
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

    const getTableSession = (tableNumber) => {
        return activeSessions.find(session => 
            session.table_number === tableNumber && session.status === 'active'
        );
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
                facilities
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

    // Extended status set per Dvir's spec: 9 distinct statuses with clear pill colors.
    // Used by the rail card, badge filter, and status counters.
    const STATUS_CONFIGS = {
        request:         { label: 'בקשה',          color: 'bg-violet-100 text-violet-800',    bgColor: 'bg-violet-50' },
        pending:         { label: 'ממתין',          color: 'bg-yellow-100 text-yellow-800',    bgColor: 'bg-yellow-50' },
        confirmed:       { label: 'מאושר',         color: 'bg-blue-100 text-blue-800',        bgColor: 'bg-blue-50' },
        standby:         { label: 'סטנדבי',        color: 'bg-cyan-100 text-cyan-800',        bgColor: 'bg-cyan-50' },
        seated:          { label: 'יושב',           color: 'bg-green-100 text-green-800',      bgColor: 'bg-green-50' },
        finishing_soon:  { label: 'מסיים בקרוב',   color: 'bg-amber-100 text-amber-800',      bgColor: 'bg-amber-50' },
        completed:       { label: 'סיים',           color: 'bg-gray-100 text-gray-800',        bgColor: 'bg-gray-50' },
        cancelled:       { label: 'בוטל',           color: 'bg-red-100 text-red-700',          bgColor: 'bg-red-50' },
        no_show:         { label: 'הבריז',          color: 'bg-orange-100 text-orange-800',    bgColor: 'bg-orange-50' },
        deleted:         { label: 'מחוק',           color: 'bg-zinc-200 text-zinc-700',        bgColor: 'bg-zinc-100' },
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
        try {
            await Reservation.update(reservation.id, { hostess_flag: nextFlag || null });
            await loadLayout();
        } catch (e) { console.warn('flag save failed', e); }
    };

    const ReservationCard = ({ reservation }) => {
        const statusConfig = getReservationStatusConfig(reservation.status, reservation.assigned_table);
        const customerInfo = reservation.customer_name || `לקוח ${reservation.id?.slice(-4)}`;

        const customer = customers.find(c => c.phone === reservation.customer_phone);
        const isReturning = customer && customer.total_visits > 1;
        const flag = reservation.hostess_flag || '';
        const flagMeta = FLAG_CONFIGS[flag];

        const cycleFlag = (e) => {
            e.stopPropagation();
            const idx = FLAG_CYCLE.indexOf(flag);
            const next = FLAG_CYCLE[(idx + 1) % FLAG_CYCLE.length];
            setHostessFlag(reservation, next);
        };

        return (
            <div className={`p-3 rounded-lg border transition-all hover:shadow-md ${isReturning ? 'bg-pink-50 border-pink-200' : statusConfig.bgColor} group relative`}>
                {/* Flag bar — left edge stripe in the flag color */}
                {flagMeta && (
                    <div className={`absolute top-0 bottom-0 right-0 w-1.5 rounded-r-lg ${flagMeta.color}`}></div>
                )}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="text-lg font-bold text-gray-900 min-w-[60px]">
                            {reservation.time?.slice(0, 5) || '00:00'}
                        </div>

                        <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                                {customerInfo}
                                {/* Flag dot — click to cycle */}
                                <button
                                    onClick={cycleFlag}
                                    title={flagMeta?.label || 'הוסף דגל'}
                                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                                        flagMeta ? `${flagMeta.color} border-white shadow` : 'bg-white border-gray-300 hover:border-gray-400'
                                    }`}
                                ></button>
                                {isReturning && <Badge className="bg-pink-200 text-pink-800">לקוח חוזר</Badge>}
                            </div>
                            <div className="text-sm text-gray-600 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {reservation.party_size} {reservation.party_size === 1 ? 'אדם' : 'אנשים'}
                                </span>
                                {Array.isArray(reservation.assigned_table) && reservation.assigned_table.length > 0 && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        שולחן {reservation.assigned_table.join(', ')}
                                    </span>
                                )}
                                {reservation.table_preference && (
                                    <span className="text-blue-600">
                                        ({reservation.table_preference})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {reservation.special_occasion && (
                            <Badge variant="outline" className="text-xs">
                                🎉 {reservation.special_occasion}
                            </Badge>
                        )}
                        <Badge className={statusConfig.color}>
                            {statusConfig.label}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => {
                            setEditingReservation(reservation);
                            setIsEditReservationOpen(true);
                        }}>
                           <Edit className="w-3 h-3" />
                        </Button>
                    </div>
                </div>
                
                {reservation.special_requests && (
                    <div className="mt-2 text-xs text-gray-600 italic">
                        "{reservation.special_requests}"
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
        const [searchTerm, setSearchTerm] = useState('');

        const filteredReservations = reservations.filter(r => {
            const statusMatch = selectedStatus === 'all' || (r.status || 'pending') === selectedStatus;
            const timeMatch = !timeFilter || (r.time && r.time.startsWith(timeFilter));
            const q = searchTerm.trim().toLowerCase();
            const searchMatch = !q || (
                (r.customer_name || '').toLowerCase().includes(q) ||
                (r.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
            );
            return statusMatch && timeMatch && searchMatch;
        });

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
                        <Calendar className="w-5 h-5 text-blue-600" />
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

                <div className="flex gap-2 mb-4">
                    <Input
                        type="time"
                        value={timeFilter}
                        onChange={e => setTimeFilter(e.target.value)}
                        className="w-28"
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

                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {filteredReservations.length > 0 ? (
                        filteredReservations.map(reservation => (
                            <ReservationCard key={reservation.id} reservation={reservation} />
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
                        <div className="border rounded-lg p-4 bg-blue-50">
                            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                הזמנות עתידיות ({futureReservations.length})
                            </h3>
                            <div className="space-y-2">
                                {futureReservations.map((reservation) => (
                                    <div key={reservation.id} className="bg-white p-3 rounded border border-blue-200 flex justify-between items-center group">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-blue-800">{reservation.customer_name}</span>
                                                <span className="text-sm text-gray-600">({reservation.party_size} אנשים)</span>
                                                <span className="text-sm text-blue-700">
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
                            <div className="border rounded-lg p-4 bg-blue-50">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" />
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
                                        className="bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200"
                                    >
                                        <Ban className="w-4 h-4 ml-2" />
                                        הוצא מישיבה
                                    </Button>
                                    <Button 
                                        onClick={() => handleTableStatusChange(table.table_number, 'cleaning')}
                                        variant="outline"
                                        className="bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200"
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

                            <div className="border rounded-lg p-4 bg-purple-50">
                                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                    <ChefHat className="w-5 h-5 text-purple-600" />
                                    התקדמות השירות
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold">שלב נוכחי: {session.current_step}/23</span>
                                        <span className="text-lg font-bold text-purple-600">{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-3" />
                                    <div className="bg-white p-3 rounded border">
                                        <div className="font-semibold text-purple-800">{currentStepInfo?.step_name || 'שלב לא ידוע'}</div>
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
                                <div className="mt-3 p-3 bg-yellow-100 rounded-lg">
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
                ? 'fixed inset-0 z-[60] bg-white overflow-auto p-2'
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
                    className="fixed top-3 left-3 z-[70] bg-zinc-900 hover:bg-zinc-800 text-white rounded-full pl-3 pr-4 py-2 shadow-2xl flex items-center gap-1.5 text-sm font-bold"
                >
                    <X className="w-4 h-4" />
                    סגור מצב מסך מלא
                </button>
            )}

            {isSelectingTables && (
                <div className="fixed top-0 left-0 right-0 bg-purple-400 text-white p-2 text-center z-50 font-bold flex items-center justify-center gap-4">
                    מצב שיוך שולחנות מרובים: בחר שולחנות עבור הזמנה {multiAssignReservationId?.slice(-4)}.
                    שולחנות נבחרים: {selectedTablesForReservation.length > 0 ? selectedTablesForReservation.join(', ') : 'אף אחד'}
                    <Button variant="ghost" size="sm" onClick={saveMultiTableAssignment} className="bg-white text-purple-700 hover:bg-gray-100">
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
                                        className={`hidden lg:flex ${bigMapMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}`}
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
                            </div>
                        ) : (
                            <div className={`grid grid-cols-1 gap-4 lg:gap-4 ${bigMapMode ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                                {/* Full sidebar — hidden in big-map mode; replaced by compact strip */}
                                {!bigMapMode && (
                                <div className={`lg:order-1 space-y-4 ${mobileSheetOpen
                                    ? 'fixed inset-0 z-40 bg-gray-50 p-4 overflow-y-auto'
                                    : 'hidden lg:block'
                                }`}>
                                    {mobileSheetOpen && (
                                        <div className="flex items-center justify-between lg:hidden mb-2">
                                            <div className="font-bold text-lg">הזמנות והושבה</div>
                                            <button onClick={() => setMobileSheetOpen(false)} className="p-2 -m-2 rounded-full hover:bg-gray-200">
                                                <X className="w-5 h-5"/>
                                            </button>
                                        </div>
                                    )}
                                    <ReservationsDashboard />
                                    <ReservationTool onReservationCreated={loadLayout} />
                                </div>
                                )}

                                {/* Right rail — only in big-map mode. Toggles between compact
                                    'tonight' strip and the full ReservationsDashboard inline (no overlay). */}
                                {bigMapMode && (
                                <div className="hidden lg:flex flex-col gap-2 lg:order-1 overflow-y-auto pl-1" style={{ maxHeight: 'calc(100vh - 110px)' }}>
                                    {/* Tab toggle at top */}
                                    <div className="sticky top-0 z-20 bg-gray-50 pt-1 pb-1.5 flex gap-1">
                                        <button
                                            onClick={() => setDashboardDrawerOpen(false)}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${!dashboardDrawerOpen
                                                    ? 'bg-indigo-600 border-indigo-700 text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                        >🌙 הערב</button>
                                        <button
                                            onClick={() => setDashboardDrawerOpen(true)}
                                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition-colors
                                                ${dashboardDrawerOpen
                                                    ? 'bg-indigo-600 border-indigo-700 text-white shadow'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                        >📅 לוח מלא</button>
                                    </div>

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
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                                            <ReservationTool onReservationCreated={() => { loadLayout(); setSmartBookerOpen(false); }} />
                                        </div>
                                    )}

                                    {dashboardDrawerOpen ? (
                                        <ReservationsDashboard />
                                    ) : (
                                        <CompactTonightStrip
                                            reservations={reservations}
                                            selectedDate={selectedDate}
                                            onEdit={(r) => { setEditingReservation(r); setIsEditReservationOpen(true); }}
                                            onOpenFullDashboard={() => setDashboardDrawerOpen(true)}
                                        />
                                    )}
                                </div>
                                )}

                                <div className={`${bigMapMode ? 'lg:col-span-3 lg:order-2' : 'lg:col-span-2 lg:order-2'} space-y-3`}>
                                    {/* פילטר אזורים - נראה בעיקר במובייל */}
                                    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg border">
                                        {[
                                            { key: 'all', label: 'הכל', color: 'bg-gray-500' },
                                            { key: 'אזור חום', label: '🟤 חום', color: 'bg-amber-700' },
                                            { key: 'כניסה', label: '🟣 כניסה', color: 'bg-purple-600' },
                                            { key: 'אדום מרוכזי', label: '🔴 אדום', color: 'bg-red-600' },
                                            { key: 'זוהרה', label: '🗠 זוהרה', color: 'bg-orange-500' },
                                            { key: 'מספרה', label: '🟡 מספרה', color: 'bg-yellow-500' },
                                            { key: 'גבטה', label: '🔵 גבטה', color: 'bg-blue-600' },
                                            { key: 'ורוד', label: '🩷 ורוד', color: 'bg-pink-500' },
                                            ].map(area => (
                                            <button
                                                key={area.key}
                                                onClick={() => toggleArea(area.key)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-bold text-white transition-all ${
                                                    selectedAreas.includes(area.key)
                                                        ? `${area.color} ring-2 ring-offset-1 ring-gray-800 scale-105`
                                                        : `${area.color} opacity-50`
                                                }`}
                                            >
                                                {area.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="bg-white p-2 border rounded-lg shadow-sm flex justify-between items-center">
                                        <Button
                                            variant="outline"
                                            onClick={() => window.open(window.location.origin + '/PublicReservation', '_blank')}
                                            className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                                        >
                                            <Eye className="w-4 h-4 ml-2" />
                                            צפה בעמוד הזמנות
                                        </Button>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline">
                                                    <Wrench className="w-4 h-4 ml-2" />
                                                    כלים
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
                                    </div>

                                    {/* Zoom controls — small floating cluster, hidden on print */}
                                    <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm w-fit">
                                        <button
                                            onClick={() => setMapZoom(z => Math.max(0.4, z - 0.1))}
                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                            title="הקטן"
                                        ><ZoomOut className="w-4 h-4"/></button>
                                        <button
                                            onClick={() => setMapZoom(1)}
                                            className="px-2 h-8 text-xs font-bold hover:bg-gray-100 rounded min-w-[3rem]"
                                            title="גודל מקורי"
                                        >{Math.round(mapZoom * 100)}%</button>
                                        <button
                                            onClick={() => setMapZoom(z => Math.min(1.6, z + 0.1))}
                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                            title="הגדל"
                                        ><ZoomIn className="w-4 h-4"/></button>
                                        <span className="text-[10px] text-gray-400 mr-2 hidden md:inline">גרור לתזוזה</span>
                                    </div>
                                    <div className="w-full overflow-auto border rounded-lg bg-gray-100" style={{ maxHeight: bigMapMode ? 'calc(100vh - 110px)' : '70vh' }}>
                                    {/* Outer wrapper takes the *visual* (scaled) dimensions so scrollbars match.
                                        Inner element renders at native 1400×850 and is scaled with transform. */}
                                    <div style={{ width: `${1400 * mapZoom}px`, height: `${850 * mapZoom}px` }}>
                                    <div
                                        className="relative"
                                        style={{
                                            width: '1400px',
                                            height: '850px',
                                            backgroundImage: `url('https://media.base44.com/images/public/68ac71d972dff18b98e30a21/5fc81039d_WhatsAppImage2026-04-10at145322.jpg')`,
                                            backgroundSize: '100% 100%',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'center',
                                            transform: `scale(${mapZoom})`,
                                            transformOrigin: 'top right',
                                        }}
                                        >
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

                                        let tableColorClass = '';
                                        const isReallyOccupied = !!session || !!seatedReservation;
                                        
                                        if (isReallyOccupied) {
                                            tableColorClass = 'bg-red-300 border-red-500 text-red-900';
                                        } else if (table.location === 'indoor') {
                                            tableColorClass = 'bg-green-300 border-green-500 text-green-900';
                                        } else {
                                            tableColorClass = 'bg-yellow-300 border-yellow-600 text-yellow-900';
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
                                                                className="px-2 py-1 text-xs rounded bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
                                                                title="שנה לניקוי"
                                                            >
                                                                ניקוי
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="h-full p-0.5 flex flex-col justify-between text-center">
                                                    <div className="flex justify-between items-start">
                                                        <Badge variant="secondary" className="text-[8px] px-0.5 py-0 leading-none">
                                                            {table.min_capacity}-{table.max_capacity}
                                                        </Badge>
                                                        <div className="font-black text-xs">{table.table_number}</div>
                                                    </div>
                                                    
                                                    <div className="flex-1 flex flex-col justify-center items-center px-0.5">
                                                        {isReallyOccupied ? (
                                                            <>
                                                                <div className="text-[10px] font-bold text-red-900">
                                                                    {session ? 'פעיל' : seatedReservation ? 'יושב' : 'תפוס'}
                                                                </div>
                                                                {session ? (
                                                                    <>
                                                                        <div className="text-[10px]">{session.party_size} אנשים</div>
                                                                        <div className="text-[10px]">{getActiveTime(session)}</div>
                                                                        <div className="text-[10px]">שלב {session.current_step}/23</div>
                                                                        {session.waiter_name && (
                                                                            <div className="text-[8px] truncate w-full">{session.waiter_name}</div>
                                                                        )}
                                                                        {session.customer_name && (
                                                                            <div className="text-[8px] truncate w-full">{getFirstName(session.customer_name)}</div>
                                                                        )}
                                                                    </>
                                                                ) : seatedReservation ? (
                                                                    <>
                                                                        <div className="text-[10px]">{seatedReservation.party_size} אנשים</div>
                                                                        <div className="text-[8px] truncate w-full">{getFirstName(seatedReservation.customer_name)}</div>
                                                                        <div className="text-[8px]">מ-{seatedReservation.time}</div>
                                                                    </>
                                                                ) : null}
                                                            </>
                                                        ) : futureReservationsForTable.length > 0 ? (
                                                            <div className="space-y-0.5 w-full">
                                                                {futureReservationsForTable.slice(0, 2).map(res => (
                                                                    <div key={res.id} className="w-full bg-blue-400 text-white px-1 py-0.5 rounded text-[9px] font-semibold flex items-center justify-between leading-none">
                                                                        <span>{res.party_size}</span>
                                                                        <span className="truncate mx-1">{getFirstName(res.customer_name)}</span>
                                                                        <span>{res.time?.slice(0, 5)}</span>
                                                                    </div>
                                                                ))}
                                                                {futureReservationsForTable.length > 2 && (
                                                                    <div className="text-[8px] text-blue-600">
                                                                        +{futureReservationsForTable.length - 2} נוספות
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] font-semibold">פנוי</div>
                                                        )}
                                                    </div>
                                                    
                                                    {session && (
                                                        <div className="w-full bg-red-200 rounded-full h-1 mt-0.5">
                                                            <div className="bg-red-600 h-1 rounded-full" style={{width: `${progress}%`}}></div>
                                                        </div>
                                                    )}
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

            {/* Mobile FAB — opens the reservations dashboard as a bottom sheet */}
            <button
                onClick={() => setMobileSheetOpen(true)}
                className="lg:hidden fixed bottom-4 left-4 z-30 h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xl flex items-center justify-center"
                title="הזמנות והושבה"
            >
                <Calendar className="w-6 h-6" />
            </button>

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
        if (s === 'confirmed') return 'bg-blue-100 text-blue-700 border-blue-200';
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
                        <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">הזמנות הערב</div>
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
                        className="w-full text-right bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-400 rounded-xl p-2.5 transition-colors relative overflow-hidden"
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
                                <span className="font-bold text-indigo-600">
                                    🪑 {Array.isArray(r.assigned_table) ? r.assigned_table.join(',') : r.assigned_table}
                                </span>
                            )}
                            {r.special_occasion && (
                                <span className="text-rose-500" title={r.special_occasion}>🎂</span>
                            )}
                        </div>
                    </button>
                    );
                })
            )}
        </>
    );
}

// === LiveStat — compact KPI tile for the top status bar ====================
function LiveStat({ icon, label, value, sub, accent = 'slate', pulse = false }) {
    const colorMap = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        blue:    'border-blue-200 bg-blue-50 text-blue-900',
        amber:   'border-amber-200 bg-amber-50 text-amber-900',
        violet:  'border-violet-200 bg-violet-50 text-violet-900',
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