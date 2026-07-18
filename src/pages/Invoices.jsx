
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice } from '@/entities/Invoice';
import { Supplier } from '@/entities/Supplier';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Package, AlertCircle, CheckCircle, Eye, CreditCard, Mail, ClipboardCheck, Pencil, Check, X, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import InvoiceFilters from '../components/invoices/InvoiceFilters';
import ExportDialog from '../components/invoices/ExportDialog'; // Import the new dialog component
import InvoiceReviewModal from '../components/invoices/InvoiceReviewModal';
import SupplierLedger from '../components/invoices/SupplierLedger';
import PageHeader from '@/components/shared/PageHeader';

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState([]);
    const [suppliers, setSuppliers] = useState({});
    const [suppliersList, setSuppliersList] = useState([]); // For the filter dropdown
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        date: null,
        supplierId: 'all',
        paymentStatus: 'all',
        minAmount: '',
        maxAmount: ''
    });
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [reviewInvoice, setReviewInvoice] = useState(null);
    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const [supplierDraft, setSupplierDraft] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [invoicesData, suppliersData] = await Promise.all([
                Invoice.list('-invoice_date'),
                Supplier.list()
            ]);

            const suppliersMap = suppliersData.reduce((acc, supplier) => {
                acc[supplier.id] = supplier;
                return acc;
            }, {});

            setInvoices(invoicesData);
            setSuppliers(suppliersMap);
            setSuppliersList(suppliersData); // Set the list for the filter
        } catch (error) {
            console.error("Failed to load invoices:", error);
        } finally {
            setLoading(false);
        }
    };

    // Optimistic partial update through the dedicated fn (payment_status /
    // due_date / supplier_name_override). No full-record round-trip.
    const patchInvoice = async (invoice, patch) => {
        setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, ...patch } : i));
        try {
            await base44.functions.updateInvoicePayment({ invoice_id: invoice.id, ...patch });
        } catch (error) {
            console.error("Failed to update invoice:", error);
            loadData(); // reconcile on failure
        }
    };

    const net30 = () => {
        const d = new Date(); d.setDate(d.getDate() + 30);
        return format(d, 'yyyy-MM-dd');
    };
    const dueValue = (invoice) => {
        if (!invoice.due_date) return '';
        const d = new Date(invoice.due_date);
        return isNaN(d) ? '' : format(d, 'yyyy-MM-dd');
    };

    const setPayment = (invoice, value) => {
        if (value === 'scheduled') patchInvoice(invoice, { payment_status: 'scheduled', due_date: invoice.due_date || net30() });
        else patchInvoice(invoice, { payment_status: value, due_date: null });
    };

    const startEditSupplier = (invoice, currentName) => {
        setEditingSupplierId(invoice.id);
        setSupplierDraft(invoice.supplier_name_override || currentName || '');
    };

    // Bulk-approve every pending-review invoice in one click (clears the review
    // queue; does not mass-apply inventory — that stays per-invoice).
    const [approvingAll, setApprovingAll] = useState(false);
    const pendingCount = invoices.filter(i => i.status === 'pending_review').length;
    const approveAll = async () => {
        if (!pendingCount) return;
        if (!window.confirm(`לאשר את כל ${pendingCount} החשבוניות שממתינות לבדיקה? הן יעברו ל"עובדה". (מלאי לא יעודכן אוטומטית — זה נשאר פר חשבונית)`)) return;
        setApprovingAll(true);
        try {
            const res = await base44.functions.emailInvoiceApproveAll({});
            const n = (res?.data ?? res)?.approved ?? 0;
            alert(`✅ אושרו ${n} חשבוניות.`);
            await loadData();
        } catch (e) {
            alert('שגיאה באישור: ' + (e?.message || ''));
        } finally { setApprovingAll(false); }
    };
    const saveSupplier = (invoice) => {
        patchInvoice(invoice, { supplier_name_override: supplierDraft.trim() });
        setEditingSupplierId(null);
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => {
            // Rejected email-imports are noise in day-to-day work; hidden unless the user
            // explicitly filters for them.
            if (invoice.status === 'rejected' && filters.status !== 'rejected') return false;

            // Date filter
            if (filters.date?.from && new Date(invoice.invoice_date) < filters.date.from) return false;
            if (filters.date?.to && new Date(invoice.invoice_date) > filters.date.to) return false;

            // Supplier filter
            if (filters.supplierId && filters.supplierId !== 'all' && invoice.supplier_id !== filters.supplierId) return false;
            
            // Payment status filter
            if (filters.paymentStatus && filters.paymentStatus !== 'all' && invoice.payment_status !== filters.paymentStatus) return false;

            // Source filter — where the invoice came from (email/whatsapp/manual)
            if (filters.source && filters.source !== 'all' && (invoice.source || 'manual') !== filters.source) return false;

            // Amount filter
            const min = parseFloat(filters.minAmount);
            const max = parseFloat(filters.maxAmount);
            if (!isNaN(min) && invoice.total_amount < min) return false;
            if (!isNaN(max) && invoice.total_amount > max) return false;

            return true;
        });
    }, [invoices, filters]);

    const statusInfo = {
        processed: { icon: CheckCircle, color: 'text-green-600', label: 'עובדה' },
        pending_review: { icon: Package, color: 'text-yellow-600', label: 'בהמתנה' },
        error: { icon: AlertCircle, color: 'text-red-600', label: 'שגיאה' },
        rejected: { icon: AlertCircle, color: 'text-gray-400', label: 'נדחתה' },
    };

    const paymentStatusInfo = {
        paid: { icon: CheckCircle, color: 'text-green-600 bg-green-50', label: 'שולם' },
        unpaid: { icon: CreditCard, color: 'text-red-600 bg-red-50', label: 'לא שולם' },
        scheduled: { icon: CalendarClock, color: 'text-amber-700 bg-amber-50', label: 'ישולם בתאריך' },
    };

    if (loading) {
        return <div className="text-center p-8">טוען חשבוניות...</div>;
    }

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <PageHeader
                    title="ארכיון חשבוניות"
                    subtitle="היסטוריית כל החשבוניות שנסרקו למערכת."
                    icon={FileText}
                    action={
                        <div className="flex items-center gap-2">
                            {pendingCount > 0 && (
                                <Button onClick={approveAll} disabled={approvingAll} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <ClipboardCheck className="w-4 h-4 ml-1.5" />
                                    {approvingAll ? 'מאשר...' : `אשר הכל (${pendingCount})`}
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => setShowExportDialog(true)}>
                                ייצא לרו"ח
                            </Button>
                        </div>
                    }
                />

                <SupplierLedger />

                <InvoiceFilters
                    suppliers={suppliersList}
                    onFilterChange={setFilters}
                />

                <Card className="mt-6">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ספק</TableHead>
                                    <TableHead>מספר חשבונית</TableHead>
                                    <TableHead>תאריך</TableHead>
                                    <TableHead>סכום</TableHead>
                                    <TableHead>סטטוס</TableHead>
                                    <TableHead>תשלום</TableHead>
                                    <TableHead>פעולות</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.map(invoice => {
                                    const supplier = suppliers[invoice.supplier_id];
                                    const StatusIcon = statusInfo[invoice.status]?.icon || AlertCircle;
                                    const statusColor = statusInfo[invoice.status]?.color || 'text-gray-600';
                                    const statusLabel = statusInfo[invoice.status]?.label || 'לא ידוע';

                                    const PaymentIcon = paymentStatusInfo[invoice.payment_status]?.icon || CreditCard;
                                    const paymentColor = paymentStatusInfo[invoice.payment_status]?.color || 'text-gray-600';
                                    const paymentLabel = paymentStatusInfo[invoice.payment_status]?.label || 'לא ידוע';

                                    return (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {editingSupplierId === invoice.id ? (
                                                        <span className="flex items-center gap-1">
                                                            <input
                                                                autoFocus
                                                                value={supplierDraft}
                                                                onChange={(e) => setSupplierDraft(e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') saveSupplier(invoice); if (e.key === 'Escape') setEditingSupplierId(null); }}
                                                                className="border rounded-lg px-2 py-1 text-sm w-44"
                                                                placeholder="שם ספק"
                                                            />
                                                            <button onClick={() => saveSupplier(invoice)} className="text-emerald-600 p-1" title="שמור"><Check className="w-4 h-4" /></button>
                                                            <button onClick={() => setEditingSupplierId(null)} className="text-gray-400 p-1" title="בטל"><X className="w-4 h-4" /></button>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 group/sup">
                                                            {invoice.supplier_name_override || supplier?.company_name || 'לא ידוע'}
                                                            <button
                                                                onClick={() => startEditSupplier(invoice, supplier?.company_name)}
                                                                className="text-gray-300 hover:text-gray-600 opacity-0 group-hover/sup:opacity-100 transition-opacity p-0.5"
                                                                title="ערוך שם ספק"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        </span>
                                                    )}
                                                    {invoice.source === 'email' && (
                                                        <Badge variant="outline" className="flex items-center gap-1 text-blue-600 border-blue-200">
                                                            <Mail className="w-3 h-3" />
                                                            מייל
                                                        </Badge>
                                                    )}
                                                    {invoice.source === 'email' && invoice.email_account && (
                                                        <Badge variant="outline" className="text-purple-700 border-purple-200">
                                                            📥 {invoice.email_account.includes('nivnin') ? 'ניב'
                                                                : invoice.email_account.includes('dvirnifusi') ? 'דביר'
                                                                : invoice.email_account.split('@')[0]}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {invoice.source === 'email' && invoice.email_sender && (
                                                    <div className="text-xs text-gray-500 font-normal mt-1" dir="ltr">
                                                        {invoice.email_sender}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>{invoice.invoice_number || '---'}</TableCell>
                                            <TableCell>{invoice.invoice_date && !isNaN(new Date(invoice.invoice_date)) ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy') : '—'}</TableCell>
                                            <TableCell>₪{(invoice.total_amount ?? 0).toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`flex items-center gap-2 ${statusColor}`}>
                                                    <StatusIcon className="w-4 h-4" />
                                                    {statusLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <select
                                                        value={invoice.payment_status === 'scheduled' ? 'scheduled' : invoice.payment_status === 'paid' ? 'paid' : 'unpaid'}
                                                        onChange={(e) => setPayment(invoice, e.target.value)}
                                                        className={`border rounded-lg px-2 py-1.5 text-sm font-medium ${paymentColor}`}
                                                    >
                                                        <option value="unpaid">לא שולם</option>
                                                        <option value="paid">שולם</option>
                                                        <option value="scheduled">ישולם בתאריך</option>
                                                    </select>
                                                    {invoice.payment_status === 'scheduled' && (
                                                        <input
                                                            type="date"
                                                            value={dueValue(invoice)}
                                                            onChange={(e) => patchInvoice(invoice, { payment_status: 'scheduled', due_date: e.target.value })}
                                                            className="border rounded-lg px-2 py-1 text-xs w-36"
                                                        />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {invoice.source === 'email' && invoice.status === 'pending_review' && (
                                                        <Button
                                                            size="sm"
                                                            className="bg-amber-500 hover:bg-amber-600 text-white"
                                                            onClick={() => setReviewInvoice(invoice)}
                                                        >
                                                            <ClipboardCheck className="w-4 h-4 ml-2" />
                                                            בדוק ואשר
                                                        </Button>
                                                    )}
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link to={createPageUrl(`InvoiceDetails?id=${invoice.id}`)}>
                                                            <Eye className="w-4 h-4 ml-2" />
                                                            צפה
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                         {filteredInvoices.length === 0 && (
                            <div className="text-center p-12 text-gray-500">
                                <p>
                                    {invoices.length === 0 ? "עדיין לא נסרקו חשבוניות." : "לא נמצאו חשבוניות התואמות את הסינון."}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            {reviewInvoice && (
                <InvoiceReviewModal
                    invoice={reviewInvoice}
                    supplierName={suppliers[reviewInvoice.supplier_id]?.company_name}
                    onClose={() => setReviewInvoice(null)}
                    onDone={() => { setReviewInvoice(null); loadData(); }}
                />
            )}
            <ExportDialog
                isOpen={showExportDialog}
                onClose={() => setShowExportDialog(false)}
            />
        </div>
    );
}
