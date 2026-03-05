import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Search, Loader2, AlertTriangle, Heart, Frown, RefreshCw, Upload, Mail, CheckSquare, Square, MessageSquare } from 'lucide-react';
import { sendSms } from '@/functions/sendSms';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function CustomerClubPage() {
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Import Excel
    const [showImport, setShowImport] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const fileInputRef = useRef(null);

    // Email campaign
    const [showEmail, setShowEmail] = useState(false);
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailResult, setEmailResult] = useState(null);

    // SMS campaign
    const [showSms, setShowSms] = useState(false);
    const [smsMessage, setSmsMessage] = useState('');
    const [sendingSms, setSendingSms] = useState(false);
    const [smsResult, setSmsResult] = useState(null);

    useEffect(() => {
        loadCustomers();
    }, []);

    // Memoize filterCustomers to ensure its reference stability for useEffect dependencies
    const filterCustomers = useCallback(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        let filteredData = customers.filter(item => {
            return (
                item.name?.toLowerCase().includes(lowercasedFilter) ||
                item.phone?.toLowerCase().includes(lowercasedFilter) ||
                item.email?.toLowerCase().includes(lowercasedFilter)
            );
        });

        if (statusFilter !== 'all') {
            filteredData = filteredData.filter(customer =>
                customer.satisfaction_status === statusFilter
            );
        }

        setFilteredCustomers(filteredData);
    }, [searchTerm, customers, statusFilter]); // Dependencies for useCallback

    useEffect(() => {
        filterCustomers();
    }, [searchTerm, customers, statusFilter, filterCustomers]); // Added filterCustomers to dependency array

    const loadCustomers = async () => {
        try {
            const allCustomers = await Customer.list('-last_visit');
            setCustomers(allCustomers);
        } catch (error) {
            console.error("Failed to load customers:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
                file_url,
                json_schema: {
                    type: "object",
                    properties: {
                        customers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    phone: { type: "string" },
                                    email: { type: "string" },
                                    birthday: { type: "string" },
                                    notes: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });
            const rows = result.output?.customers || [];
            let imported = 0;
            for (const row of rows) {
                if (row.name && row.phone) {
                    await Customer.create({ ...row, satisfaction_status: 'neutral', total_visits: 0, total_spent: 0 });
                    imported++;
                }
            }
            setImportResult({ success: true, count: imported });
            loadCustomers();
        } catch (err) {
            setImportResult({ success: false, error: err.message });
        } finally {
            setImporting(false);
            fileInputRef.current.value = '';
        }
    };

    const toggleSelectCustomer = (id) => {
        setSelectedCustomers(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedCustomers.length === filteredCustomers.filter(c => c.email).length) {
            setSelectedCustomers([]);
        } else {
            setSelectedCustomers(filteredCustomers.filter(c => c.email).map(c => c.id));
        }
    };

    const handleSendSms = async () => {
        if (!smsMessage || selectedCustomers.length === 0) return;
        setSendingSms(true);
        setSmsResult(null);
        let sent = 0;
        let failed = 0;
        const targets = customers.filter(c => selectedCustomers.includes(c.id) && c.phone);
        for (const c of targets) {
            try {
                await sendSms({ to: c.phone, message: smsMessage.replace('{שם}', c.name) });
                sent++;
            } catch {
                failed++;
            }
        }
        setSmsResult({ success: true, sent, failed });
        setSendingSms(false);
    };

    const handleSendEmail = async () => {
        if (!emailSubject || !emailBody || selectedCustomers.length === 0) return;
        setSendingEmail(true);
        setEmailResult(null);
        try {
            const targets = customers.filter(c => selectedCustomers.includes(c.id) && c.email);
            let sent = 0;
            for (const c of targets) {
                await base44.integrations.Core.SendEmail({
                    to: c.email,
                    subject: emailSubject,
                    body: emailBody.replace('{שם}', c.name)
                });
                sent++;
            }
            setEmailResult({ success: true, count: sent });
            setEmailSubject('');
            setEmailBody('');
            setSelectedCustomers([]);
        } catch (err) {
            setEmailResult({ success: false, error: err.message });
        } finally {
            setSendingEmail(false);
        }
    };

    const updateCustomerStatus = async (customerId, newStatus) => {
        try {
            await Customer.update(customerId, { satisfaction_status: newStatus });
            loadCustomers(); // Refresh the data
        } catch (error) {
            console.error("Failed to update customer status:", error);
            alert("שגיאה בעדכון הסטטוס. נסה שוב.");
        }
    };

    const calculateAge = (birthday) => {
        if (!birthday) return 'N/A';
        const birthDate = new Date(birthday);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const getSatisfactionBadge = (status) => {
        const configs = {
            satisfied: { text: 'מרוצה', className: 'bg-green-100 text-green-800', icon: Heart },
            unsatisfied: { text: 'לא מרוצה', className: 'bg-red-100 text-red-800', icon: Frown },
            recovering: { text: 'בטיפול', className: 'bg-yellow-100 text-yellow-800', icon: RefreshCw },
            neutral: { text: 'ניטרלי', className: 'bg-gray-100 text-gray-800', icon: Users }
        };

        const config = configs[status] || configs.neutral;
        const Icon = config.icon;

        return (
            <Badge className={config.className}>
                <Icon className="w-3 h-3 ml-1" />
                {config.text}
            </Badge>
        );
    };

    const unsatisfiedCount = customers.filter(c => c.satisfaction_status === 'unsatisfied').length;
    const satisfiedCount = customers.filter(c => c.satisfaction_status === 'satisfied').length;
    const recoveringCount = customers.filter(c => c.satisfaction_status === 'recovering').length;

    return (
        <div className="p-4 md:p-8" dir="rtl">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-2xl">
                                <Users className="w-6 h-6 text-purple-600" />
                                מועדון לקוחות
                            </CardTitle>
                            <CardDescription>רשימת כל הלקוחות, ביקורים וסטטוס שביעות רצון.</CardDescription>

                            <div className="flex gap-4 mt-4">
                                <Badge className="bg-green-100 text-green-800">
                                    {satisfiedCount} לקוחות מרוצים
                                </Badge>
                                <Badge className="bg-red-100 text-red-800">
                                    <AlertTriangle className="w-3 h-3 ml-1" />
                                    {unsatisfiedCount} לקוחות לא מרוצים
                                </Badge>
                                <Badge className="bg-yellow-100 text-yellow-800">
                                    {recoveringCount} בטיפול
                                </Badge>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    placeholder="חפש לפי שם, טלפון או מייל..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 w-60"
                                />
                            </div>
                            <Button variant="outline" onClick={() => { setShowImport(true); setImportResult(null); }}>
                                <Upload className="w-4 h-4 ml-1" />
                                ייבוא מאקסל
                            </Button>
                            <Button variant="outline" onClick={() => { setShowEmail(true); setEmailResult(null); }} className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
                                <Mail className="w-4 h-4 ml-1" />
                                שלח דיוור ({selectedCustomers.length})
                            </Button>
                            <Button variant="outline" onClick={() => { setShowSms(true); setSmsResult(null); }} className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100">
                                <MessageSquare className="w-4 h-4 ml-1" />
                                שלח SMS ({selectedCustomers.length})
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
                        <TabsList>
                            <TabsTrigger value="all">הכל</TabsTrigger>
                            <TabsTrigger value="satisfied">מרוצים</TabsTrigger>
                            <TabsTrigger value="unsatisfied">לא מרוצים</TabsTrigger>
                            <TabsTrigger value="recovering">בטיפול</TabsTrigger>
                            <TabsTrigger value="neutral">ניטרליים</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <button onClick={toggleSelectAll} className="flex items-center gap-1 text-xs text-gray-500">
                                            {selectedCustomers.length === filteredCustomers.filter(c => c.email).length && filteredCustomers.filter(c => c.email).length > 0
                                                ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            בחר הכל
                                        </button>
                                    </TableHead>
                                    <TableHead>שם מלא</TableHead>
                                    <TableHead>טלפון</TableHead>
                                    <TableHead>מייל</TableHead>
                                    <TableHead>ביקור אחרון</TableHead>
                                    <TableHead>סטטוס שביעות רצון</TableHead>
                                    <TableHead>פעולות</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCustomers.length > 0 ? (
                                    filteredCustomers.map(customer => (
                                        <TableRow key={customer.id}>
                                            <TableCell>
                                                {customer.email && (
                                                    <Checkbox
                                                        checked={selectedCustomers.includes(customer.id)}
                                                        onCheckedChange={() => toggleSelectCustomer(customer.id)}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <Link to={createPageUrl(`CustomerDetails?id=${customer.id}`)} className="text-blue-600 hover:underline font-semibold">
                                                    {customer.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{customer.phone}</TableCell>
                                            <TableCell>{customer.email || '-'}</TableCell>
                                            <TableCell>
                                                {customer.last_visit ? format(new Date(customer.last_visit), 'dd/MM/yyyy') : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {getSatisfactionBadge(customer.satisfaction_status)}
                                                {customer.last_negative_feedback && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        משוב שלילי: {format(new Date(customer.last_negative_feedback), 'dd/MM/yyyy')}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={customer.satisfaction_status || 'neutral'}
                                                    onValueChange={(value) => updateCustomerStatus(customer.id, value)}
                                                >
                                                    <SelectTrigger className="w-32">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="satisfied">מרוצה</SelectItem>
                                                        <SelectItem value="unsatisfied">לא מרוצה</SelectItem>
                                                        <SelectItem value="recovering">בטיפול</SelectItem>
                                                        <SelectItem value="neutral">ניטרלי</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="6" className="h-24 text-center">
                                            לא נמצאו לקוחות.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Import Excel Dialog */}
            <Dialog open={showImport} onOpenChange={setShowImport}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>ייבוא לקוחות מאקסל</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            העלה קובץ אקסל (.xlsx) עם עמודות: <strong>name, phone, email, birthday, notes</strong>
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleImportExcel}
                            className="block w-full text-sm border rounded p-2"
                        />
                        {importing && (
                            <div className="flex items-center gap-2 text-blue-600">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                מייבא...
                            </div>
                        )}
                        {importResult && (
                            <div className={`p-3 rounded text-sm ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {importResult.success ? `✅ יובאו ${importResult.count} לקוחות בהצלחה!` : `❌ שגיאה: ${importResult.error}`}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* SMS Campaign Dialog */}
            <Dialog open={showSms} onOpenChange={setShowSms}>
                <DialogContent dir="rtl" className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>שליחת SMS ללקוחות</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">
                            {selectedCustomers.length === 0
                                ? 'לא נבחרו לקוחות. סגור וסמן לקוחות בטבלה.'
                                : `נבחרו ${selectedCustomers.length} לקוחות לשליחה.`}
                        </p>
                        <div>
                            <Label>תוכן ההודעה</Label>
                            <p className="text-xs text-gray-400 mb-1">ניתן להשתמש ב-&#123;שם&#125; לשם הלקוח (עד 160 תווים)</p>
                            <Textarea
                                value={smsMessage}
                                onChange={e => setSmsMessage(e.target.value.slice(0, 160))}
                                rows={4}
                                placeholder="שלום {שם}, יש לנו מבצע מיוחד עבורך!"
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-400 text-left">{smsMessage.length}/160</p>
                        </div>
                        {smsResult && (
                            <div className={`p-3 rounded text-sm ${smsResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {smsResult.success ? `✅ נשלחו ${smsResult.sent} הודעות${smsResult.failed > 0 ? ` (${smsResult.failed} נכשלו)` : ''}` : `❌ שגיאה`}
                            </div>
                        )}
                        <Button
                            onClick={handleSendSms}
                            disabled={sendingSms || selectedCustomers.length === 0 || !smsMessage}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            {sendingSms ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> שולח...</> : <><MessageSquare className="w-4 h-4 ml-2" /> שלח SMS לכל הנבחרים</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Email Campaign Dialog */}
            <Dialog open={showEmail} onOpenChange={setShowEmail}>
                <DialogContent dir="rtl" className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>שליחת דיוור ללקוחות</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">
                            {selectedCustomers.length === 0
                                ? 'לא נבחרו לקוחות. סגור וסמן לקוחות עם מייל בטבלה.'
                                : `נבחרו ${selectedCustomers.length} לקוחות לשליחה.`}
                        </p>
                        <div>
                            <Label>נושא המייל</Label>
                            <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="נושא..." className="mt-1" />
                        </div>
                        <div>
                            <Label>תוכן ההודעה</Label>
                            <p className="text-xs text-gray-400 mb-1">ניתן להשתמש ב-&#123;שם&#125; לשם הלקוח</p>
                            <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={6} placeholder="שלום {שם}, אנחנו שמחים להודיע..." className="mt-1" />
                        </div>
                        {emailResult && (
                            <div className={`p-3 rounded text-sm ${emailResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {emailResult.success ? `✅ נשלחו ${emailResult.count} מיילים בהצלחה!` : `❌ שגיאה: ${emailResult.error}`}
                            </div>
                        )}
                        <Button
                            onClick={handleSendEmail}
                            disabled={sendingEmail || selectedCustomers.length === 0 || !emailSubject || !emailBody}
                            className="w-full"
                        >
                            {sendingEmail ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> שולח...</> : <><Mail className="w-4 h-4 ml-2" /> שלח לכל הנבחרים</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}