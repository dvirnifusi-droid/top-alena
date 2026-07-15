
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TableSession } from '@/entities/TableSession';
import { ManualSurvey } from '@/entities/ManualSurvey';
import { CustomerFeedback } from '@/entities/CustomerFeedback';
import { Incident } from '@/entities/Incident';
import { User } from '@/entities/User';
import { Customer } from '@/entities/Customer'; // Added Customer entity
import { Reservation } from '@/entities/Reservation'; // T+24h survey link prefill
import { ReservationSettings } from '@/entities/ReservationSettings'; // Import ReservationSettings
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Star, CheckCircle, Frown, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';


const GOOGLE_REVIEW_LINK = 'https://g.page/r/CReDn7f8zub7EBM/review';

export default function CustomerSurveyPage() {
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    // GOOGLE_REVIEW_LINK points at Alena's specific Google place and there is no
    // per-tenant settings/branding field for it. To avoid sending other tenants'
    // customers to Alena's review page, only offer the Google review CTA on the
    // main Alena tenant.
    const isMainTenant = /עלינ|alena|alina/i.test(branding?.name || '');
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('sessionId');
    const shortCode = searchParams.get('s'); // Changed from manualId to shortCode 's'
    const reservationId = searchParams.get('res'); // T+24h survey link prefill

    const [session, setSession] = useState(null);
    const [manualSurvey, setManualSurvey] = useState(null);
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comments, setComments] = useState('');
    const [feedbackForm, setFeedbackForm] = useState({
        visit_date: null,
        party_size: '',
        food_rating: 0,
        service_rating: 0,
        contact_name: '',
        contact_phone: ''
    });
    const [foodHover, setFoodHover] = useState(0);
    const [serviceHover, setServiceHover] = useState(0);
    const [step, setStep] = useState('rating'); // rating, feedback, thanks_good, thanks_bad
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tableNumber, setTableNumber] = useState(null); // New state for table number from QR
    const [clubForm, setClubForm] = useState({ name: '', phone: '' }); // Added state for club form
    const [clubSignupSuccess, setClubSignupSuccess] = useState(false); // Added state for club signup success
    const [isJoiningClub, setIsJoiningClub] = useState(false); // Added state for club signup loading
    const [settings, setSettings] = useState(null); // New state for ReservationSettings

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('source');
        const tableParam = urlParams.get('table');
        
        if (source === 'qr') {
            console.log('Survey accessed via QR code');
            // אם זה QR כללי, פשוט תמשיך עם הסקר ללא טעינת נתונים נוספים
            if (tableParam) {
                setTableNumber(tableParam);
            }
            // לא צריך לטעון שום נתונים נוספים עבור QR כלליים, פשוט ממשיכים עם הסקר.
            return;
        }
        
        // אם לא QR, אך עדיין יש tableParam (למקרה של שימוש עתידי או קונפיגורציה אחרת)
        if (tableParam && tableParam !== 'general') {
            setTableNumber(tableParam);
        }

        const loadData = async () => {
            if (sessionId) {
                // סקר רגיל מטבלת הפגישות
                try {
                    const sessions = await TableSession.filter({ id: sessionId });
                    if (sessions.length > 0) {
                        setSession(sessions[0]);
                    } else {
                        setError('לא נמצאה הזמנה תואמת. ייתכן שהקישור אינו תקין.');
                    }
                } catch (e) {
                    console.error('Error loading session:', e);
                    setError('שגיאה בטעינת הנתונים. ייתכן שהקישור אינו תקין.');
                }
            } else if (shortCode) {
                // סקר ידני עם קוד מקוצר
                try {
                    const surveys = await ManualSurvey.filter({ survey_id: shortCode });
                    if (surveys.length > 0) {
                        setManualSurvey(surveys[0]);
                        // עדכון שהסקר נצפה
                        try {
                            await ManualSurvey.update(surveys[0].id, { status: 'viewed' });
                        } catch (updateError) {
                            console.error('Error updating manual survey status:', updateError);
                            // לא עוצרים את התהליך בגלל זה
                        }
                    } else {
                        setError('לא נמצא סקר תואם. ייתכן שהקישור אינו תקין.');
                    }
                } catch (e) {
                    console.error('Error loading manual survey:', e);
                    setError('שגיאה בטעינת הנתונים. ייתכן שהקישור אינו תקין.');
                }
            } else if (reservationId) {
                // T+24h survey — link came from yesterday's reservation WhatsApp.
                // Prefill name + phone so the guest doesn't re-type them.
                try {
                    const reservations = await Reservation.filter({ id: reservationId });
                    if (reservations.length > 0) {
                        const r = reservations[0];
                        setFeedbackForm(f => ({
                            ...f,
                            contact_name: r.customer_name || '',
                            contact_phone: r.customer_phone || '',
                            party_size: r.party_size || '',
                            visit_date: r.date ? new Date(r.date) : null,
                        }));
                        setClubForm({ name: r.customer_name || '', phone: r.customer_phone || '' });
                    }
                } catch (e) {
                    console.warn('Could not prefill from reservation', e);
                    // Survey still works without prefill — proceed silently.
                }
            } else {
                // אם אין sessionId / shortCode / reservationId / QR — קישור לא תקין.
                setError('קישור הסקר אינו תקין. לא נמצא מזהה ספציפי או קוד QR.');
            }
        };

        loadData();
    }, [sessionId, shortCode, reservationId]);

    // New useEffect to load settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Assuming there's only one settings entry, or we want the first one
                const settingsData = await ReservationSettings.list('', 1); 
                if (settingsData && settingsData.length > 0) {
                    setSettings(settingsData[0]);
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        };
        loadSettings();
    }, []); // Empty dependency array means this runs once on mount


    const handleRatingSubmit = async () => {
        if (rating > 3) {
            // Good review
            try {
                await saveFeedback(true);
            } catch (e) {
                console.error('Error saving good-review feedback:', e);
            }
            setStep('thanks_good');
        } else {
            // Bad review
            setStep('feedback');
        }
    };

    const handleFeedbackSubmit = async () => {
        setLoading(true);
        try {
            await saveFeedback(false);
            setStep('thanks_bad');
        } catch(e) {
            console.error("Error saving feedback:", e);
            alert("שגיאה בשמירת המשוב. נסה שוב.");
        } finally {
            setLoading(false);
        }
    };

    const handleJoinClub = async (e) => {
        e.preventDefault();
        if (!clubForm.name || !clubForm.phone) {
            alert('אנא מלא שם וטלפון');
            return;
        }
        setIsJoiningClub(true);
        try {
            // Check if customer already exists
            const existingCustomers = await Customer.filter({ phone: clubForm.phone });
            if (existingCustomers.length > 0) {
                // Customer exists, maybe update their record
                const existingId = existingCustomers[0].id;
                const updatedData = { 
                    total_visits: (existingCustomers[0].total_visits || 0) + 1,
                    last_visit: new Date().toISOString()
                };
                await Customer.update(existingId, updatedData);
            } else {
                // Create new customer
                await Customer.create({
                    name: clubForm.name,
                    phone: clubForm.phone,
                    last_visit: new Date().toISOString(),
                    total_visits: 1,
                    is_new: false,
                });
            }
            setClubSignupSuccess(true);
        } catch (error) {
            console.error("Failed to join customer club:", error);
            alert("אופס! הייתה בעיה בהרשמה למועדון. נסה שוב.");
        } finally {
            setIsJoiningClub(false);
        }
    };

    const saveFeedback = async (isGoodReview) => {
        try {
            const customerName = session?.customer_name || manualSurvey?.customer_name || 
                               (feedbackForm.contact_name || (tableNumber ? `אורח בשולחן ${tableNumber}` : 'לקוח מברקוד QR'));
            const customerPhone = session?.customer_phone || manualSurvey?.customer_phone || feedbackForm.contact_phone || '';
            
            // שמירת המשוב
            const feedbackData = {
                session_id: sessionId || (manualSurvey ? manualSurvey.id : null),
                customer_name: customerName,
                customer_phone: customerPhone,
                rating: rating,
                comments: comments || '',
                was_redirected_to_google: isGoodReview,
                incident_created: !isGoodReview,
                visit_date: feedbackForm.visit_date,
                party_size: parseInt(feedbackForm.party_size) || null,
                food_rating: feedbackForm.food_rating,
                service_rating: feedbackForm.service_rating,
                table_number: tableNumber && !sessionId && !manualSurvey ? tableNumber : null
            };

            await CustomerFeedback.create(feedbackData);

            // טיפול בלקוחות במועדון הלקוחות
            if (customerPhone && customerName) {
                try {
                    const existingCustomers = await Customer.filter({ phone: customerPhone });
                    
                    if (existingCustomers.length > 0) {
                        // לקוח קיים - עדכון הסטטוס
                        const customer = existingCustomers[0];
                        const updateData = {
                            total_visits: (customer.total_visits || 0) + 1,
                            last_visit: new Date().toISOString(),
                            satisfaction_status: isGoodReview ? 'satisfied' : 'unsatisfied'
                        };
                        
                        if (!isGoodReview) {
                            updateData.last_negative_feedback = new Date().toISOString();
                        }
                        
                        await Customer.update(customer.id, updateData);
                    } else {
                        // לקוח חדש - יצירה עם הסטטוס המתאים
                        const newCustomerData = {
                            name: customerName,
                            phone: customerPhone,
                            last_visit: new Date().toISOString(),
                            total_visits: 1,
                            is_new: false,
                            satisfaction_status: isGoodReview ? 'satisfied' : 'unsatisfied'
                        };
                        
                        if (!isGoodReview) {
                            newCustomerData.last_negative_feedback = new Date().toISOString();
                        }
                        
                        await Customer.create(newCustomerData);
                    }
                } catch (customerError) {
                    console.error('Error managing customer in club:', customerError);
                    // לא עוצרים את התהליך אם יש שגיאה במועדון לקוחות
                }
            }

            // עדכון סטטוס הסקר הידני להושלם (רק אם יש)
            if (manualSurvey) {
                try {
                    await ManualSurvey.update(manualSurvey.id, { status: 'completed' });
                } catch (updateError) {
                    console.error('Error updating manual survey to completed:', updateError);
                }
            }

            // יצירת תקרית עבור ביקורת שלילית
            if (!isGoodReview) {
                try {
                    console.log('יוצר תקרית למשוב שלילי:', { rating, comments, customerName, customerPhone, feedbackForm, tableNumber });
                    
                    // קבלת המשתמש הנוכחי או יצירת reported_by תקין
                    let reportedBy = 'system@surveys.auto';
                    try {
                        const currentUser = await User.me();
                        if (currentUser && currentUser.email) {
                            reportedBy = currentUser.email;
                        }
                    } catch (userError) {
                        console.log('לא ניתן לקבל משתמש נוכחי, משתמש בברירת מחדל');
                    }

                    const contactInfo = feedbackForm.contact_name || feedbackForm.contact_phone ? 
                        `\n\n📞 פרטי קשר שהלקוח השאיר:\nשם: ${feedbackForm.contact_name || 'לא סופק'}\nטלפון: ${feedbackForm.contact_phone || customerPhone || 'לא סופק'}` : 
                        `\n\n📞 טלפון ליצירת קשר: ${customerPhone || 'לא סופק'}`;

                    const incidentDescription = `
                        דירוג כללי: ${rating}/5
                        אוכל: ${feedbackForm.food_rating || 'לא צוין'}/5 | שירות: ${feedbackForm.service_rating || 'לא צוין'}/5
                        תאריך ביקור: ${feedbackForm.visit_date ? format(feedbackForm.visit_date, 'dd/MM/yyyy') : 'לא צוין'}
                        כמות סועדים: ${feedbackForm.party_size || 'לא צוין'}

                        תשובת הלקוח לשאלה "ממה התאכזבת ומה היית מצפה שיקרה טוב יותר":
                        ${comments || 'לא סופקו הערות נוספות'}

                        מקור: ${session ? `שולחן ${session.table_number}` : manualSurvey ? 'סקר ידני' : tableNumber ? `ברקוד שולחן ${tableNumber}` : 'ברקוד QR כללי'}${contactInfo}
                    `;

                    const incidentData = {
                        incident_number: `SURVEY-${Date.now()}`,
                        title: `משוב שלילי מלקוח - ${customerName}`,
                        description: incidentDescription.trim(),
                        category: 'customer_service',
                        severity: rating <= 2 ? 'high' : rating === 3 ? 'medium' : 'low',
                        status: 'reported',
                        visibility_level: 'managers_only',
                        reported_by: reportedBy,
                        incident_date: new Date().toISOString(),
                        location: session ? `שולחן ${session.table_number}` : manualSurvey ? 'סקר ידני' : tableNumber ? `שולחן ${tableNumber} (QR)` : 'ברקוד QR כללי',
                        customer_reaction: `דירוג כללי: ${rating}/5. אוכל: ${feedbackForm.food_rating}/5. שירות: ${feedbackForm.service_rating}/5. הערות: ${comments}\n\nפרטי קשר: ${customerName}${customerPhone || feedbackForm.contact_phone ? ` | טלפון: ${customerPhone || feedbackForm.contact_phone}` : ''}`,
                        solution_provided: 'ממתין לטיפול - יש לחזור ללקוח ולטפל בבעיה',
                        impact_on_shift: 'דורש בדיקה ומעקב עם הלקוח',
                        follow_up_required: true,
                        prevention_measures: `יש לבדוק ולטפל בבעיה שהועלתה על ידי ${customerName}${customerPhone || feedbackForm.contact_phone ? ` (${customerPhone || feedbackForm.contact_phone})` : ''}`
                    };

                    console.log('נתוני התקרית שנוצרה:', incidentData);
                    
                    const createdIncident = await Incident.create(incidentData);
                    console.log('תקרית נוצרה בהצלחה עם פרטי קשר:', createdIncident);
                    
                } catch (incidentError) {
                    console.error('Error creating incident:', incidentError);
                    // נמשיך בתהליך גם אם יצירת התקרית נכשלה
                    alert('המשוב נשמר, אך הייתה בעיה ביצירת התקרית. אנא צור קשר עם המנהל.');
                }
            } else {
                console.log('לא נוצרת תקרית - משוב חיובי:', { isGoodReview });
            }

        } catch (error) {
            console.error('Error in saveFeedback:', error);
            throw error; // זורקים את השגיאה הלאה כדי שהקומפוננט יוכל לטפל בה
        }
    };

    const isQrSource = new URLSearchParams(window.location.search).get('source') === 'qr';

    // Only show loading if we expect to load session/manualSurvey and haven't yet, AND no error, AND it's NOT a QR source
    const isLoadingData = !isQrSource && ((sessionId && !session) || (shortCode && !manualSurvey));

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-red-50 text-red-700 p-8 text-center" dir="rtl">
                <Card className="max-w-md">
                    <CardContent className="p-6">
                        <Frown className="w-12 h-12 mx-auto mb-4 text-red-500" />
                        <h2 className="text-xl font-bold mb-2">אופס!</h2>
                        <p>{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center h-screen" dir="rtl">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
                        <p>טוען...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const customerName = session?.customer_name || manualSurvey?.customer_name || (tableNumber && tableNumber !== 'general' ? `אורח בשולחן ${tableNumber}` : 'אורח יקר');

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4 relative" dir="rtl">
            <div className="absolute top-3 left-3"><LanguagePicker /></div>
            <Card className="w-full max-w-2xl shadow-xl border-0 bg-white/90 backdrop-blur-sm">
                {step === 'rating' && (
                    <>
                        <CardHeader className="text-center bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
                            <CardTitle className="text-2xl font-bold">היי {customerName}!</CardTitle>
                            <CardDescription className="text-green-100">
                                {isQrSource ? (
                                    "תודה שסרקת את הברקוד! המשוב שלך חשוב לנו 💚"
                                ) : (
                                    `נהניתם במסעדת ${brandName}? נשמח לשמוע מכם`
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center items-center gap-2 py-12">
                            {[...Array(5)].map((_, index) => {
                                const starValue = index + 1;
                                return (
                                    <Star
                                        key={starValue}
                                        className={`w-12 h-12 cursor-pointer transition-all duration-200 ${
                                            starValue <= (hover || rating) 
                                                ? 'text-yellow-400 fill-yellow-400 scale-110' 
                                                : 'text-gray-300 hover:text-[#D9BD83]'
                                        }`}
                                        onClick={() => setRating(starValue)}
                                        onMouseEnter={() => setHover(starValue)}
                                        onMouseLeave={() => setHover(0)}
                                    />
                                );
                            })}
                        </CardContent>
                        <CardFooter>
                            <Button 
                                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-lg py-3" 
                                onClick={handleRatingSubmit} 
                                disabled={rating === 0}
                            >
                                המשך
                            </Button>
                        </CardFooter>
                    </>
                )}

                {step === 'feedback' && (
                    <>
                        <CardHeader className="text-center bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
                            <Frown className="w-12 h-12 mx-auto mb-4" />
                            <CardTitle className="text-2xl font-bold">אנו מצטערים לשמוע</CardTitle>
                            <CardDescription className="text-green-100">
                                נשמח אם תוכלו לפרט מה פחות אהבתם כדי שנוכל להשתפר
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="visit-date">תאריך הביקור</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className="w-full justify-start text-right font-normal"
                                            >
                                                <CalendarIcon className="ml-2 h-4 w-4" />
                                                {feedbackForm.visit_date ? format(feedbackForm.visit_date, "PPP") : <span>בחר תאריך</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={feedbackForm.visit_date}
                                                onSelect={(date) => setFeedbackForm({...feedbackForm, visit_date: date})}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div>
                                    <Label htmlFor="party-size">כמות סועדים</Label>
                                    <Input 
                                        id="party-size"
                                        type="number"
                                        value={feedbackForm.party_size}
                                        onChange={(e) => setFeedbackForm({...feedbackForm, party_size: e.target.value})}
                                        placeholder="למשל: 4"
                                    />
                                </div>
                            </div>

                            {/* פרטי קשר - חדש */}
                            <div className="bg-[#F4ECD8] p-4 rounded-lg border border-[#E8D9B5]">
                                <h4 className="font-semibold text-blue-900 mb-3">📞 פרטי קשר (אופציונלי)</h4>
                                <p className="text-sm text-[#2E3819] mb-3">אם תרצו שנחזור אליכם לטיפול אישי בנושא</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="contact-name">שם מלא</Label>
                                        <Input 
                                            id="contact-name"
                                            value={feedbackForm.contact_name}
                                            onChange={(e) => setFeedbackForm({...feedbackForm, contact_name: e.target.value})}
                                            placeholder="למשל: ישראל ישראלי"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="contact-phone">מספר טלפון</Label>
                                        <Input 
                                            id="contact-phone"
                                            value={feedbackForm.contact_phone}
                                            onChange={(e) => setFeedbackForm({...feedbackForm, contact_phone: e.target.value})}
                                            placeholder="למשל: 050-1234567"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label>איך היה האוכל?</Label>
                                <div className="flex justify-center items-center gap-2 pt-2">
                                    {[...Array(5)].map((_, index) => {
                                        const starValue = index + 1;
                                        return (
                                            <Star
                                                key={`food-${starValue}`}
                                                className={`w-8 h-8 cursor-pointer transition-all duration-200 ${
                                                    starValue <= (foodHover || feedbackForm.food_rating) 
                                                        ? 'text-yellow-400 fill-yellow-400 scale-110' 
                                                        : 'text-gray-300 hover:text-[#D9BD83]'
                                                }`}
                                                onClick={() => setFeedbackForm({...feedbackForm, food_rating: starValue})}
                                                onMouseEnter={() => setFoodHover(starValue)}
                                                onMouseLeave={() => setFoodHover(0)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div>
                                <Label>איך היה השירות?</Label>
                                <div className="flex justify-center items-center gap-2 pt-2">
                                    {[...Array(5)].map((_, index) => {
                                        const starValue = index + 1;
                                        return (
                                            <Star
                                                key={`service-${starValue}`}
                                                className={`w-8 h-8 cursor-pointer transition-all duration-200 ${
                                                    starValue <= (serviceHover || feedbackForm.service_rating) 
                                                        ? 'text-yellow-400 fill-yellow-400 scale-110' 
                                                        : 'text-gray-300 hover:text-[#D9BD83]'
                                                }`}
                                                onClick={() => setFeedbackForm({...feedbackForm, service_rating: starValue})}
                                                onMouseEnter={() => setServiceHover(starValue)}
                                                onMouseLeave={() => setServiceHover(0)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                               <Label>ממה התאכזבת ומה היית מצפה שיקרה טוב יותר?</Label>
                                <Textarea
                                    placeholder="ספרו לנו..."
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    rows={4}
                                    className="resize-none mt-1"
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button 
                                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" 
                                onClick={handleFeedbackSubmit} 
                                disabled={loading}
                            >
                                {loading ? 'שולח...' : 'שלח משוב'}
                            </Button>
                        </CardFooter>
                    </>
                )}

                {(step === 'thanks_good' || step === 'thanks_bad') && (
                    <>
                        <CardHeader className="text-center bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
                            <div className="text-4xl mb-2">🙏</div>
                            <CardTitle className="text-2xl mb-2">תודה רבה!</CardTitle>
                            <CardDescription className="text-green-100">
                                {isQrSource ? "המשוב שלכם התקבל בהצלחה 💚" : "המשוב שלכם התקבל בהצלחה"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 text-center">
                            {step === 'thanks_good' && (
                                <p className="text-gray-600 mb-4">
                                    אנחנו שמחים לשמוע שנהניתם! המשוב שלכם התקבל בהצלחה.
                                </p>
                            )}
                            {step === 'thanks_bad' && (
                                <>
                                    <p className="text-gray-600 mb-4">
                                        ההערות שלכם חשובות לנו מאוד. שלחנו את המשוב למנהל המסעדה לטיפול מיידי. 
                                        {(feedbackForm.contact_name || feedbackForm.contact_phone) && (
                                            <span className="text-[#44512C] font-semibold"> נחזור אליכם בהקדם האפשרי.</span>
                                        )}
                                    </p>
                                    <p className="text-gray-600">
                                        אנו נעשה הכל כדי להבטיח שהחוויה הבאה שלכם תהיה מושלמת.
                                    </p>

                                    {(feedbackForm.contact_name || feedbackForm.contact_phone) && (
                                        <div className="bg-green-50 p-4 rounded-lg border border-green-200 mt-4 text-right">
                                            <p className="text-green-800 text-sm">
                                                ✅ <strong>הפרטים שלכם נשמרו:</strong><br/>
                                                {feedbackForm.contact_name && `שם: ${feedbackForm.contact_name}`}<br/>
                                                {feedbackForm.contact_phone && `טלפון: ${feedbackForm.contact_phone}`}
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {isQrSource && (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-200 mb-4">
                                    <p className="text-green-800 text-sm">
                                        💡 <strong>עצה:</strong> שמח שהשתמשת בברקוד! זה עוזר לנו לדעת שהמערכת עובדת טוב
                                    </p>
                                </div>
                            )}

                            {/* הצטרפות לקבוצת וואטסאפ */}
                            {settings?.whatsapp_group_enabled && settings?.whatsapp_group_link && (
                                <div className="bg-green-50 p-6 rounded-lg border border-green-200 mt-6 text-center">
                                    <h3 className="font-bold text-green-900 text-xl mb-2 flex items-center justify-center gap-2">
                                        <span className="text-3xl">💎</span>
                                        קהילת ה-VIP שלנו בוואטסאפ מחכה לכם!
                                    </h3>
                                    <p className="text-green-800 mb-4">
                                        הצטרפו לקבוצה השקטה שלנו וקבלו ראשונים עדכונים על אירועים מיוחדים, תפריטים חדשים והטבות ששמורות רק לחברים!
                                    </p>
                                    <Button
                                        onClick={() => window.open(settings.whatsapp_group_link, '_blank')}
                                        className="bg-green-600 hover:bg-green-700 text-white h-12 px-8 text-lg rounded-full shadow-lg transition-transform hover:scale-105"
                                    >
                                        <span className="text-xl mr-2">💬</span>
                                        הצטרפו עכשיו ותתפנקו
                                    </Button>
                                    <p className="text-xs text-green-700 mt-2">
                                        ✨ מבטיחים לא להציק - רק דברים טובים!
                                    </p>
                                </div>
                            )}
                            
                            {step === 'thanks_good' && isMainTenant && (
                                <div className="bg-[#F4ECD8] p-6 rounded-lg border border-[#E8D9B5] mt-6 text-center">
                                    <h3 className="font-bold text-blue-900 text-xl mb-2">עזרתם לנו המון! ❤️</h3>
                                    <p className="text-[#2E3819] mb-4">
                                        ביקורת חיובית בגוגל היא הדלק שלנו להמשיך ולהשתפר. זה לוקח רק רגע, ועוזר לעסקים מקומיים כמונו יותר ממה שאתם חושבים.
                                    </p>
                                    <Button 
                                        onClick={() => window.open(GOOGLE_REVIEW_LINK, '_blank')}
                                        className="bg-[#44512C] hover:bg-[#44512C] text-white h-12 px-8 text-lg rounded-full shadow-lg transition-transform hover:scale-105"
                                    >
                                        🌟 אכתוב לכם ביקורת מפרגנת
                                    </Button>
                                </div>
                            )}

                             {/* Customer Club Signup */}
                            <div className="bg-[#F4ECD8] p-6 rounded-lg border border-purple-200 mt-6">
                                {clubSignupSuccess ? (
                                    <div className="text-center">
                                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                                        <h3 className="font-bold text-green-800 text-xl">נהדר! צורפת למועדון הלקוחות.</h3>
                                        <p className="text-green-700 mt-2">נשלח לך עדכונים והטבות בקרוב 🎁</p>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="font-bold text-purple-900 mb-2">הצטרפו למועדון הלקוחות שלנו!</h3>
                                        <p className="text-[#7A3722] mb-4 text-sm">קבלו הטבות, הנחות ועדכונים לפני כולם.</p>
                                        <form onSubmit={handleJoinClub} className="space-y-3">
                                            <Input 
                                                placeholder="שם מלא"
                                                value={clubForm.name}
                                                onChange={(e) => setClubForm({...clubForm, name: e.target.value})}
                                                required
                                            />
                                            <Input 
                                                placeholder="מספר טלפון"
                                                type="tel"
                                                value={clubForm.phone}
                                                onChange={(e) => setClubForm({...clubForm, phone: e.target.value})}
                                                required
                                            />
                                            <Button 
                                                type="submit"
                                                className="w-full bg-[#A04A2E] hover:bg-[#7A3722]"
                                                disabled={isJoiningClub}
                                            >
                                                {isJoiningClub ? 'מצטרף...' : 'כן, אני רוצה להצטרף!'}
                                            </Button>
                                        </form>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    );
}
