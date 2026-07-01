import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Palette, Upload, Save, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { useTenantBranding, invalidateBrandingCache } from '@/hooks/useTenantBranding';

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
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [font, setFont] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

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
          setColors({ ...DEFAULT_COLORS, ...(profile.brand_colors || {}) });
          setFont(profile.brand_font || '');
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        restaurant_name: restaurantName || 'המסעדה',
        logo_url: logoUrl || null,
        brand_colors: colors,
        brand_font: font || null,
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
              placeholder="עלינא / יואבי / ..."
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
