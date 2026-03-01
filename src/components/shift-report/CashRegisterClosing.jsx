import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Minus, Plus, Scale, AlertTriangle, CheckCircle, Banknote } from 'lucide-react';

export default function CashRegisterClosing({ data, onFieldChange }) {
    // Parse values from form data, defaulting to 0 if not present
    const openingAmount = parseFloat(data.cash_opening_amount) || 0;
    const cashFromSales = parseFloat(data.total_cash) || 0;
    const cashFromDeliveries = parseFloat(data.cash_deliveries_amount) || 0;
    const paidOut = parseFloat(data.cash_paid_out) || 0;
    const actualCount = parseFloat(data.actual_cash_in_register) || 0;
    
    // Calculate expected cash
    const expectedCash = openingAmount + cashFromSales + cashFromDeliveries - paidOut;
    
    // Calculate the difference
    const difference = actualCount - expectedCash;

    // Persist difference to parent form
    React.useEffect(() => {
        if (data.cash_difference !== difference) {
            onFieldChange('cash_difference', difference);
        }
    }, [difference, onFieldChange, data.cash_difference]);

    const SummaryLine = ({ icon, label, value, colorClass = "text-gray-800" }) => (
        <div className="flex justify-between items-center py-2 border-b">
            <div className="flex items-center gap-2 text-sm text-gray-600">
                {React.createElement(icon, { className: "w-4 h-4" })}
                <span>{label}</span>
            </div>
            <span className={`font-semibold ${colorClass}`}>₪{value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Scale className="w-6 h-6 text-blue-600" />
                    סגירת קופה
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="cash_opening_amount">פתיחת קופה</Label>
                        <Input
                            id="cash_opening_amount"
                            type="number"
                            placeholder="סכום התחלה במזומן"
                            value={data.cash_opening_amount || ''}
                            onChange={(e) => onFieldChange('cash_opening_amount', e.target.value)}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="cash_paid_out">הוצאות מזומן</Label>
                        <Input
                            id="cash_paid_out"
                            type="number"
                            placeholder="סך הוצאות ששולמו במזומן"
                            value={data.cash_paid_out || ''}
                            onChange={(e) => onFieldChange('cash_paid_out', e.target.value)}
                        />
                    </div>
                </div>
                
                {/* Summary Calculation */}
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                    <h4 className="font-semibold text-center mb-2 text-gray-700">חישוב קופה</h4>
                    <SummaryLine icon={Plus} label="יתרת פתיחה" value={openingAmount} />
                    <SummaryLine icon={Banknote} label="מזומן ממכירות (דוח Z)" value={cashFromSales} colorClass="text-green-600" />
                    <SummaryLine icon={Banknote} label="מזומן ממשלוחים" value={cashFromDeliveries} colorClass="text-green-600" />
                    <SummaryLine icon={Minus} label="הוצאות ששולמו" value={paidOut} colorClass="text-red-600" />
                    <div className="!mt-4 pt-2 border-t-2 border-gray-400 font-bold flex justify-between items-center text-lg">
                        <span>צפוי בקופה:</span>
                        <span>₪{expectedCash.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>

                 {/* Final Count and Difference */}
                <div className="space-y-4">
                     <div className="space-y-2">
                        <Label htmlFor="actual_cash_in_register" className="font-bold text-lg">ספירה בפועל בקופה</Label>
                        <Input
                            id="actual_cash_in_register"
                            type="number"
                            placeholder="הכנס את הסכום שנספר פיזית"
                            value={data.actual_cash_in_register || ''}
                            onChange={(e) => onFieldChange('actual_cash_in_register', e.target.value)}
                            className="h-12 text-xl text-center font-bold"
                        />
                    </div>
                    <div 
                        className={`p-4 rounded-lg text-center font-bold text-2xl flex items-center justify-center gap-2
                        ${difference === 0 ? 'bg-green-100 text-green-800' : ''}
                        ${difference > 0 ? 'bg-blue-100 text-blue-800' : ''}
                        ${difference < 0 ? 'bg-red-100 text-red-800' : ''}`}
                    >
                        {difference === 0 && <CheckCircle className="w-8 h-8" />}
                        {difference !== 0 && <AlertTriangle className="w-8 h-8" />}
                        <span>
                            {difference === 0 ? "הפרש: ₪0.00 (מדויק!)" : 
                             difference > 0 ? `עודף: ₪${difference.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                             `חוסר: ₪${(difference * -1).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}