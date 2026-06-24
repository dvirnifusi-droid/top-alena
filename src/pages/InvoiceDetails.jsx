
import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Invoice } from '@/entities/Invoice';
import { InvoiceItem } from '@/entities/InvoiceItem';
import { Supplier } from '@/entities/Supplier';
import { CreateFileSignedUrl } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

export default function InvoiceDetailsPage() {
    const [invoice, setInvoice] = useState(null);
    const [items, setItems] = useState([]);
    const [supplier, setSupplier] = useState(null);
    const [signedUrl, setSignedUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const location = useLocation();
    const invoiceId = new URLSearchParams(location.search).get('id');

    useEffect(() => {
        if (!invoiceId) {
            setError("לא סופק מזהה חשבונית.");
            setLoading(false);
            return;
        }

        const loadData = async () => {
            try {
                const invoiceData = await Invoice.get(invoiceId);
                if (!invoiceData) throw new Error("החשבונית לא נמצאה.");
                
                // Schema field is file_url (not file_uri). The signed-url helper
                // also expects { file_url }. Old code passed file_uri on both sides
                // so the preview iframe never got a URL and was stuck loading.
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
                // Fall back to the raw file_url if the signing helper returned nothing.
                setSignedUrl(urlResponse?.signed_url || urlResponse?.url || invoiceData.file_url || null);

            } catch (err) {
                console.error("Failed to load invoice details:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [invoiceId]);

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <h2 className="text-xl font-semibold">שגיאה בטעינת החשבונית</h2>
                <p>{error}</p>
                <Button asChild><Link to={createPageUrl('Invoices')}>חזרה לרשימת החשבוניות</Link></Button>
            </div>
        );
    }
    
    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <Button asChild variant="outline">
                        <Link to={createPageUrl('Invoices')}>
                            <ArrowRight className="w-4 h-4 ml-2" />
                            חזרה לארכיון החשבוניות
                        </Link>
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">חשבונית מס' {invoice.invoice_number || 'לא צוין'}</CardTitle>
                        <CardDescription>
                            ספק: {supplier?.company_name} | תאריך: {format(new Date(invoice.invoice_date), 'dd/MM/yyyy')} | סה"כ: ₪{invoice.total_amount?.toLocaleString()}
                        </CardDescription>
                    </CardHeader>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader><CardTitle>צפייה בחשבונית</CardTitle></CardHeader>
                            <CardContent>
                                {signedUrl ? (
                                    <iframe src={signedUrl} className="w-full h-[800px] border rounded-md" title="Invoice Document"></iframe>
                                ) : (
                                    <p>טוען תצוגה מקדימה...</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    <div>
                        <Card>
                            <CardHeader><CardTitle>פריטים בחשבונית</CardTitle></CardHeader>
                            <CardContent>
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
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
