
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { Invoice } from "@/entities/Invoice";
import { InvoiceItem } from "@/entities/InvoiceItem";
import { Product } from "@/entities/Product";
import { Supplier } from "@/entities/Supplier";
import { Upload, Brain, Loader2, CheckCircle, AlertCircle, Building } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function InvoiceScanner() {
    const [file, setFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [extractedData, setExtractedData] = useState(null);
    const [showCreateSupplierDialog, setShowCreateSupplierDialog] = useState(false);
    const [showOrderReviewDialog, setShowOrderReviewDialog] = useState(false);
    const [reviewItems, setReviewItems] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setResult(null);
        setExtractedData(null);
    };

    const processInvoice = async (supplier, finalItems) => {
        if (!extractedData || !supplier) {
            throw new Error("Missing data for invoice processing.");
        }

        // 4. Create Invoice record
        const newInvoice = await Invoice.create({
            supplier_id: supplier.id,
            invoice_number: extractedData.invoice_number,
            invoice_date: extractedData.invoice_date,
            total_amount: extractedData.total_amount,
            file_url: extractedData.file_url,
            status: 'processed',
            payment_status: 'unpaid'
        });

        // 5. Process items, update stock, and create new products if necessary
        let updatedItemsCount = 0;
        let createdItemsCount = 0;
        const newlyCreatedItems = [];

        for (const item of finalItems) {
            if (!item.name.trim() || item.quantity <= 0) continue; // Skip empty items

            const products = await Product.filter({ name: item.name, supplier_id: supplier.id });

            let product = null;
            if (products.length > 0) {
                // Product exists, update stock
                product = products[0];
                const newStock = (product.current_stock || 0) + item.quantity;
                await Product.update(product.id, { current_stock: newStock });
                updatedItemsCount++;
            } else {
                // Product does not exist, create it automatically
                product = await Product.create({
                    name: item.name,
                    supplier_id: supplier.id,
                    category: 'other', // Default category
                    price: item.unit_price, // Assuming purchase price
                    unit: 'piece', // Default unit
                    current_stock: item.quantity,
                    desired_stock: 0 // Manager should update this
                });
                createdItemsCount++;
                newlyCreatedItems.push(item.name);
            }

            await InvoiceItem.create({
                invoice_id: newInvoice.id,
                product_id: product.id,
                product_name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price
            });
        }
        
        let successMessage = `חשבונית מס' ${newInvoice.invoice_number} עובדה בהצלחה!`;
        if (updatedItemsCount > 0) {
          successMessage += `\n- עודכן מלאי עבור ${updatedItemsCount} מוצרים קיימים.`
        }
        if (createdItemsCount > 0) {
          successMessage += `\n- נוצרו והוכנסו למלאי ${createdItemsCount} מוצרים חדשים: ${newlyCreatedItems.join(', ')}.`;
          successMessage += `\n- שים לב: מומלץ לעדכן עבורם קטגוריה, יחידת מידה ומלאי רצוי בדף הספק.`
        }
        return successMessage;
    };
    
    const handleCreateSupplier = async () => {
        setIsLoading(true);
        setShowCreateSupplierDialog(false);
        try {
            const newSupplier = await Supplier.create({
                company_name: extractedData.supplier_name,
                supplier_id: `SUP-${Date.now()}`,
                contact_person: 'לא ידוע',
                email: 'לא ידוע@example.com',
                category: 'materials',
                status: 'active'
            });
            
            // המשך לחלון הבדיקה
            setSelectedSupplier(newSupplier);
            setReviewItems(extractedData.items.map(item => ({ ...item })));
            setShowOrderReviewDialog(true);
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmOrder = async () => {
        setIsLoading(true);
        setShowOrderReviewDialog(false);
        try {
            const successMessage = await processInvoice(selectedSupplier, reviewItems);
            setResult({ type: 'success', message: successMessage });
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setIsLoading(false);
            setExtractedData(null);
            setSelectedSupplier(null);
            setReviewItems([]);
            setFile(null);
        }
    };

    const updateReviewItem = (index, field, value) => {
        const updatedItems = [...reviewItems];
        updatedItems[index][field] = value;
        setReviewItems(updatedItems);
    };

    const handleScanInvoice = async () => {
        if (!file) {
            setResult({ type: 'error', message: 'אנא בחר קובץ להעלות.' });
            return;
        }

        setIsLoading(true);
        setResult(null);

        try {
            // 1. Upload file
            const { file_url } = await UploadFile({ file });

            // 2. Extract data
            const extractionResult = await ExtractDataFromUploadedFile({
                file_url: file_url,
                json_schema: {
                    type: "object",
                    properties: {
                        invoice_number: { type: "string" },
                        invoice_date: { type: "string", format: "date" },
                        supplier_name: { type: "string" },
                        total_amount: { type: "number" },
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    quantity: { type: "number" },
                                    unit_price: { type: "number" }
                                },
                                required: ["name", "quantity", "unit_price"]
                            }
                        }
                    },
                    required: ["supplier_name", "invoice_date", "total_amount", "items"]
                }
            });

            if (extractionResult.status !== 'success' || !extractionResult.output) {
                throw new Error(extractionResult.details || 'שגיאה בחילוץ הנתונים מהחשבונית.');
            }

            const currentExtractedData = { ...extractionResult.output, file_url };
            setExtractedData(currentExtractedData);

            // 3. Find supplier with flexible matching
            const allSuppliers = await Supplier.list();
            const extractedNameLower = currentExtractedData.supplier_name.toLowerCase().trim();
            
            const foundSupplier = allSuppliers.find(s => 
                s.company_name.toLowerCase().trim().includes(extractedNameLower) || 
                extractedNameLower.includes(s.company_name.toLowerCase().trim())
            );

            if (foundSupplier) {
                // מצא ספק - עבור לחלון הבדיקה
                setSelectedSupplier(foundSupplier);
                setReviewItems(currentExtractedData.items.map(item => ({ ...item })));
                setShowOrderReviewDialog(true);
            } else {
                // Supplier not found, open dialog
                setShowCreateSupplierDialog(true);
            }

        } catch (err) {
            setResult({ type: 'error', message: err.message });
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <CardTitle className="text-lg text-slate-800">סריקת חשבונית ספק</CardTitle>
                    </div>
                    <CardDescription>העלה צילום של חשבונית והמערכת תעדכן את המלאי אוטומטית.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label htmlFor="invoice-file" className="text-sm font-medium text-slate-700 block mb-2">1. בחר קובץ חשבונית</label>
                        <Input id="invoice-file" type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="text-xs"/>
                    </div>
                    
                    <Button onClick={handleScanInvoice} disabled={isLoading || !file} className="w-full bg-indigo-600 hover:bg-indigo-700">
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                סורק ומעבד...
                            </>
                        ) : (
                             <>
                                <Upload className="w-4 h-4 ml-2" />
                                סרוק ועדכן מלאי
                            </>
                        )}
                    </Button>

                    {result && (
                         <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
                            {result.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            <AlertTitle>{result.type === 'success' ? 'הצלחה!' : 'שגיאה'}</AlertTitle>
                            <AlertDescription className="whitespace-pre-wrap">
                                {result.message}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
            
            {/* דיאלוג יצירת ספק */}
            <Dialog open={showCreateSupplierDialog} onOpenChange={setShowCreateSupplierDialog}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                           <Building className="w-5 h-5 text-orange-600"/> ספק לא נמצא
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            הספק "{extractedData?.supplier_name}" לא נמצא במערכת.
                            האם תרצה ליצור אותו ולהמשיך בעיבוד החשבונית?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-4">
                        <Button variant="outline" onClick={() => setShowCreateSupplierDialog(false)}>ביטול</Button>
                        <Button onClick={handleCreateSupplier}>כן, צור ספק והמשך</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* דיאלוג בדיקת הזמנה */}
            <Dialog open={showOrderReviewDialog} onOpenChange={setShowOrderReviewDialog}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>בדיקת פרטי ההזמנה</DialogTitle>
                        <DialogDescription>
                            בדוק את הפריטים שנמצאו בחשבונית ותקן במידת הצורך לפני הכנסה למערכת
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                            <p><strong>ספק:</strong> {selectedSupplier?.company_name}</p>
                            <p><strong>מספר חשבונית:</strong> {extractedData?.invoice_number}</p>
                            <p><strong>סכום כולל:</strong> ₪{extractedData?.total_amount}</p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>שם המוצר</TableHead>
                                    <TableHead>כמות</TableHead>
                                    <TableHead>מחיר יחידה</TableHead>
                                    <TableHead>סה"כ</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reviewItems.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Input
                                                value={item.name}
                                                onChange={(e) => updateReviewItem(index, 'name', e.target.value)}
                                                className="w-full"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => updateReviewItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                                className="w-24"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={item.unit_price}
                                                onChange={(e) => updateReviewItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                className="w-24"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            ₪{(item.quantity * item.unit_price).toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button variant="outline" onClick={() => setShowOrderReviewDialog(false)}>ביטול</Button>
                        <Button onClick={handleConfirmOrder} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                    מעבד...
                                </>
                            ) : (
                                'אשר והכנס למערכת'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
