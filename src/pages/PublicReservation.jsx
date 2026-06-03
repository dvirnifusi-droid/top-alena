
import React, { useState, useEffect } from 'react';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invokePublic } from '@/lib/publicFetch';
import { format, addMinutes, parse } from 'date-fns';
import { Calendar, Clock, Users, Send, Loader2, AlertCircle, CheckCircle, PartyPopper, Search, Phone, Mail, MapPin, Utensils } from 'lucide-react'; // Added Phone, Mail, MapPin, Utensils icons

const getOpeningHours = (selectedDate) => {
    const dayOfWeek = new Date(selectedDate).getDay();
    if (dayOfWeek === 6) return { start: '21:00', end: '23:45' };
    if (dayOfWeek === 5) return { start: '12:00', end: '23:45' };
    return { start: '12:00', end: '23:30' };
};

const getSeatingDuration = (size) => {
    if (size >= 9) return 165;
    if (size >= 6) return 150;
    return 120;
};

// Generate valid time slots (quarter hours only)
const generateTimeSlots = (startTime, endTime) => {
    const slots = [];
    if (startTime === '00:00' && endTime === '00:00') {
        return []; // Restaurant is closed
    }

    let current = startTime;
    
    while (current <= endTime) {
        const [hours, minutes] = current.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        
        // Round to nearest quarter hour
        const roundedMinutes = Math.ceil(totalMinutes / 15) * 15;
        const roundedHours = Math.floor(roundedMinutes / 60);
        const finalMinutes = roundedMinutes % 60;
        
        const timeSlot = `${roundedHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
        
        if (timeSlot <= endTime && !slots.includes(timeSlot)) {
            slots.push(timeSlot);
        }
        
        // Move to next quarter hour
        const nextTotalMinutes = roundedMinutes + 15;
        const nextHours = Math.floor(nextTotalMinutes / 60);
        const nextMinutes = nextTotalMinutes % 60;
        current = `${nextHours.toString().padStart(2, '0')}:${nextMinutes.toString().padStart(2, '0')}`;
        
        if (nextHours >= 24) break;
    }
    
    return slots;
};

export default function PublicReservationPage() {
    const [t, lang] = useI18n();
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState('20:00');
    const [partySize, setPartySize] = useState(2);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [specialRequests, setSpecialRequests] = useState('');
    const [specialOccasion, setSpecialOccasion] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [availableTable, setAvailableTable] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [timeSlotInfo, setTimeSlotInfo] = useState(null);
    const [openingHours, setOpeningHours] = useState(getOpeningHours(new Date()));
    const [timeSlots, setTimeSlots] = useState([]);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [reservationData, setReservationData] = useState(null);
    const [settings, setSettings] = useState(null); // Added settings state

    useEffect(() => {
        loadSettings();
    }, []); // Load settings only once on mount

    useEffect(() => {
        let hoursToUse;
        const dayOfWeekIndex = date.getDay(); // 0 (Sunday) to 6 (Saturday)
        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDayName = dayMap[dayOfWeekIndex];

        if (settings && settings.opening_hours && settings.opening_hours[currentDayName]) {
            const daySettings = settings.opening_hours[currentDayName];
            if (daySettings.closed) {
                hoursToUse = { start: '00:00', end: '00:00' }; // Represents closed for time slot generation
            } else {
                hoursToUse = { start: daySettings.open, end: daySettings.close };
            }
        } else {
            // Fallback to the hardcoded function if settings not loaded or specific day not defined
            hoursToUse = getOpeningHours(date);
        }

        setOpeningHours(hoursToUse);
        setTimeSlots(generateTimeSlots(hoursToUse.start, hoursToUse.end));
        setHasSearched(false);
        setAvailableTable(null);
    }, [date, settings]); // Re-run if date or settings change

    const loadSettings = async () => {
        try {
            const existingSettings = await invokePublic('getReservationSettings');
            if (existingSettings) {
                setSettings(existingSettings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    };

    const handleSearchTable = async () => {
        if (!customerName || !customerPhone) {
            setError("יש למלא שם וטלפון לפני חיפוש שולחן.");
            return;
        }

        setIsSearching(true);
        setError('');
        setHasSearched(false);
        setAvailableTable(null);

        try {
            const dateString = format(date, 'yyyy-MM-dd');
            // Server-side capacity check + table finding (no customer data exposed)
            const result = await invokePublic('searchReservationTable', {
                date: dateString, time, party_size: partySize,
            });
            setTimeSlotInfo(result);

            if (!result.canAccommodate) {
                setError(`השעה ${time} מלאה (${result.currentCapacity}/36 אנשים). אנא בחר שעה אחרת.`);
                setIsSearching(false);
                return;
            }

            setAvailableTable(result.table);
            setHasSearched(true);

        } catch (err) {
            console.error("Table search failed:", err);
            setError("שגיאה בחיפוש שולחן. אנא נסה שוב.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!hasSearched) {
            setError("יש לחפש שולחן זמין לפני ביצוע הזמנה.");
            return;
        }

        if (!availableTable) {
            setError("לא נמצא שולחן זמין. אנא נסה שעה אחרת.");
            return;
        }

        // Prepare reservation data for confirmation
        const dateString = format(date, 'yyyy-MM-dd');
        const startDateTime = parse(`${dateString} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
        const endDateTime = addMinutes(startDateTime, getSeatingDuration(Number(partySize)));
        
        const newReservationData = {
            customer_name: customerName,
            customer_phone: customerPhone,
            date: dateString,
            time: time,
            party_size: parseInt(partySize),
            special_requests: specialRequests || null,
            special_occasion: specialOccasion || null,
            status: 'confirmed', // Auto-confirm since table is available
            reservation_end_time: format(endDateTime, 'HH:mm'),
            assigned_table: [availableTable.table_number]
        };

        setReservationData(newReservationData);
        setShowConfirmation(true);
    };

    const confirmReservation = async () => {
        setIsLoading(true);
        try {
            const res = await invokePublic('createPublicReservation', {
                customer_name: reservationData.customer_name,
                customer_phone: reservationData.customer_phone,
                date: reservationData.date,
                time: reservationData.time,
                party_size: reservationData.party_size,
                special_requests: reservationData.special_requests,
                special_occasion: reservationData.special_occasion,
            });
            if (!res?.success) {
                setError('השעה התמלאה זה עתה. אנא בחר שעה אחרת.');
                setShowConfirmation(false);
                setIsLoading(false);
                return;
            }

            setSuccess(`מעולה ${reservationData.customer_name}! ההזמנה שלך אושרה בהצלחה למקום בעלינא.`);
            setShowConfirmation(false);
            
            // Reset form
            setCustomerName('');
            setCustomerPhone('');
            setSpecialRequests('');
            setSpecialOccasion('');
            setHasSearched(false);
            setAvailableTable(null);

        } catch (err) {
            console.error("Reservation creation failed:", err);
            setError("אירעה שגיאה ביצירת ההזמנה. אנא נסה שוב.");
            setShowConfirmation(false);
        } finally {
            setIsLoading(false);
        }
    };

    if (showConfirmation && reservationData) {
        return (
            <div className="min-h-screen bg-pink-50 flex items-center justify-center p-4" dir="rtl">
                <Card className="w-full max-w-2xl shadow-2xl border-pink-200">
                    <CardHeader className="text-center">
                        <PartyPopper className="mx-auto h-12 w-12 text-pink-500" />
                        <CardTitle className="text-2xl font-bold text-gray-800">אישור ההזמנה</CardTitle>
                        <CardDescription className="text-gray-600">אנא וודא שהפרטים נכונים לפני האישור הסופי</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 bg-white p-6 rounded-lg border">
                            <div className="grid grid-cols-2 gap-4">
                                <div><strong>שם:</strong> {reservationData.customer_name}</div>
                                <div><strong>טלפון:</strong> {reservationData.customer_phone}</div>
                                <div><strong>תאריך:</strong> {format(new Date(reservationData.date), 'dd/MM/yyyy')}</div>
                                <div><strong>שעה:</strong> {reservationData.time} - {reservationData.reservation_end_time}</div>
                                <div><strong>מספר סועדים:</strong> {reservationData.party_size}</div>
                                <div><strong>סטטוס:</strong> <span className="text-green-600 font-semibold">מאושר ✓</span></div>
                            </div>
                            {reservationData.special_occasion && (
                                <div><strong>אירוע מיוחד:</strong> {reservationData.special_occasion}</div>
                            )}
                            {reservationData.special_requests && (
                                <div><strong>בקשות מיוחדות:</strong> {reservationData.special_requests}</div>
                            )}
                        </div>

                        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5"/>{error}</div>}

                        <div className="flex gap-3 mt-6">
                            <Button onClick={confirmReservation} className="flex-1 bg-pink-600 hover:bg-pink-700" disabled={isLoading}>
                                {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Send className="w-5 h-5 ml-2"/>אשר הזמנה</>}
                            </Button>
                            <Button variant="outline" onClick={() => setShowConfirmation(false)} className="flex-1">
                                חזור לעריכה
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const isRtl = lang === 'he';
    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="max-w-4xl mx-auto p-6">
                {/* Language picker */}
                <div className={`flex ${isRtl ? 'justify-start' : 'justify-end'} mb-2`}>
                    <LanguagePicker />
                </div>
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ color: settings?.theme_color || '#059669' }}>
                        {settings?.restaurant_name || 'עלינא'}
                    </h1>
                    <p className="text-lg text-gray-700">
                        {lang === 'he'
                          ? (settings?.welcome_message || 'ברוכים הבאים למסעדת עלינא - חוויה קולינרית מיוחדת מחכה לכם')
                          : t('reservation_subtitle')}
                    </p>
                </div>

                {/* Special Message */}
                {settings?.special_message && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6 rounded">
                        <p className="text-yellow-800 font-medium">{settings.special_message}</p>
                    </div>
                )}

                {/* Reservations Disabled Message */}
                {settings?.reservations_enabled === false && (
                    <div className="bg-red-100 border border-red-300 rounded-lg p-6 text-center mb-6">
                        <h2 className="text-xl font-bold text-red-800 mb-2">הזמנות מושבתות זמנית</h2>
                        <p className="text-red-700">
                            מתנצלים, כרגע לא ניתן לבצע הזמנות חדשות. אנא פנו אלינו טלפונית או נסו שוב מאוחר יותר.
                        </p>
                        <div className="mt-4 space-y-2">
                            <p className="flex items-center justify-center gap-2">
                                <Phone className="w-4 h-4" />
                                <span>{settings?.phone || '03-1234567'}</span>
                            </p>
                            {settings?.email && (
                                <p className="flex items-center justify-center gap-2">
                                    <Mail className="w-4 h-4" />
                                    <span>{settings.email}</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content (Reservation Form + Restaurant Info) */}
                {settings?.reservations_enabled !== false && (
                    <div className="grid lg:grid-cols-2 gap-8">
                        {/* Reservation Form */}
                        <Card className="w-full shadow-2xl border-pink-200">
                            <CardHeader className="text-center">
                                <PartyPopper className="mx-auto h-12 w-12 text-pink-500" />
                                <CardTitle className="text-3xl font-bold text-gray-800">הזמנת מקום בעלינא</CardTitle>
                                <CardDescription className="text-gray-600">מלאו את הפרטים והזמינו מקום במסעדה</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {success ? (
                                    <div className="text-center p-8 bg-green-50 rounded-lg">
                                        <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
                                        <h3 className="text-2xl font-bold text-green-800 mb-2">ההזמנה אושרה!</h3>
                                        <p className="text-green-700">{success}</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleFormSubmit} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <Label htmlFor="name" className="font-semibold text-gray-700">שם מלא</Label>
                                                <Input id="name" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                                            </div>
                                            <div>
                                                <Label htmlFor="phone" className="font-semibold text-gray-700">טלפון</Label>
                                                <Input id="phone" type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <Label htmlFor="partySize" className="flex items-center gap-2 font-semibold text-gray-700"><Users className="w-4 h-4"/>סועדים</Label>
                                                <Input id="partySize" type="number" value={partySize} onChange={e => setPartySize(e.target.value)} min="1" required />
                                            </div>
                                            <div>
                                                <Label htmlFor="date" className="flex items-center gap-2 font-semibold text-gray-700"><Calendar className="w-4 h-4"/>תאריך</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start font-normal">
                                                            {format(date, 'dd/MM/yyyy')}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <CalendarComponent mode="single" selected={date} onSelect={d => d && setDate(d)} initialFocus disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <div>
                                                <Label htmlFor="time" className="flex items-center gap-2 font-semibold text-gray-700"><Clock className="w-4 h-4"/>שעה</Label>
                                                <Select value={time} onValueChange={setTime}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="בחר שעה" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-48 overflow-y-auto">
                                                        {timeSlots.map(slot => (
                                                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <Label htmlFor="occasion" className="font-semibold text-gray-700">אירוע מיוחד (אופציונלי)</Label>
                                                <Select value={specialOccasion} onValueChange={setSpecialOccasion}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="בחר אירוע" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="birthday">יום הולדת</SelectItem>
                                                        <SelectItem value="anniversary">יום נישואין</SelectItem>
                                                        <SelectItem value="date">דייט</SelectItem>
                                                        <SelectItem value="business">פגישת עסקים</SelectItem>
                                                        <SelectItem value="celebration">חגיגה</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-end">
                                                <Button 
                                                    type="button" 
                                                    onClick={handleSearchTable}
                                                    disabled={isSearching || !customerName || !customerPhone}
                                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                                >
                                                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Search className="w-5 h-5 ml-2" />}
                                                    חפש שולחן זמין
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Search Results */}
                                        {hasSearched && (
                                            <div className={`p-4 rounded-lg border ${availableTable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    {availableTable ? (
                                                        <>
                                                            <CheckCircle className="w-5 h-5 text-green-600" />
                                                            <span className="font-semibold text-green-800">שולחן זמין!</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <AlertCircle className="w-5 h-5 text-red-600" />
                                                            <span className="font-semibold text-red-800">אין שולחן זמין</span>
                                                        </>
                                                    )}
                                                </div>
                                                {availableTable ? (
                                                    <div className="text-sm text-green-700">
                                                        נמצא שולחן מתאים עבור {partySize} אנשים בשעה {time}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-red-700">
                                                        לא נמצא שולחן זמין בשעה זו. אנא נסה שעה אחרת.
                                                    </div>
                                                )}
                                                {timeSlotInfo && (
                                                    <div className="text-xs text-gray-600 mt-2">
                                                        תפוסה ברבע השעה: {timeSlotInfo.currentCapacity + partySize}/36 אנשים
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div>
                                            <Label htmlFor="specialRequests" className="font-semibold text-gray-700">בקשות מיוחדות</Label>
                                            <Textarea id="specialRequests" value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} placeholder="לדוגמה: אלרגיות, בקשות מיוחדות למטבח..." />
                                        </div>

                                        <div className="text-xs text-gray-500 text-center">
                                            {openingHours.start === '00:00' && openingHours.end === '00:00' ? (
                                                'המסעדה סגורה ביום זה.'
                                            ) : (
                                                `שעות פעילות: ${openingHours.start} - ${openingHours.end} | מקבלים עד 36 אנשים לרבע שעה`
                                            )}
                                        </div>

                                        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5"/>{error}</div>}

                                        <Button 
                                            type="submit" 
                                            className="w-full bg-pink-600 hover:bg-pink-700 text-lg py-3" 
                                            disabled={isLoading || !hasSearched || !availableTable}
                                        >
                                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Send className="w-5 h-5 ml-2"/>בצע הזמנה</>}
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>

                        {/* Restaurant Info */}
                        <div className="space-y-6">
                            {/* Contact Info */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Phone className="w-5 h-5" />
                                        פרטי קשר
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Phone className="w-4 h-4 text-green-600" />
                                        <span>{settings?.phone || '03-1234567'}</span>
                                    </div>
                                    {settings?.email && (
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-4 h-4 text-green-600" />
                                            <span>{settings.email}</span>
                                        </div>
                                    )}
                                    {settings?.address && (
                                        <div className="flex items-center gap-3">
                                            <MapPin className="w-4 h-4 text-green-600" />
                                            <span>{settings.address}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Opening Hours */}
                            {settings?.opening_hours && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Clock className="w-5 h-5" />
                                            שעות פתיחה
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {Object.entries(settings.opening_hours).map(([day, hours]) => {
                                                const dayNames = {
                                                    sunday: 'ראשון',
                                                    monday: 'שני',
                                                    tuesday: 'שלישי', 
                                                    wednesday: 'רביעי',
                                                    thursday: 'חמישי',
                                                    friday: 'שישי',
                                                    saturday: 'שבת'
                                                };
                                                
                                                return (
                                                    <div key={day} className="flex justify-between">
                                                        <span className="font-medium">{dayNames[day]}</span>
                                                        <span>
                                                            {hours.closed ? 'סגור' : `${hours.open} - ${hours.close}`}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Menu Link */}
                            {settings?.show_menu_link && (
                                <Card>
                                    <CardContent className="p-6">
                                        <Button 
                                            className="w-full" 
                                            variant="outline"
                                            onClick={() => window.open(settings?.menu_link || '#', '_blank')}
                                        >
                                            <Utensils className="w-4 h-4 ml-2" />
                                            צפה בתפריט שלנו
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
