import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadFile, InvokeLLM } from "@/integrations/Core";
import { InventoryAlert } from "@/entities/InventoryAlert";
import { Supplier } from "@/entities/Supplier";
import { Product } from "@/entities/Product";
import { Camera, Upload, Loader2, Package, CheckCircle } from 'lucide-react';

export default function InventoryScanner() {
    const [scanning, setScanning] = useState(false);
    const [alerts, setAlerts] = useState([]);
    const [showResults, setShowResults] = useState(false);

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setScanning(true);
        try {
            // העלאת התמונה
            const { file_url } = await UploadFile({ file });
            
            // קבלת רשימת מוצרים וספקים לרפרנס
            const [products, suppliers] = await Promise.all([
                Product.list(),
                Supplier.list()
            ]);

            // ניתוח התמונה עם AI
            const aiResponse = await InvokeLLM({
                prompt: `
                נתח את התמונה המצורפת של מדף המלאי במסעדה וזהה:
                1. איזה פריטים נגמרים או במלאי נמוך
                2. איזה פריטים נראים טריים/ישנים  
                3. המלץ על כמויות להזמנה
                
                רשימת מוצרים קיימת במערכת:
                ${products.map(p => `${p.name} - ${p.supplier_id}`).join('\n')}
                
                ספק תשובה מפורטת עם המלצות מדויקות.
                `,
                file_urls: [file_url],
                response_json_schema: {
                    type: "object",
                    properties: {
                        detected_items: {
                            type: "array",
                            items: {
                                type: "object", 
                                properties: {
                                    item_name: { type: "string" },
                                    current_quantity_estimate: { type: "string" },
                                    condition: { type: "string" },
                                    urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
                                    suggested_order_quantity: { type: "string" },
                                    reasoning: { type: "string" }
                                }
                            }
                        },
                        general_observations: { type: "string" },
                        priority_items: { type: "array", items: { type: "string" } }
                    }
                }
            });

            // יצירת התראות מלאי
            const newAlerts = [];
            for (const item of aiResponse.detected_items) {
                if (item.urgency === 'high' || item.urgency === 'critical') {
                    // חיפוש ספק מתאים
                    const matchingProduct = products.find(p => 
                        p.name.toLowerCase().includes(item.item_name.toLowerCase()) ||
                        item.item_name.toLowerCase().includes(p.name.toLowerCase())
                    );
                    
                    const alert = await InventoryAlert.create({
                        item_name: item.item_name,
                        current_quantity: 0, // נעדכן מהתמונה
                        suggested_quantity: parseFloat(item.suggested_order_quantity) || 10,
                        urgency: item.urgency,
                        supplier_id: matchingProduct?.supplier_id || null,
                        estimated_cost: matchingProduct ? matchingProduct.price * (parseFloat(item.suggested_order_quantity) || 10) : 0,
                        reasoning: item.reasoning,
                        photo_analysis: `זוהה בתמונה: ${item.condition}. ${aiResponse.general_observations}`,
                        status: 'pending'
                    });
                    
                    newAlerts.push(alert);
                }
            }

            setAlerts(newAlerts);
            setShowResults(true);
            
        } catch (error) {
            console.error('Error analyzing inventory:', error);
            alert('שגיאה בניתוח התמונה. נסה שוב.');
        } finally {
            setScanning(false);
        }
    };

    const approveOrder = async (alertId) => {
        try {
            await InventoryAlert.update(alertId, { status: 'approved' });
            setAlerts(alerts.map(a => a.id === alertId ? {...a, status: 'approved'} : a));
            alert('ההזמנה אושרה ונשלחה לספק! 📦');
        } catch (error) {
            console.error('Error approving order:', error);
        }
    };

    const rejectOrder = async (alertId) => {
        try {
            await InventoryAlert.delete(alertId);
            setAlerts(alerts.filter(a => a.id !== alertId));
        } catch (error) {
            console.error('Error rejecting order:', error);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-green-50/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white" />
                        </div>
                        סורק מלאי חכם
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            id="inventory-upload"
                            disabled={scanning}
                        />
                        <label
                            htmlFor="inventory-upload"
                            className={`inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer transition-all ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {scanning ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    מנתח תמונה...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5" />
                                    צלם/העלה תמונת מלאי
                                </>
                            )}
                        </label>
                        <p className="text-sm text-gray-600 mt-2">
                            צלם את המדף או המקרר והמערכת תזהה מה חסר לך
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* תוצאות הסריקה */}
            {showResults && (
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-orange-500" />
                            התראות מלאי - {alerts.length} פריטים זקוקים להזמנה
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {alerts.map((alert) => (
                                <div key={alert.id} className={`border rounded-lg p-4 ${
                                    alert.urgency === 'critical' ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'
                                }`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-semibold text-lg">{alert.item_name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge className={
                                                    alert.urgency === 'critical' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                                                }>
                                                    {alert.urgency === 'critical' ? 'דחוף מאוד' : 'דחוף'}
                                                </Badge>
                                                <span className="text-sm text-gray-600">
                                                    כמות מוצעת: {alert.suggested_quantity}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-lg font-bold text-green-600">
                                                ₪{alert.estimated_cost?.toLocaleString() || '---'}
                                            </div>
                                            <div className="text-sm text-gray-500">עלות מוערכת</div>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <p className="text-sm text-gray-700 mb-1"><strong>נימוק:</strong></p>
                                        <p className="text-sm bg-white p-2 rounded border">{alert.reasoning}</p>
                                    </div>

                                    <div className="flex gap-3">
                                        <Button 
                                            onClick={() => approveOrder(alert.id)}
                                            className="bg-green-600 hover:bg-green-700"
                                            disabled={alert.status === 'approved'}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            {alert.status === 'approved' ? 'אושרה' : 'אשר הזמנה'}
                                        </Button>
                                        <Button 
                                            onClick={() => rejectOrder(alert.id)}
                                            variant="outline"
                                            className="text-red-600 border-red-300 hover:bg-red-50"
                                        >
                                            דחה
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}