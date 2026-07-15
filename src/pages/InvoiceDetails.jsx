
import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Invoice } from '@/entities/Invoice';
import { InvoiceItem } from '@/entities/InvoiceItem';
import { Supplier } from '@/entities/Supplier';
import { CreateFileSignedUrl } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, Loader2, AlertTriangle, Pencil, Check, X, CreditCard, Trash2, ZoomIn, ZoomOut, ExternalLink, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

const STATUS_BADGE = {
    pending_review: { label: '⏳ ממתינה לסקירה', cls: 'bg-amber-100 text-amber-800' },
    approved: { label: '✅ אושרה', cls: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: '❌ נדחתה', cls: 'bg-red-100 text-red-800' },
};
const PAYMENT_BADGE = {
    unpaid: { label: '💸 לא שולמה', cls: 'bg-red-100 text-red-800' },
    paid: { label: '✅ שולמה', cls: 'bg-emerald-100 text-emerald-800' },
    partial: { label: '〰️ שולמה חלקית', cls: 'bg-amber-100 text-amber-800' },
};

export default function InvoiceDetailsPage() {
    const [invoice, setInvoice] = useState(null);
    const [items, setItems] = useState([]);
    const [supplier, setSupplier] = useState(null);
    const [signedUrl, setSignedUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null); // 'approve'|'reject'|'pay'|'delete'
    const [editOpen, setEditOpen] = useState(false);
    const [imgZoom, setImgZoom] = useState(1); // 1, 1.5, 2, 3 — image scale

    const location = useLocation();
    const navigate = useNavigate();
    const invoiceId = new URLSearchParams(location.search).get('id');

    const loadData = async () => {
        try {
            const invoiceData = await Invoice.get(invoiceId);
            if (!invoiceData) throw new Error("החשבונית לא נמצאה.");
            const [itemsData, supplierData, urlResponse] = await Promise.all([
                InvoiceItem.filter({ invoice_id: invoiceId }),
                Supplier.get(invoiceData.supplier_id),
                invoiceData.file_url
                    ? CreateFileSignedUrl({ file_url: invoiceData.file_url })
                    : Promise.resolve(null),
            ]);
            setInvoice(invoiceData);
            setItems(itemsData);
            setSupplier(supplierData);
            setSignedUrl(urlResponse?.signed_url || urlResponse?.url || invoiceData.file_url || null);
        } catch (err) {
            console.error("Failed to load invoice details:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!invoiceId) { setError("לא סופק מזהה חשבונית."); setLoading(false); return; }
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceId]);

    const setStatus = async (status) => {
        setBusy(status);
        try {
            await Invoice.update(invoiceId, { status });
            await loadData();
        } catch (e) { alert('שגיאה: ' + (e?.message || e)); }
        finally { setBusy(null); }
    };
    const markPaid = async () => {
        setBusy('pay');
        try {
            await Invoice.update(invoiceId, { payment_status: 'paid' });
            await loadData();
        } catch (e) { alert('שגיאה: ' + (e?.message || e)); }
        finally { setBusy(null); }
    };
    const deleteInvoice = async () => {
        if (!window.confirm('למחוק את החשבונית? פעולה זו לא הפיכה.')) return;
        setBusy('delete');
        try {
            await Invoice.delete(invoiceId);
            navigate(createPageUrl('Invoices'));
        } catch (e) {
            alert('שגיאה במחיקה: ' + (e?.message || e));
            setBusy(null);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    if (error) return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <h2 className="text-xl font-semibold">שגיאה בטעינת החשבונית</h2>
            <p>{error}</p>
            <Button asChild><Link to={createPageUrl('Invoices')}>חזרה לרשימת החשבוניות</Link></Button>
        </div>
    );

    const isImage = (() => {
        if (!signedUrl) return false;
        const u = String(signedUrl).toLowerCase();
        return /\.(jpe?g|png|webp|gif|heic|bmp)(\?|$)/.test(u);
    })();
    const isPdf = (() => {
        if (!signedUrl) return false;
        return /\.pdf(\?|$)/i.test(String(signedUrl));
    })();
    const statusInfo = STATUS_BADGE[invoice.status] || STATUS_BADGE.pending_review;
    const paymentInfo = PAYMENT_BADGE[invoice.payment_status] || PAYMENT_BADGE.unpaid;

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Button asChild variant="outline">
                        <Link to={createPageUrl('Invoices')}>
                            <ArrowRight className="w-4 h-4 ml-2" />
                            חזרה לארכיון
                        </Link>
                    </Button>
                    <div className="flex gap-2 flex-wrap">
                        <Badge className={`${statusInfo.cls} text-sm py-1.5 px-3`}>{statusInfo.label}</Badge>
                        <Badge className={`${paymentInfo.cls} text-sm py-1.5 px-3`}>{paymentInfo.label}</Badge>
                    </div>
                </div>

                <PageHeader
                    title={`חשבונית מס' ${invoice.invoice_number || 'לא צוין'}`}
                    subtitle={<>ספק: {supplier?.company_name || '—'} | תאריך: {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy') : '—'} | סה"כ: ₪{invoice.total_amount?.toLocaleString() || 0}</>}
                    icon={FileText}
                />
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                                <Pencil className="w-3.5 h-3.5 ml-1" /> ערוך
                            </Button>
                            {invoice.status !== 'approved' && (
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy === 'approved'} onClick={() => setStatus('approved')}>
                                    {busy === 'approved' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 ml-1" /> אשר</>}
                                </Button>
                            )}
                            {invoice.status !== 'rejected' && (
                                <Button size="sm" variant="outline" className="text-red-700 border-red-300" disabled={busy === 'rejected'} onClick={() => setStatus('rejected')}>
                                    {busy === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 ml-1" /> דחה</>}
                                </Button>
                            )}
                            {invoice.payment_status !== 'paid' && (
                                <Button size="sm" style={{ backgroundColor: 'var(--brand-primary, #A04A2E)' }} className="text-white hover:opacity-90" disabled={busy === 'pay'} onClick={markPaid}>
                                    {busy === 'pay' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CreditCard className="w-3.5 h-3.5 ml-1" /> סמן כשולמה</>}
                                </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300 ml-auto" disabled={busy === 'delete'} onClick={deleteInvoice}>
                                {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5 ml-1" /> מחק</>}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between gap-2">
                                <CardTitle>צפייה בחשבונית</CardTitle>
                                {signedUrl && (
                                    <div className="flex gap-1">
                                        {isImage && (
                                            <>
                                                <Button size="sm" variant="outline" onClick={() => setImgZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                                                    <ZoomOut className="w-3.5 h-3.5" />
                                                </Button>
                                                <span className="text-xs text-slate-500 self-center min-w-[40px] text-center">{Math.round(imgZoom * 100)}%</span>
                                                <Button size="sm" variant="outline" onClick={() => setImgZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}>
                                                    <ZoomIn className="w-3.5 h-3.5" />
                                                </Button>
                                            </>
                                        )}
                                        <Button asChild size="sm" variant="outline">
                                            <a href={signedUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 ml-1" /> פתח בטאב חדש</a>
                                        </Button>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent>
                                {!signedUrl ? (
                                    <p className="text-sm text-slate-500 text-center py-8">אין קובץ מצורף לחשבונית זו.</p>
                                ) : isImage ? (
                                    <div className="w-full bg-slate-100 rounded-md border overflow-auto" style={{ maxHeight: '80vh' }}>
                                        <div className="flex items-start justify-center p-2">
                                            <img
                                                src={signedUrl}
                                                alt="חשבונית"
                                                className="rounded-md select-none"
                                                style={{
                                                    width: `${imgZoom * 100}%`,
                                                    maxWidth: imgZoom <= 1 ? '100%' : 'none',
                                                    height: 'auto',
                                                    objectFit: 'contain',
                                                }}
                                                draggable={false}
                                            />
                                        </div>
                                    </div>
                                ) : isPdf ? (
                                    <iframe src={signedUrl} className="w-full h-[80vh] border rounded-md" title="Invoice PDF" />
                                ) : (
                                    <div className="text-center py-6 space-y-3">
                                        <p className="text-sm text-slate-600">פורמט קובץ לא מזוהה.</p>
                                        <Button asChild variant="outline">
                                            <a href={signedUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 ml-1" /> פתח קובץ</a>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    <div>
                        <Card>
                            <CardHeader><CardTitle>פריטים בחשבונית</CardTitle></CardHeader>
                            <CardContent>
                                {items.length === 0 ? (
                                    <p className="text-xs text-slate-500 text-center py-4">לא חולצו פריטים פרטניים (סיכום כללי בלבד).</p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>מוצר</TableHead>
                                                <TableHead>כמות</TableHead>
                                                <TableHead>מחיר</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.product_name}</TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell>₪{item.unit_price.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {editOpen && (
                <EditInvoiceDialog
                    invoice={invoice}
                    currentSupplier={supplier}
                    onClose={() => setEditOpen(false)}
                    onSaved={() => { setEditOpen(false); loadData(); }}
                />
            )}
        </div>
    );
}

function EditInvoiceDialog({ invoice, currentSupplier, onClose, onSaved }) {
    const [form, setForm] = useState({
        invoice_number: invoice.invoice_number || '',
        invoice_date: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : '',
        total_amount: invoice.total_amount || 0,
        supplier_id: invoice.supplier_id,
    });
    const [suppliers, setSuppliers] = useState(currentSupplier ? [currentSupplier] : []);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        Supplier.list().then(r => setSuppliers(Array.isArray(r) ? r : (r?.items || r?.data || []))).catch(() => {});
    }, []);
    const save = async () => {
        setSaving(true);
        try {
            const payload = {
                invoice_number: form.invoice_number || null,
                invoice_date: form.invoice_date ? new Date(form.invoice_date + 'T00:00:00.000Z').toISOString() : null,
                total_amount: Number(form.total_amount) || 0,
                supplier_id: form.supplier_id,
            };
            await Invoice.update(invoice.id, payload);
            onSaved();
        } catch (e) {
            alert('שגיאה בשמירה: ' + (e?.message || e));
        } finally { setSaving(false); }
    };
    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent dir="rtl" className="sm:max-w-md">
                <DialogHeader><DialogTitle>עריכת חשבונית</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                    <div>
                        <Label>ספק</Label>
                        <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>מספר חשבונית</Label>
                        <Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
                    </div>
                    <div>
                        <Label>תאריך חשבונית</Label>
                        <Input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
                    </div>
                    <div>
                        <Label>סכום כולל (₪)</Label>
                        <Input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
