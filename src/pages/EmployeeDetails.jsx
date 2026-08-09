
import React, { useState, useEffect, useMemo } from 'react';
import { Employee, Shift, WorkPosition } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
    ArrowRight, 
    User, 
    Plus, 
    Edit, 
    Trash2, 
    DollarSign, 
    Clock, 
    Star,
    Target,
    Save, // Added Save icon
    Briefcase // Added Briefcase icon for roles
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmployeePaySection from '../components/employees/EmployeePaySection';
import EmployeeTierSelect from '../components/employees/EmployeeTierSelect';
import Employee360 from '../components/employees/Employee360';
import SignedAgreementCard from '../components/employees/SignedAgreementCard';
import EmployeeMeetings from '../components/employees/EmployeeMeetings';
import EmployeeCoreDetails, { statusMeta } from '../components/employees/EmployeeCoreDetails';
import EmployeeOnboarding from '../components/employees/EmployeeOnboarding';
import EmployeeDocuments from '../components/employees/EmployeeDocuments';
import EmployeeNotesTasks from '../components/employees/EmployeeNotesTasks';
import EmployeeShiftHistory from '../components/employees/EmployeeShiftHistory';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Phone, Building2, CalendarDays, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';


function ShiftForm({ shift, employeeId, employeeName, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        date: shift ? shift.date.split('T')[0] : new Date().toISOString().split('T')[0],
        hours_worked: shift ? shift.hours_worked : '',
        sales_amount: shift ? shift.sales_amount : '',
        sales_target: shift ? shift.sales_target : '',
        manager_rating: shift ? shift.manager_rating : '',
        customer_service_rating: shift ? shift.customer_service_rating : '',
        area: shift ? shift.area : '',
        notes: shift ? shift.notes : '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const dataToSend = { ...formData };

        // Clean optional number fields to prevent sending empty strings
        for (const key of ['sales_target', 'manager_rating', 'customer_service_rating']) {
            // Check if the value is essentially "empty" or invalid for a number
            if (dataToSend[key] === '' || dataToSend[key] === null || isNaN(dataToSend[key])) {
                delete dataToSend[key]; // Remove the key entirely
            } else {
                dataToSend[key] = Number(dataToSend[key]); // Convert to number if valid
            }
        }

        onSave({
            ...dataToSend,
            employee_id: employeeId,
            employee_name: employeeName,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="date">תאריך</Label>
                <Input id="date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
            </div>
            <div>
                <Label htmlFor="hours_worked">שעות עבודה</Label>
                <Input id="hours_worked" type="number" placeholder="לדוגמה: 8" value={formData.hours_worked} onChange={(e) => setFormData({ ...formData, hours_worked: parseFloat(e.target.value) || '' })} required />
            </div>
            <div>
                <Label htmlFor="sales_amount">סכום מכירות (₪)</Label>
                <Input id="sales_amount" type="number" placeholder="לדוגמה: 1500" value={formData.sales_amount} onChange={(e) => setFormData({ ...formData, sales_amount: parseFloat(e.target.value) || '' })} required />
            </div>
            <div>
                <Label htmlFor="sales_target">יעד מכירות (₪)</Label>
                <Input id="sales_target" type="number" placeholder="לדוגמה: 1200" value={formData.sales_target} onChange={(e) => setFormData({ ...formData, sales_target: parseFloat(e.target.value) || '' })} />
            </div>
            <div>
                <Label htmlFor="manager_rating">דירוג מנהל (1-5)</Label>
                <Input id="manager_rating" type="number" min="1" max="5" placeholder="5" value={formData.manager_rating} onChange={(e) => setFormData({ ...formData, manager_rating: parseInt(e.target.value) || '' })} />
            </div>
            <div>
                <Label htmlFor="customer_service_rating">אחוז שירות לקוחות (יעד: 14%)</Label>
                <Input 
                    id="customer_service_rating" 
                    type="number" 
                    min="0" 
                    max="100" 
                    placeholder="14" 
                    value={formData.customer_service_rating} 
                    onChange={(e) => setFormData({ ...formData, customer_service_rating: parseInt(e.target.value) || '' })} 
                />
                <p className="text-xs text-gray-500 mt-1">יעד: 14% | טוב: מעל 14% | מצוין: מעל 20%</p>
            </div>
            <div className="md:col-span-2">
                <Label htmlFor="area">אזור שירות</Label>
                <Input id="area" placeholder="לדוגמה: פטיו" value={formData.area} onChange={(e) => setFormData({ ...formData, area: e.target.value })} />
            </div>
            <div className="md:col-span-2">
                <Label htmlFor="notes">הערות</Label>
                <Input id="notes" placeholder="הערות על המשמרת" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
                <Button type="submit">{shift ? 'שמור שינויים' : 'הוסף משמרת'}</Button>
            </div>
        </form>
    );
}

export default function EmployeeDetailsPage() {
    const [employee, setEmployee] = useState(null);
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isShiftFormOpen, setIsShiftFormOpen] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [employeeId, setEmployeeId] = useState(null);
    
    // States for positions and wage editing
    const [isEditingPositions, setIsEditingPositions] = useState(false);
    const [positionsData, setPositionsData] = useState([]);
    const [allPositions, setAllPositions] = useState([]);
    const [crm, setCrm] = useState(null);
    const [tab, setTab] = useState('overview');

    const loadCrm = async (id) => {
        try { const r = await base44.functions.getEmployeeCRM({ employee_id: id || employeeId }); setCrm(r?.data || r); }
        catch (e) { /* CRM is additive — never block the page */ }
    };


    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        setEmployeeId(id);
        if (id) {
            loadData(id);
        }
    }, []);

    const loadData = async (id) => {
        setLoading(true);
        try {
            const [employeeData, shiftsData, workPositionsData] = await Promise.all([
                Employee.get(id),
                Shift.filter({ employee_id: id }, '-date'),
                WorkPosition.list()
            ]);
            setEmployee(employeeData);
            setShifts(shiftsData);
            setPositionsData(employeeData.positions || []);
            setAllPositions(workPositionsData);
            loadCrm(id);
        } catch (error) {
            console.error("שגיאה בטעינת נתוני עובד:", error);
        }
        setLoading(false);
    };

    const monthlyStats = useMemo(() => {
        if (shifts.length === 0) {
            return { totalSales: 0, totalHours: 0, avgManagerRating: 0, avgServiceRating: 0 };
        }
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const relevantShifts = shifts.filter(s => {
            const shiftDate = new Date(s.date);
            return shiftDate.getMonth() === currentMonth && shiftDate.getFullYear() === currentYear;
        });

        const totalSales = relevantShifts.reduce((sum, s) => sum + (s.sales_amount || 0), 0);
        const totalHours = relevantShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
        
        const managerRatings = relevantShifts.map(s => s.manager_rating).filter(Boolean);
        const avgManagerRating = managerRatings.length > 0 ? (managerRatings.reduce((a, b) => a + b, 0) / managerRatings.length).toFixed(1) : 'N/A';

        const serviceRatings = relevantShifts.map(s => s.customer_service_rating).filter(Boolean);
        const avgServiceRating = serviceRatings.length > 0 ? (serviceRatings.reduce((a, b) => a + b, 0) / serviceRatings.length).toFixed(0) : 'N/A';

        return { 
            totalSales, 
            totalHours, 
            avgManagerRating, 
            avgServiceRating,
            shiftsThisMonth: relevantShifts.length // This is still useful, even if not displayed in a card
        };
    }, [shifts]);

    const handleSaveShift = async (shiftData) => {
        try {
            if (editingShift) {
                await Shift.update(editingShift.id, shiftData);
            } else {
                await Shift.create(shiftData);
            }
            setIsShiftFormOpen(false);
            setEditingShift(null);
            loadData(employeeId);
        } catch (error) {
            console.error("שגיאה בשמירת משמרת:", error);
        }
    };
    
    const handleDeleteShift = async (shiftId) => {
        if(window.confirm('האם אתה בטוח שברצונך למחוק את המשמרת?')) {
            try {
                await Shift.delete(shiftId);
                loadData(employeeId);
            } catch (error) {
                console.error("שגיאה במחיקת משמרת:", error);
            }
        }
    };

    const handleSavePositions = async () => {
        if (!employee) return;
        try {
            // Filter out positions that might have empty names or invalid rates
            const validPositions = positionsData.filter(pos => 
                pos.position_name && pos.rate !== undefined && pos.rate >= 0
            );
            await Employee.update(employee.id, { positions: validPositions });
            setIsEditingPositions(false);
            loadData(employee.id); // Reload to reflect changes
        } catch (error) {
            console.error('שגיאה בעדכון תפקידים:', error);
            alert('שגיאה בעדכון תפקידים');
        }
    };
    
    const handlePositionChange = (index, field, value) => {
        const newPositions = [...positionsData];
        newPositions[index][field] = value;
        setPositionsData(newPositions);
    };

    const handleAddPosition = () => {
        // Find a default position name if available, otherwise use a placeholder
        const defaultPositionName = allPositions.length > 0 ? allPositions[0].position_name : '';
        setPositionsData([...positionsData, { position_name: defaultPositionName, pay_type: 'hourly', rate: 0 }]);
    };
    
    const handleRemovePosition = (index) => {
        const newPositions = positionsData.filter((_, i) => i !== index);
        setPositionsData(newPositions);
    };


    if (loading) return <p>טוען נתונים...</p>;
    if (!employee) return <p>עובד לא נמצא.</p>;

    return (
        <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header card — avatar + status + key facts + alerts */}
                <Link to={createPageUrl('Employees')} className="text-[#44512C] hover:underline flex items-center gap-2 mb-1">
                    <ArrowRight className="w-4 h-4" /> חזרה לכל העובדים
                </Link>
                <Card className="overflow-hidden">
                    <div className="bg-gradient-to-l from-[#44512C] to-[#5c6b3d] p-5 text-white">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <Avatar className="w-16 h-16 border-2 border-white/40">
                                    <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                                        {(employee.full_name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h1 className="text-2xl font-extrabold">{employee.full_name}</h1>
                                    <p className="text-white/80">{employee.employee_position || employee.role}</p>
                                    <div className="mt-1">
                                        <Badge className={statusMeta(crm?.core?.status || employee.status).color}>{statusMeta(crm?.core?.status || employee.status).label}</Badge>
                                    </div>
                                </div>
                            </div>
                            <Button onClick={() => { setEditingShift(null); setIsShiftFormOpen(true); }} className="bg-white/15 hover:bg-white/25 border border-white/30">
                                <Plus className="w-4 h-4 ml-2" /> הוסף משמרת
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm text-white/90">
                            {employee.phone && <a href={`tel:${employee.phone}`} className="flex items-center gap-1.5 hover:underline"><Phone className="w-4 h-4" /> {employee.phone}</a>}
                            {employee.department && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" /> {employee.department}</span>}
                            {crm?.core?.hire_date && <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> מ-{new Date(crm.core.hire_date).toLocaleDateString('he-IL')}</span>}
                        </div>
                    </div>
                    {crm?.alerts?.length > 0 && (
                        <div className="p-3 bg-amber-50 flex flex-wrap gap-2">
                            {crm.alerts.map((a, i) => (
                                <span key={i} className={`text-xs rounded-full px-2.5 py-1 flex items-center gap-1 ${a.level === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> {a.text}
                                </span>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Controlled shift dialog — used by header button + shifts-tab edit */}
                <Dialog open={isShiftFormOpen} onOpenChange={setIsShiftFormOpen}>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>{editingShift ? 'עריכת משמרת' : 'הוספת משמרת חדשה'}</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <ShiftForm shift={editingShift} employeeId={employee.id} employeeName={employee.full_name} onSave={handleSaveShift} onCancel={() => setIsShiftFormOpen(false)} />
                        </div>
                    </DialogContent>
                </Dialog>

                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-white/60 p-1">
                        <TabsTrigger value="overview">סקירה</TabsTrigger>
                        <TabsTrigger value="onboarding">קליטה ומסמכים</TabsTrigger>
                        <TabsTrigger value="file">תיק עובד</TabsTrigger>
                        <TabsTrigger value="shifts">משמרות</TabsTrigger>
                        {(crm?.viewer_scope?.canMeetings ?? true) && <TabsTrigger value="meetings">פגישות ושכר</TabsTrigger>}
                        {(crm?.viewer_scope?.canNotes ?? true) && <TabsTrigger value="notes">הערות ומשימות</TabsTrigger>}
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6 mt-4">
                {crm?.core && <EmployeeCoreDetails core={crm.core} readOnly={crm?.viewer_scope?.canEdit === false} onChange={() => loadCrm()} />}
                {/* Positions & Salary Info */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Briefcase className="w-6 h-6 text-[#44512C]" />
                            <CardTitle>תפקידים ושכר</CardTitle>
                        </div>
                        {!isEditingPositions ? (
                            <Button variant="outline" onClick={() => setIsEditingPositions(true)}>
                                <Edit className="w-4 h-4 ml-2" />
                                ערוך
                            </Button>
                        ) : (
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => { setIsEditingPositions(false); setPositionsData(employee.positions || []); }}>ביטול</Button>
                                <Button onClick={handleSavePositions}><Save className="w-4 h-4 ml-2" />שמור שינויים</Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        {isEditingPositions ? (
                            <div className="space-y-4">
                                {positionsData.map((pos, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-3 items-center p-3 border rounded-lg bg-gray-50">
                                        <div className="col-span-4">
                                            <Label>תפקיד</Label>
                                            <Select
                                                value={pos.position_name}
                                                onValueChange={(value) => handlePositionChange(index, 'position_name', value)}
                                            >
                                                <SelectTrigger><SelectValue placeholder="בחר תפקיד..." /></SelectTrigger>
                                                <SelectContent>
                                                    {allPositions.map(p => <SelectItem key={p.id} value={p.position_name}>{p.position_name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-3">
                                            <Label>סוג תשלום</Label>
                                            <Select
                                                value={pos.pay_type}
                                                onValueChange={(value) => handlePositionChange(index, 'pay_type', value)}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="hourly">שכר שעתי</SelectItem>
                                                    <SelectItem value="tip_based">מבוסס טיפים</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-3">
                                            <Label>{pos.pay_type === 'hourly' ? 'שכר לשעה (₪)' : 'השלמה ל (₪)'}</Label>
                                            <Input 
                                                type="number" 
                                                value={pos.rate}
                                                onChange={(e) => handlePositionChange(index, 'rate', parseFloat(e.target.value) || 0)}
                                                min="0"
                                            />
                                        </div>
                                        <div className="col-span-2 self-end">
                                            <Button variant="ghost" size="icon" onClick={() => handleRemovePosition(index)}>
                                                <Trash2 className="w-5 h-5 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <Button variant="outline" onClick={handleAddPosition} className="w-full">
                                    <Plus className="w-4 h-4 ml-2" />
                                    הוסף תפקיד
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {employee.positions && employee.positions.length > 0 ? (
                                    employee.positions.map((pos, index) => (
                                        <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
                                            <span className="font-bold text-lg">{pos.position_name}</span>
                                            <div className="text-left">
                                                <p className="font-semibold">{pos.pay_type === 'hourly' ? 'שכר שעתי' : 'מבוסס טיפים'}</p>
                                                <p className="text-gray-600">
                                                    {/* A position saved without a rate left pos.rate undefined and
                                                        `.toFixed()` crashed the WHOLE profile page. Guard it. */}
                                                    {Number.isFinite(Number(pos.rate))
                                                        ? (pos.pay_type === 'hourly'
                                                            ? `₪${Number(pos.rate).toFixed(2)} לשעה`
                                                            : `השלמה ל-₪${Number(pos.rate).toFixed(2)} לשעה`)
                                                        : 'לא הוגדר תעריף'}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-gray-500 py-4">לא הוגדרו תפקידים ושכר עבור עובד זה.</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pay & employer-cost (privacy-aware) — hidden from viewers without salary access */}
                {(crm?.viewer_scope?.canSalary ?? true) && <EmployeePaySection employee={employee} />}
                {(crm?.viewer_scope?.canEdit ?? true) && <EmployeeTierSelect employee={employee} />}

                {/* Monthly Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">מכירות החודש</CardTitle><DollarSign className="w-4 h-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">₪{monthlyStats.totalSales.toLocaleString()}</div></CardContent></Card>
                    <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">שעות עבודה החודש</CardTitle><Clock className="w-4 h-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{monthlyStats.totalHours}</div></CardContent></Card>
                    <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">דירוג מנהל ממוצע</CardTitle><Star className="w-4 h-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{monthlyStats.avgManagerRating} / 5</div></CardContent></Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">אחוז שירות ממוצע</CardTitle>
                            <Target className="w-4 h-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {monthlyStats.avgServiceRating !== 'N/A' ? `${monthlyStats.avgServiceRating}%` : 'N/A'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                יעד: 14% | {monthlyStats.avgServiceRating !== 'N/A' && monthlyStats.avgServiceRating >= 14 ? '✅ עומד ביעד' : '❌ מתחת ליעד'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                    </TabsContent>

                    <TabsContent value="onboarding" className="space-y-6 mt-4">
                        {crm && <EmployeeOnboarding employeeId={employee.id} steps={crm.onboarding || []} done={crm.onboarding_done || 0} total={crm.onboarding_total || 10} onChange={() => loadCrm()} />}
                        <SignedAgreementCard employeeId={employee.id} employeeName={employee.full_name} />
                        {crm && <EmployeeDocuments employeeId={employee.id} documents={crm.documents || []} onChange={() => loadCrm()} />}
                    </TabsContent>

                    <TabsContent value="file" className="mt-4">
                {/* Itzik #1/#2 — 360° HR card: forms/signatures + life-in-the-group timeline */}
                <Employee360 employeeId={employee.id} employeeName={employee.full_name} />
                    </TabsContent>

                    <TabsContent value="shifts" className="space-y-6 mt-4">
                {/* Real attendance + lateness from clock vs roster */}
                <EmployeeShiftHistory employeeId={employee.id} />
                {/* Shifts List (sales/ratings history) */}
                <Card>
                    <CardHeader>
                        <CardTitle>היסטוריית משמרות (מכירות ודירוגים)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {shifts.length > 0 ? shifts.map(shift => (
                                <div key={shift.id} className="border p-4 rounded-lg hover:bg-white transition-colors">
                                    <div className="flex flex-wrap justify-between items-start gap-4">
                                        <div>
                                            <p className="font-bold text-lg">{new Date(shift.date).toLocaleDateString('he-IL')}</p>
                                            <p className="text-sm text-gray-500">{shift.area || 'אזור לא צוין'}</p>
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium">עמידה ביעד</span>
                                                <span className="text-sm font-bold">{shift.sales_target ? `${Math.round((shift.sales_amount / shift.sales_target) * 100)}%` : 'אין יעד'}</span>
                                            </div>
                                            <Progress value={shift.sales_target ? (shift.sales_amount / shift.sales_target) * 100 : 0} />
                                            <p className="text-xs text-center mt-1">₪{shift.sales_amount.toLocaleString()} מתוך יעד של ₪{shift.sales_target ? shift.sales_target.toLocaleString() : '0'}</p>
                                        </div>
                                        <div className="text-sm space-y-1 text-right">
                                            <p><strong>שעות:</strong> {shift.hours_worked}</p>
                                            <p><strong>דירוג מנהל:</strong> {shift.manager_rating || 'לא דורג'}</p>
                                            <p><strong>שירות לקוחות:</strong> {shift.customer_service_rating ? `${shift.customer_service_rating}%` : 'אין נתון'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => {setEditingShift(shift); setIsShiftFormOpen(true);}}><Edit className="w-4 h-4" /></Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteShift(shift.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                        </div>
                                    </div>
                                    {shift.notes && <p className="text-sm mt-2 p-2 bg-gray-100 rounded"><strong>הערות:</strong> {shift.notes}</p>}
                                </div>
                            )) : (
                                <p className="text-center text-gray-500 py-8">אין משמרות רשומות עבור עובד זה. לחץ על "הוסף משמרת" כדי להתחיל.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                    </TabsContent>

                    <TabsContent value="meetings" className="mt-4">
                        <EmployeeMeetings employeeId={employee.id} meetings={crm?.meetings || []} salaryHistory={crm?.salary_history || []} onChange={() => loadCrm()} />
                    </TabsContent>

                    <TabsContent value="notes" className="mt-4">
                        <EmployeeNotesTasks employeeId={employee.id} notes={crm?.notes || []} tasks={crm?.tasks || []} onChange={() => loadCrm()} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
