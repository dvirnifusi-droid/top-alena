import React, { useState, useEffect, useRef } from 'react';
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
import { Users, Search, Loader2, AlertTriangle, Heart, Frown, RefreshCw, Upload, Mail, CheckSquare, Square, MessageSquare, UserPlus, ImagePlus, X } from 'lucide-react';
import { sendSms } from '@/functions/sendSms';
import { sendCustomerEmail } from '@/functions/sendCustomerEmail';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const PAGE_SIZE = 50;

export default function CustomerClubPage() {
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [vipFilter, setVipFilter] = useState('all');
    const [joinDateFrom, setJoinDateFrom] = useState('');
    const [joinDateTo, setJoinDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Add Customer
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
    const [savingCustomer, setSavingCustomer] = useState(false);

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
    const [emailImageUrl, setEmailImageUrl] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailResult, setEmailResult] = useState(null);
    const emailImageRef = useRef(null);

    // SMS campaign
    const [showSms, setShowSms] = useState(false);
    const [smsMessage, setSmsMessage] = useState('');
    const [sendingSms, setSendingSms] = useState(false);
    const [smsResult, setSmsResult] = useState(null);

    // Templates
    const [emailTemplates, setEmailTemplates] = useState([]);
    const [smsTemplates, setSmsTemplates] = useState([]);

    useEffect(() => {
        loadCustomers();
    }, []);

    useEffect(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        let filteredData = customers;
        if (lowercasedFilter) {
            filteredData = filteredData.filter(item =>
                item.name?.toLowerCase().includes(lowercasedFilter) ||
                item.phone?.toLowerCase().includes(lowercasedFilter) ||
                item.email?.toLowerCase().includes(lowercasedFilter)
            );
        }
        if (statusFilter !== 'all') {
            filteredData = filteredData.filter(c => c.satisfaction_status === statusFilter);
        }
        if (vipFilter !== 'all') {
            filteredData = filteredData.filter(c => c.vip_level === vipFilter);
        }
        if (joinDateFrom) {
            filteredData = filteredData.filter(c => c.created_date && new Date(c.created_date) >= new Date(joinDateFrom));
        }
        if (joinDateTo) {
            filteredData = filteredData.filter(c => c.created_date && new Date(c.created_date) <= new Date(joinDateTo + 'T23:59:59'));
        }
        setFilteredCustomers(filteredData);
        setCurrentPage(1);
    }, [searchTerm, customers, statusFilter, vipFilter, joinDateFrom, joinDateTo]);

    const loadCustomers = async () => {
        try {
            setLoading(true);
            const BATCH = 500;
            let all = [];
            let skip = 0;
            while (true) {
                const batch = await base44.entities.Customer.list('-created_date', BATCH, skip);
                all = all.concat(batch);
                if (batch.length < BATCH) break;
                skip += BATCH;
            }
            setCustomers(all);
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
                    await base44.entities.Customer.create({ ...row, satisfaction_status: 'neutral', total_visits: 0, total_spent: 0 });
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
        // Send in parallel batches of 5
        const batchSize = 5;
        for (let i = 0; i < targets.length; i += batchSize) {
            const batch = targets.slice(i, i + batchSize);
            const results = await Promise.allSettled(batch.map(c =>
                sendSms({ to: c.phone, message: smsMessage.replace('{שם}', c.name) })
            ));
            results.forEach(r => r.status === 'fulfilled' ? sent++ : failed++);
        }
        setSmsResult({ success: true, sent, failed });
        setSendingSms(false);
    };

    const handleAddCustomer = async () => {
        if (!newCustomer.name || !newCustomer.phone) return;
        setSavingCustomer(true);
        await base44.entities.Customer.create({ ...newCustomer, satisfaction_status: 'neutral', total_visits: 0, total_spent: 0 });
        setSavingCustomer(false);
        setNewCustomer({ name: '', phone: '', email: '', birthday: '', notes: '' });
        setShowAddCustomer(false);
        loadCustomers();
    };

    const handleUploadEmailImage = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingImage(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setEmailImageUrl(file_url);
        setUploadingImage(false);
    };

    const handleSendEmail = async () => {
        if (!emailSubject || !emailBody || selectedCustomers.length === 0) return;
        setSendingEmail(true);
        setEmailResult(null);
        try {
            const targets = customers.filter(c => selectedCustomers.includes(c.id) && c.email);
            const batchSize = 5;
            let sent = 0;
            for (let i = 0; i < targets.length; i += batchSize) {
                const batch = targets.slice(i, i + batchSize);
                await Promise.all(batch.map(c => {
                    const bodyWithImage = emailImageUrl
                        ? `${emailBody.replace('{שם}', c.name)}\n\n<img src="${emailImageUrl}" style="max-width:100%;border-radius:8px;" />`
                        : emailBody.replace('{שם}', c.name);
                    return sendCustomerEmail({
                        to: c.email,
                        subject: emailSubject,
                        body: bodyWithImage
                    });
                }));
                sent += batch.length;
            }
            setEmailResult({ success: true, count: sent });
            setEmailSubject('');
            setEmailBody('');
            setEmailImageUrl('');
            setSelectedCustomers([]);
        } catch (err) {
            setEmailResult({ success: false, error: err.message });
        } finally {
            setSendingEmail(false);
        }
    };

    const updateCustomerStatus = async (customerId, newStatus) => {
        try {
            await base44.entities.Customer.update(customerId, { satisfaction_status: newStatus });
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

    const totalPages = Math.ceil(filteredCustomers.length / PAGE_SIZE);
    const pagedCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
                            <Button onClick={() => setShowAddCustomer(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
                                <UserPlus className="w-4 h-4 ml-1" />
                                הוסף לקוח
                            </Button>
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
                    <div className="flex flex-wrap gap-3 mb-4 items-end">
                        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                            <TabsList>
                                <TabsTrigger value="all">הכל</TabsTrigger>
                                <TabsTrigger value="satisfied">מרוצים</TabsTrigger>
                                <TabsTrigger value="unsatisfied">לא מרוצים</TabsTrigger>
                                <TabsTrigger value="recovering">בטיפול</TabsTrigger>
                                <TabsTrigger value="neutral">ניטרליים</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <Select value={vipFilter} onValueChange={setVipFilter}>
                            <SelectTrigger className="w-36">
                                <SelectValue placeholder="רמת VIP" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל הרמות</SelectItem>
                                <SelectItem value="regular">רגיל</SelectItem>
                                <SelectItem value="silver">כסף</SelectItem>
                                <SelectItem value="gold">זהב</SelectItem>
                                <SelectItem value="platinum">פלטינום</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">הצטרפות:</span>
                            <Input type="date" value={joinDateFrom} onChange={e => setJoinDateFrom(e.target.value)} className="w-36" placeholder="מתאריך" />
                            <span className="text-sm text-gray-400">—</span>
                            <Input type="date" value={joinDateTo} onChange={e => setJoinDateTo(e.target.value)} className="w-36" placeholder="עד תאריך" />
                        </div>

                        {(vipFilter !== 'all' || joinDateFrom || joinDateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => { setVipFilter('all'); setJoinDateFrom(''); setJoinDateTo(''); }} className="text-gray-500">
                                נקה סינון ✕
                            </Button>
                        )}

                        <span className="text-sm text-gray-500 mr-auto">{filteredCustomers.length} לקוחות</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        </div>
                    ) : (
                        <>
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
                                {pagedCustomers.length > 0 ? (
                                    pagedCustomers.map(customer => (
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
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>הקודם</Button>
                                <span className="text-sm text-gray-600">{currentPage} / {totalPages} ({filteredCustomers.length} לקוחות)</span>
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>הבא</Button>
                            </div>
                        )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Add Customer Dialog */}
            <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>הוספת לקוח חדש</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label>שם מלא *</Label>
                            <Input value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} placeholder="שם הלקוח" className="mt-1" />
                        </div>
                        <div>
                            <Label>טלפון *</Label>
                            <Input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="050-0000000" className="mt-1" />
                        </div>
                        <div>
                            <Label>מייל</Label>
                            <Input value={newCustomer.email} onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="mt-1" />
                        </div>
                        <div>
                            <Label>תאריך לידה</Label>
                            <Input type="date" value={newCustomer.birthday} onChange={e => setNewCustomer(p => ({ ...p, birthday: e.target.value }))} className="mt-1" />
                        </div>
                        <div>
                            <Label>הערות</Label>
                            <Textarea value={newCustomer.notes} onChange={e => setNewCustomer(p => ({ ...p, notes: e.target.value }))} placeholder="הערות על הלקוח..." rows={2} className="mt-1" />
                        </div>
                        <Button onClick={handleAddCustomer} disabled={savingCustomer || !newCustomer.name || !newCustomer.phone} className="w-full bg-purple-600 hover:bg-purple-700">
                            {savingCustomer ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />שומר...</> : <><UserPlus className="w-4 h-4 ml-2" />הוסף לקוח</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

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
                            <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} placeholder="שלום {שם}, אנחנו שמחים להודיע..." className="mt-1" />
                        </div>
                        <div>
                            <Label>תמונה למייל (אופציונלי)</Label>
                            <div className="mt-1">
                                {emailImageUrl ? (
                                    <div className="relative inline-block">
                                        <img src={emailImageUrl} alt="preview" className="max-h-40 rounded-lg border object-cover" />
                                        <button onClick={() => setEmailImageUrl('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => emailImageRef.current?.click()}
                                        disabled={uploadingImage}
                                        className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                                    >
                                        {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                                        {uploadingImage ? 'מעלה...' : 'העלה תמונה'}
                                    </button>
                                )}
                                <input ref={emailImageRef} type="file" accept="image/*" onChange={handleUploadEmailImage} className="hidden" />
                            </div>
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