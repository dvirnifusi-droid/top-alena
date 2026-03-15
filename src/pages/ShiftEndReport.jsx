import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShiftEndReport } from '@/entities/ShiftEndReport';
import { User } from '@/entities/User';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, ChefHat, Wine, Star, BarChart2,
  DollarSign, ShoppingBag, UserX, Loader2, Save, Camera, Truck, FileText, Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";

const StarRating = ({ rating, onRatingChange, label, readOnly = false }) => (
    <div className="flex items-center gap-2">
        {label && <Label className="font-medium">{label}:</Label>}
        <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => !readOnly && onRatingChange(star)}
                    className={`focus:outline-none ${readOnly ? 'cursor-default' : ''}`}
                    disabled={readOnly}
                >
                    <Star
                        className={`w-6 h-6 transition-colors ${
                            rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                        }`}
                    />
                </button>
            ))}
        </div>
    </div>
);

const ZReportScanner = ({ onScanComplete, onDataExtracted, children }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [isOpen, setIsOpen] = useState(false);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsScanning(true);
        setScanResult(null);

        try {
            const uploadResponse = await UploadFile({ file });
            if (!uploadResponse.file_url) throw new Error("File upload failed.");
            onScanComplete(uploadResponse.file_url);

            const extractionResult = await ExtractDataFromUploadedFile({
                file_url: uploadResponse.file_url,
                json_schema: {
                    type: "object",
                    properties: {
                        z_report_number: { type: "string" },
                        total_revenue: { type: "number" },
                        total_covers: { type: "integer" },
                        total_credit_card: { type: "number" },
                        total_cash: { type: "number" },
                        total_credit_card_tips: { type: "number" }
                    }
                }
            });

            if (extractionResult.status === 'success' && extractionResult.output) {
                onDataExtracted({ z_report_data: extractionResult.output });
                setScanResult({ type: 'success', message: 'הנתונים נסרקו בהצלחה!' });
                toast.success('נתוני דוח Z מולאו אוטומטית.');
                setTimeout(() => setIsOpen(false), 2000);
            } else {
                throw new Error(extractionResult.details || "שגיאה בחילוץ הנתונים.");
            }

        } catch (error) {
            setScanResult({ type: 'error', message: `שגיאת סריקה: ${error.message}` });
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent dir="rtl">
                <DialogHeader>
                    <DialogTitle>סריקת דוח Z</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
                        <input id="z-report-scan" type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isScanning} />
                        <label htmlFor="z-report-scan" className={`flex flex-col items-center justify-center gap-2 cursor-pointer ${isScanning ? 'opacity-50' : ''}`}>
                            {isScanning ? <Loader2 className="w-8 h-8 animate-spin text-purple-600" /> : <Camera className="w-8 h-8 text-purple-600" />}
                            <span className="text-sm font-medium">{isScanning ? 'סורק...' : 'צלם או העלה תמונה'}</span>
                        </label>
                    </div>
                    {scanResult && <Alert variant={scanResult.type === 'error' ? 'destructive' : 'default'}><AlertTitle>{scanResult.type === 'success' ? 'הצלחה' : 'שגיאה'}</AlertTitle><AlertDescription>{scanResult.message}</AlertDescription></Alert>}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DeliveryReportScanner = ({ onDataExtracted, children }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [isOpen, setIsOpen] = useState(false);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsScanning(true);
        setScanResult(null);

        try {
            const { file_url } = await UploadFile({ file }); // Changed from UploadPrivateFile to UploadFile
            const extractionResult = await ExtractDataFromUploadedFile({
                file_url: file_url,
                json_schema: {
                    type: "object",
                    properties: {
                        wolt_deliveries: { type: "integer" }, cibus_deliveries: { type: "integer" },
                        ten_bis_deliveries: { type: "integer" }, valuecard_deliveries: { type: "integer" },
                        mishoha_deliveries: { type: "integer" }, total_deliveries: { type: "integer" },
                        credit_deliveries_amount: { type: "number" }, cash_deliveries_amount: { type: "number" },
                        total_deliveries_amount: { type: "number" }
                    }
                }
            });

            if (extractionResult.status === 'success' && extractionResult.output) {
                onDataExtracted({ delivery_data: extractionResult.output });
                setScanResult({ type: 'success', message: 'נתוני המשלוחים נסרקו בהצלחה!' });
                toast.success('נתוני המשלוחים מולאו אוטומטית.');
                setTimeout(() => setIsOpen(false), 2000);
            } else {
                throw new Error(extractionResult.details || "שגיאה בחילוץ נתוני המשלוח.");
            }
        } catch (error) {
            setScanResult({ type: 'error', message: `שגיאת סריקה: ${error.message}` });
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>סריקת דוח משלוחים</DialogTitle></DialogHeader>
                <div className="space-y-4">
                     <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
                        <input id="delivery-report-scan" type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isScanning} />
                        <label htmlFor="delivery-report-scan" className={`flex flex-col items-center justify-center gap-2 cursor-pointer ${isScanning ? 'opacity-50' : ''}`}>
                            {isScanning ? <Loader2 className="w-8 h-8 animate-spin text-orange-600" /> : <Truck className="w-8 h-8 text-orange-600" />}
                            <span className="text-sm font-medium">{isScanning ? 'סורק...' : 'צלם או העלה דוח משלוחים'}</span>
                        </label>
                    </div>
                    {scanResult && <Alert variant={scanResult.type === 'error' ? 'destructive' : 'default'}><AlertTitle>{scanResult.type === 'success' ? 'הצלחה' : 'שגיאה'}</AlertTitle><AlertDescription>{scanResult.message}</AlertDescription></Alert>}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const FinancialDetail = ({ label, value, icon: Icon, isCurrency = true, fieldKey, isEditing, onChange }) => (
    <div className="flex items-start gap-3 p-3 bg-gray-50/50 rounded-lg border">
        <div className="bg-gray-100 p-2 rounded-md mt-1">
            <Icon className="w-5 h-5 text-gray-500" />
        </div>
        <div className="flex-1">
            <p className="text-sm text-gray-500">{label}</p>
            {isEditing ? (
                <Input
                    type="number"
                    value={value || ''}
                    onChange={(e) => onChange(fieldKey, e.target.value)}
                    className="h-9 mt-1 font-bold text-lg p-1"
                />
            ) : (
                <p className="font-bold text-lg">{value !== null && value !== undefined ? (isCurrency ? `₪${Number(value).toLocaleString()}` : Number(value).toLocaleString()) : 'N/A'}</p>
            )}
        </div>
    </div>
);

export default function ShiftEndReportPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('general');
    const [isSaving, setIsSaving] = useState(false);
    const [isEditingFinancials, setIsEditingFinancials] = useState(false);

    const [reportData, setReportData] = useState({
        shift_date: new Date().toISOString().split('T')[0],
        shift_type: 'dinner',
        manager_name: '',
        total_covers: null, total_revenue: null, staff_performance: [],
        department_performance: {
            kitchen: { rating: 0, notes: '', issues: '' },
            service: { rating: 0, notes: '', issues: '' },
            bar: { rating: 0, notes: '', issues: '' }
        },
        key_incidents: [''], inventory_issues: '', customer_feedback: '',
        recommendations: '', overall_rating: 0, z_report_number: null,
        total_credit_card: null, total_cash: null, total_credit_card_tips: null,
        tip_per_hour_waiter: null, total_takeaway_amount: null,
        avg_spend_dine_in: null, avg_spend_takeaway: null, total_item_discounts_value: null,
        canceled_items_count: null, canceled_items_value: null, canceled_orders_count: null,
        z_report_image_uri: '', delivery_data: null,
    });

    const updateReportData = (field, value) => {
      if (field.startsWith('delivery_data.')) {
          const deliveryKey = field.split('.')[1];
          setReportData(prev => ({
              ...prev,
              delivery_data: { ...(prev.delivery_data || {}), [deliveryKey]: value }
          }));
      } else {
          setReportData(prev => ({ ...prev, [field]: value }));
      }
    };
    
    const handleDepartmentPerformanceChange = (department, field, value) => {
        setReportData(prev => ({ ...prev, department_performance: { ...prev.department_performance, [department]: { ...prev.department_performance[department], [field]: value }}}));
    };

    const handleStaffPerformanceChange = (index, field, value) => {
        setReportData(prev => {
            const updatedStaff = [...prev.staff_performance];
            updatedStaff[index] = { ...updatedStaff[index], [field]: value };
            return { ...prev, staff_performance: updatedStaff };
        });
    };

    const loadUserAndShift = useCallback(async () => {
        try {
            const currentUser = await User.me();
            setUser(currentUser);
            
            // נסה להביא שם מ-Employee entity (יותר עדכני)
            let managerName = currentUser.full_name;
            try {
                const { Employee } = await import('@/entities/Employee');
                const employees = await Employee.filter({ email: currentUser.email });
                if (employees.length > 0 && employees[0].full_name) {
                    managerName = employees[0].full_name;
                }
            } catch (e) {
                // fallback to user full_name
            }
            
            updateReportData('manager_name', managerName);
        } catch (error) { toast.error('שגיאה בטעינת נתוני משתמש.'); }
    }, []);

    useEffect(() => { loadUserAndShift(); }, [loadUserAndShift]);

    const handleDataExtracted = (data) => {
        const { z_report_data, delivery_data } = data;
        if (z_report_data) {
            setReportData(prev => ({ ...prev, ...z_report_data }));
        }
        if (delivery_data) {
            setReportData(prev => ({ ...prev, delivery_data: { ...(prev.delivery_data || {}), ...delivery_data } }));
        }
    };
    
    const handleStarRating = (category, rating) => {
        if (category === 'overall') updateReportData('overall_rating', rating);
        else handleDepartmentPerformanceChange(category, 'rating', rating);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const numericFields = [
                'total_covers', 'total_revenue', 'total_credit_card', 'total_cash', 
                'total_credit_card_tips', 'tip_per_hour_waiter', 'total_takeaway_amount',
                'avg_spend_dine_in', 'avg_spend_takeaway', 'total_item_discounts_value',
                'canceled_items_count', 'canceled_items_value', 'canceled_orders_count'
            ];
            const cleanedReportData = { ...reportData };
            numericFields.forEach(field => {
                if (cleanedReportData[field]) {
                    cleanedReportData[field] = parseFloat(cleanedReportData[field]);
                }
            });
            await ShiftEndReport.create(cleanedReportData);
            toast.success('דוח סיום משמרת נשמר בהצלחה!');
            navigate(createPageUrl('Reports'));
        } catch (error) {
            console.error('Error saving report:', error);
            toast.error('שגיאה בשמירת הדוח.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const financialFields = [
        { key: 'total_covers', label: 'סך סועדים', icon: Users, isCurrency: false },
        { key: 'total_revenue', label: 'סך הכנסות', icon: DollarSign },
        { key: 'z_report_number', label: 'Z מספר דוח', icon: FileText, isCurrency: false },
        { key: 'total_credit_card', label: 'סך הכל אשראי', icon: DollarSign },
        { key: 'total_cash', label: 'סך הכל מזומן', icon: DollarSign },
        { key: 'total_credit_card_tips', label: 'טיפים באשראי', icon: DollarSign },
        { key: 'tip_per_hour_waiter', label: 'טיפ לשעה מלצר', icon: BarChart2 },
        { key: 'total_takeaway_amount', label: 'הכנסות Takeaway', icon: ShoppingBag },
        { key: 'avg_spend_dine_in', label: 'ממוצע לסועד', icon: BarChart2 },
        { key: 'avg_spend_takeaway', label: 'ממוצע ל-Takeaway', icon: BarChart2 },
        { key: 'total_item_discounts_value', label: 'שווי הנחות פריטים', icon: DollarSign },
        { key: 'canceled_items_count', label: 'כמות פריטים מבוטלים', icon: UserX, isCurrency: false },
        { key: 'canceled_items_value', label: 'שווי פריטים מבוטלים', icon: DollarSign },
        { key: 'canceled_orders_count', label: 'כמות הזמנות מבוטלות', icon: UserX, isCurrency: false },
    ];
    
    const deliveryFields = [
        { key: 'wolt_deliveries', label: 'Wolt', icon: Truck, isCurrency: false },
        { key: 'cibus_deliveries', label: 'Cibus', icon: Truck, isCurrency: false },
        { key: 'ten_bis_deliveries', label: 'Ten Bis', icon: Truck, isCurrency: false },
        { key: 'valuecard_deliveries', label: 'ValueCard', icon: Truck, isCurrency: false },
        { key: 'mishoha_deliveries', label: 'Mishoha', icon: Truck, isCurrency: false },
        { key: 'total_deliveries', label: 'סה"כ משלוחים', icon: ShoppingBag, isCurrency: false },
        { key: 'credit_deliveries_amount', label: 'כסף (אשראי)', icon: DollarSign, isCurrency: true },
        { key: 'cash_deliveries_amount', label: 'כסף (מזומן)', icon: DollarSign, isCurrency: true },
        { key: 'total_deliveries_amount', label: 'סה"כ כסף', icon: DollarSign, isCurrency: true },
    ];

    const tabs = [
        { id: 'general', label: 'פרטים כלליים' },
        { id: 'staff', label: 'ביצועי עובדים' },
        { id: 'departments', label: 'מחלקות' },
        { id: 'summary', label: 'סיכום והמלצות' },
    ];

    return (
        <div className="min-h-screen bg-gray-100 p-4 sm:p-6" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
                    <div className="flex flex-wrap justify-between items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">דוח סיום משמרת - {user?.full_name}</h1>
                            <p className="text-gray-500">Nifusi</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Input type="date" value={reportData.shift_date} onChange={e => updateReportData('shift_date', e.target.value)} className="w-auto" />
                            <Select value={reportData.shift_type} onValueChange={v => updateReportData('shift_type', v)}>
                                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="lunch">צהריים</SelectItem>
                                    <SelectItem value="dinner">ערב</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="border-t mt-4 pt-4 flex flex-wrap justify-start items-center gap-2">
                        <Button onClick={handleSubmit} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                           {isSaving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />} שמור דוח
                        </Button>
                        <ZReportScanner onScanComplete={uri => updateReportData('z_report_image_uri', uri)} onDataExtracted={handleDataExtracted}>
                           <Button variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50"><Camera className="w-4 h-4 ml-2" /> סרוק דוח Z</Button>
                        </ZReportScanner>
                        <DeliveryReportScanner onDataExtracted={handleDataExtracted}>
                             <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50"><Truck className="w-4 h-4 ml-2" /> סרוק משלוחים</Button>
                        </DeliveryReportScanner>
                        <Button variant="outline"><FileText className="w-4 h-4 ml-2" /> הורד כתמונה</Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-t-lg shadow-sm">
                    <div className="border-b">
                        <nav className="flex -mb-px">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`py-3 px-4 sm:px-6 font-medium text-sm transition-colors duration-200 ${
                                        activeTab === tab.id
                                            ? 'border-b-2 border-blue-600 text-blue-600'
                                            : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
                
                {/* Tab Content */}
                <div className="bg-white p-4 sm:p-6 rounded-b-lg shadow-sm">
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            <Card>
                                <CardHeader className="flex flex-row justify-between items-center">
                                    <CardTitle>סיכום כספי מהדוח</CardTitle>
                                    <Button variant="ghost" size="icon" onClick={() => setIsEditingFinancials(!isEditingFinancials)}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {financialFields.map(field => (
                                        <FinancialDetail key={field.key} {...field} fieldKey={field.key} value={reportData[field.key]} isEditing={isEditingFinancials} onChange={updateReportData} />
                                    ))}
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader className="flex flex-row justify-between items-center">
                                    <CardTitle>סיכום משלוחים</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {deliveryFields.map(field => (
                                        <FinancialDetail 
                                            key={field.key} 
                                            {...field} 
                                            fieldKey={`delivery_data.${field.key}`}
                                            value={reportData.delivery_data ? reportData.delivery_data[field.key] : null}
                                            isEditing={isEditingFinancials} 
                                            onChange={updateReportData}
                                        />
                                    ))}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>דירוג כללי למשמרת</CardTitle></CardHeader>
                                <CardContent>
                                    <StarRating rating={reportData.overall_rating} onRatingChange={(r) => handleStarRating('overall', r)} />
                                </CardContent>
                            </Card>
                        </div>
                    )}
                    {activeTab === 'staff' && (
                        <div>
                             <p className="text-gray-500 mb-4">הערכת ביצועים של חברי הצוות במשמרת.</p>
                            <div className="space-y-4">
                                {reportData.staff_performance.map((staff, index) => (
                                    <div key={index} className="p-4 border rounded-lg space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input placeholder="שם עובד" value={staff.employee_name} onChange={(e) => handleStaffPerformanceChange(index, 'employee_name', e.target.value)} />
                                            <Input placeholder="תפקיד" value={staff.position} onChange={(e) => handleStaffPerformanceChange(index, 'position', e.target.value)} />
                                        </div>
                                        <StarRating rating={staff.performance_rating} onRatingChange={(rating) => handleStaffPerformanceChange(index, 'performance_rating', rating)} label="דירוג" />
                                        <Textarea placeholder="נקודות חוזק..." value={staff.strengths} onChange={(e) => handleStaffPerformanceChange(index, 'strengths', e.target.value)} />
                                        <Textarea placeholder="תחומים לשיפור..." value={staff.improvements_needed} onChange={(e) => handleStaffPerformanceChange(index, 'improvements_needed', e.target.value)} />
                                    </div>
                                ))}
                            </div>
                            <Button variant="outline" type="button" className="mt-4" onClick={() => setReportData(prev => ({ ...prev, staff_performance: [...prev.staff_performance, { employee_name: '', position: '', performance_rating: 0, strengths: '', improvements_needed: '' }] }))}>
                                הוסף עובד
                            </Button>
                        </div>
                    )}
                    {activeTab === 'departments' && (
                        <div className="grid md:grid-cols-3 gap-6">
                            {[ { key: 'kitchen', title: 'מטבח', icon: ChefHat }, { key: 'service', title: 'שירות', icon: Users }, { key: 'bar', title: 'בר', icon: Wine } ].map(dept => (
                                <Card key={dept.key}>
                                    <CardHeader><CardTitle className="flex items-center gap-3"><dept.icon className="w-6 h-6" /> {dept.title}</CardTitle></CardHeader>
                                    <CardContent className="space-y-4">
                                        <StarRating rating={reportData.department_performance[dept.key].rating} onRatingChange={(rating) => handleStarRating(dept.key, rating)} label="דירוג כללי" />
                                        <Textarea value={reportData.department_performance[dept.key].notes} onChange={(e) => handleDepartmentPerformanceChange(dept.key, 'notes', e.target.value)} placeholder="הערות חיוביות..." />
                                        <Textarea value={reportData.department_performance[dept.key].issues} onChange={(e) => handleDepartmentPerformanceChange(dept.key, 'issues', e.target.value)} placeholder="בעיות שזוהו..." />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                    {activeTab === 'summary' && (
                        <div className="space-y-6">
                            <div><Label>אירועים מרכזיים</Label><Textarea value={reportData.key_incidents[0] || ''} onChange={(e) => updateReportData('key_incidents', [e.target.value])} placeholder="אירועים חשובים שקרו במשמרת..." /></div>
                            <div><Label>בעיות מלאי</Label><Textarea value={reportData.inventory_issues} onChange={(e) => updateReportData('inventory_issues', e.target.value)} placeholder="חוסרים במלאי, בעיות באיכות..." /></div>
                            <div><Label>משוב מלקוחות</Label><Textarea value={reportData.customer_feedback} onChange={(e) => updateReportData('customer_feedback', e.target.value)} placeholder="מחמאות, תלונות, הערות..." /></div>
                            <div><Label>המלצות לשיפור</Label><Textarea value={reportData.recommendations} onChange={(e) => updateReportData('recommendations', e.target.value)} placeholder="מה לשפר למשמרת הבאה?" /></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}