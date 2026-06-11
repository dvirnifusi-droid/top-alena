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
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const PAGE_SIZE = 50;

export default function CustomerClubPage() {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [vipFilter, setVipFilter] = useState('all');
    const [joinDateFrom, setJoinDateFrom] = useState('');
    const [joinDateTo, setJoinDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    // Add Customer
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', birthday: '', anniversary: '', anniversary_label: '', notes: '', marketing_consent: true });
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
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        const data = await base44.entities.MessageTemplate.list('-created_date');
        setEmailTemplates(data.filter(t => t.type === 'email'));
        setSmsTemplates(data.filter(t => t.type === 'sms'));
    };

    // ── Server-side loading ─────────────────────────────────────────────────
    // The old version pulled ALL customers in 500-row batches (19K rows ≈ 40
    // sequential requests) and filtered in the browser. Now one request per
    // page: search + satisfaction filter run in the DB via clubListCustomers.
    const loadCustomers = async (page, q, status) => {
        try {
            setLoading(true);
            const res = await base44.functions.clubListCustomers({
                q: q || '',
                page: Math.max((page || 1) - 1, 0),
                page_size: PAGE_SIZE,
                satisfaction: status && status !== 'all' ? status : undefined,
            });
            const data = res?.data ?? res;
            setCustomers(data?.rows || []);
            setTotalCount(data?.total || 0);
        } catch (error) {
            console.error("Failed to load customers:", error);
            setCustomers([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    };

    // Search is debounced 400ms; filter/page changes load immediately.
    useEffect(() => {
        const t = setTimeout(() => loadCustomers(currentPage, searchTerm, statusFilter), searchTerm ? 400 : 0);
        return () => clearTimeout(t);
    }, [searchTerm, statusFilter, currentPage]);

    // Reset to page 1 when the query/filter changes
    useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, vipFilter, joinDateFrom, joinDateTo]);

    // Remaining client-side filters (rare) apply to the current page only.
    useEffect(() => {
        let filteredData = customers;
        if (vipFilter !== 'all') {
            filteredData = filteredData.filter(c => c.vip_level === vipFilter);
        }
        if (joinDateFrom) {
            filteredData = filteredData.filter(c => (c.created_date || c.createdAt) && new Date(c.created_date || c.createdAt) >= new Date(joinDateFrom));
        }
        if (joinDateTo) {
            filteredData = filteredData.filter(c => (c.created_date || c.createdAt) && new Date(c.created_date || c.createdAt) <= new Date(joinDateTo + 'T23:59:59'));
        }
        setFilteredCustomers(filteredData);
    }, [customers, vipFilter, joinDateFrom, joinDateTo]);

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
        // רשום לוג קמפיין
        await base44.entities.CampaignLog.create({
            type: 'sms',
            body_preview: smsMessage.slice(0, 100),
            recipients_count: targets.length,
            sent_count: sent,
            failed_count: failed,
            sent_at: new Date().toISOString()
        });
        setSmsResult({ success: true, sent, failed });
        setSendingSms(false);
    };

    const handleAddCustomer = async () => {
        if (!newCustomer.name || !newCustomer.phone) return;
        setSavingCustomer(true);
        // Extract MM-DD from full date strings (YYYY-MM-DD) for campaign matching.
        // Keep the original `birthday` field too so existing displays still work.
        const birthday_mmdd = newCustomer.birthday && /^\d{4}-\d{2}-\d{2}$/.test(newCustomer.birthday)
            ? newCustomer.birthday.slice(5)
            : null;
        const anniversary_mmdd = newCustomer.anniversary && /^\d{4}-\d{2}-\d{2}$/.test(newCustomer.anniversary)
            ? newCustomer.anniversary.slice(5)
            : null;
        await base44.entities.Customer.create({
            ...newCustomer,
            ...(birthday_mmdd ? { birthday_mmdd } : {}),
            ...(anniversary_mmdd ? { anniversary_mmdd } : {}),
            ...(newCustomer.anniversary_label ? { anniversary_label: newCustomer.anniversary_label } : {}),
            // marketing_consent: from the checkbox (default true since owner is manually adding).
            // Stamp consent_at so we have a timestamp for audit/legal purposes.
            marketing_consent: !!newCustomer.marketing_consent,
            marketing_consent_at: newCustomer.marketing_consent ? new Date().toISOString() : null,
            satisfaction_status: 'neutral',
            total_visits: 0,
            total_spent: 0,
        });
        setSavingCustomer(false);
        setNewCustomer({ name: '', phone: '', email: '', birthday: '', anniversary: '', anniversary_label: '', notes: '', marketing_consent: true });
        setShowAddCustomer(false);
        loadCustomers();
    };

    const handleBulkGrantConsent = async () => {
        if (!confirm('להעניק הסכמה לקבלת הודעות שיווק לכל הלקוחות הקיימים?\n\n• רק אם אישרו בעצמם בעבר.\n• לקוחות שביטלו בעצמם — לא ייפגעו.')) return;
        try {
            const r = await base44.functions.bulkGrantMarketingConsent({});
            alert(`✅ ${(r?.data || r)?.updated || 0} לקוחות עודכנו ויכולים לקבל קמפיינים`);
            loadCustomers();
        } catch (e) {
            alert('שגיאה: ' + (e?.message || ''));
        }
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
            // רשום לוג קמפיין
            await base44.entities.CampaignLog.create({
                type: 'email',
                subject: emailSubject,
                body_preview: emailBody.slice(0, 100),
                recipients_count: targets.length,
                sent_count: sent,
                failed_count: 0,
                sent_at: new Date().toISOString()
            });
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
            recovering: { text: 'בטיפול', className: 'bg-[#F4ECD8] text-yellow-800', icon: RefreshCw },
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

    // Server already returns exactly one page — no client-side slicing.
    const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);
    const pagedCustomers = filteredCustomers;

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
                                <Users className="w-6 h-6 text-[#A04A2E]" />
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
                                <Badge className="bg-[#F4ECD8] text-yellow-800">
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
                            <Button onClick={() => setShowAddCustomer(true)} className="bg-[#A04A2E] hover:bg-[#7A3722] text-white">
                                <UserPlus className="w-4 h-4 ml-1" />
                                הוסף לקוח
                            </Button>
                            <Button variant="outline" onClick={() => { setShowImport(true); setImportResult(null); }}>
                                <Upload className="w-4 h-4 ml-1" />
                                ייבוא מאקסל
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleBulkGrantConsent}
                                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                title="הענק לכל הלקוחות הסכמה לקבל שיווק — שימושי אחרי ייבוא או הוספה ידנית"
                            >
                                📢 הענק הסכמה לכולם
                            </Button>
                            <Button variant="outline" onClick={() => { setShowEmail(true); setEmailResult(null); }} className="bg-[#F4ECD8] border-[#E8D9B5] text-[#44512C] hover:bg-[#F4ECD8]">
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

                        <span className="text-sm text-gray-500 mr-auto">{totalCount.toLocaleString()} לקוחות</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-[#A04A2E]" />
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
                                        // Whole row opens the customer card; interactive cells stop propagation.
                                        <TableRow
                                            key={customer.id}
                                            onClick={() => navigate(createPageUrl(`CustomerDetails?id=${customer.id}`))}
                                            className="cursor-pointer hover:bg-[#FAF5E8] transition-colors"
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                {customer.email && (
                                                    <Checkbox
                                                        checked={selectedCustomers.includes(customer.id)}
                                                        onCheckedChange={() => toggleSelectCustomer(customer.id)}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <span className="text-[#44512C] font-semibold flex items-center gap-1.5">
                                                    👤 {customer.name || '(ללא שם)'}
                                                </span>
                                                <span className="text-[10px] text-gray-400 flex flex-wrap gap-2 mt-0.5">
                                                    {customer.city && <span>📍 {customer.city}</span>}
                                                    {customer.birthday_mmdd && <span>🎂 {customer.birthday_mmdd}</span>}
                                                    {(customer.visit_count > 0 || customer.total_visits > 0) && <span>{customer.visit_count || customer.total_visits} ביקורים</span>}
                                                </span>
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
                                            <TableCell onClick={(e) => e.stopPropagation()}>
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
                                <span className="text-sm text-gray-600">{currentPage} / {totalPages} ({totalCount.toLocaleString()} לקוחות)</span>
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
                            <Label>🎂 תאריך לידה</Label>
                            <Input type="date" value={newCustomer.birthday} onChange={e => setNewCustomer(p => ({ ...p, birthday: e.target.value }))} className="mt-1" />
                            <p className="text-[10px] text-gray-500 mt-1">משמש לקמפיין יום הולדת חודשי</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>💝 יום נישואים / ציון מיוחד</Label>
                                <Input type="date" value={newCustomer.anniversary} onChange={e => setNewCustomer(p => ({ ...p, anniversary: e.target.value }))} className="mt-1" />
                            </div>
                            <div>
                                <Label>תווית (אופציונלי)</Label>
                                <Input value={newCustomer.anniversary_label} onChange={e => setNewCustomer(p => ({ ...p, anniversary_label: e.target.value }))} placeholder="יום נישואים / יום בעולם / ..." className="mt-1" />
                            </div>
                        </div>
                        <div>
                            <Label>הערות</Label>
                            <Textarea value={newCustomer.notes} onChange={e => setNewCustomer(p => ({ ...p, notes: e.target.value }))} placeholder="הערות על הלקוח..." rows={2} className="mt-1" />
                        </div>
                        <label className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer hover:bg-emerald-100">
                            <input
                                type="checkbox"
                                checked={newCustomer.marketing_consent}
                                onChange={e => setNewCustomer(p => ({ ...p, marketing_consent: e.target.checked }))}
                                className="mt-0.5"
                            />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-emerald-900">📢 מאשר/ת לקבל הודעות שיווק</p>
                                <p className="text-[10px] text-emerald-700">חובה לחוק הספאם — סמן רק אם הלקוח אישר בעצמו. ללא זה, לקוח לא יקבל קמפיינים.</p>
                            </div>
                        </label>
                        <Button onClick={handleAddCustomer} disabled={savingCustomer || !newCustomer.name || !newCustomer.phone} className="w-full bg-[#A04A2E] hover:bg-[#7A3722]">
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
                            <div className="flex items-center gap-2 text-[#44512C]">
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
                        {smsTemplates.length > 0 && (
                            <div>
                                <Label>טען מתבנית</Label>
                                <Select onValueChange={(id) => {
                                    const t = smsTemplates.find(t => t.id === id);
                                    if (t) setSmsMessage(t.body.slice(0, 160));
                                }}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="בחר תבנית..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {smsTemplates.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
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
                        {emailTemplates.length > 0 && (
                            <div>
                                <Label>טען מתבנית</Label>
                                <Select onValueChange={(id) => {
                                    const t = emailTemplates.find(t => t.id === id);
                                    if (t) { setEmailSubject(t.subject || ''); setEmailBody(t.body); }
                                }}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="בחר תבנית..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {emailTemplates.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
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
                                        className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-[#44512C] transition-colors"
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
                        {selectedCustomers.length > 0 && customers.filter(c => selectedCustomers.includes(c.id) && c.email).length === 0 && (
                            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">⚠️ ללקוחות הנבחרים אין כתובת מייל. סמן לקוחות עם מייל.</p>
                        )}
                        <Button
                            onClick={handleSendEmail}
                            disabled={sendingEmail || customers.filter(c => selectedCustomers.includes(c.id) && c.email).length === 0 || !emailSubject || !emailBody}
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