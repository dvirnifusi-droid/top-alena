
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice } from '@/entities/Invoice';
import { Supplier } from '@/entities/Supplier';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Package, AlertCircle, CheckCircle, Eye, CreditCard, Mail, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import InvoiceFilters from '../components/invoices/InvoiceFilters';
import ExportDialog from '../components/invoices/ExportDialog'; // Import the new dialog component
import InvoiceReviewModal from '../components/invoices/InvoiceReviewModal';

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

    const handlePaymentStatusChange = async (invoiceId, newStatus) => {
        try {
            const currentInvoice = invoices.find(inv => inv.id === invoiceId);
            // Ensure all other properties are preserved when updating
            await Invoice.update(invoiceId, { ...currentInvoice, payment_status: newStatus });
            loadData(); // Refresh data
        } catch (error) {
            console.error("Failed to update payment status:", error);
        }
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => {
            // Date filter
            if (filters.date?.from && new Date(invoice.invoice_date) < filters.date.from) return false;
            if (filters.date?.to && new Date(invoice.invoice_date) > filters.date.to) return false;

            // Supplier filter
            if (filters.supplierId && filters.supplierId !== 'all' && invoice.supplier_id !== filters.supplierId) return false;
            
            // Payment status filter
            if (filters.paymentStatus && filters.paymentStatus !== 'all' && invoice.payment_status !== filters.paymentStatus) return false;

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
        unpaid: { icon: CreditCard, color: 'text-red-600 bg-red-50', label: 'לא שולם' }
    };

    if (loading) {
        return <div className="text-center p-8">טוען חשבוניות...</div>;
    }

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 flex items-center gap-3">
                            <FileText className="w-8 h-8" />
                            ארכיון חשבוניות
                        </h1>
                        <p className="text-lg text-slate-600 mt-2">היסטוריית כל החשבוניות שנסרקו למערכת.</p>
                    </div>
                    <Button onClick={() => setShowExportDialog(true)}>
                        ייצא לרו"ח
                    </Button>
                </div>
                
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
                                                <div className="flex items-center gap-2">
                                                    {supplier?.company_name || 'לא ידוע'}
                                                    {invoice.source === 'email' && (
                                                        <Badge variant="outline" className="flex items-center gap-1 text-blue-600 border-blue-200">
                                                            <Mail className="w-3 h-3" />
                                                            מייל
                                                        </Badge>
                                                    )}
                                                </div>
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
                                                <Button
                                                    variant="ghost" 
                                                    size="sm"
                                                    className={`${paymentColor} border font-medium`}
                                                    onClick={() => handlePaymentStatusChange(
                                                        invoice.id, 
                                                        invoice.payment_status === 'paid' ? 'unpaid' : 'paid'
                                                    )}
                                                >
                                                    <CreditCard className="w-4 h-4 ml-2" />
                                                    {paymentLabel}
                                                </Button>
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
