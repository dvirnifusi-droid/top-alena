import React, { useState, useEffect } from 'react';
import { ReservationSettings } from '@/entities/ReservationSettings';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Phone, MessageSquare, Calendar, Save } from 'lucide-react';

// Defaults for the customer confirmation page (ReservationView). The editor pre-fills these.
const DEFAULT_PARKING = 'חניון מול מרכז בן גוריון — הליכה קצרה מהמקום.';
const DEFAULT_NEARBY = 'רחובות סמוכים: רוטשילד, הרצל, וייצמן (כחול-לבן).';
const DEFAULT_POLICY = [
  'השולחן ימתין לכם עד 10 דקות מהשעה המצוינת בהזמנה.',
  'ניתן לבטל עד 3 שעות לפני המועד — ללא חיוב.',
  'ביטול בפחות מ-3 שעות (גם אם הזמנתם בתוך הטווח) — יחויב בפיקדון של 30 ₪ לסועד.',
  'המסעדה אינה מתחייבת לשולחן או אזור ישיבה ספציפי.',
];

// Shrink a (possibly huge, 30MB) photo to a web-friendly JPEG before upload — client-side
// via canvas, so the confirmation page loads fast. Falls back to the original on error.
function resizeImageForWeb(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(img.src);
          if (!blob) return resolve(file);
          resolve(new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    } catch { resolve(file); }
  });
}

