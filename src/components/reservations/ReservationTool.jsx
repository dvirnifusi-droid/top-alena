
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { SeatingLayout } from '@/entities/SeatingLayout';
import { TableSession } from '@/entities/TableSession';
import { Reservation } from '@/entities/Reservation';
import { Customer } from '@/entities/Customer';
import { format, addMinutes, parse } from "date-fns";
import { Calendar, Clock, Users, Wand2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import TimePicker from '../shared/TimePicker';

const updateCustomerClub = async (phone, name, visitDate) => {
    try {
        const existingCustomers = await Customer.filter({ phone: phone });
        if (existingCustomers.length > 0) {
            const customer = existingCustomers[0];
            await Customer.update(customer.id, {
                total_visits: (customer.total_visits || 0) + 1,
                last_visit: visitDate,
            });
        } else {
            await Customer.create({
                phone: phone,
                name: name,
                total_visits: 1,
                last_visit: visitDate,
                is_new: true,
            });
        }
    } catch (error) {
        console.error("Failed to update customer club:", error);
    }
};

export default function ReservationTool({ onReservationCreated }) {
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState('19:00');
    const [partySize, setPartySize] = useState(2);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [suggestion, setSuggestion] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const getOpeningHours = (selectedDate) => {
        const dayOfWeek = selectedDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 4) return { start: '12:00', end: '23:30' };
        if (dayOfWeek === 5) return { start: '12:00', end: '23:59' };
        if (dayOfWeek === 6) return { start: '21:00', end: '23:59' };
        return { start: '12:00', end: '23:30' };
    };

    const isTimeValid = () => {
        const hours = getOpeningHours(date);
        return time >= hours.start && time <= hours.end;
    };

    const getSeatingDuration = (size) => {
        if (size >= 9) return 165;
        if (size >= 6) return 150;
        return 120;
    };

    const handleFindTable = async () => {
        setIsLoading(true);
        setSuggestion(null);
        setError('');
        setSuccess('');

        if (!customerName || !customerPhone) {
            setError("אנא מלא שם לקוח וטלפון.");
            setIsLoading(false);
            return;
        }

        if (!isTimeValid()) {
            const hours = getOpeningHours(date);
            setError(`השעה הנבחרת אינה בשעות הפעילות. שעות פעילות: ${hours.start}-${hours.end}`);
            setIsLoading(false);
            return;
        }

        try {
            const dateString = format(date, 'yyyy-MM-dd');
            const reservationStartTime = parse(`${dateString} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
            const duration = getSeatingDuration(partySize);
            const reservationEndTime = addMinutes(reservationStartTime, duration);

            const [layouts, activeSessions, existingReservations] = await Promise.all([
                SeatingLayout.list(),
                TableSession.filter({ status: 'active' }),
                Reservation.filter({ date: dateString })
            ]);

            if (!layouts || layouts.length === 0) {
                setError("לא נמצאה מפת הושבה. יש להגדיר אותה קודם.");
                setIsLoading(false);
                return;
            }
            
            const allTables = layouts[0].tables;
            const occupiedNow = activeSessions.map(s => s.table_number);
            
            let availableTables = allTables.filter(t => !occupiedNow.includes(t.table_number));

            availableTables = availableTables.filter(table => {
                const reservationsForTable = existingReservations.filter(r => {
                    if (!r.assigned_table || r.assigned_table.length === 0) return false;
                    const assignedTables = Array.isArray(r.assigned_table) ? r.assigned_table : [r.assigned_table];
                    return assignedTables.includes(table.table_number);
                });

                for (const res of reservationsForTable) {
                    if (res.status === 'cancelled' || res.status === 'no_show') continue;
                    const resStart = parse(`${res.date} ${res.time}`, 'yyyy-MM-dd HH:mm', new Date());
                    const resEnd = addMinutes(resStart, getSeatingDuration(res.party_size));
                    if ((reservationStartTime < resEnd) && (reservationEndTime > resStart)) {
                        return false;
                    }
                }
                return true;
            });

            const perfectFit = availableTables.find(t => t.min_capacity <= partySize && t.max_capacity >= partySize);
            
            if (perfectFit) {
                setSuggestion({
                    tables: [perfectFit.table_number],
                    reason: `מושלם עבור ${partySize} סועדים`
                });
            } else {
                setError(`לא נמצא שולחן פנוי מתאים ל-${partySize} סועדים בשעה ${time}. אנא נסה שעה אחרת.`);
            }
        } catch (e) {
            console.error("Error finding table:", e);
            setError("שגיאה בחיפוש שולחן. אנא נסה שוב.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleConfirmReservation = async () => {
        if (!suggestion || !customerName || !customerPhone) {
            setError("יש למלא את כל הפרטים ולמצוא שולחן לפני השמירה.");
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const dateString = format(date, 'yyyy-MM-dd');
            const startDateTime = parse(`${dateString} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
            const endDateTime = addMinutes(startDateTime, getSeatingDuration(partySize));

            const reservationData = {
                customer_name: customerName,
                customer_phone: customerPhone,
                date: dateString,
                time: time,
                party_size: parseInt(partySize),
                assigned_table: suggestion.tables,
                status: 'confirmed',
                reservation_end_time: format(endDateTime, 'HH:mm')
            };

            await Reservation.create(reservationData);
            await updateCustomerClub(customerPhone, customerName, dateString);
            
            setSuccess(`ההזמנה אושרה בהצלחה!`);
            setSuggestion(null);
            
            setCustomerName('');
            setCustomerPhone('');
            setTime('19:00');
            setPartySize(2);
            
            if(onReservationCreated) onReservationCreated();
            
        } catch (e) {
            console.error("שגיאה בשמירת ההזמנה:", e);
            setError("שגיאה בשמירת ההזמנה. אנא נסה שוב.");
        } finally {
            setIsLoading(false);
        }
    };

    const hours = getOpeningHours(date);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-blue-600" />
                    הזמנה חכמה
                </CardTitle>
                <CardDescription>מצא שולחן פנוי אוטומטית</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>שם הלקוח</Label>
                            <Input 
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="שם מלא"
                            />
                        </div>
                        <div>
                            <Label>טלפון</Label>
                            <Input 
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                placeholder="מספר טלפון"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                סועדים
                            </Label>
                            <Input
                                type="number"
                                min="1"
                                max="20"
                                value={partySize}
                                onChange={(e) => setPartySize(parseInt(e.target.value))}
                            />
                        </div>
                        <div>
                            <Label className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                תאריך
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start">
                                        {format(date, 'dd/MM/yyyy')}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <CalendarComponent
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => d && setDate(d)}
                                        disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div>
                            <Label className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                שעה
                            </Label>
                            <TimePicker
                                value={time}
                                onChange={setTime}
                            />
                        </div>
                    </div>

                    <div className="text-xs text-gray-500">
                        שעות פעילות: {hours.start} - {hours.end}
                    </div>

                    {suggestion && (
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="font-semibold text-green-800">מצאנו לכם שולחן מושלם!</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-green-600 font-medium">משך זמן:</span>
                                    <div>{getSeatingDuration(partySize)} דקות</div>
                                </div>
                                <div>
                                    <span className="text-green-600 font-medium">עד שעה:</span>
                                    <div>{format(addMinutes(parse(`${format(date, 'yyyy-MM-dd')} ${time}`, 'yyyy-MM-dd HH:mm', new Date()), getSeatingDuration(partySize)), 'HH:mm')}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600 p-2 bg-red-50 rounded-lg text-center flex items-center justify-center"><AlertCircle className="w-4 h-4 ml-2"/>{error}</p>}
                    {success && <p className="text-sm text-green-600 p-2 bg-green-50 rounded-lg text-center flex items-center justify-center"><CheckCircle className="w-4 h-4 ml-2"/>{success}</p>}
                    
                    <div className="flex gap-2">
                        <Button onClick={handleFindTable} disabled={isLoading} className="flex-1">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                            מצא שולחן זמין
                        </Button>
                        {suggestion && (
                            <Button onClick={handleConfirmReservation} disabled={isLoading} className="flex-1 bg-green-600 hover:bg-green-700">
                                <CheckCircle className="w-4 h-4 ml-2" />
                                אשר הזמנה
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
