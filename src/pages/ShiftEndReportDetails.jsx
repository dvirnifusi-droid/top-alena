import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ShiftEndReport } from '@/entities/ShiftEndReport';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Star, Users, ChefHat, Wine, FileText, DollarSign, ShoppingBag, UserX, BarChart2, Pencil, Save, X, Eye, Download, Camera, Smartphone } from 'lucide-react';
import ShiftReportAiAnalysis from '@/components/ai/ShiftReportAiAnalysis';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CreateFileSignedUrl, UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const StarRating = ({ rating, label }) => (
    <div className="flex items-center gap-2">
        <span className="font-medium">{label}:</span>
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={`w-5 h-5 ${rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                />
            ))}
        </div>
        <span className="font-semibold">({rating}/5)</span>
    </div>
);

const FinancialDetail = ({ label, value, icon: Icon, isCurrency = true, isEditing = false, onFieldChange, fieldKey }) => (
    <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
        <div className="bg-gray-200 p-2 rounded-md">
            <Icon className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1">
            <p className="text-sm text-gray-500">{label}</p>
            {isEditing ? (
                <Input
                    type="number"
                    value={value !== null && value !== undefined ? value : ''}
                    onChange={(e) => onFieldChange(fieldKey, e.target.value)}
                    className="h-9 mt-1 font-bold text-lg p-1"
                />
            ) : (
                <p className="font-bold text-lg">{value !== null && value !== undefined ? (isCurrency ? `₪${Number(value).toLocaleString()}` : value) : 'לא הוזן'}</p>
            )}
        </div>
    </div>
);

const ZReportImageViewer = ({ fileUri }) => {
    const [signedUrl, setSignedUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const getUrl = useCallback(async () => {
        if (!fileUri || signedUrl) return;
        setLoading(true);
        try {
            const result = await CreateFileSignedUrl({ file_uri: fileUri });
            setSignedUrl(result.signed_url);
        } catch (error) {
            console.error("Error creating signed URL", error);
        } finally {
            setLoading(false);
        }
    }, [fileUri, signedUrl]);

    useEffect(() => {
        if (isOpen) {
            getUrl();
        }
    }, [isOpen, getUrl]);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><Eye className="w-4 h-4 ml-2" />צפה בתמונת הדוח</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl" dir="rtl">
                <DialogHeader>
                    <DialogTitle>תמונת דוח Z</DialogTitle>
                </DialogHeader>
                <div className="flex items-center justify-center p-4 min-h-[60vh] bg-gray-100 rounded-md">
                    {loading ? <Loader2 className="w-8 h-8 animate-spin" /> :
                     signedUrl ? <img src={signedUrl} alt="תמונת דוח Z" className="max-w-full max-h-[80vh] object-contain" /> :
                     <p>לא ניתן היה לטעון את התמונה או שאין תמונה מצורפת.</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DeliveryScanner = ({ onDeliveryData }) => {
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);

    const handleScan = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setScanning(true);
        setResult(null);

        try {
            const { file_url } = await UploadFile({ file });
            const extractionResult = await ExtractDataFromUploadedFile({
                file_url: file_url,
                json_schema: {
                    type: "object",
                    properties: {
                        wolt_deliveries: { type: "integer" },
                        cibus_deliveries: { type: "integer" },
                        ten_bis_deliveries: { type: "integer" },
                        valuecard_deliveries: { type: "integer" },
                        mishoha_deliveries: { type: "integer" },
                        total_deliveries: { type: "integer" },
                        credit_deliveries_amount: { type: "number", description: "Total money amount from credit deliveries in shekels" },
                        cash_deliveries_amount: { type: "number", description: "Total money amount from cash deliveries in shekels" },
                        total_deliveries_amount: { type: "number", description: "Total money amount from all deliveries" }
                    }
                }
            });

            if (extractionResult.status === 'success' && extractionResult.output) {
                const data = extractionResult.output;
                onDeliveryData(data);
                setResult({ type: 'success', message: 'נתוני המשלוחים נסרקו בהצלחה!' });
            } else {
                throw new Error(extractionResult.details || 'שגיאה בחילוץ נתוני המשלוח');
            }
        } catch (error) {
            setResult({ type: 'error', message: error.message });
        } finally {
            setScanning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
                <input
                    id="delivery-scan"
                    type="file"
                    accept="image/*"
                    onChange={handleScan}
                    className="hidden"
                    disabled={scanning}
                />
                <label
                    htmlFor="delivery-scan"
                    className={`flex flex-col items-center justify-center gap-2 cursor-pointer ${scanning ? 'opacity-50' : ''}`}
                >
                    {scanning ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    ) : (
                        <Smartphone className="w-8 h-8 text-blue-600" />
                    )}
                    <span className="text-sm font-medium">
                        {scanning ? 'סורק נתוני משלוחים...' : 'צלם דוח משלוחים'}
                    </span>
                </label>
            </div>

            {result && (
                <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
                    <AlertTitle>{result.type === 'success' ? 'הצלחה!' : 'שגיאה'}</AlertTitle>
                    <AlertDescription>{result.message}</AlertDescription>
                </Alert>
            )}
        </div>
    );
};

export default function ShiftEndReportDetailsPage() {
    const [report, setReport] = useState(null);
    const [editedReport, setEditedReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeliveryScanner, setShowDeliveryScanner] = useState(false);
    const [scannedDeliveryData, setScannedDeliveryData] = useState(null); // New state for scanned data

    const location = useLocation();
    const reportId = new URLSearchParams(location.search).get('id');
    const editMode = new URLSearchParams(location.search).get('edit');

    const loadReport = useCallback(async () => {
        if (!reportId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await ShiftEndReport.get(reportId);
            setReport(data);
            setEditedReport(data);
        } catch (error) {
            console.error("Error loading report", error);
            // Optionally set an error state for user feedback
        } finally {
            setLoading(false);
        }
    }, [reportId]);

    useEffect(() => {
        loadReport();
        // If edit mode is specified in URL, start editing immediately
        if (editMode === 'true') {
            setIsEditing(true);
        }
    }, [loadReport, editMode]);
    
    const handleFieldChange = useCallback((key, value) => {
        let processedValue = value;
        // List of keys that are expected to be numbers
        const numericKeys = [
            'total_revenue', 'total_covers', 'z_report_number', 'total_credit_card', 'total_cash',
            'total_credit_card_tips', 'tip_per_hour_waiter', 'total_takeaway_amount',
            'avg_spend_dine_in', 'avg_spend_takeaway', 'total_item_discounts_value',
            'canceled_items_count', 'canceled_items_value', 'canceled_orders_count',
            'wolt_deliveries', 'cibus_deliveries', 'ten_bis_deliveries', 'valuecard_deliveries',
            'mishoha_deliveries', 'total_deliveries', 'credit_deliveries_amount',
            'cash_deliveries_amount', 'total_deliveries_amount'
        ];
        
        if (numericKeys.includes(key)) {
            processedValue = value === '' ? null : Number(value);
        }
        // For 'shift_date' and 'shift_type', value is a string and does not need conversion.
        // For nested delivery_data, need to update the correct path
        if (key.startsWith('delivery_data.')) {
            const deliveryKey = key.split('.')[1];
            setEditedReport(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    delivery_data: {
                        ...(prev.delivery_data || {}),
                        [deliveryKey]: processedValue
                    }
                };
            });
        } else {
            setEditedReport(prev => {
                if (!prev) return null;
                return { ...prev, [key]: processedValue };
            });
        }
    }, []);

    const handleDeliveryDataScanned = useCallback((data) => {
        setScannedDeliveryData(data); // Store scanned data temporarily
        setEditedReport(prev => ({
            ...prev,
            delivery_data: { ...(prev.delivery_data || {}), ...data } // Also update editedReport directly
        }));
        // Don't close the scanner immediately - let user see the results
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // editedReport already contains all modifications (including date, shift type, and delivery_data)
            const updatedReport = await ShiftEndReport.update(report.id, editedReport);
            setReport(updatedReport);
            setEditedReport(updatedReport);
            setIsEditing(false);
            setScannedDeliveryData(null); // Clear scanned data after saving
        } catch (error) {
            console.error("Error saving report", error);
            alert("שגיאה בשמירת הדוח: " + (error.message || "נסה שוב."));
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCancel = () => {
        setEditedReport(report); // Revert editedReport to the original report state
        setIsEditing(false);
        setShowDeliveryScanner(false); // Close scanner on cancel
        setScannedDeliveryData(null); // Clear scanned data if editing is canceled
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadCSV = () => {
        if (!report) return;

        const escapeCSV = (str) => {
            if (str === null || str === undefined) return '';
            const s = String(str);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const financialFieldsForCSV = [
            { key: 'total_revenue', label: 'סך הכנסות' },
            { key: 'total_covers', label: 'סך סועדים' },
            { key: 'z_report_number', label: 'מספר דוח Z' },
            { key: 'total_credit_card', label: 'סך הכל אשראי' },
            { key: 'total_cash', label: 'סך הכל מזומן' },
            { key: 'total_credit_card_tips', label: 'טיפים' },
            { key: 'tip_per_hour_waiter', label: 'טיפ לשעה מלצר' },
            { key: 'total_takeaway_amount', label: 'הכנסות Takeaway' },
            { key: 'avg_spend_dine_in', label: 'ממוצע לסועד' },
            { key: 'avg_spend_takeaway', label: 'ממוצע ל-Takeaway' },
            { key: 'total_item_discounts_value', label: 'שווי הנחות פריטים' },
            { key: 'canceled_items_count', label: 'כמות פריטים מבוטלים' },
            { key: 'canceled_items_value', label: 'שווי פריטים מבוטלים' },
            { key: 'canceled_orders_count', label: 'כמות הזמנות מבוטלות' },
        ];

        let csvContent = "נושא,פירוט\n";
        
        // מידע כללי על הדוח
        csvContent += `דוח סיום משמרת,${format(new Date(report.shift_date), 'dd/MM/yyyy')}\n`;
        csvContent += `סוג משמרת,${report.shift_type === 'dinner' ? 'ערב' : 'צהריים'}\n`;
        csvContent += `שם מנהל,${escapeCSV(report.manager_name)}\n`;
        csvContent += `דירוג כללי,"${report.overall_rating}/5"\n\n`;
        
        // סיכום כספי מלא
        csvContent += "--- סיכום כספי ---\n";
        financialFieldsForCSV.forEach(field => {
            const value = report[field.key];
            csvContent += `${escapeCSV(field.label)},${escapeCSV(value !== null && value !== undefined ? value : 'לא הוזן')}\n`;
        });

        // נתוני משלוחים (אם קיימים)
        if (report.delivery_data) {
            const deliveryData = report.delivery_data;
            csvContent += "\n--- נתוני משלוחים ---\n";
            csvContent += `משלוחי Wolt,${escapeCSV(deliveryData.wolt_deliveries)}\n`;
            csvContent += `משלוחי Cibus,${escapeCSV(deliveryData.cibus_deliveries)}\n`;
            csvContent += `משלוחי Ten Bis,${escapeCSV(deliveryData.ten_bis_deliveries)}\n`;
            csvContent += `משלוחי ValueCard,${escapeCSV(deliveryData.valuecard_deliveries)}\n`;
            csvContent += `משלוחי Mishoha,${escapeCSV(deliveryData.mishoha_deliveries)}\n`;
            csvContent += `סך הכל משלוחים,${escapeCSV(deliveryData.total_deliveries)}\n`;
            csvContent += `סך הכל כסף משלוחים באשראי,${escapeCSV(`₪${(deliveryData.credit_deliveries_amount || 0).toLocaleString()}`)}\n`;
            csvContent += `סך הכל כסף משלוחים במזומן,${escapeCSV(`₪${(deliveryData.cash_deliveries_amount || 0).toLocaleString()}`)}\n`;
            csvContent += `סך הכל כסף ממשלוחים,${escapeCSV(`₪${(deliveryData.total_deliveries_amount || 0).toLocaleString()}`)}\n`;
        }

        // ביצועי מחלקות (מטבח, שירות, בר)
        if (report.department_performance && Object.keys(report.department_performance).length > 0) {
            csvContent += "\n--- ביצועי מחלקות ---\n";
            Object.entries(report.department_performance).forEach(([deptKey, deptData]) => {
                const deptName = deptKey === 'kitchen' ? 'מטבח' : 
                                deptKey === 'service' ? 'שירות' : 
                                deptKey === 'bar' ? 'בר' : deptKey;
                
                csvContent += `${deptName} - דירוג,"${deptData.rating}/5"\n`;
                if (deptData.notes) {
                    csvContent += `${deptName} - הערות חיוביות,${escapeCSV(deptData.notes)}\n`;
                }
                if (deptData.issues) {
                    csvContent += `${deptName} - בעיות,${escapeCSV(deptData.issues)}\n`;
                }
                csvContent += `\n`;
            });
        }

        // ביצועי עובדים אישיים (אם קיימים)
        if (report.staff_performance && report.staff_performance.length > 0) {
            csvContent += "\n--- ביצועי עובדים ---\n";
            csvContent += "שם עובד,תפקיד,דירוג,חוזקות,לשיפור,אירועים\n";
            report.staff_performance.forEach(staff => {
                csvContent += `${escapeCSV(staff.employee_name || '')},${escapeCSV(staff.position || '')},"${staff.performance_rating !== null && staff.performance_rating !== undefined ? staff.performance_rating : 'N/A'}/5",${escapeCSV(staff.strengths || '')},${escapeCSV(staff.improvements_needed || '')},${escapeCSV(staff.specific_incidents || '')}\n`;
            });
        }

        // הערות ואירועים מיוחדים
        csvContent += "\n--- הערות ואירועים מיוחדים ---\n";
        if (report.key_incidents && report.key_incidents.length > 0) {
            csvContent += `אירועים מרכזיים,${escapeCSV(report.key_incidents.filter(Boolean).join('; '))}\n`;
        }
        if (report.inventory_issues) {
            csvContent += `בעיות מלאי,${escapeCSV(report.inventory_issues)}\n`;
        }
        if (report.customer_feedback) {
            csvContent += `משוב לקוחות,${escapeCSV(report.customer_feedback)}\n`;
        }
        if (report.recommendations) {
            csvContent += `המלצות לשיפור,${escapeCSV(report.recommendations)}\n`;
        }

        // זמני משמרת (אם קיימים)
        if (report.shift_start_time || report.shift_end_time) {
            csvContent += "\n--- זמני משמרת ---\n";
            if (report.shift_start_time) {
                csvContent += `שעת התחלה,${escapeCSV(report.shift_start_time)}\n`;
            }
            if (report.shift_end_time) {
                csvContent += `שעת סיום,${escapeCSV(report.shift_end_time)}\n`;
            }
        }

        // יצירת הקובץ להורדה
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const fileName = `דוח_סיום_משמרת_מלא_${format(new Date(report.shift_date), 'yyyy-MM-dd')}_${report.shift_type}.csv`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    if (!report) {
        return <div className="text-center p-8">לא נמצא דוח.</div>;
    }

    const reportData = isEditing ? editedReport : report;
    if (!reportData) return null;

    const financialFields = [
        { key: 'total_revenue', label: 'סך הכנסות', icon: DollarSign, isCurrency: true },
        { key: 'total_covers', label: 'סך סועדים', icon: Users, isCurrency: false },
        { key: 'z_report_number', label: 'מספר דוח Z', icon: FileText, isCurrency: false },
        { key: 'total_credit_card', label: 'סך הכל אשראי', icon: DollarSign, isCurrency: true },
        { key: 'total_cash', label: 'סך הכל מזומן', icon: DollarSign, isCurrency: true },
        { key: 'total_credit_card_tips', label: 'טיפים', icon: DollarSign, isCurrency: true },
        { key: 'tip_per_hour_waiter', label: 'טיפ לשעה מלצר', icon: BarChart2, isCurrency: true },
        { key: 'total_takeaway_amount', label: 'הכנסות Takeaway', icon: ShoppingBag, isCurrency: true },
        { key: 'avg_spend_dine_in', label: 'ממוצע לסועד', icon: BarChart2, isCurrency: true },
        { key: 'avg_spend_takeaway', label: 'ממוצע ל-Takeaway', icon: BarChart2, isCurrency: true },
        { key: 'total_item_discounts_value', label: 'שווי הנחות פריטים', icon: DollarSign, isCurrency: true },
        { key: 'canceled_items_count', label: 'כמות פריטים מבוטלים', icon: UserX, isCurrency: false },
        { key: 'canceled_items_value', label: 'שווי פריטים מבוטלים', icon: DollarSign, isCurrency: true },
        { key: 'canceled_orders_count', label: 'כמות הזמנות מבוטלות', icon: UserX, isCurrency: false },
    ];

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { font-family: 'Heebo', sans-serif; direction: rtl; }
                    .printable-area { width: 100% !important; margin: 0 !important; padding: 1rem !important; }
                }
            `}</style>
            
            <div className="max-w-7xl mx-auto space-y-6 printable-area">
                <div className="flex flex-wrap justify-between items-center gap-4 no-print">
                    <Button asChild variant="outline">
                        <Link to={createPageUrl('Reports')}>
                            <ArrowRight className="w-4 h-4 ml-2" />
                            חזרה לדוחות
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button onClick={handleDownloadCSV} variant="secondary">
                            <Download className="w-4 h-4 ml-2" />
                            הורד נתונים (CSV)
                        </Button>
                        <Button onClick={handlePrint}>
                            <Camera className="w-4 h-4 ml-2" />
                            הדפס דוח
                        </Button>
                        <Button onClick={() => setShowDeliveryScanner(!showDeliveryScanner)} variant="outline">
                            <Smartphone className="w-4 h-4 ml-2" />
                            סרוק משלוחים
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                {isEditing ? (
                                    <>
                                        <div className="flex items-center gap-4">
                                            <div>
                                                <Label htmlFor="shift_date">תאריך</Label>
                                                <Input
                                                    id="shift_date"
                                                    type="date"
                                                    value={format(new Date(reportData.shift_date), 'yyyy-MM-dd')}
                                                    onChange={(e) => handleFieldChange('shift_date', e.target.value)}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="shift_type">משמרת</Label>
                                                <Select value={reportData.shift_type} onValueChange={(value) => handleFieldChange('shift_type', value)}>
                                                    <SelectTrigger id="shift_type" className="mt-1">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="lunch">צהריים</SelectItem>
                                                        <SelectItem value="dinner">ערב</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <CardTitle className="text-2xl">
                                            דוח סיום משמרת: {format(new Date(reportData.shift_date), 'dd/MM/yyyy', { locale: he })}
                                        </CardTitle>
                                        <CardDescription className="text-lg">
                                            {reportData.shift_type === 'dinner' ? 'משמרת ערב' : 'משמרת צהריים'} | מנהל: {reportData.manager_name}
                                        </CardDescription>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-2 no-print self-start">
                                {isEditing ? (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={handleCancel}><X className="w-4 h-4 ml-1" /> בטל</Button>
                                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
                                            שמור
                                        </Button>
                                    </>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                        <Pencil className="w-4 h-4 ml-1" /> ערוך דוח
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                {showDeliveryScanner && (
                    <Card className="no-print">
                        <CardHeader>
                            <CardTitle>סריקת נתוני משלוחים</CardTitle>
                            <CardDescription>צלם את דוח המשלוחים כדי לחלץ אוטומטית את הנתונים</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DeliveryScanner onDeliveryData={handleDeliveryDataScanned} />
                        </CardContent>
                    </Card>
                )}

                {(reportData.delivery_data || scannedDeliveryData) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>נתוני משלוחים {scannedDeliveryData ? 'שנסרקו' : ''}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(() => {
                                const deliveryData = scannedDeliveryData || reportData.delivery_data;
                                return (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="text-center p-3 bg-orange-50 rounded-lg">
                                                <p className="text-sm text-orange-600">Wolt</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.wolt_deliveries !== null && deliveryData.wolt_deliveries !== undefined ? deliveryData.wolt_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.wolt_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.wolt_deliveries || 0}</p>
                                                )}
                                            </div>
                                            <div className="text-center p-3 bg-green-50 rounded-lg">
                                                <p className="text-sm text-green-600">Cibus</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.cibus_deliveries !== null && deliveryData.cibus_deliveries !== undefined ? deliveryData.cibus_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.cibus_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.cibus_deliveries || 0}</p>
                                                )}
                                            </div>
                                            <div className="text-center p-3 bg-blue-50 rounded-lg">
                                                <p className="text-sm text-blue-600">Ten Bis</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.ten_bis_deliveries !== null && deliveryData.ten_bis_deliveries !== undefined ? deliveryData.ten_bis_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.ten_bis_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.ten_bis_deliveries || 0}</p>
                                                )}
                                            </div>
                                            <div className="text-center p-3 bg-purple-50 rounded-lg">
                                                <p className="text-sm text-purple-600">ValueCard</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.valuecard_deliveries !== null && deliveryData.valuecard_deliveries !== undefined ? deliveryData.valuecard_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.valuecard_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.valuecard_deliveries || 0}</p>
                                                )}
                                            </div>
                                            <div className="text-center p-3 bg-red-50 rounded-lg">
                                                <p className="text-sm text-red-600">Mishoha</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.mishoha_deliveries !== null && deliveryData.mishoha_deliveries !== undefined ? deliveryData.mishoha_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.mishoha_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.mishoha_deliveries || 0}</p>
                                                )}
                                            </div>
                                            <div className="text-center p-3 bg-gray-50 rounded-lg">
                                                <p className="text-sm text-gray-600">סך הכל משלוחים</p>
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={deliveryData.total_deliveries !== null && deliveryData.total_deliveries !== undefined ? deliveryData.total_deliveries : ''}
                                                        onChange={(e) => handleFieldChange('delivery_data.total_deliveries', e.target.value)}
                                                        className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                    />
                                                ) : (
                                                    <p className="text-xl font-bold">{deliveryData.total_deliveries || 0}</p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {(deliveryData.credit_deliveries_amount || deliveryData.cash_deliveries_amount || deliveryData.total_deliveries_amount || isEditing) && (
                                            <div className="border-t pt-4">
                                                <h4 className="font-semibold mb-3 text-gray-800">סכומי כסף מהמשלוחים:</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="text-center p-4 bg-green-100 rounded-lg border border-green-200">
                                                        <p className="text-sm text-green-700 font-medium">סך הכל כסף משלוחים באשראי</p>
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                value={deliveryData.credit_deliveries_amount !== null && deliveryData.credit_deliveries_amount !== undefined ? deliveryData.credit_deliveries_amount : ''}
                                                                onChange={(e) => handleFieldChange('delivery_data.credit_deliveries_amount', e.target.value)}
                                                                className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                            />
                                                        ) : (
                                                            <p className="text-2xl font-bold text-green-800">₪{(deliveryData.credit_deliveries_amount || 0).toLocaleString()}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-center p-4 bg-blue-100 rounded-lg border border-blue-200">
                                                        <p className="text-sm text-blue-700 font-medium">סך הכל כסף משלוחים במזומן</p>
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                value={deliveryData.cash_deliveries_amount !== null && deliveryData.cash_deliveries_amount !== undefined ? deliveryData.cash_deliveries_amount : ''}
                                                                onChange={(e) => handleFieldChange('delivery_data.cash_deliveries_amount', e.target.value)}
                                                                className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                            />
                                                        ) : (
                                                            <p className="text-2xl font-bold text-blue-800">₪{(deliveryData.cash_deliveries_amount || 0).toLocaleString()}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-center p-4 bg-purple-100 rounded-lg border border-purple-200">
                                                        <p className="text-sm text-purple-700 font-medium">סך הכל כסף ממשלוחים</p>
                                                        {isEditing ? (
                                                            <Input
                                                                type="number"
                                                                value={deliveryData.total_deliveries_amount !== null && deliveryData.total_deliveries_amount !== undefined ? deliveryData.total_deliveries_amount : ''}
                                                                onChange={(e) => handleFieldChange('delivery_data.total_deliveries_amount', e.target.value)}
                                                                className="h-9 mt-1 font-bold text-lg p-1 text-center"
                                                            />
                                                        ) : (
                                                            <p className="text-2xl font-bold text-purple-800">₪{(deliveryData.total_deliveries_amount || 0).toLocaleString()}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {scannedDeliveryData && (
                                            <div className="flex justify-end gap-2 pt-4 border-t">
                                                <Button 
                                                    variant="outline" 
                                                    onClick={() => {
                                                        setScannedDeliveryData(null);
                                                        setShowDeliveryScanner(false);
                                                        setEditedReport(report); // Revert to original if not saved
                                                    }}
                                                >
                                                    ביטול
                                                </Button>
                                                <Button onClick={() => {
                                                    // Data is already saved in editedReport via handleDeliveryDataScanned
                                                    setShowDeliveryScanner(false);
                                                    setScannedDeliveryData(null); // Clear scanned data after "saving" it into editedReport
                                                }}>
                                                    שמור נתונים
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader className="flex flex-row justify-between items-center no-print">
                        <CardTitle>סיכום כספי</CardTitle>
                        <div className="flex gap-2">
                            {/* This is handled by the main edit button now */}
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {financialFields.map(field => (
                            <FinancialDetail 
                                key={field.key}
                                fieldKey={field.key}
                                label={field.label}
                                value={reportData[field.key]}
                                icon={field.icon}
                                isCurrency={field.isCurrency}
                                isEditing={isEditing}
                                onFieldChange={handleFieldChange}
                            />
                        ))}
                    </CardContent>
                </Card>

                {reportData.staff_performance && reportData.staff_performance.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>ביצועי עובדים</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {reportData.staff_performance.map((staff, index) => (
                                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                                    <h4 className="font-bold">{staff.employee_name} - {staff.position}</h4>
                                    <StarRating rating={staff.performance_rating} label="דירוג" />
                                    {staff.strengths && <p><strong>חוזקות:</strong> {staff.strengths}</p>}
                                    {staff.improvements_needed && <p><strong>לשיפור:</strong> {staff.improvements_needed}</p>}
                                    {staff.specific_incidents && <p><strong>אירועים:</strong> {staff.specific_incidents}</p>}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {Object.entries(reportData.department_performance || {}).map(([key, value]) => (
                        <Card key={key}>
                            <CardHeader>
                                <CardTitle className="capitalize flex items-center gap-2">
                                    {key === 'kitchen' ? <ChefHat/> : key === 'service' ? <Users/> : <Wine/>}
                                    {key === 'kitchen' ? 'מטבח' : key === 'service' ? 'שירות' : 'בר'}
                                </CardTitle>
                                <StarRating rating={value.rating} label="דירוג"/>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {value.notes && <div><p className="font-semibold">הערות חיוביות:</p><p className="text-gray-700 bg-gray-50 p-2 rounded">{value.notes}</p></div>}
                                {value.issues && <div><p className="font-semibold">בעיות:</p><p className="text-gray-700 bg-gray-50 p-2 rounded">{value.issues}</p></div>}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <ShiftReportAiAnalysis reportId={reportId} />

                 <Card>
                    <CardHeader><CardTitle>הערות ואירועים</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {reportData.key_incidents?.[0] && <div><h3 className="font-semibold">אירועים מרכזיים</h3><p className="text-gray-700 bg-gray-50 p-2 rounded">{reportData.key_incidents[0]}</p></div>}
                        {reportData.inventory_issues && <div><h3 className="font-semibold">בעיות מלאי</h3><p className="text-gray-700 bg-gray-50 p-2 rounded">{reportData.inventory_issues}</p></div>}
                        {reportData.customer_feedback && <div><h3 className="font-semibold">משוב לקוחות</h3><p className="text-gray-700 bg-gray-50 p-2 rounded">{reportData.customer_feedback}</p></div>}
                        {reportData.recommendations && <div><h3 className="font-semibold">המלצות</h3><p className="text-gray-700 bg-gray-50 p-2 rounded">{reportData.recommendations}</p></div>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}