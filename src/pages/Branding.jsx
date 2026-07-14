import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Palette, Upload, Save, RefreshCw, Sparkles, Building2, MapPin, Phone, Clock, Users, ChefHat } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import TimePicker from '@/components/shared/TimePicker';
import { useTenantBranding, invalidateBrandingCache } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';

const FONT_OPTIONS = [
  { value: '', label: 'ברירת מחדל (Heebo)' },
  { value: 'Heebo', label: 'Heebo' },
  { value: 'Rubik', label: 'Rubik' },
  { value: 'Assistant', label: 'Assistant' },
  { value: 'Alef', label: 'Alef' },
  { value: 'Frank Ruhl Libre', label: 'Frank Ruhl Libre' },
  { value: 'Inter', label: 'Inter' },
];

const DEFAULT_COLORS = { primary: '#A04A2E', secondary: '#44512C', accent: '#B89556' };

function BrandingInner() {
  const branding = useTenantBranding();
  const [profileId, setProfileId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [font, setFont] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  // Business profile fields — deep context for every AI prompt
  const [businessType, setBusinessType] = useState('');
  const [cuisineStyle, setCuisineStyle] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [description, setDescription] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [uniqueSellingPoints, setUniqueSellingPoints] = useState('');
  const [openingHours, setOpeningHours] = useState({});
  const [aiComposing, setAiComposing] = useState(false);

  // Load current profile once. base44.entities.RestaurantProfile is per-tenant.
  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.RestaurantProfile.list();
        const profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (profile) {
          setProfileId(profile.id);
          setRestaurantName(profile.restaurant_name || '');
          setLogoUrl(profile.logo_url || '');
          setCoverPhotoUrl(profile.cover_photo_url || '');
          setColors({ ...DEFAULT_COLORS, ...(profile.brand_colors || {}) });
          setFont(profile.brand_font || '');
          setBusinessType(profile.business_type || '');
          setCuisineStyle(profile.cuisine_style || '');
          setAddress(profile.address || '');
          setCity(profile.city || '');
          setPhone(profile.phone || '');
          setTargetAudience(profile.target_audience || '');
          setDescription(profile.description || '');
          setMenuDescription(profile.menu_description || '');
          const usp = profile.unique_selling_points;
          setUniqueSellingPoints(Array.isArray(usp) ? usp.join('\n') : (typeof usp === 'string' ? usp : ''));
          setOpeningHours(profile.opening_hours || {});
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  const runAiInterview = async () => {
    setAiComposing(true);
    setError(null);
    try {
      const res = await base44.functions.composeBusinessProfileWithAi({
        current: {
          restaurant_name: restaurantName,
          business_type: businessType,
          cuisine_style: cuisineStyle,
          address,
          city,
          phone,
          target_audience: targetAudience,
          description,
          menu_description: menuDescription,
          unique_selling_points: uniqueSellingPoints,
        },
      });
      const data = res?.data || res;
      const suggested = data?.suggested || {};
      if (suggested.business_type) setBusinessType(suggested.business_type);
      if (suggested.cuisine_style) setCuisineStyle(suggested.cuisine_style);
      if (suggested.target_audience) setTargetAudience(suggested.target_audience);
      if (suggested.description) setDescription(suggested.description);
      if (suggested.menu_description) setMenuDescription(suggested.menu_description);
      if (suggested.unique_selling_points) setUniqueSellingPoints(suggested.unique_selling_points);
    } catch (e) {
      setError('שגיאה בפילוח AI: ' + (e?.message || ''));
    } finally {
      setAiComposing(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setLogoUrl(file_url);
    } catch (err) {
      setError('שגיאה בהעלאה: ' + (err?.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setCoverPhotoUrl(file_url);
    } catch (err) {
      setError('שגיאה בהעלאה: ' + (err?.message || ''));
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const uspArr = (uniqueSellingPoints || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const payload = {
        restaurant_name: restaurantName || 'המסעדה',
        logo_url: logoUrl || null,
        cover_photo_url: coverPhotoUrl || null,
        brand_colors: colors,
        brand_font: font || null,
        business_type: businessType || null,
        cuisine_style: cuisineStyle || null,
        address: address || null,
        city: city || null,
        phone: phone || null,
        target_audience: targetAudience || null,
        description: description || null,
        menu_description: menuDescription || null,
        unique_selling_points: uspArr.length ? uspArr : null,
        opening_hours: Object.keys(openingHours || {}).length ? openingHours : null,
        business_context: null, // invalidate — backend will recompose on next AI call
      };
      if (profileId) {
        await base44.entities.RestaurantProfile.update(profileId, payload);
      } else {
        const created = await base44.entities.RestaurantProfile.create(payload);
        setProfileId(created?.id || null);
      }
      invalidateBrandingCache();
      branding?.refresh?.();
      setSavedAt(new Date());
    } catch (e) {
      setError('שגיאה בשמירה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const updateColor = (key, val) => setColors((c) => ({ ...c, [key]: val }));

  const previewStyle = {
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
    fontFamily: font ? `"${font}", system-ui, sans-serif` : 'inherit',
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-slate-700 to-slate-900 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Palette className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">מיתוג המסעדה</h1>
            <p className="text-sm text-white/80 mt-1">
              לוגו, צבעי מותג, פונט, ושם — הופיעו בכל המערכת שלך.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Live preview */}
      <Card>
        <CardContent className="p-6">
          <div className="text-xs text-slate-500 mb-2">תצוגה מקדימה</div>
          <div className="rounded-xl p-6 text-white shadow-lg" style={previewStyle}>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="לוגו" className="w-full h-full object-cover" />
                ) : (
                  <Palette className="w-7 h-7" />
                )}
              </div>
              <div>
                <div className="text-2xl font-black">{restaurantName || 'המסעדה שלי'}</div>
                <div className="text-white/70 text-sm">מערכת ניהול</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editors */}
      <Card>
        <CardContent className="p-6 space-y-6">
          <div>
            <Label className="text-sm font-semibold">שם המסעדה</Label>
            <Input
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder={isMainAlena() ? 'עלינא / יואבי / ...' : 'שם המסעדה שלך'}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold">לוגו</Label>
            <div className="mt-2 flex items-center gap-3">
              {logoUrl && (
                <img src={logoUrl} alt="לוגו" className="w-14 h-14 rounded-lg object-cover border" />
              )}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-slate-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-sm">{uploading ? 'מעלה...' : 'העלה תמונה'}</span>
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
              {logoUrl && (
                <Button variant="ghost" size="sm" onClick={() => setLogoUrl('')} className="text-red-600">
                  הסר
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">תמונת רקע לאדר (מסך העובד)</Label>
            <p className="text-xs text-slate-500 mt-1 mb-2">תמונה יפה של העסק — מופיעה כרקע האדר במסך הבית של העובדים. אם לא תעלה — יוצג גרדיאנט בצבעי המותג שלך.</p>
            <div className="flex items-center gap-3">
              {coverPhotoUrl && (
                <img src={coverPhotoUrl} alt="רקע" className="w-28 h-16 rounded-lg object-cover border" />
              )}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-slate-50">
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-sm">{uploadingCover ? 'מעלה...' : 'העלה תמונת רקע'}</span>
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              </label>
              {coverPhotoUrl && (
                <Button variant="ghost" size="sm" onClick={() => setCoverPhotoUrl('')} className="text-red-600">
                  הסר
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">צבעי מותג</Label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { key: 'primary', label: 'ראשי' },
                { key: 'secondary', label: 'משני' },
                { key: 'accent', label: 'הדגשה' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 p-3 border rounded-lg">
                  <input
                    type="color"
                    value={colors[key] || '#000000'}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-xs text-slate-500">{label}</div>
                    <Input
                      value={colors[key] || ''}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">פונט</Label>
            <select
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'שומר...' : 'שמור'}
            </Button>
            {savedAt && (
              <span className="text-xs text-emerald-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                נשמר. רענן את הדף כדי לראות את השינוי בכל האפליקציה.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Business Profile — deep context for every AI in the system ── */}
      <Card className="border-amber-200 bg-gradient-to-l from-amber-50 to-white">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Building2 className="w-6 h-6 text-amber-600 mt-1" />
              <div>
                <h3 className="text-lg font-bold">פרופיל העסק שלך</h3>
                <p className="text-xs text-slate-600 mt-1">
                  כל AI במערכת יקרא מכאן — סוכן הגיוס, סוכנת האירועים, המלצר הווירטואלי, תדריכים, שיווק.
                  ככל שתמלא יותר — כך התוצאות יהיו מדויקות ומכוונות לעסק שלך.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={runAiInterview} disabled={aiComposing} className="gap-1 whitespace-nowrap">
              {aiComposing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {aiComposing ? 'AI חושב...' : 'עזור לי למלא'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1">
                <ChefHat className="w-3 h-3" /> סוג העסק
              </Label>
              <Input
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="למשל: בר יין, בורגר בר, סושי, קפה שכונתי, מסעדה איטלקית"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">סגנון מטבח</Label>
              <Input
                value={cuisineStyle}
                onChange={(e) => setCuisineStyle(e.target.value)}
                placeholder="ים תיכוני / איטלקי / אסייתי / בשרים על אש"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1">
                <MapPin className="w-3 h-3" /> כתובת
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="רחוב + מספר"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">עיר</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="תל אביב / ראשון לציון / ירושלים"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1">
                <Phone className="w-3 h-3" /> טלפון
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03-1234567"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1">
                <Users className="w-3 h-3" /> קהל יעד
              </Label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="זוגות/משפחות/עסקים/היי-טק/צעירים"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">תיאור המסעדה (בקצרה)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="בשני משפטים — מה הסיפור? למה לבוא? מה הוויב?"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-h-[70px]"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold">התפריט — עיקרי</Label>
            <textarea
              value={menuDescription}
              onChange={(e) => setMenuDescription(e.target.value)}
              placeholder="דגלים ראשיים: מנות שיתוף? כשרות? יינות טבעיים? קוקטיילים? אין דגים?"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-h-[70px]"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold">יתרונות ייחודיים (שורה לכל אחד)</Label>
            <textarea
              value={uniqueSellingPoints}
              onChange={(e) => setUniqueSellingPoints(e.target.value)}
              placeholder={"למשל:\nתנור ג'וספר על אש\nמרפסת עם נוף\nיינות טבעיים בלבד"}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-h-[90px]"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> שעות פעילות
            </Label>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {['sun','mon','tue','wed','thu','fri','sat'].map((k) => {
                const label = { sun: 'א', mon: 'ב', tue: 'ג', wed: 'ד', thu: 'ה', fri: 'ו', sat: 'ש' }[k];
                const v = openingHours?.[k] || {};
                return (
                  <div key={k} className="flex items-center gap-1 border rounded-lg p-2 text-xs">
                    <span className="font-bold w-4">{label}</span>
                    <TimePicker
                      value={v.open || ''}
                      onChange={(val) => setOpeningHours((h) => ({ ...h, [k]: { ...(h?.[k] || {}), open: val } }))}
                    />
                    <span>-</span>
                    <TimePicker
                      value={v.close || ''}
                      onChange={(val) => setOpeningHours((h) => ({ ...h, [k]: { ...(h?.[k] || {}), close: val } }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-xs text-slate-500 pt-2 border-t">
            אחרי שמירה — הבריף היומי, סוכנת האירועים, המלצר הווירטואלי, וכל AI במערכת ידברו בשם העסק שלך עם הפרטים האלה.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Branding() {
  return (
    <PageGuard pageName="Branding" pageTitle="מיתוג">
      <BrandingInner />
    </PageGuard>
  );
}
