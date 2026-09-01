
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TableSession } from '@/entities/TableSession';
import { ManualSurvey } from '@/entities/ManualSurvey';
import { CustomerFeedback } from '@/entities/CustomerFeedback';
import { Incident } from '@/entities/Incident';
import { User } from '@/entities/User';
import { Customer } from '@/entities/Customer';
import { Reservation } from '@/entities/Reservation';
import { ReservationSettings } from '@/entities/ReservationSettings';
import { base44 } from '@/api/base44Client';
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

// Alena brand palette — warm, premium (was generic green/emerald before).
const A = {
    terracotta: '#A04A2E', terracottaDark: '#7A3722', olive: '#44512C',
    brass: '#B89556', gold: '#E0A63E', cream: '#FAF5E8', creamCard: '#F4ECD8',
    border: '#E8D9B5', charcoal: '#231D17', muted: '#7A6F5D',
};
const RATING_COPY = ['', 'נשתפר בשבילכם 🙏', 'מצטערים 😔', 'סבבה, נשתדל יותר', 'תודה, שמחנו! 😊', 'וואו, אלופים! 🤩'];

export default function CustomerSurveyPage() {
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    // GOOGLE_REVIEW_LINK points at Alena's specific Google place; only offer the
    // Google CTA on the main Alena tenant so other tenants' guests aren't sent there.
    const isMainTenant = /עלינ|alena|alina/i.test(branding?.name || '');
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('sessionId');
    const shortCode = searchParams.get('s');
    const reservationId = searchParams.get('res');

    const [session, setSession] = useState(null);
    const [manualSurvey, setManualSurvey] = useState(null);
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comments, setComments] = useState('');
    const [feedbackForm, setFeedbackForm] = useState({
        visit_date: null, party_size: '', food_rating: 0, service_rating: 0,
        contact_name: '', contact_phone: '',
    });
    const [foodHover, setFoodHover] = useState(0);
    const [serviceHover, setServiceHover] = useState(0);
    const [step, setStep] = useState('rating'); // rating, feedback, thanks_good, thanks_bad
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tableNumber, setTableNumber] = useState(null);
    const [clubForm, setClubForm] = useState({ name: '', phone: '' });
    const [clubSignupSuccess, setClubSignupSuccess] = useState(false);
    const [isJoiningClub, setIsJoiningClub] = useState(false);
    const [showClub, setShowClub] = useState(false);
    const [settings, setSettings] = useState(null);
    const advanceTimer = useRef(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('source');
        const tableParam = urlParams.get('table');

        if (source === 'qr') {
            if (tableParam) setTableNumber(tableParam);
            return;
        }
        if (tableParam && tableParam !== 'general') setTableNumber(tableParam);

        const loadData = async () => {
            if (sessionId) {
                try {
                    const sessions = await TableSession.filter({ id: sessionId });
                    if (sessions.length > 0) setSession(sessions[0]);
                    else setError('לא נמצאה הזמנה תואמת. ייתכן שהקישור אינו תקין.');
                } catch (e) {
                    console.error('Error loading session:', e);
                    setError('שגיאה בטעינת הנתונים. ייתכן שהקישור אינו תקין.');
                }
            } else if (shortCode) {
                try {
                    const surveys = await ManualSurvey.filter({ survey_id: shortCode });
                    if (surveys.length > 0) {
                        setManualSurvey(surveys[0]);
                        try { await ManualSurvey.update(surveys[0].id, { status: 'viewed' }); }
                        catch (updateError) { console.error('Error updating manual survey status:', updateError); }
                    } else setError('לא נמצא סקר תואם. ייתכן שהקישור אינו תקין.');
                } catch (e) {
                    console.error('Error loading manual survey:', e);
                    setError('שגיאה בטעינת הנתונים. ייתכן שהקישור אינו תקין.');
                }
            } else if (reservationId) {
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
                } catch (e) { console.warn('Could not prefill from reservation', e); }
            } else {
                setError('קישור הסקר אינו תקין. לא נמצא מזהה ספציפי או קוד QR.');
            }
        };
        loadData();
    }, [sessionId, shortCode, reservationId]);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                // PUBLIC fn — the survey is scanned by guests with no login, so we
                // can't use the authed ReservationSettings entity here.
                const r = await base44.asServiceRole.functions.getReservationSettings({});
                const s = (r && r.data !== undefined) ? r.data : r;
                if (s) setSettings(s);
            } catch (error) { console.error('Error loading settings:', error); }
        };
        loadSettings();
    }, []);

    // rv is passed explicitly — the auto-advance timer fires with a stale `rating`
    // closure, so we must not read state here.
    const submitRating = async (rv) => {
        if (rv > 3) {
            try { await saveFeedback(true, rv); } catch (e) { console.error('Error saving good-review feedback:', e); }
            setStep('thanks_good');
        } else {
            setStep('feedback');
        }
    };
    // Tapping a star auto-advances after a short beat — so it's obvious something
    // happened and it's ONE tap to the Google ask. Re-tapping resets the timer so
    // the guest can still change their mind before it moves on.
    const pickAndAdvance = (v) => {
        setRating(v);
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        advanceTimer.current = setTimeout(() => submitRating(v), 550);
    };
    useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

    const handleFeedbackSubmit = async () => {
        setLoading(true);
        try {
            await saveFeedback(false);
            setStep('thanks_bad');
        } catch (e) {
            console.error('Error saving feedback:', e);
            alert('שגיאה בשמירת המשוב. נסה שוב.');
        } finally { setLoading(false); }
    };

    const handleJoinClub = async (e) => {
        e.preventDefault();
        if (!clubForm.name || !clubForm.phone) { alert('אנא מלא שם וטלפון'); return; }
        setIsJoiningClub(true);
        try {
            // PUBLIC club-join fn (guest, no login). city is required by the fn but
            // the survey doesn't ask for it — send a placeholder.
            await base44.asServiceRole.functions.clubJoin({ name: clubForm.name, phone: clubForm.phone, city: 'לא צוין', marketing_consent: true });
            setClubSignupSuccess(true);
        } catch (error) {
            console.error('Failed to join customer club:', error);
            alert('אופס! הייתה בעיה בהרשמה למועדון. נסה שוב.');
        } finally { setIsJoiningClub(false); }
    };

    const saveFeedback = async (isGoodReview, ratingOverride) => {
        // Guests have NO login, so persistence goes through the PUBLIC
        // submitCustomerSurvey fn (feedback + customer satisfaction + a
        // managers-only incident for bad reviews) — no authed entity calls.
        const rv = (ratingOverride ?? rating);
        const customerName = session?.customer_name || manualSurvey?.customer_name ||
            (feedbackForm.contact_name || (tableNumber ? `אורח בשולחן ${tableNumber}` : 'לקוח מברקוד QR'));
        const customerPhone = session?.customer_phone || manualSurvey?.customer_phone || feedbackForm.contact_phone || '';
        const location = session ? `שולחן ${session.table_number}` : manualSurvey ? 'סקר ידני' : tableNumber ? `שולחן ${tableNumber} (QR)` : 'ברקוד QR כללי';
        const contactInfo = (feedbackForm.contact_name || feedbackForm.contact_phone)
            ? `\n\n📞 פרטי קשר: ${feedbackForm.contact_name || 'לא סופק'} · ${feedbackForm.contact_phone || customerPhone || 'לא סופק'}`
            : `\n\n📞 טלפון: ${customerPhone || 'לא סופק'}`;
        const incidentDescription = [
            `דירוג כללי: ${rv}/5`,
            `אוכל: ${feedbackForm.food_rating || 'לא צוין'}/5 | שירות: ${feedbackForm.service_rating || 'לא צוין'}/5`,
            `תאריך ביקור: ${feedbackForm.visit_date ? format(feedbackForm.visit_date, 'dd/MM/yyyy') : 'לא צוין'}`,
            `כמות סועדים: ${feedbackForm.party_size || 'לא צוין'}`,
            ``,
            `ממה התאכזב הלקוח:`,
            `${comments || 'לא סופקו הערות'}`,
            ``,
            `מקור: ${location}${contactInfo}`,
        ].join('\n');
        const customerReaction = `דירוג ${rv}/5 · אוכל ${feedbackForm.food_rating}/5 · שירות ${feedbackForm.service_rating}/5. ${comments || ''}`.trim();

        await base44.asServiceRole.functions.submitCustomerSurvey({
            is_good: isGoodReview,
            rating: rv,
            customer_name: customerName,
            customer_phone: customerPhone,
            comments: comments || '',
            session_id: sessionId || (manualSurvey ? manualSurvey.id : null),
            visit_date: feedbackForm.visit_date ? new Date(feedbackForm.visit_date).toISOString() : null,
            party_size: feedbackForm.party_size,
            food_rating: feedbackForm.food_rating,
            service_rating: feedbackForm.service_rating,
            table_number: tableNumber && !sessionId && !manualSurvey ? tableNumber : null,
            location,
            incident_description: incidentDescription,
            customer_reaction: customerReaction,
        });

        // Best-effort — only works if opened from an authed context; a guest 401 is fine.
        if (manualSurvey) { try { await ManualSurvey.update(manualSurvey.id, { status: 'completed' }); } catch { /* guest */ } }
    };

    const isQrSource = new URLSearchParams(window.location.search).get('source') === 'qr';
    const isLoadingData = !isQrSource && ((sessionId && !session) || (shortCode && !manualSurvey));

    const pageStyle = { background: `linear-gradient(160deg, ${A.cream} 0%, #F3E7CD 55%, #EFE0C2 100%)` };

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen p-6 text-center" dir="rtl" style={pageStyle}>
                <div className="w-full max-w-sm rounded-3xl p-8 shadow-xl" style={{ background: '#fff', border: `1px solid ${A.border}` }}>
                    <Frown className="w-12 h-12 mx-auto mb-4" style={{ color: A.terracotta }} />
                    <h2 className="text-xl font-bold mb-2" style={{ color: A.charcoal }}>אופס!</h2>
                    <p style={{ color: A.muted }}>{error}</p>
                </div>
            </div>
        );
    }

    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center min-h-screen" dir="rtl" style={pageStyle}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: A.terracotta }}></div>
                    <p style={{ color: A.muted }}>טוען...</p>
                </div>
            </div>
        );
    }

    const customerName = session?.customer_name || manualSurvey?.customer_name || (tableNumber && tableNumber !== 'general' ? `אורח בשולחן ${tableNumber}` : 'אורח יקר');
    const activeStars = hover || rating;

    // ── The single most important element: the Google-review CTA ──────────────
    const GoogleReviewCTA = () => (
        <div className="rounded-3xl p-6 text-center shadow-lg" style={{ background: '#fff', border: `2px solid ${A.brass}` }}>
            <div className="text-5xl mb-1 alena-bounce">⭐</div>
            <h3 className="font-extrabold text-xl mb-1 ol-serif" style={{ color: A.charcoal }}>עשיתם לנו את היום 🙏</h3>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: A.muted }}>
                אם נהניתם — פרגנו לנו ביקורת קצרה בגוגל.<br />לוקח <b style={{ color: A.terracotta }}>20 שניות</b>, ומשנה לנו את העולם 🌍
            </p>
            <button
                onClick={() => window.open(GOOGLE_REVIEW_LINK, '_blank')}
                className="alena-pulse w-full h-14 rounded-2xl text-white text-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                style={{ background: `linear-gradient(90deg, ${A.terracotta}, ${A.terracottaDark})` }}
            >
                <span className="text-2xl">⭐</span> כתבו לנו ביקורת בגוגל
            </button>
            <p className="text-[11px] mt-3" style={{ color: A.muted }}>נפתח ישירות בחשבון הגוגל שלכם · אנחנו לא רואים שום פרט</p>
        </div>
    );

    const WhatsAppCommunity = () => (settings?.whatsapp_group_enabled && settings?.whatsapp_group_link ? (
        <button
            onClick={() => window.open(settings.whatsapp_group_link, '_blank')}
            className="w-full rounded-2xl p-4 flex items-center gap-3 text-right transition-transform active:scale-[0.98]"
            style={{ background: A.creamCard, border: `1px solid ${A.border}` }}
        >
            <span className="text-2xl shrink-0">💬</span>
            <span className="flex-1">
                <span className="block font-bold" style={{ color: A.olive }}>הצטרפו לקהילת "החברים של עלינא"</span>
                <span className="block text-xs" style={{ color: A.muted }}>ראשונים לדעת על אירועים, תפריטים חדשים והטבות שמורות · לא מציקים 🤫</span>
            </span>
            <span className="text-sm font-bold shrink-0" style={{ color: A.terracotta }}>הצטרפו ‹</span>
        </button>
    ) : null);

    const ClubSignup = () => (
        <div className="rounded-2xl p-4" style={{ background: A.creamCard, border: `1px solid ${A.border}` }}>
            {clubSignupSuccess ? (
                <div className="text-center py-2">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: A.olive }} />
                    <h3 className="font-bold" style={{ color: A.olive }}>נהדר! צורפתם למועדון 🎁</h3>
                    <p className="text-sm mt-1" style={{ color: A.muted }}>נשלח לכם הטבות ועדכונים בקרוב</p>
                </div>
            ) : !showClub ? (
                <button onClick={() => setShowClub(true)} className="w-full flex items-center gap-3 text-right">
                    <span className="text-2xl shrink-0">🎁</span>
                    <span className="flex-1">
                        <span className="block font-bold" style={{ color: A.terracotta }}>הצטרפו למועדון הלקוחות</span>
                        <span className="block text-xs" style={{ color: A.muted }}>הטבות, הנחות ועדכונים לפני כולם</span>
                    </span>
                    <span className="text-sm font-bold shrink-0" style={{ color: A.terracotta }}>+ הצטרפו</span>
                </button>
            ) : (
                <>
                    <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: A.terracotta }}><span>🎁</span> מועדון הלקוחות</h3>
                    <form onSubmit={handleJoinClub} className="space-y-2.5">
                        <Input placeholder="שם מלא" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required className="bg-white" />
                        <Input placeholder="מספר טלפון" type="tel" value={clubForm.phone} onChange={(e) => setClubForm({ ...clubForm, phone: e.target.value })} required className="bg-white" />
                        <Button type="submit" className="w-full text-white" style={{ background: A.terracotta }} disabled={isJoiningClub}>
                            {isJoiningClub ? 'מצטרף...' : 'כן, אני רוצה להצטרף!'}
                        </Button>
                    </form>
                </>
            )}
        </div>
    );

    const StarRow = ({ value, activeValue, onPick, onHover, onLeave, size = 'w-9 h-9' }) => (
        <div className="flex justify-center items-center gap-1.5">
            {[...Array(5)].map((_, index) => {
                const sv = index + 1;
                const on = sv <= activeValue;
                return (
                    <Star key={sv}
                        className={`${size} cursor-pointer transition-all duration-150 ${on ? 'scale-110' : ''}`}
                        style={{ color: on ? A.gold : '#D8CBB0', fill: on ? A.gold : 'transparent' }}
                        onClick={() => onPick(sv)}
                        onMouseEnter={() => onHover?.(sv)}
                        onMouseLeave={() => onLeave?.()}
                    />
                );
            })}
        </div>
    );

    return (
        <div className="flex items-start sm:items-center justify-center min-h-screen p-4 relative" dir="rtl" style={pageStyle}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@600;800&display=swap');
                .ol-serif{font-family:'Frank Ruhl Libre',Georgia,serif;}
                @keyframes alenaPulse{0%,100%{box-shadow:0 8px 22px -6px rgba(160,74,46,.55)}50%{box-shadow:0 8px 34px 0px rgba(160,74,46,.85)}}
                .alena-pulse{animation:alenaPulse 1.8s ease-in-out infinite}
                @keyframes alenaBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
                .alena-bounce{animation:alenaBounce 1.6s ease-in-out infinite}
            `}</style>
            <div className="absolute top-3 left-3 z-10"><LanguagePicker /></div>

            <div className="w-full max-w-md mt-2 sm:mt-0">
                {/* ── RATING ── */}
                {step === 'rating' && (
                    <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#fff', border: `1px solid ${A.border}` }}>
                        <div className="text-center px-6 pt-9 pb-7 text-white" style={{ background: `linear-gradient(140deg, ${A.terracotta}, ${A.terracottaDark})` }}>
                            <div className="text-4xl mb-2">🍽️</div>
                            <h1 className="text-2xl font-extrabold ol-serif">היי {customerName}!</h1>
                            <p className="mt-1 text-sm" style={{ color: '#F6E7D8' }}>
                                {isQrSource ? `איך הייתה החוויה שלכם ב${brandName}?` : `נהניתם ב${brandName}? נשמח לשמוע`}
                            </p>
                        </div>
                        <div className="px-6 py-9">
                            <p className="text-center text-sm mb-4 font-semibold" style={{ color: A.muted }}>סמנו כמה כוכבים 👇</p>
                            <StarRow value={rating} activeValue={activeStars} onPick={pickAndAdvance} onHover={setHover} onLeave={() => setHover(0)} size="w-12 h-12" />
                            <div className="h-7 mt-3 text-center font-bold text-lg ol-serif" style={{ color: A.terracotta }}>
                                {RATING_COPY[activeStars] || (rating === 0 ? 'הקישו על הכוכבים 👆' : '')}
                            </div>
                        </div>
                        {rating > 0 && (
                            <div className="px-6 pb-6">
                                <button
                                    onClick={() => { if (advanceTimer.current) clearTimeout(advanceTimer.current); submitRating(rating); }}
                                    className="w-full h-13 py-3.5 rounded-2xl text-white text-lg font-bold shadow-lg transition-transform active:scale-95"
                                    style={{ background: `linear-gradient(90deg, ${A.olive}, #384218)` }}
                                >
                                    {rating >= 4 ? 'המשך ➜' : 'המשך'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── FEEDBACK (rating ≤ 3, private) ── */}
                {step === 'feedback' && (
                    <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#fff', border: `1px solid ${A.border}` }}>
                        <div className="text-center px-6 pt-8 pb-6 text-white" style={{ background: `linear-gradient(140deg, ${A.terracotta}, ${A.terracottaDark})` }}>
                            <Frown className="w-11 h-11 mx-auto mb-2" />
                            <h2 className="text-xl font-extrabold ol-serif">מצטערים שלא היה מושלם</h2>
                            <p className="mt-1 text-sm" style={{ color: '#F6E7D8' }}>ספרו לנו מה קרה — נטפל בזה אישית ומהר</p>
                        </div>
                        <CardContent className="p-5 space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="visit-date" className="text-xs" style={{ color: A.muted }}>תאריך הביקור</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start text-right font-normal mt-1">
                                                <CalendarIcon className="ml-2 h-4 w-4" />
                                                {feedbackForm.visit_date ? format(feedbackForm.visit_date, 'dd/MM/yyyy') : <span>בחרו</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar mode="single" selected={feedbackForm.visit_date} onSelect={(date) => setFeedbackForm({ ...feedbackForm, visit_date: date })} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div>
                                    <Label htmlFor="party-size" className="text-xs" style={{ color: A.muted }}>כמות סועדים</Label>
                                    <Input id="party-size" type="number" value={feedbackForm.party_size} onChange={(e) => setFeedbackForm({ ...feedbackForm, party_size: e.target.value })} placeholder="למשל: 4" className="mt-1" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center">
                                    <Label className="text-xs" style={{ color: A.muted }}>האוכל</Label>
                                    <div className="mt-1"><StarRow value={feedbackForm.food_rating} activeValue={foodHover || feedbackForm.food_rating} onPick={(v) => setFeedbackForm({ ...feedbackForm, food_rating: v })} onHover={setFoodHover} onLeave={() => setFoodHover(0)} size="w-7 h-7" /></div>
                                </div>
                                <div className="text-center">
                                    <Label className="text-xs" style={{ color: A.muted }}>השירות</Label>
                                    <div className="mt-1"><StarRow value={feedbackForm.service_rating} activeValue={serviceHover || feedbackForm.service_rating} onPick={(v) => setFeedbackForm({ ...feedbackForm, service_rating: v })} onHover={setServiceHover} onLeave={() => setServiceHover(0)} size="w-7 h-7" /></div>
                                </div>
                            </div>

                            <div>
                                <Label className="text-sm font-semibold" style={{ color: A.charcoal }}>ממה התאכזבתם, ומה הייתם מצפים?</Label>
                                <Textarea placeholder="ספרו לנו בכמה מילים..." value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className="resize-none mt-1.5" />
                            </div>

                            <div className="rounded-xl p-4" style={{ background: A.creamCard, border: `1px solid ${A.border}` }}>
                                <h4 className="font-semibold mb-1 text-sm" style={{ color: A.olive }}>📞 שנחזור אליכם? (רשות)</h4>
                                <p className="text-xs mb-3" style={{ color: A.muted }}>נשמח לתקן אישית</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input value={feedbackForm.contact_name} onChange={(e) => setFeedbackForm({ ...feedbackForm, contact_name: e.target.value })} placeholder="שם" className="bg-white" />
                                    <Input value={feedbackForm.contact_phone} onChange={(e) => setFeedbackForm({ ...feedbackForm, contact_phone: e.target.value })} placeholder="טלפון" className="bg-white" />
                                </div>
                            </div>
                        </CardContent>
                        <div className="px-5 pb-6">
                            <button onClick={handleFeedbackSubmit} disabled={loading} className="w-full py-3.5 rounded-2xl text-white text-lg font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${A.olive}, #384218)` }}>
                                {loading ? 'שולח...' : 'שלחו לנו — נטפל בזה'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── THANKS (good) — Google CTA is the hero ── */}
                {step === 'thanks_good' && (
                    <div className="space-y-4">
                        <div className="text-center pt-2 pb-1">
                            <div className="text-5xl mb-1">🎉</div>
                            <h1 className="text-2xl font-extrabold ol-serif" style={{ color: A.charcoal }}>תודה {customerName}!</h1>
                            <div className="mt-2"><StarRow value={5} activeValue={5} onPick={() => {}} size="w-7 h-7" /></div>
                        </div>
                        {isMainTenant && <GoogleReviewCTA />}
                        <WhatsAppCommunity />
                        <ClubSignup />
                    </div>
                )}

                {/* ── THANKS (bad) — apologetic, private, no Google ── */}
                {step === 'thanks_bad' && (
                    <div className="space-y-4">
                        <div className="rounded-3xl p-7 text-center shadow-xl" style={{ background: '#fff', border: `1px solid ${A.border}` }}>
                            <div className="text-4xl mb-2">🙏</div>
                            <h1 className="text-2xl font-extrabold ol-serif mb-2" style={{ color: A.charcoal }}>תודה על הכנות</h1>
                            <p className="text-sm leading-relaxed" style={{ color: A.muted }}>
                                ההערות שלכם הגיעו ישירות למנהל המסעדה לטיפול מיידי.
                                {(feedbackForm.contact_name || feedbackForm.contact_phone) && <span className="font-semibold" style={{ color: A.olive }}> נחזור אליכם בהקדם.</span>}
                            </p>
                            {(feedbackForm.contact_name || feedbackForm.contact_phone) && (
                                <div className="rounded-xl p-3 mt-4 text-right text-sm" style={{ background: A.creamCard, border: `1px solid ${A.border}` }}>
                                    <span style={{ color: A.olive }}>✅ <strong>הפרטים שלכם נשמרו:</strong></span><br />
                                    {feedbackForm.contact_name && <span style={{ color: A.muted }}>שם: {feedbackForm.contact_name}<br /></span>}
                                    {feedbackForm.contact_phone && <span style={{ color: A.muted }}>טלפון: {feedbackForm.contact_phone}</span>}
                                </div>
                            )}
                        </div>
                        <WhatsAppCommunity />
                        <ClubSignup />
                    </div>
                )}
            </div>
        </div>
    );
}
