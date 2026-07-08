import React, { useState, useEffect } from 'react';
import { ReservationSettings } from '@/entities/ReservationSettings';
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
    const [message, setMessage] = useState('');

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
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="general">כללי</TabsTrigger>
                        <TabsTrigger value="whatsapp">וואטסאפ</TabsTrigger>
                        <TabsTrigger value="hours">שעות פעילות</TabsTrigger>
                        <TabsTrigger value="booking">הזמנות</TabsTrigger>
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
                                        <div key={day} className="flex items-center gap-4 p-3 border rounded-lg">
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
                                        <Label htmlFor="max_party_size">מקסימום סועדים</Label>
                                        <Input 
                                            id="max_party_size"
                                            type="number"
                                            value={settings.max_party_size}
                                            onChange={(e) => setSettings({...settings, max_party_size: parseInt(e.target.value)})}
                                        />
                                    </div>
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