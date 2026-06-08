import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Customer } from '@/entities/Customer';
import { TableSession } from '@/entities/TableSession';
import { CustomerBenefit } from '@/entities/CustomerBenefit';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, User, Phone, Mail, PlusCircle, Edit } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function CustomerDetailsPage() {
    const [searchParams] = useSearchParams();
    const customerId = searchParams.get('id');

    const [customer, setCustomer] = useState(null);
    const [visits, setVisits] = useState([]);
    const [benefits, setBenefits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAddBenefitOpen, setIsAddBenefitOpen] = useState(false);
    const [isEditNotesOpen, setIsEditNotesOpen] = useState(false);

    useEffect(() => {
        if (!customerId) {
            setError("לא סופק מזהה לקוח.");
            setLoading(false);
            return;
        }
        loadCustomerData();
    }, [customerId]);

    const loadCustomerData = async () => {
        setLoading(true);
        try {
            const customerData = await Customer.get(customerId);
            if (!customerData) throw new Error("הלקוח לא נמצא.");

            const [visitsData, benefitsData] = await Promise.all([
                customerData.phone ? TableSession.filter({ customer_phone: customerData.phone }, '-session_start', 10) : Promise.resolve([]),
                CustomerBenefit.filter({ customer_id: customerId }, '-created_date')
            ]);
            
            setCustomer(customerData);
            setVisits(visitsData);
            setBenefits(benefitsData);
        } catch (err) {
            console.error("שגיאה בטעינת נתוני לקוח:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddBenefit = async (benefitData) => {
        try {
            await CustomerBenefit.create({ ...benefitData, customer_id: customerId });
            setIsAddBenefitOpen(false);
            loadCustomerData();
        } catch (error) {
            console.error("שגיאה בהוספת הטבה:", error);
            alert("שגיאה בהוספת הטבה. נסה שוב.");
        }
    };
    
    const handleRedeemBenefit = async (benefitId) => {
        try {
            await CustomerBenefit.update(benefitId, { status: 'redeemed' });
            loadCustomerData();
        } catch (error) {
            console.error("שגיאה במימוש הטבה:", error);
            alert("שגיאה במימוש הטבה.");
        }
    };

    const handleSaveNotes = async (notesData) => {
        try {
            await Customer.update(customerId, notesData);
            setIsEditNotesOpen(false);
            loadCustomerData();
        } catch (error) {
            console.error("שגיאה בשמירת הערות:", error);
            alert("שגיאה בשמירת הערות.");
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    if (error) return <div className="text-center text-red-500 p-8">{error}</div>;
    if (!customer) return <div className="text-center p-8">לא נמצאו נתוני לקוח.</div>;

    const satisfactionConfig = {
        satisfied: { text: 'מרוצה', className: 'bg-green-100 text-green-800' },
        unsatisfied: { text: 'לא מרוצה', className: 'bg-red-100 text-red-800' },
        recovering: { text: 'בטיפול', className: 'bg-[#F4ECD8] text-yellow-800' },
        neutral: { text: 'ניטרלי', className: 'bg-gray-100 text-gray-800' }
    };
    const currentSatisfaction = satisfactionConfig[customer.satisfaction_status] || satisfactionConfig.neutral;

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <Button asChild variant="outline">
                        <Link to={createPageUrl('CustomerClub')}>
                            <ArrowRight className="w-4 h-4 ml-2" />
                            חזרה למועדון הלקוחות
                        </Link>
                    </Button>
                </div>

                <Card className="shadow-lg">
                    <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle className="text-3xl font-bold flex items-center gap-3">
                                <User className="w-8 h-8 text-[#A04A2E]" />
                                {customer.name}
                            </CardTitle>
                            <CardDescription className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                                <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> {customer.phone}</span>
                                {customer.email && <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> {customer.email}</span>}
                            </CardDescription>
                        </div>
                        <div className="flex flex-col items-start md:items-end gap-2">
                             <Badge className={`${currentSatisfaction.className} px-3 py-1 text-sm`}>{currentSatisfaction.text}</Badge>
                            <span className="text-sm text-gray-500">סה"כ ביקורים: {customer.total_visits || 0}</span>
                        </div>
                    </CardHeader>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Benefits and Compensations */}
                        <Card>
                            <CardHeader className="flex flex-row justify-between items-center">
                                <CardTitle className="text-xl">הטבות ופיצויים</CardTitle>
                                <Button onClick={() => setIsAddBenefitOpen(true)}><PlusCircle className="w-4 h-4 ml-2" />הוסף הטבה</Button>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {benefits.length > 0 ? benefits.map(b => (
                                        <div key={b.id} className="flex justify-between items-center p-3 bg-[#F4ECD8] rounded-lg">
                                            <div>
                                                <p className="font-semibold">{b.description}</p>
                                                <Badge variant="outline" className="mt-1">{b.type === 'compensation' ? 'פיצוי' : 'הטבה'}</Badge>
                                            </div>
                                            <div>
                                                {b.status === 'active' ? (
                                                     <Button size="sm" onClick={() => handleRedeemBenefit(b.id)}>ממש הטבה</Button>
                                                ) : (
                                                    <Badge className="bg-gray-200 text-gray-700">{b.status === 'redeemed' ? 'מומש' : 'פג תוקף'}</Badge>
                                                )}
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-gray-500 text-center py-4">אין הטבות פעילות כרגע.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Visit History */}
                        <Card>
                            <CardHeader><CardTitle className="text-xl">היסטוריית ביקורים</CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {visits.length > 0 ? visits.map(v => (
                                        <div key={v.id} className="p-3 border rounded-lg">
                                            <p className="font-semibold">{format(new Date(v.session_start), 'd MMMM yyyy, HH:mm', { locale: he })}</p>
                                            <p className="text-sm text-gray-600">
                                                {v.party_size} סועדים • שולחן {v.table_number} • מלצר: {v.waiter_name}
                                            </p>
                                        </div>
                                    )) : (
                                        <p className="text-gray-500 text-center py-4">אין היסטוריית ביקורים מתועדת.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Manager Notes */}
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle className="text-xl">הערות מנהל</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsEditNotesOpen(true)}><Edit className="w-4 h-4" /></Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-semibold">הערות כלליות</h4>
                                <p className="text-gray-700 whitespace-pre-wrap">{customer.notes || 'אין הערות.'}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold">מה אכל פעם שעברה?</h4>
                                <p className="text-gray-700 whitespace-pre-wrap">{customer.last_order_notes || 'אין מידע.'}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Add Benefit Dialog */}
            <AddBenefitDialog 
                isOpen={isAddBenefitOpen} 
                onClose={() => setIsAddBenefitOpen(false)}
                onSubmit={handleAddBenefit}
            />

            {/* Edit Notes Dialog */}
            {isEditNotesOpen && (
                <EditNotesDialog
                    isOpen={isEditNotesOpen}
                    onClose={() => setIsEditNotesOpen(false)}
                    customer={customer}
                    onSubmit={handleSaveNotes}
                />
            )}
        </div>
    );
}

function AddBenefitDialog({ isOpen, onClose, onSubmit }) {
    const [description, setDescription] = useState('');
    const [type, setType] = useState('offer');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!description) {
            alert('חובה למלא תיאור הטבה.');
            return;
        }
        onSubmit({ description, type });
        setDescription('');
        setType('offer');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent dir="rtl">
                <DialogHeader>
                    <DialogTitle>הוספת הטבה או פיצוי</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div>
                        <Label htmlFor="description">תיאור ההטבה</Label>
                        <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="למשל: בקבוק יין אדום על חשבון הבית" required />
                    </div>
                    <div>
                        <Label htmlFor="type">סוג</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="offer">הטבה</SelectItem>
                                <SelectItem value="compensation">פיצוי</SelectItem>
                                <SelectItem value="birthday_gift">מתנת יום הולדת</SelectItem>
                                <SelectItem value="welcome_gift">מתנת הצטרפות</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
                        <Button type="submit">הוסף הטבה</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditNotesDialog({ isOpen, onClose, customer, onSubmit }) {
    const [notes, setNotes] = useState(customer.notes || '');
    const [lastOrderNotes, setLastOrderNotes] = useState(customer.last_order_notes || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ notes, last_order_notes: lastOrderNotes });
    };

    return (
         <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent dir="rtl">
                <DialogHeader>
                    <DialogTitle>עריכת הערות מנהל</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div>
                        <Label htmlFor="general_notes">הערות כלליות</Label>
                        <Textarea id="general_notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="העדפות אישיות, אירועים מיוחדים וכו'..." />
                    </div>
                    <div>
                        <Label htmlFor="last_order_notes">מה אכל פעם שעברה?</Label>
                        <Textarea id="last_order_notes" value={lastOrderNotes} onChange={e => setLastOrderNotes(e.target.value)} rows={3} placeholder="פרטי הזמנה אחרונה, מנות מועדפות..." />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
                        <Button type="submit">שמור שינויים</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}