export default function PublicReservationSettings() {
    const branding = useTenantBranding();
    const isAlena = isMainAlena();
    // Alena keeps its historical defaults; a fresh tenant defaults to its own
    // branding (name/address) or an empty value it can fill in — never Alena's.
    const defaultName = isAlena ? 'עלינא' : (branding?.name || '');
    const defaultWelcome = isAlena
        ? 'ברוכים הבאים למסעדת עלינא - חוויה קולינרית מיוחדת מחכה לכם'
        : (defaultName ? `ברוכים הבאים למסעדת ${defaultName} - חוויה קולינרית מיוחדת מחכה לכם` : '');
    const [settings, setSettings] = useState({
        restaurant_name: defaultName,
        welcome_message: defaultWelcome,
        phone: isAlena ? '03-1234567' : '',
        email: isAlena ? 'reservations@alina.co.il' : '',
        address: isAlena ? 'רחוב הדוגמה 123, תל אביב' : (branding?.address || ''),
        whatsapp_group_link: 'https://chat.whatsapp.com/KwD8J5F3aE9JnZ2vB4XyQr',
        whatsapp_group_enabled: true,
        min_party_size: 1,
        max_party_size: 12,
        slot_capacity: 36,
        advance_booking_days: 30,
        booking_cutoff_hours: 2,
        special_message: '',
        show_menu_link: true,
        show_location_map: true,
        theme_color: '#059669',
        reservations_enabled: true,
        opening_hours: {
            sunday: { open: '12:00', close: '23:30', closed: false },
            monday: { open: '12:00', close: '23:30', closed: false },
            tuesday: { open: '12:00', close: '23:30', closed: false },
            wednesday: { open: '12:00', close: '23:30', closed: false },
            thursday: { open: '12:00', close: '23:30', closed: false },
            friday: { open: '12:00', close: '23:59', closed: false },
            saturday: { open: '21:00', close: '23:59', closed: false }
        }
    });
    const [loading, setLoading] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const [message, setMessage] = useState('');
    // Phase 2 — reservation-page styling (separate, isolated store).
    const [extras, setExtras] = useState({ tagline: '', tags: '', hero_image_url: '', instagram_url: '', tiktok_url: '', facebook_url: '' });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await ReservationSettings.list('', 1);
            if (data && data.length > 0) {
                setSettings(data[0]);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        try {
            const r = await base44.functions.getReservationPageExtras({});
            const e = r?.data || r || {};
            setExtras({
                tagline: e.tagline || '',
                tags: Array.isArray(e.tags) ? e.tags.join(', ') : '',
                hero_image_url: e.hero_image_url || '',
                instagram_url: e.instagram_url || '',
                tiktok_url: e.tiktok_url || '',
                facebook_url: e.facebook_url || '',
            });
        } catch (error) {
            console.warn('Error loading page extras:', error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const existingSettings = await ReservationSettings.list('', 1);
            
            if (existingSettings && existingSettings.length > 0) {
                await ReservationSettings.update(existingSettings[0].id, settings);
            } else {
                await ReservationSettings.create(settings);
            }

            // Phase 2 — save reservation-page styling (isolated store).
            await base44.functions.setReservationPageExtras({
                tagline: extras.tagline,
                tags: String(extras.tags || '').split(',').map(s => s.trim()).filter(Boolean),
                hero_image_url: extras.hero_image_url,
                instagram_url: extras.instagram_url,
                tiktok_url: extras.tiktok_url,
                facebook_url: extras.facebook_url,
            }).catch((e) => console.warn('save extras failed', e));

            setMessage('ההגדרות נשמרו בהצלחה! ✅');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage('שגיאה בשמירת ההגדרות ❌');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setLoading(false);
        }
    };

    const handleOpeningHourChange = (day, field, value) => {
        setSettings({
            ...settings,
            opening_hours: {
                ...settings.opening_hours,
                [day]: {
                    ...settings.opening_hours[day],
                    [field]: value
                }
            }
        });
    };

    // Blocked time ranges per day (stored inside opening_hours[day].blocks — no DB migration).
    const addBlock = (day) => handleOpeningHourChange(day, 'blocks', [...(settings.opening_hours[day].blocks || []), { start: '14:00', end: '17:00' }]);
    const updateBlock = (day, i, field, value) => {
        const blocks = [...(settings.opening_hours[day].blocks || [])];
        blocks[i] = { ...blocks[i], [field]: value };
        handleOpeningHourChange(day, 'blocks', blocks);
    };
    const removeBlock = (day, i) => handleOpeningHourChange(day, 'blocks', (settings.opening_hours[day].blocks || []).filter((_, idx) => idx !== i));

    // ── Confirmation-page editor (ReservationView content: images / parking / policy / nearby) ──
    const cc = settings.confirmation_config || {};
    const updateCC = (patch) => setSettings(s => ({ ...s, confirmation_config: { ...(s.confirmation_config || {}), ...patch } }));
    const ccPolicy = Array.isArray(cc.policy) ? cc.policy : DEFAULT_POLICY;
    const addPolicy = () => updateCC({ policy: [...ccPolicy, ''] });
    const updatePolicy = (i, v) => updateCC({ policy: ccPolicy.map((l, idx) => idx === i ? v : l) });
    const removePolicy = (i) => updateCC({ policy: ccPolicy.filter((_, idx) => idx !== i) });
    const removeImage = (i) => updateCC({ images: (cc.images || []).filter((_, idx) => idx !== i) });
    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImg(true);
        try {
            const optimized = await resizeImageForWeb(file); // shrink huge photos before upload
            const { file_url } = await base44.integrations.Core.UploadFile({ file: optimized });
            if (file_url) updateCC({ images: [...(cc.images || []), file_url] });
        } catch (err) { alert('שגיאה בהעלאת התמונה: ' + (err?.message || err)); }
        finally { setUploadingImg(false); e.target.value = ''; }
    };
    const handleHeaderUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImg(true);
        try {
            const optimized = await resizeImageForWeb(file);
            const { file_url } = await base44.integrations.Core.UploadFile({ file: optimized });
            if (file_url) updateCC({ header_image: file_url });
        } catch (err) { alert('שגיאה בהעלאת התמונה: ' + (err?.message || err)); }
        finally { setUploadingImg(false); e.target.value = ''; }
    };

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
        <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">הגדרות מסעדה</h1>
                    <p className="text-gray-600">נהל את ההגדרות הכלליות והזמנות</p>
                </div>

                {message && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                        {message}
                    </div>
                )}

                <Tabs defaultValue="general" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="general">כללי</TabsTrigger>
                        <TabsTrigger value="design">עיצוב הדף</TabsTrigger>
                        <TabsTrigger value="whatsapp">וואטסאפ</TabsTrigger>
                        <TabsTrigger value="hours">שעות פעילות</TabsTrigger>
                        <TabsTrigger value="booking">הזמנות</TabsTrigger>
                        <TabsTrigger value="confirm">עמוד אישור</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="w-5 h-5" />
                                    פרטי מסעדה
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="restaurant_name">שם המסעדה</Label>
                                    <Input 
                                        id="restaurant_name"
                                        value={settings.restaurant_name}
                                        onChange={(e) => setSettings({...settings, restaurant_name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="welcome_message">הודעת ברוכים הבאים</Label>
                                    <Textarea 
                                        id="welcome_message"
                                        value={settings.welcome_message}
                                        onChange={(e) => setSettings({...settings, welcome_message: e.target.value})}
                                        className="h-20"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="phone">טלפון</Label>
                                        <Input 
                                            id="phone"
                                            value={settings.phone}
                                            onChange={(e) => setSettings({...settings, phone: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="email">מייל</Label>
                                        <Input 
                                            id="email"
                                            value={settings.email}
                                            onChange={(e) => setSettings({...settings, email: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="address">כתובת</Label>
                                    <Input 
                                        id="address"
                                        value={settings.address}
                                        onChange={(e) => setSettings({...settings, address: e.target.value})}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="design">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="w-5 h-5" /> עיצוב דף ההזמנות
                                </CardTitle>
                                <p className="text-sm text-gray-500">כך יראה דף ההזמנות הציבורי שלך. הכל אופציונלי — מה שתשאיר ריק פשוט לא יוצג.</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="tagline">שורת תיאור (מתחת לשם)</Label>
                                    <Input id="tagline" placeholder="למשל: בר אסאי ושייקים טבעיים"
                                        value={extras.tagline}
                                        onChange={(e) => setExtras({ ...extras, tagline: e.target.value })} />
                                </div>
                                <div>
                                    <Label htmlFor="tags">תגיות (מופרדות בפסיק)</Label>
                                    <Input id="tags" placeholder="טבעוני, כשר, ללא גלוטן, אווירה"
                                        value={extras.tags}
                                        onChange={(e) => setExtras({ ...extras, tags: e.target.value })} />
                                </div>
                                <div>
                                    <Label htmlFor="hero">תמונת רקע (קישור URL)</Label>
                                    <Input id="hero" placeholder="https://... (תמונה רחבה של המסעדה)"
                                        value={extras.hero_image_url}
                                        onChange={(e) => setExtras({ ...extras, hero_image_url: e.target.value })} />
                                    <p className="text-xs text-gray-400 mt-1">אם ריק — יוצג רקע בצבעי המותג. הלוגו נלקח מעמוד המיתוג.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <Label htmlFor="ig">Instagram</Label>
                                        <Input id="ig" placeholder="https://instagram.com/..."
                                            value={extras.instagram_url}
                                            onChange={(e) => setExtras({ ...extras, instagram_url: e.target.value })} />
                                    </div>
                                    <div>
                                        <Label htmlFor="tt">TikTok</Label>
                                        <Input id="tt" placeholder="https://tiktok.com/@..."
                                            value={extras.tiktok_url}
                                            onChange={(e) => setExtras({ ...extras, tiktok_url: e.target.value })} />
                                    </div>
                                    <div>
                                        <Label htmlFor="fb">Facebook</Label>
                                        <Input id="fb" placeholder="https://facebook.com/..."
                                            value={extras.facebook_url}
                                            onChange={(e) => setExtras({ ...extras, facebook_url: e.target.value })} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="whatsapp">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-green-600" />
                                    הגדרות קבוצת וואטסאפ
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="whatsapp_enabled">הפעל הצטרפות לקבוצת וואטסאפ בסקרים</Label>
                                    <Switch 
                                        id="whatsapp_enabled"
                                        checked={settings.whatsapp_group_enabled}
                                        onCheckedChange={(checked) => setSettings({...settings, whatsapp_group_enabled: checked})}
                                    />
                                </div>
                                
                                <div>
                                    <Label htmlFor="whatsapp_link">קישור קבוצת וואטסאפ</Label>
                                    <Input 
                                        id="whatsapp_link"
                                        value={settings.whatsapp_group_link}
                                        onChange={(e) => setSettings({...settings, whatsapp_group_link: e.target.value})}
                                        placeholder="https://chat.whatsapp.com/..."
                                        className="font-mono text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        💡 כדי לקבל את הקישור: פתח את קבוצת הוואטסאפ ← הגדרות קבוצה ← הזמן באמצעות קישור ← העתק קישור
                                    </p>
                                </div>

                                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                    <h4 className="font-semibold text-green-900 mb-2">🎯 איך זה עובד?</h4>
                                    <ul className="text-sm text-green-800 space-y-1">
                                        <li>• לקוחות שמרוצים בסקר יראו הצעה להצטרף לקבוצה</li>
                                        <li>• לקוחות לא מרוצים יכנסו אוטומטית למועדון לקוחות לטיפול</li>
                                        <li>• הקבוצה מושלמת לשיתוף מבצעים ועדכונים</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="hours">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    שעות פעילות
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {Object.keys(settings.opening_hours).map(day => (
                                        <div key={day} className="flex flex-wrap items-center gap-4 p-3 border rounded-lg">
                                            <div className="w-16 font-semibold">{dayNames[day]}</div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={!settings.opening_hours[day].closed}
                                                    onCheckedChange={(checked) => handleOpeningHourChange(day, 'closed', !checked)}
                                                />
                                                <span className="text-sm">פתוח</span>
                                            </div>
                                            {!settings.opening_hours[day].closed && (
                                                <>
                                                    <Input
                                                        type="time"
                                                        value={settings.opening_hours[day].open}
                                                        onChange={(e) => handleOpeningHourChange(day, 'open', e.target.value)}
                                                        className="w-24"
                                                    />
                                                    <span>עד</span>
                                                    <Input
                                                        type="time"
                                                        value={settings.opening_hours[day].close}
                                                        onChange={(e) => handleOpeningHourChange(day, 'close', e.target.value)}
                                                        className="w-24"
                                                    />
                                                    {/* Blocked ranges within this open day — no reservations allowed */}
                                                    <div className="w-full mt-1 pr-16">
                                                        {(settings.opening_hours[day].blocks || []).map((b, i) => (
                                                            <div key={i} className="flex items-center gap-1 mb-1">
                                                                <span className="text-[11px] text-rose-600 font-bold w-14">🚫 חסום</span>
                                                                <Input type="time" value={b.start || '14:00'} onChange={(e) => updateBlock(day, i, 'start', e.target.value)} className="w-24 h-8" />
                                                                <span className="text-xs">עד</span>
                                                                <Input type="time" value={b.end || '17:00'} onChange={(e) => updateBlock(day, i, 'end', e.target.value)} className="w-24 h-8" />
                                                                <button type="button" onClick={() => removeBlock(day, i)} className="text-rose-500 hover:text-rose-700 text-xs px-2">הסר</button>
                                                            </div>
                                                        ))}
                                                        <button type="button" onClick={() => addBlock(day)} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold">+ חסום טווח שעות</button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="booking">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Phone className="w-5 h-5" />
                                    הגדרות הזמנות
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="reservations_enabled">אפשר הזמנות חדשות</Label>
                                    <Switch 
                                        id="reservations_enabled"
                                        checked={settings.reservations_enabled}
                                        onCheckedChange={(checked) => setSettings({...settings, reservations_enabled: checked})}
                                    />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="min_party_size">מינימום סועדים</Label>
                                        <Input 
                                            id="min_party_size"
                                            type="number"
                                            value={settings.min_party_size}
                                            onChange={(e) => setSettings({...settings, min_party_size: parseInt(e.target.value)})}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="max_party_size">מקסימום סועדים להזמנה</Label>
                                        <Input
                                            id="max_party_size"
                                            type="number"
                                            value={settings.max_party_size}
                                            onChange={(e) => setSettings({...settings, max_party_size: parseInt(e.target.value)})}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">מעל מספר זה → אירוע פרטי (טופס אירועים)</p>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="slot_capacity">קיבולת לרבע שעה (סה"כ סועדים)</Label>
                                    <Input
                                        id="slot_capacity"
                                        type="number"
                                        value={settings.slot_capacity}
                                        onChange={(e) => setSettings({...settings, slot_capacity: parseInt(e.target.value)})}
                                    />
                                    <p className="text-[11px] text-gray-400 mt-1">מעל זה נחסם אישור מיידי — הלקוח יקבל שעות חלופיות או ייכנס לרשימת המתנה. כל עסק קובע את שלו.</p>
                                </div>

                                <div>
                                    <Label htmlFor="special_message">הודעה מיוחדת (אופציונלי)</Label>
                                    <Textarea 
                                        id="special_message"
                                        value={settings.special_message}
                                        onChange={(e) => setSettings({...settings, special_message: e.target.value})}
                                        placeholder="למשל: 'שימו לב - חנייה בחיוב'"
                                        className="h-20"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="confirm">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">📄 עמוד אישור ההזמנה</CardTitle>
                                <p className="text-xs text-gray-500">מה שהלקוח רואה בקישור האישור (ReservationView). כתובת + טלפון נלקחים מטאב "כללי".</p>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {/* Header background image (behind the logo) */}
                                <div>
                                    <Label>תמונת רקע להאדר (מאחורי הלוגו)</Label>
                                    <div className="flex items-center gap-2 mt-2">
                                        {cc.header_image ? (
                                            <div className="relative w-32 h-16 rounded-lg overflow-hidden border">
                                                <img src={cc.header_image} alt="" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => updateCC({ header_image: '' })} className="absolute top-0 left-0 bg-red-600 text-white w-5 h-5 text-xs flex items-center justify-center">×</button>
                                            </div>
                                        ) : (
                                            <label className="w-32 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-2xl text-gray-400 hover:border-emerald-400">
                                                {uploadingImg ? '…' : '+'}
                                                <input type="file" accept="image/*" className="hidden" onChange={handleHeaderUpload} disabled={uploadingImg} />
                                            </label>
                                        )}
                                        <p className="text-[11px] text-gray-400">תמונה כהה/אווירתית עובדת הכי טוב (הכיתוב יופיע מעליה עם הצללה).</p>
                                    </div>
                                </div>
                                {/* Images */}
                                <div>
                                    <Label>תמונות לעמוד</Label>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {(cc.images || []).map((url, i) => (
                                            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => removeImage(i)} className="absolute top-0 left-0 bg-red-600 text-white w-5 h-5 text-xs flex items-center justify-center">×</button>
                                            </div>
                                        ))}
                                        <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-2xl text-gray-400 hover:border-emerald-400">
                                            {uploadingImg ? '…' : '+'}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImg} />
                                        </label>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">מומלץ תמונות רוחביות של המסעדה/מנות. הן יופיעו כגלריה בעמוד.</p>
                                </div>
                                {/* Parking */}
                                <div>
                                    <Label>חניה</Label>
                                    <Textarea value={cc.parking ?? DEFAULT_PARKING} onChange={e => updateCC({ parking: e.target.value })} className="h-16" />
                                </div>
                                {/* Nearby */}
                                <div>
                                    <Label>רחובות סמוכים</Label>
                                    <Input value={cc.nearby ?? DEFAULT_NEARBY} onChange={e => updateCC({ nearby: e.target.value })} />
                                </div>
                                {/* Policy lines */}
                                <div>
                                    <Label>שורות מדיניות</Label>
                                    <div className="space-y-1 mt-1">
                                        {ccPolicy.map((line, i) => (
                                            <div key={i} className="flex items-start gap-1">
                                                <Textarea value={line} onChange={e => updatePolicy(i, e.target.value)} className="h-12 text-sm" />
                                                <button type="button" onClick={() => removePolicy(i)} className="text-rose-500 hover:text-rose-700 text-xs px-2 pt-2 shrink-0">הסר</button>
                                            </div>
                                        ))}
                                    </div>
                                    <button type="button" onClick={addPolicy} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold mt-1">+ הוסף שורת מדיניות</button>
                                </div>
                                <div className="text-[11px] text-amber-700 bg-amber-50 rounded p-2">💡 השאר שדה ריק כדי להשתמש בברירת המחדל. לחץ "שמור" למטה כדי לפרסם.</div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={loading} className="bg-green-600 hover:bg-green-700">
                        <Save className="w-4 h-4 ml-2" />
                        {loading ? 'שומר...' : 'שמור הגדרות'}
                    </Button>
                </div>
            </div>
        </div>
    );
}