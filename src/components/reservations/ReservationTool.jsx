
import React, { useState, useEffect, useMemo } from 'react';
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
import { invokePublic } from '@/lib/publicFetch';

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

// Next quarter-hour from now, as "HH:mm" — a sensible live default so the booker
// never opens on a time that's already in the past.
function nextQuarterHour() {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + ((15 - (d.getMinutes() % 15)) % 15 || 15));
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ReservationTool({ onReservationCreated, customers }) {
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(() => nextQuarterHour());
    const [partySize, setPartySize] = useState(2);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    // Customer autocomplete — suggest past / club customers as the hostess types
    // a name or phone, so a returning guest is one tap to fill. Uses the list
    // passed from the parent (already loaded on the seating page); falls back to
    // fetching once if used standalone.
    const [fetchedCustomers, setFetchedCustomers] = useState([]);
    const custList = (customers && customers.length) ? customers : fetchedCustomers;
    useEffect(() => {
        if (customers && customers.length) return;
        let alive = true;
        Customer.list(undefined, 2000).then(list => { if (alive) setFetchedCustomers(list || []); }).catch(() => {});
        return () => { alive = false; };
    }, [customers]);
    const [activeField, setActiveField] = useState(null); // 'name' | 'phone' | null
    const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
    const custMatches = useMemo(() => {
        if (activeField === 'name') {
            const q = customerName.toLowerCase().trim();
            if (q.length < 2) return [];
            return custList.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 6);
        }
        if (activeField === 'phone') {
            const q = digitsOnly(customerPhone);
            if (q.length < 3) return [];
            return custList.filter(c => digitsOnly(c.phone).includes(q)).slice(0, 6);
        }
        return [];
    }, [activeField, customerName, customerPhone, custList]);
    const pickCustomer = (c) => {
        setCustomerName(c.name || '');
        setCustomerPhone(c.phone || '');
        setActiveField(null);
        setSuggestion(null); // customer changed → require a fresh table search
    };
    const CustomerSuggestions = () => (
        custMatches.length > 0 ? (
            <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {custMatches.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                        className="w-full text-right px-3 py-2 hover:bg-[#F4ECD8] flex items-center justify-between gap-2 border-b last:border-b-0 border-gray-100"
                    >
                        <span className="font-bold text-sm text-gray-800 truncate">{c.name || 'ללא שם'}</span>
                        <span className="flex items-center gap-2 shrink-0">
                            {(c.total_visits > 1 || c.visit_count > 1) && (
                                <span className="text-[10px] font-bold text-[#A04A2E] bg-[#F4ECD8] rounded-full px-1.5">
                                    {Math.round(c.total_visits || c.visit_count)} ביקורים
                                </span>
                            )}
                            <span className="text-xs text-gray-500 tabular-nums" dir="ltr">{c.phone}</span>
                        </span>
                    </button>
                ))}
            </div>
        ) : null
    );
    
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

    // Live "now" guard — booking a time that has already passed makes no sense.
    // Only applies when the chosen date is today.
    const isPastTime = () => {
        const now = new Date();
        if (format(date, 'yyyy-MM-dd') !== format(now, 'yyyy-MM-dd')) return false;
        const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        return time < nowHHMM;
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

        if (isPastTime()) {
            setError('השעה שנבחרה כבר עברה — בחרו שעה מאוחרת יותר.');
            setIsLoading(false);
            return;
        }

        try {
            const dateString = format(date, 'yyyy-MM-dd');
            // Use the SERVER's table-finder — the single source of truth. It honors
            // the owner's priority list (singles + combos) and refuses any table with
            // a time-overlapping reservation, so the app booker can never double-book
            // (same logic that online reservations use).
            const result = await invokePublic('searchReservationTable', {
                date: dateString,
                time,
                party_size: partySize,
            });

            if (result?.reason === 'too_large_use_events') {
                setError(`ל-${partySize} סועדים ומעלה — יש לפנות דרך אירועים.`);
            } else if (result?.canAccommodate && result?.table) {
                const tables = Array.isArray(result.table.table_numbers) && result.table.table_numbers.length > 0
                    ? result.table.table_numbers
                    : [result.table.table_number];
                setSuggestion({
                    tables,
                    reason: tables.length > 1 ? `חיבור שולחנות ${tables.join(' + ')}` : `שולחן ${tables[0]} — פנוי ומתאים`,
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
            setTime(nextQuarterHour());
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
                        <div className="relative">
                            <Label>שם הלקוח</Label>
                            <Input
                                value={customerName}
                                onChange={(e) => { setCustomerName(e.target.value); setSuggestion(null); }}
                                onFocus={() => setActiveField('name')}
                                onBlur={() => setTimeout(() => setActiveField(f => f === 'name' ? null : f), 120)}
                                placeholder="שם מלא"
                                autoComplete="off"
                            />
                            {activeField === 'name' && <CustomerSuggestions />}
                        </div>
                        <div className="relative">
                            <Label>טלפון</Label>
                            <Input
                                value={customerPhone}
                                onChange={(e) => { setCustomerPhone(e.target.value); setSuggestion(null); }}
                                onFocus={() => setActiveField('phone')}
                                onBlur={() => setTimeout(() => setActiveField(f => f === 'phone' ? null : f), 120)}
                                placeholder="מספר טלפון"
                                autoComplete="off"
                                inputMode="tel"
                            />
                            {activeField === 'phone' && <CustomerSuggestions />}
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
                                onChange={(e) => { setPartySize(parseInt(e.target.value)); setSuggestion(null); }}
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
                                        onSelect={(d) => { if (d) { setDate(d); setSuggestion(null); } }}
                                        disabled={(d) => {
                                            const today = new Date(); today.setHours(0, 0, 0, 0);
                                            const max = new Date(today); max.setDate(max.getDate() + 180); // 6 months ahead
                                            return d < today || d > max;
                                        }}
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
                                onChange={(v) => { setTime(v); setSuggestion(null); }}
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
