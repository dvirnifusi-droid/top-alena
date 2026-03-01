import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccountantExport } from '@/entities/AccountantExport';
import { Invoice } from '@/entities/Invoice';
import { Supplier } from '@/entities/Supplier';
import { CreateFileSignedUrl } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, FileDown, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function AccountantExportView() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [exportData, setExportData] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [suppliers, setSuppliers] = useState({});

    useEffect(() => {
        const loadExportData = async () => {
            if (!token) {
                setError('קישור לא תקין או חסר.');
                setLoading(false);
                return;
            }

            try {
                const exports = await AccountantExport.filter({ token: token });
                if (exports.length === 0) {
                    setError('הקישור אינו תקין או שפג תוקפו.');
                    setLoading(false);
                    return;
                }

                const exportRecord = exports[0];
                
                // Check if expired
                if (new Date(exportRecord.expires_at) < new Date()) {
                     setError('הקישור פג תוקפו. יש לבקש קישור חדש.');
                     setLoading(false);
                     return;
                }

                setExportData(exportRecord);

                const [invoicesData, suppliersData] = await Promise.all([
                    Invoice.filter({
                        invoice_date_gte: exportRecord.start_date,
                        invoice_date_lte: exportRecord.end_date,
                    }, '-invoice_date'),
                    Supplier.list()
                ]);

                const suppliersMap = suppliersData.reduce((acc, sup) => ({...acc, [sup.id]: sup.company_name}), {});
                
                const invoicesWithUrls = await Promise.all(
                    invoicesData.map(async (inv) => {
                        const { signed_url } = await CreateFileSignedUrl({ file_uri: inv.file_uri });
                        return { ...inv, downloadUrl: signed_url };
                    })
                );

                setInvoices(invoicesWithUrls);
                setSuppliers(suppliersMap);

            } catch (err) {
                console.error("Failed to load export data:", err);
                setError('שגיאה בטעינת הנתונים.');
            } finally {
                setLoading(false);
            }
        };

        loadExportData();
    }, [token]);

    const handleDownloadCSV = () => {
        const headers = ["תאריך חשבונית", "ספק", "מספר חשבונית", "סכום כולל", "סטטוס תשלום"];
        const rows = invoices.map(inv => [
            format(new Date(inv.invoice_date), 'dd/MM/yyyy'),
            suppliers[inv.supplier_id] || 'לא ידוע',
            inv.invoice_number,
            inv.total_amount,
            inv.payment_status === 'paid' ? 'שולם' : 'לא שולם'
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `invoices_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return <div className="flex flex-col items-center justify-center min-h-screen"><Loader2 className="w-12 h-12 animate-spin mb-4" />טוען נתונים...</div>;
    }

    if (error) {
        return <div className="flex flex-col items-center justify-center min-h-screen text-red-600"><AlertCircle className="w-12 h-12 mb-4" />{error}</div>;
    }

    const totalAmount = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

    return (
        <div className="p-4 sm:p-8 bg-gray-100 min-h-screen" dir="rtl">
            <div className="max-w-6xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-2xl flex items-center gap-2"><FileText />ייצוא חשבוניות עבור TOP ALENA</CardTitle>
                                <CardDescription>
                                    תקופה: {format(new Date(exportData.start_date), 'dd/MM/yyyy')} - {format(new Date(exportData.end_date), 'dd/MM/yyyy')}
                                </CardDescription>
                            </div>
                            <Button onClick={handleDownloadCSV}><FileDown className="w-4 h-4 ml-2"/> הורד הכל כ-CSV</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="p-4 bg-gray-50 rounded-lg mb-4 text-center">
                            <p className="font-bold">סה"כ חשבוניות: {invoices.length} | סכום כולל: ₪{totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>תאריך</TableHead>
                                    <TableHead>ספק</TableHead>
                                    <TableHead>מספר חשבונית</TableHead>
                                    <TableHead>סכום</TableHead>
                                    <TableHead>הורדה</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map(invoice => (
                                    <TableRow key={invoice.id}>
                                        <TableCell>{format(new Date(invoice.invoice_date), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{suppliers[invoice.supplier_id] || 'לא ידוע'}</TableCell>
                                        <TableCell>{invoice.invoice_number}</TableCell>
                                        <TableCell>₪{invoice.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell>
                                            <Button asChild variant="outline" size="sm">
                                                <a href={invoice.downloadUrl} target="_blank" rel="noopener noreferrer">הורד PDF</a>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                         {invoices.length === 0 && <p className="text-center text-gray-500 py-8">לא נמצאו חשבוניות בטווח התאריכים שנבחר.</p>}
                    </CardContent>
                </Card>
                <p className="text-center text-xs text-gray-500 mt-4">קישור זה יפוג בתאריך {format(new Date(exportData.expires_at), 'dd/MM/yyyy')}</p>
            </div>
        </div>
    );
}