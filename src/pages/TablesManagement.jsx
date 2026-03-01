
import React, { useState, useEffect } from 'react';
import { TableSession } from '@/entities/TableSession';
import { ServiceStep } from '@/entities/ServiceStep';
import { Customer } from '@/entities/Customer';
import { Reservation } from '@/entities/Reservation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
    Users, Clock, CheckCircle, Coffee, Loader2, Search, 
    Play, RotateCcw, Edit, Utensils, Phone, PlusCircle, Star
} from 'lucide-react';
import { format } from 'date-fns';

const stepGroups = {
    'opening': { label: 'פתיחה (1-3): קבלת פנים ומים', range: [1, 3] },
    'ordering': { label: 'הזמנה (4-6): לקיחת הזמנה ראשונית', range: [4, 6] },
    'serving': { label: 'אירוח (7-15): הגשת מנות ובדיקה', range: [7, 15] },
    'closing': { label: 'סיום (16-23): פינוי, חשבון וסגירה', range: [16, 23] },
};

export default function TablesManagementPage() {
    const [sessions, setSessions] = useState([]);
    const [steps, setSteps] = useState([]);
    const [reservations, setReservations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingStep, setEditingStep] = useState(null);
    const [editingSession, setEditingSession] = useState(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    
    // Filters
    const [areaFilter, setAreaFilter] = useState('all');
    const [waiterFilter, setWaiterFilter] = useState('all');
    const [stepFilter, setStepFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 15000); // Refresh every 15 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const [sessionsData, stepsData, todayReservations, allCustomers] = await Promise.all([
                TableSession.filter({ status: 'active' }),
                ServiceStep.list('step_number'),
                Reservation.filter({ date: format(new Date(), 'yyyy-MM-dd') }),
                Customer.list()
            ]);

            setSessions(sessionsData);
            setSteps(stepsData);
            setReservations(todayReservations);
            setCustomers(allCustomers);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const isReturningCustomer = (phone) => {
        if (!phone || customers.length === 0) return false;
        const customer = customers.find(c => c.phone === phone);
        return customer && customer.total_visits > 1;
    };

    const getStepInfo = (stepNumber) => {
        return steps.find(s => s.step_number === stepNumber) || {};
    };

    const getTableStyleLabel = (style) => {
        const styles = {
            date: 'דייט רומנטי',
            family_with_kids: 'משפחה עם ילדים', 
            business: 'עסקים',
            friends: 'חברים',
            celebration: 'חגיגה',
            couple: 'זוג',
            solo: 'יחיד'
        };
        return styles[style] || style;
    };

    const getProgressPercentage = (session) => {
        return Math.round(((session.steps_completed?.length || 0) / 23) * 100);
    };

    const getActiveTime = (session) => {
        if (!session.session_start) return '00:00';
        const activeMinutes = Math.round((new Date() - new Date(session.session_start)) / 60000);
        if (activeMinutes < 60) return `${activeMinutes} דק'`;
        const hours = Math.floor(activeMinutes / 60);
        const minutes = activeMinutes % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    };

    // Get reservation info for table
    const getTableReservation = (tableNumber) => {
        return reservations.find(r => 
            Array.isArray(r.assigned_table) && 
            r.assigned_table.includes(tableNumber) &&
            r.status === 'seated'
        );
    };

    const releaseTable = async (sessionId) => {
        try {
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return;
            
            await TableSession.update(sessionId, { 
                status: 'completed',
                session_end: new Date().toISOString() 
            });
            
            const reservation = getTableReservation(session.table_number);
            if (reservation) {
                await Reservation.update(reservation.id, { status: 'completed' });
            }
            
            loadData();
        } catch (error) {
            console.error('Error releasing table:', error);
        }
    };

    const advanceStep = async (sessionId, currentStep) => {
        try {
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return;

            const newStepsCompleted = [...(session.steps_completed || []), currentStep];
            const nextStep = currentStep < 23 ? currentStep + 1 : 23;

            const updateData = {
                current_step: nextStep,
                steps_completed: newStepsCompleted
            };

            if (nextStep === 23) {
                updateData.status = 'completed';
                updateData.session_end = new Date().toISOString();
                // Optionally mark reservation as completed too
                const reservation = getTableReservation(session.table_number);
                if (reservation) {
                    await Reservation.update(reservation.id, { status: 'completed' });
                }
            }

            await TableSession.update(sessionId, updateData);
            loadData();
        } catch (error) {
            console.error('Error advancing step:', error);
        }
    };

    const setTableStep = async (sessionId, stepNumber) => {
        try {
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return;

            const completedSteps = [];
            for (let i = 1; i < stepNumber; i++) {
                completedSteps.push(i);
            }

            await TableSession.update(sessionId, {
                current_step: stepNumber,
                steps_completed: completedSteps
            });

            setEditingStep(null);
            loadData();
        } catch (error) {
            console.error('Error setting table step:', error);
        }
    };

    // Filter sessions based on criteria
    const filteredSessions = sessions.filter(session => {
        const matchesArea = areaFilter === 'all' || 
            (areaFilter === 'indoor' && session.table_number && parseInt(session.table_number) < 100) ||
            (areaFilter === 'outdoor' && session.table_number && parseInt(session.table_number) >= 100);
        
        const matchesWaiter = waiterFilter === 'all' || session.waiter_name?.includes(waiterFilter);
        
        const stepGroup = stepGroups[stepFilter];
        const matchesStep = stepFilter === 'all' || (stepGroup && session.current_step >= stepGroup.range[0] && session.current_step <= stepGroup.range[1]);

        const matchesSearch = searchQuery === '' || 
            session.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.table_number?.includes(searchQuery);

        return matchesArea && matchesWaiter && matchesStep && matchesSearch;
    });

    // Get unique waiters for filter
    const uniqueWaiters = [...new Set(sessions.map(s => s.waiter_name).filter(Boolean))];

    // Handle adding a new session
    const handleAddSession = async (newSessionData) => {
        try {
            await TableSession.create({
                ...newSessionData,
                party_size: parseInt(newSessionData.party_size),
                session_start: new Date().toISOString(),
                status: 'active',
                current_step: 1,
                steps_completed: []
            });
            // Update customer club
            if (newSessionData.customer_phone) {
                const customer = customers.find(c => c.phone === newSessionData.customer_phone);
                if (customer) {
                    await Customer.update(customer.id, { total_visits: (customer.total_visits || 0) + 1, last_visit: format(new Date(), 'yyyy-MM-dd') });
                } else {
                    await Customer.create({ name: newSessionData.customer_name, phone: newSessionData.customer_phone, total_visits: 1, last_visit: format(new Date(), 'yyyy-MM-dd') });
                }
            }
            setIsAddDialogOpen(false);
            loadData();
        } catch (error) {
            console.error('Error adding session:', error);
            alert('שגיאה בהוספת השולחן.');
        }
    };

    // Handle updating an existing session
    const handleUpdateSession = async (sessionId, updatedData) => {
        try {
            await TableSession.update(sessionId, updatedData);
            setEditingSession(null);
            loadData();
        } catch (error) {
            console.error('Error updating session:', error);
            alert('שגיאה בעדכון השולחן.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="mr-2">טוען נתוני שולחנות...</span>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">ניהול שולחנות - מנהלים</h1>
                        <p className="text-slate-600 mt-1">מעקב מתקדם וניהול כל השולחנות הפעילים</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button onClick={() => setIsAddDialogOpen(true)}>
                            <PlusCircle className="w-4 h-4 ml-2" />
                            הוסף שולחן
                        </Button>
                        <Button onClick={loadData} variant="outline">
                            <RotateCcw className="w-4 h-4 ml-2" />
                            רענן
                        </Button>
                    </div>
                </div>

                {/* Filters Row */}
                <Card className="mb-6">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                            <div>
                                <Label className="text-sm font-medium">חיפוש</Label>
                                <div className="relative">
                                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="שם לקוח או מספר שולחן"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pr-10"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">אזור</Label>
                                <Select value={areaFilter} onValueChange={setAreaFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל האזורים</SelectItem>
                                        <SelectItem value="indoor">פנים</SelectItem>
                                        <SelectItem value="outdoor">חוץ</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">מלצר</Label>
                                <Select value={waiterFilter} onValueChange={setWaiterFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל המלצרים</SelectItem>
                                        {uniqueWaiters.map(waiter => (
                                            <SelectItem key={waiter} value={waiter}>{waiter}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">ריכוז שלבים</Label>
                                <Select value={stepFilter} onValueChange={setStepFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">כל השלבים</SelectItem>
                                        {Object.entries(stepGroups).map(([key, group]) => (
                                            <SelectItem key={key} value={key}>{group.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button 
                                onClick={() => {
                                    setAreaFilter('all');
                                    setWaiterFilter('all');
                                    setStepFilter('all');
                                    setSearchQuery('');
                                }}
                                variant="outline"
                            >
                                נקה סינון
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-between items-center mb-4">
                    <Badge variant="outline" className="text-md px-3 py-1">
                        {filteredSessions.length}/{sessions.length} שולחנות מוצגים
                    </Badge>
                     <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Star className="w-4 h-4 text-purple-500 fill-purple-200" />
                        <span>לקוח חוזר</span>
                    </div>
                </div>

                {/* Tables Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredSessions.length === 0 ? (
                        <div className="col-span-full text-center py-12">
                            <Coffee className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-600 mb-2">אין שולחנות תואמים</h3>
                            <p className="text-gray-500">נסה לשנות את הסינון או לרענן את הדף</p>
                        </div>
                    ) : (
                        filteredSessions.map(session => {
                            const currentStepInfo = getStepInfo(session.current_step);
                            const progress = getProgressPercentage(session);
                            const reservation = getTableReservation(session.table_number);
                            const isReturning = isReturningCustomer(session.customer_phone);

                            return (
                                <Card key={session.id} className={`relative shadow-md hover:shadow-lg transition-all ${isReturning ? 'border-2 border-purple-400' : ''}`}>
                                    {isReturning && <div className="absolute -top-2 -right-2 bg-purple-500 text-white p-1 rounded-full"><Star className="w-3 h-3" /></div>}
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="flex items-center gap-2 text-xl">
                                                    <span className="text-2xl font-bold text-orange-600">שולחן {session.table_number}</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {parseInt(session.table_number) < 100 ? 'פנים' : 'חוץ'}
                                                    </Badge>
                                                </CardTitle>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Users className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm text-gray-600">{session.party_size} סועדים</span>
                                                    <span className="text-gray-400">•</span>
                                                    <span className="text-sm text-blue-600">{getTableStyleLabel(session.table_style)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Clock className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm">התחיל: {format(new Date(session.session_start), 'HH:mm')} ({getActiveTime(session)})</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Utensils className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm">מלצר: {session.waiter_name}</span>
                                                </div>
                                                {reservation && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Phone className="w-4 h-4 text-green-500" />
                                                        <span className="text-sm text-green-600">הזמנה: {reservation.customer_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-green-600">{progress}%</div>
                                                <Progress value={progress} className="w-16 mt-1" />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="mt-2"
                                                    onClick={() => setEditingSession(session)}
                                                >
                                                    <Edit className="w-3 h-3 ml-1" />
                                                    ערוך
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pt-2">
                                        <div className="space-y-4">
                                            {/* Current Step */}
                                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                                            {session.current_step}
                                                        </div>
                                                        <h4 className="font-semibold text-blue-800 text-sm">{currentStepInfo.step_name}</h4>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingStep(session.id)}
                                                    >
                                                        <Edit className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                                <p className="text-xs text-blue-700 mb-2">{currentStepInfo.description}</p>
                                            </div>

                                            {/* Manager Actions */}
                                            <div className="flex gap-2">
                                                <Button 
                                                    onClick={() => advanceStep(session.id, session.current_step)}
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                    size="sm"
                                                    disabled={session.current_step >= 23}
                                                >
                                                    <Play className="w-3 h-3 ml-1" />
                                                    קדם שלב
                                                </Button>
                                                <Button 
                                                    onClick={() => releaseTable(session.id)}
                                                    variant="outline" 
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <CheckCircle className="w-3 h-3 ml-1" />
                                                    סיים
                                                </Button>
                                            </div>

                                            {/* Customer Info & Notes */}
                                            <div className="space-y-2">
                                                {session.customer_name && (
                                                    <div className="text-xs bg-gray-100 p-2 rounded">
                                                        <strong>לקוח:</strong> {session.customer_name}
                                                        {session.customer_phone && ` • ${session.customer_phone}`}
                                                    </div>
                                                )}
                                                {session.notes && (
                                                    <div className="text-xs bg-yellow-50 p-2 rounded border border-yellow-200">
                                                        <strong>הערות:</strong> {session.notes}
                                                    </div>
                                                )}
                                                {session.special_requests && (
                                                    <div className="text-xs bg-orange-50 p-2 rounded border border-orange-200">
                                                        <strong>בקשות מיוחדות:</strong> {session.special_requests}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>

                {/* Step Edit Dialog */}
                {editingStep && (
                    <Dialog open={!!editingStep} onOpenChange={() => setEditingStep(null)}>
                        <DialogContent dir="rtl">
                            <DialogHeader>
                                <DialogTitle>עדכון שלב שירות</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <Label>בחר שלב חדש:</Label>
                                <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                                    {Array.from({ length: 23 }, (_, i) => i + 1).map(step => {
                                        const stepInfo = getStepInfo(step);
                                        return (
                                            <Button
                                                key={step}
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setTableStep(editingStep, step)}
                                                className="text-xs p-2 h-auto flex flex-col"
                                                title={stepInfo.step_name}
                                            >
                                                <span className="font-bold">{step}</span>
                                                <span className="truncate w-full" style={{fontSize: '10px'}}>{stepInfo.step_name}</span>
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setEditingStep(null)}>
                                    ביטול
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Add/Edit Session Dialog */}
                <SessionFormDialog
                    isOpen={isAddDialogOpen || !!editingSession}
                    onClose={() => { setIsAddDialogOpen(false); setEditingSession(null); }}
                    session={editingSession}
                    onSubmit={editingSession ? (data) => handleUpdateSession(editingSession.id, data) : handleAddSession}
                    waiters={uniqueWaiters}
                />
            </div>
        </div>
    );
}


// A new component for the Add/Edit Session Dialog
function SessionFormDialog({ isOpen, onClose, session, onSubmit, waiters }) {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (session) {
            setFormData({ ...session });
        } else {
            setFormData({
                table_number: '',
                party_size: 2,
                waiter_name: '',
                customer_name: '',
                customer_phone: '',
                table_style: 'friends',
                notes: '',
                special_requests: ''
            });
        }
    }, [session, isOpen]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent dir="rtl">
                <DialogHeader>
                    <DialogTitle>{session ? 'עריכת שולחן' : 'הוספת שולחן חדש'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="table_number">מספר שולחן</Label>
                            <Input id="table_number" value={formData.table_number || ''} onChange={e => handleChange('table_number', e.target.value)} required />
                        </div>
                        <div>
                            <Label htmlFor="party_size">כמות סועדים</Label>
                            <Input id="party_size" type="number" value={formData.party_size || ''} onChange={e => handleChange('party_size', e.target.value)} required />
                        </div>
                        <div>
                            <Label htmlFor="waiter_name">שם מלצר</Label>
                             <Select value={formData.waiter_name || ''} onValueChange={value => handleChange('waiter_name', value)}>
                                <SelectTrigger id="waiter_name">
                                    <SelectValue placeholder="בחר מלצר" />
                                </SelectTrigger>
                                <SelectContent>
                                    {waiters.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                                    <SelectItem value="מנהל">מנהל</SelectItem>
                                    <SelectItem value="אחמ״ש">אחמ״ש</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div>
                            <Label htmlFor="table_style">סגנון שולחן</Label>
                            <Select value={formData.table_style || 'friends'} onValueChange={value => handleChange('table_style', value)}>
                                <SelectTrigger id="table_style">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                     <SelectItem value="date">דייט רומנטי</SelectItem>
                                     <SelectItem value="family_with_kids">משפחה עם ילדים</SelectItem>
                                     <SelectItem value="business">עסקים</SelectItem>
                                     <SelectItem value="friends">חברים</SelectItem>
                                     <SelectItem value="celebration">חגיגה</SelectItem>
                                     <SelectItem value="couple">זוג</SelectItem>
                                     <SelectItem value="solo">יחיד</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="customer_name">שם לקוח (אופציונלי)</Label>
                            <Input id="customer_name" value={formData.customer_name || ''} onChange={e => handleChange('customer_name', e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="customer_phone">טלפון לקוח (אופציונלי)</Label>
                            <Input id="customer_phone" value={formData.customer_phone || ''} onChange={e => handleChange('customer_phone', e.target.value)} />
                        </div>
                    </div>
                     <div>
                        <Label htmlFor="notes">הערות</Label>
                        <Textarea id="notes" value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="special_requests">בקשות מיוחדות</Label>
                        <Textarea id="special_requests" value={formData.special_requests || ''} onChange={e => handleChange('special_requests', e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
                        <Button type="submit">{session ? 'שמור שינויים' : 'הוסף שולחן'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
