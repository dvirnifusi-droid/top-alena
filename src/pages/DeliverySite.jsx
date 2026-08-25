import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Store, Link2, Save, Check, RefreshCw, Search, Utensils, Power, Megaphone, Ticket, TrendingUp, CalendarOff, Plus, Trash2, SlidersHorizontal, CreditCard, ShieldCheck, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Resize an image file to a sane size before upload — a phone photo is 3–5MB and
// would blow the JSON body; 1200px/JPEG keeps it ~150KB and looks fine on a card.
function fileToDataUrl(file, maxPx = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Owner remote for the alenabepita.co.il delivery site. Talks to the WordPress
// control bridge through the app backend (which holds the secret key). See
// apps/api/src/functions/deliverySiteControl.ts.
// build-marker: live-ops-controls v1

export default function DeliverySite() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // connect form
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [connecting, setConnecting] = useState(false);

  // menu editor (lazy — only fetched when opened)
  const [products, setProducts] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [uploadingImgId, setUploadingImgId] = useState(null);

  // live operational controls
  const [quickBusy, setQuickBusy] = useState('');       // label of the action mid-save
  const [orders, setOrders] = useState(null);           // today's orders summary
  const [coupons, setCoupons] = useState(null);         // lazy
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponBusy, setCouponBusy] = useState(null);
  const [newDate, setNewDate] = useState('');           // holiday date to add

  // add-new-product + categories
  const [categories, setCategories] = useState([]);
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState({ name: '', price: '', category_id: '' });
  const [creatingProd, setCreatingProd] = useState(false);

  // option groups (modifiers)
  const [ogGroups, setOgGroups] = useState(null);       // lazy
  const [ogLoading, setOgLoading] = useState(false);
  const [ogBusy, setOgBusy] = useState(null);
  const [prodOpts, setProdOpts] = useState({});         // {productId: [refs]}
  const [prodOptsBusy, setProdOptsBusy] = useState(null);

  // payments / OTP
  const [gateways, setGateways] = useState(null);       // lazy
  const [gwLoading, setGwLoading] = useState(false);
  const [gwBusy, setGwBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // base44.functions returns axios-style { data, status } — the body is in .data.
      const d = (await base44.functions.getDeliverySiteControl({}))?.data || {};
      setConnected(!!d.connected);
      setSettings(d.settings || null);
      setError(d.error || '');
      if (d.connected) { loadOrders(); loadOtpTplStatus(); }
    } catch (e) {
      setError(e?.message || 'טעינה נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = async () => {
    try {
      const d = (await base44.functions.getDeliverySiteOrdersToday({}))?.data || {};
      if (d.ok) setOrders(d);
    } catch { /* non-critical */ }
  };

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true); setError('');
    try {
      const d = (await base44.functions.connectDeliverySite({ url, key }))?.data || {};
      if (d.connected) {
        setConnected(true); setSettings(d.settings || null); setKey('');
      } else {
        setError(d.error || 'החיבור נכשל');
      }
    } catch (e) {
      setError(e?.message || 'החיבור נכשל');
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      const payload = {
        club: {
          member_discount_pct: Number(settings.club?.member_discount_pct) || 0,
          join_incentive: settings.club?.join_incentive || '',
          coin_value: Number(settings.club?.coin_value) || 0,
          earn_per: Number(settings.club?.earn_per) || 1,
        },
        features: Object.fromEntries(
          Object.entries(settings.features || {}).map(([slug, f]) => [slug, !!f.enabled]),
        ),
        zones: (settings.zones || []).map((z) => ({
          id: z.id,
          name: z.name,
          delivery_fee: Number(z.delivery_fee) || 0,
          min_order: Number(z.min_order) || 0,
          eta_max: Number(z.eta_max) || 0,
          enabled: z.enabled !== false,
        })),
        brand_images: settings.brand_images || {},
        cart_eta: {
          delivery_min: Number(settings.cart_eta?.delivery_min) || 0,
          delivery_max: Number(settings.cart_eta?.delivery_max) || 0,
          pickup_min: Number(settings.cart_eta?.pickup_min) || 0,
          pickup_max: Number(settings.cart_eta?.pickup_max) || 0,
        },
        note_chips: settings.note_chips || {},
        hours: settings.hours || {},
        specials: settings.specials || {},
        store_status: {
          mode: settings.store_status?.mode || 'open',
          busy_extra_min: Number(settings.store_status?.busy_extra_min) || 0,
          message: settings.store_status?.message || '',
        },
        announcement: {
          enabled: !!settings.announcement?.enabled,
          text: settings.announcement?.text || '',
        },
        free_delivery_over: Number(settings.free_delivery_over) || 0,
        date_overrides: settings.date_overrides || {},
      };
      const d = (await base44.functions.setDeliverySiteControl({ settings: payload }))?.data || {};
      if (d.settings) setSettings(d.settings);
      setSavedAt(new Date());
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  // Instant partial save — for one-tap actions (open/close, busy, zone toggle)
  // that should hit the live site immediately without the big Save button.
  const quickSave = async (partial, label) => {
    setQuickBusy(label || 'save'); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteControl({ settings: partial }))?.data || {};
      if (d.settings) setSettings(d.settings);
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setQuickBusy('');
    }
  };
  const setStoreMode = (mode) => {
    setSettings((s) => ({ ...s, store_status: { ...(s.store_status || {}), mode } }));
    quickSave({ store_status: { ...(settings.store_status || {}), mode } }, 'mode:' + mode);
  };
  const setBusy = (min) => {
    const busy_extra_min = Number(min) || 0;
    setSettings((s) => ({ ...s, store_status: { ...(s.store_status || {}), busy_extra_min } }));
  };
  const applyBusy = (min) => quickSave({ store_status: { ...(settings.store_status || {}), busy_extra_min: Number(min) || 0 } }, 'busy');
  const setStatusMsg = (message) => setSettings((s) => ({ ...s, store_status: { ...(s.store_status || {}), message } }));
  const setAnnounce = (k, v) => setSettings((s) => ({ ...s, announcement: { ...(s.announcement || {}), [k]: v } }));
  const setFree = (v) => setSettings((s) => ({ ...s, free_delivery_over: v }));
  const toggleZoneEnabled = (id, enabled) => {
    setSettings((s) => ({ ...s, zones: (s.zones || []).map((z) => (z.id === id ? { ...z, enabled } : z)) }));
    quickSave({ zones: [{ id, enabled }] }, 'zone:' + id);
  };
  const addDateOverride = () => {
    if (!newDate) return;
    setSettings((s) => ({ ...s, date_overrides: { ...(s.date_overrides || {}), [newDate]: { mode: 'closed' } } }));
    setNewDate('');
  };
  const removeDateOverride = (date) =>
    setSettings((s) => {
      const d = { ...(s.date_overrides || {}) }; delete d[date]; return { ...s, date_overrides: d };
    });

  const loadCoupons = async () => {
    setCouponsLoading(true);
    try {
      const d = (await base44.functions.getDeliverySiteCoupons({}))?.data || {};
      setCoupons(Array.isArray(d.coupons) ? d.coupons : []);
    } catch (e) {
      setError(e?.message || 'טעינת קופונים נכשלה');
    } finally {
      setCouponsLoading(false);
    }
  };
  const setCouponField = (id, k, v) =>
    setCoupons((cs) => cs.map((c) => (c.id === id ? { ...c, [k]: v } : c)));
  const saveCoupon = async (c) => {
    setCouponBusy(c.id ?? 'new'); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteCoupon({
        id: c.id, code: c.code, discount_type: c.discount_type, amount: c.amount,
        minimum_amount: c.minimum_amount, free_shipping: c.free_shipping,
        description: c.description, expiry_date: c.expiry_date, enabled: c.enabled,
      }))?.data || {};
      if (d.ok) await loadCoupons();
      else setError(d.error || 'שמירת קופון נכשלה');
    } catch (e) {
      setError(e?.message || 'שמירת קופון נכשלה');
    } finally {
      setCouponBusy(null);
    }
  };
  const deleteCoupon = async (c) => {
    if (!window.confirm('למחוק את הקופון "' + (c.code || '') + '"?')) return;
    setCouponBusy(c.id); setError('');
    try {
      await base44.functions.setDeliverySiteCoupon({ id: c.id, delete: true });
      await loadCoupons();
    } catch (e) {
      setError(e?.message || 'מחיקה נכשלה');
    } finally {
      setCouponBusy(null);
    }
  };
  const addCoupon = () =>
    setCoupons((cs) => [{ id: 0, code: '', discount_type: 'percent', amount: '10', minimum_amount: '', free_shipping: false, description: '', expiry_date: '', enabled: true, _new: true }, ...(cs || [])]);

  // --- Add new product ---
  const createProduct = async () => {
    if (!newProd.name) return;
    setCreatingProd(true); setError('');
    try {
      const d = (await base44.functions.createDeliverySiteProduct({
        name: newProd.name, price: newProd.price, category_id: newProd.category_id, in_stock: true,
      }))?.data || {};
      if (d.ok) {
        setNewProd({ name: '', price: '', category_id: '' }); setNewProdOpen(false);
        await loadMenu();
      } else setError(d.error || 'יצירת המנה נכשלה');
    } catch (e) {
      setError(e?.message || 'יצירת המנה נכשלה');
    } finally {
      setCreatingProd(false);
    }
  };

  // --- Option groups (modifiers) ---
  const loadOptionGroups = async () => {
    setOgLoading(true);
    try {
      const d = (await base44.functions.getDeliverySiteOptionGroups({}))?.data || {};
      setOgGroups(Array.isArray(d.groups) ? d.groups : []);
    } catch (e) {
      setError(e?.message || 'טעינת אופציות נכשלה');
    } finally {
      setOgLoading(false);
    }
  };
  const setOgField = (id, patch) => setOgGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const setOgValue = (gid, vidx, patch) =>
    setOgGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, values: g.values.map((v, i) => (i === vidx ? { ...v, ...patch } : v)) } : g)));
  const addOgValue = (gid) => setOgGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, values: [...(g.values || []), { id: '', name: '', price: 0 }] } : g)));
  const removeOgValue = (gid, vidx) => setOgGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, values: g.values.filter((_, i) => i !== vidx) } : g)));
  const addOgGroup = () => setOgGroups((gs) => [{ id: '', name: '', type: 'single', values: [{ id: '', name: '', price: 0 }], used_by: 0, _new: true }, ...(gs || [])]);
  const saveOgGroup = async (g) => {
    setOgBusy(g.id || 'new'); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteOptionGroup({ id: g.id || undefined, name: g.name, type: g.type, values: g.values }))?.data || {};
      if (d.ok) await loadOptionGroups();
      else setError(d.error || 'שמירה נכשלה');
    } catch (e) {
      setError(e?.message || 'שמירה נכשלה');
    } finally {
      setOgBusy(null);
    }
  };
  const deleteOgGroup = async (g) => {
    if (g.used_by > 0) { setError('הקבוצה משויכת ל־' + g.used_by + ' מנות — הסירו אותה מהן קודם'); return; }
    if (g.id && !window.confirm('למחוק את "' + (g.name || '') + '"?')) return;
    if (!g.id) { setOgGroups((gs) => gs.filter((x) => x !== g)); return; }
    setOgBusy(g.id); setError('');
    try {
      await base44.functions.setDeliverySiteOptionGroup({ id: g.id, delete: true });
      await loadOptionGroups();
    } catch (e) {
      setError(e?.message || 'מחיקה נכשלה');
    } finally {
      setOgBusy(null);
    }
  };
  // Per-dish attach/detach of library groups
  const loadProdOpts = async (pid) => {
    if (ogGroups === null) await loadOptionGroups();
    try {
      const d = (await base44.functions.getDeliverySiteProductOptions({ id: pid }))?.data || {};
      setProdOpts((x) => ({ ...x, [pid]: Array.isArray(d.refs) ? d.refs : [] }));
    } catch (e) {
      setError(e?.message || 'טעינת אופציות מנה נכשלה');
    }
  };
  const toggleProdGroup = (pid, group) =>
    setProdOpts((x) => {
      const cur = x[pid] || [];
      const has = cur.some((r) => r.group_id === group.id);
      const next = has ? cur.filter((r) => r.group_id !== group.id)
                       : [...cur, { group_id: group.id, label: group.name, min: 0, max: group.type === 'multi' ? 0 : 1, max_single: 1, free: 0 }];
      return { ...x, [pid]: next };
    });
  const saveProdOpts = async (pid) => {
    setProdOptsBusy(pid); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteProductOptions({ id: pid, refs: prodOpts[pid] || [] }))?.data || {};
      if (!d.ok) setError(d.error || 'שמירה נכשלה');
    } catch (e) {
      setError(e?.message || 'שמירה נכשלה');
    } finally {
      setProdOptsBusy(null);
    }
  };

  // --- Payment gateways ---
  const loadGateways = async () => {
    setGwLoading(true);
    try {
      const d = (await base44.functions.getDeliverySitePaymentGateways({}))?.data || {};
      setGateways(Array.isArray(d.gateways) ? d.gateways : []);
    } catch (e) {
      setError(e?.message || 'טעינת אמצעי תשלום נכשלה');
    } finally {
      setGwLoading(false);
    }
  };
  const toggleGateway = async (gw, enabled) => {
    setGateways((gs) => gs.map((g) => (g.id === gw.id ? { ...g, enabled } : g)));
    setGwBusy(gw.id);
    try {
      await base44.functions.setDeliverySitePaymentGateway({ id: gw.id, enabled });
    } catch (e) {
      setError(e?.message || 'שמירה נכשלה'); loadGateways();
    } finally {
      setGwBusy(null);
    }
  };

  // --- Auth / OTP ---
  const [otpTplBusy, setOtpTplBusy] = useState(false);
  const [otpTplMsg, setOtpTplMsg] = useState('');
  const [otpTpl, setOtpTpl] = useState(null); // live {configured, approved}
  const loadOtpTplStatus = async () => {
    try {
      const d = (await base44.functions.getWhatsAppTemplates({}))?.data || {};
      const t = (d.templates || []).find((x) => x.kind === 'delivery_otp');
      if (t) setOtpTpl({ configured: !!t.configured, approved: !!t.approved });
    } catch { /* non-critical */ }
  };
  const submitOtpTemplate = async () => {
    setOtpTplBusy(true); setOtpTplMsg('');
    try {
      const d = (await base44.functions.ensureWaTemplate({ kind: 'delivery_otp' }))?.data || {};
      setOtpTplMsg(d.message || d.status || 'נשלח');
      loadOtpTplStatus();
    } catch (e) {
      setOtpTplMsg(e?.message || 'שליחת התבנית נכשלה');
    } finally {
      setOtpTplBusy(false);
    }
  };
  const setAuth = (k, v) => setSettings((s) => ({ ...s, auth: { ...(s.auth || {}), [k]: v } }));
  const saveAuth = async (extra = {}) => {
    setQuickBusy('auth'); setError('');
    try {
      const a = { ...(settings.auth || {}), ...extra };
      // Don't send the masked booleans back as if they were secrets.
      const payload = { provider: a.provider, test_mode: a.test_mode, wa_template: a.wa_template, twilio_from: a.twilio_from };
      ['wa_token', 'wa_phone_id', 'twilio_sid', 'twilio_token'].forEach((k) => { if (a[k]) payload[k] = a[k]; });
      const d = (await base44.functions.setDeliverySiteControl({ settings: { auth: payload } }))?.data || {};
      if (d.settings) setSettings((s) => ({ ...s, auth: d.settings.auth }));
    } catch (e) {
      setError(e?.message || 'שמירה נכשלה');
    } finally {
      setQuickBusy('');
    }
  };

  const setClub = (k, v) => setSettings((s) => ({ ...s, club: { ...s.club, [k]: v } }));
  const setFeature = (slug, v) =>
    setSettings((s) => ({ ...s, features: { ...s.features, [slug]: { ...s.features[slug], enabled: v } } }));
  const setZone = (id, k, v) =>
    setSettings((s) => ({ ...s, zones: (s.zones || []).map((z) => (z.id === id ? { ...z, [k]: v } : z)) }));

  const loadMenu = async () => {
    setMenuLoading(true);
    try {
      const d = (await base44.functions.getDeliverySiteProducts({}))?.data || {};
      setProducts(Array.isArray(d.products) ? d.products : []);
      if (Array.isArray(d.categories)) setCategories(d.categories);
    } catch (e) {
      setError(e?.message || 'טעינת התפריט נכשלה');
    } finally {
      setMenuLoading(false);
    }
  };
  const setProduct = (id, k, v) =>
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const saveProduct = async (p) => {
    setSavingId(p.id); setError('');
    try {
      const d = (await base44.functions.setDeliverySiteProduct({
        id: p.id, name: p.name, price: p.price, description: p.description, in_stock: p.in_stock,
      }))?.data || {};
      if (d.ok) { setSavedId(p.id); setTimeout(() => setSavedId(null), 1500); }
      else setError(d.error || 'שמירת המנה נכשלה');
    } catch (e) {
      setError(e?.message || 'שמירת המנה נכשלה');
    } finally {
      setSavingId(null);
    }
  };
  const uploadImage = async (p, file) => {
    if (!file) return;
    setUploadingImgId(p.id); setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const d = (await base44.functions.setDeliverySiteProductImage({ id: p.id, filename: file.name || 'dish.jpg', data: dataUrl }))?.data || {};
      if (d.ok && d.image) setProduct(p.id, 'image', d.image + '?t=' + Date.now());
      else setError(d.error || 'העלאת תמונה נכשלה');
    } catch (e) {
      setError(e?.message || 'העלאת תמונה נכשלה');
    } finally {
      setUploadingImgId(null);
    }
  };
  const setImg = (brand, v) =>
    setSettings((s) => ({ ...s, brand_images: { ...(s.brand_images || {}), [brand]: v } }));
  const setEta = (k, v) =>
    setSettings((s) => ({ ...s, cart_eta: { ...(s.cart_eta || {}), [k]: v } }));
  const setChips = (which, text) =>
    setSettings((s) => ({ ...s, note_chips: { ...(s.note_chips || {}), [which]: text.split('\n').map((x) => x.trim()).filter(Boolean) } }));
  // Hours: edit from/to of an existing range, preserving any extra elements
  // (motzash+30 stays as text; a Friday {category_slug} object at [2] is kept).
  const setHour = (service, day, idx, pos, v) =>
    setSettings((s) => {
      const h = JSON.parse(JSON.stringify(s.hours || {}));
      if (!h[service]) h[service] = {};
      if (!h[service][day]) h[service][day] = [];
      if (!h[service][day][idx]) h[service][day][idx] = ['', ''];
      h[service][day][idx][pos] = v;
      return { ...s, hours: h };
    });
  const setSpecial = (pid, patch) =>
    setSettings((s) => ({ ...s, specials: { ...(s.specials || {}), [pid]: { ...(s.specials || {})[pid], ...patch } } }));
  const toggleSpecialDay = (pid, day) =>
    setSettings((s) => {
      const cur = ((s.specials || {})[pid]?.days || []).map(Number);
      const days = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort();
      return { ...s, specials: { ...(s.specials || {}), [pid]: { ...(s.specials || {})[pid], days } } };
    });

  return (
    <PageGuard pageName="DeliverySite" pageTitle="אתר משלוחים">
      <PageShell>
        <PageHeader
          title="אתר משלוחים — עלינא בפיתה"
          subtitle="שליטה בהטבות ובהגדרות של אתר ההזמנות, ישירות מכאן"
          icon={Store}
          action={connected ? (
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="w-4 h-4 ml-1" /> רענון
            </Button>
          ) : null}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin ml-2" /> טוען…
          </div>
        ) : !connected ? (
          /* ---------- Connect ---------- */
          <Card className="max-w-xl mx-auto">
            <CardContent className="p-6 space-y-4" dir="rtl">
              <div className="flex items-center gap-2 text-lg font-bold"><Link2 className="w-5 h-5" /> חיבור לאתר המשלוחים</div>
              <p className="text-sm text-slate-600">
                בוורדפרס: <b>אזורי חלוקה → מרכז שליטה → חיבור לאפליקציית TOP ALENA</b>. העתק משם את הכתובת והמפתח והדבק כאן (פעם אחת).
              </p>
              <div>
                <Label>כתובת</Label>
                <Input dir="ltr" placeholder="https://alenabepita.co.il" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div>
                <Label>מפתח שליטה</Label>
                <Input dir="ltr" placeholder="מפתח סודי מהמרכז שליטה" value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
              <Button onClick={connect} disabled={connecting || !url || !key} className="w-full">
                {connecting ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> מתחבר…</> : <>חבר את האתר</>}
              </Button>
            </CardContent>
          </Card>
        ) : !settings ? (
          <Card className="max-w-xl mx-auto"><CardContent className="p-6 text-center" dir="rtl">
            <p className="text-rose-600 font-semibold mb-3">{error || 'מחובר, אך לא הצלחנו לטעון הגדרות'}</p>
            <Button onClick={load} variant="outline">נסה שוב</Button>
          </CardContent></Card>
        ) : (
          /* ---------- Settings ---------- */
          <div className="space-y-5 max-w-2xl mx-auto" dir="rtl">

            {/* ---- Store status: the one-tap open/closed control ---- */}
            <Card className="border-2 border-slate-200">
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold flex items-center gap-2"><Power className="w-5 h-5" /> מצב החנות</div>
                {(() => {
                  const mode = settings.store_status?.mode || 'open';
                  const opts = [
                    { v: 'open', label: 'פתוח', emoji: '🟢', cls: 'bg-emerald-600 border-emerald-600' },
                    { v: 'delivery_only', label: 'משלוחים בלבד', emoji: '🚚', cls: 'bg-amber-600 border-amber-600' },
                    { v: 'pickup_only', label: 'איסוף בלבד', emoji: '🛍️', cls: 'bg-amber-600 border-amber-600' },
                    { v: 'closed', label: 'סגור עכשיו', emoji: '🔴', cls: 'bg-rose-600 border-rose-600' },
                  ];
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {opts.map((o) => (
                        <button key={o.v} type="button" onClick={() => setStoreMode(o.v)} disabled={quickBusy === 'mode:' + o.v}
                          className={`rounded-xl border-2 py-3 text-sm font-bold transition ${mode === o.v ? o.cls + ' text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                          {quickBusy === 'mode:' + o.v ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <>{o.emoji} {o.label}</>}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                <div>
                  <Label className="text-xs">הודעה ללקוח כשסגור (לא חובה)</Label>
                  <Input value={settings.store_status?.message || ''} placeholder="נחזור בעוד כשעה 🙏"
                    onChange={(e) => setStatusMsg(e.target.value)}
                    onBlur={() => quickSave({ store_status: settings.store_status || {} }, 'msg')} />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">🔥 מצב עומס — להוסיף דקות לזמן ההכנה</Label>
                    <div className="flex gap-1 mt-1">
                      {[0, 15, 30, 45].map((m) => (
                        <button key={m} type="button" onClick={() => { setBusy(m); applyBusy(m); }}
                          className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${(Number(settings.store_status?.busy_extra_min) || 0) === m ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 text-slate-500'}`}>
                          {m === 0 ? 'רגיל' : '+' + m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {quickBusy && quickBusy.startsWith('mode') === false && <p className="text-xs text-slate-400">שומר…</p>}
              </CardContent>
            </Card>

            {/* ---- Today's orders (read-only) ---- */}
            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold flex items-center gap-2 text-slate-700"><TrendingUp className="w-4 h-4" /> היום עד עכשיו</div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400" onClick={loadOrders}><RefreshCw className="w-3.5 h-3.5" /></Button>
                </div>
                {orders ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-2xl font-extrabold text-slate-800">{orders.count}</div><div className="text-xs text-slate-500">הזמנות</div></div>
                    <div><div className="text-2xl font-extrabold text-emerald-700">₪{Number(orders.revenue).toLocaleString()}</div><div className="text-xs text-slate-500">מחזור</div></div>
                    <div><div className="text-2xl font-extrabold text-slate-800">₪{Number(orders.avg).toLocaleString()}</div><div className="text-xs text-slate-500">ממוצע</div></div>
                  </div>
                ) : <p className="text-xs text-slate-400 text-center py-2">טוען…</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold">🎁 מועדון והטבות</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>הנחת חבר מועדון (%)</Label>
                    <Input type="number" min="0" max="90" value={settings.club?.member_discount_pct ?? 0}
                      onChange={(e) => setClub('member_discount_pct', e.target.value)} />
                  </div>
                  <div>
                    <Label>₪ לכל נקודה (פדיון)</Label>
                    <Input type="number" min="0" step="0.5" value={settings.club?.coin_value ?? 4}
                      onChange={(e) => setClub('coin_value', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>תמריץ הצטרפות (בכפתור ההתחברות)</Label>
                  <Input value={settings.club?.join_incentive ?? ''} placeholder={settings.club?.join_incentive_effective || ''}
                    onChange={(e) => setClub('join_incentive', e.target.value)} />
                  <p className="text-xs text-slate-500 mt-1">ריק = ברירת המחדל: "{settings.club?.join_incentive_effective || ''}"</p>
                </div>
                <div>
                  <Label>₪ להזמנה לכל נקודה (צבירה)</Label>
                  <Input type="number" min="1" value={settings.club?.earn_per ?? 100}
                    onChange={(e) => setClub('earn_per', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-bold">🎛️ פיצ׳רים באתר</div>
                {Object.entries(settings.features || {}).map(([slug, f]) => (
                  <div key={slug} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0 border-slate-100">
                    <div>
                      <div className="font-semibold text-sm">{f.label || slug}</div>
                      <div className="text-xs text-slate-500">{f.desc || ''}</div>
                    </div>
                    <Switch checked={!!f.enabled} onCheckedChange={(v) => setFeature(slug, v)} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-2">
                <div className="text-lg font-bold">🛵 אזורי חלוקה ודמי משלוח</div>
                <p className="text-xs text-slate-500 mb-1">שם, דמי משלוח ומינימום הזמנה לכל אזור. צורת האזור על המפה נערכת בוורדפרס.</p>
                {(settings.zones || []).map((z) => (
                  <div key={z.id} className={`border-b last:border-0 border-slate-100 py-2 ${z.enabled === false ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-6">
                        <Label className="text-xs">אזור</Label>
                        <Input value={z.name || ''} onChange={(e) => setZone(z.id, 'name', e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">משלוח ₪</Label>
                        <Input type="number" min="0" value={z.delivery_fee} onChange={(e) => setZone(z.id, 'delivery_fee', e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">מינ׳ ₪</Label>
                        <Input type="number" min="0" value={z.min_order} onChange={(e) => setZone(z.id, 'min_order', e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-end gap-3 mt-2">
                      <div className="w-40">
                        <Label className="text-xs">זמן הגעה מקס׳ (דק׳)</Label>
                        <Input type="number" min="0" placeholder="למשל 60" value={z.eta_max ?? ''} onChange={(e) => setZone(z.id, 'eta_max', e.target.value)} />
                      </div>
                      <div className="flex items-center gap-2 pb-2">
                        <Switch checked={z.enabled !== false} onCheckedChange={(v) => toggleZoneEnabled(z.id, v)} disabled={quickBusy === 'zone:' + z.id} />
                        <span className="text-xs text-slate-500">{z.enabled === false ? 'כבוי' : 'פעיל'}</span>
                        {quickBusy === 'zone:' + z.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      </div>
                    </div>
                  </div>
                ))}
                {!(settings.zones || []).length && <p className="text-sm text-slate-500">אין אזורי חלוקה מוגדרים.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold">⚙️ הגדרות נוספות</div>

                <div>
                  <Label className="text-sm font-semibold">🖼️ תמונות מותג (בדף הכניסה)</Label>
                  <div className="space-y-2 mt-1">
                    <div><Label className="text-xs">עלינא בפיתה — URL</Label><Input dir="ltr" value={settings.brand_images?.alena || ''} onChange={(e) => setImg('alena', e.target.value)} /></div>
                    <div><Label className="text-xs">חומוס זוהרה — URL</Label><Input dir="ltr" value={settings.brand_images?.zohara || ''} onChange={(e) => setImg('zohara', e.target.value)} /></div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">⏱️ זמני הכנה (דקות)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div><Label className="text-xs">משלוח — מ־</Label><Input type="number" value={settings.cart_eta?.delivery_min ?? ''} onChange={(e) => setEta('delivery_min', e.target.value)} /></div>
                    <div><Label className="text-xs">משלוח — עד</Label><Input type="number" value={settings.cart_eta?.delivery_max ?? ''} onChange={(e) => setEta('delivery_max', e.target.value)} /></div>
                    <div><Label className="text-xs">איסוף — מ־</Label><Input type="number" value={settings.cart_eta?.pickup_min ?? ''} onChange={(e) => setEta('pickup_min', e.target.value)} /></div>
                    <div><Label className="text-xs">איסוף — עד</Label><Input type="number" value={settings.cart_eta?.pickup_max ?? ''} onChange={(e) => setEta('pickup_max', e.target.value)} /></div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">📝 צ׳יפים להערות (שורה לכל צ׳יפ)</Label>
                  <div className="space-y-2 mt-1">
                    <div><Label className="text-xs">מטבח</Label><Textarea rows={3} value={(settings.note_chips?.kitchen || []).join('\n')} onChange={(e) => setChips('kitchen', e.target.value)} /></div>
                    <div><Label className="text-xs">משלוח</Label><Textarea rows={2} value={(settings.note_chips?.delivery || []).join('\n')} onChange={(e) => setChips('delivery', e.target.value)} /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ---- Announcement bar + free delivery ---- */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold flex items-center gap-2"><Megaphone className="w-5 h-5" /> באנר הודעה ומשלוח חינם</div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">באנר עליון באתר</div>
                    <div className="text-xs text-slate-500">רצועת הודעה שמופיעה מעל כל עמוד</div>
                  </div>
                  <Switch checked={!!settings.announcement?.enabled} onCheckedChange={(v) => setAnnounce('enabled', v)} />
                </div>
                <Input value={settings.announcement?.text || ''} placeholder="לדוגמה: היום משלוחים עד 22:00 בלבד"
                  onChange={(e) => setAnnounce('text', e.target.value)} />
                <div>
                  <Label className="text-sm font-semibold">🎉 משלוח חינם מעל ₪</Label>
                  <Input type="number" min="0" value={settings.free_delivery_over ?? 0}
                    onChange={(e) => setFree(e.target.value)} />
                  <p className="text-xs text-slate-500 mt-1">0 = כבוי. מעל הסכום הזה דמי המשלוח יתאפסו אוטומטית.</p>
                </div>
              </CardContent>
            </Card>

            {/* ---- Holiday / special-date closures ---- */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-bold flex items-center gap-2"><CalendarOff className="w-5 h-5" /> ימים מיוחדים / חגים (סגור)</div>
                <p className="text-xs text-slate-500">תאריכים שבהם האתר סגור לגמרי (ערב חג, יום כיפור וכו׳). גובר על שעות הפעילות הרגילות.</p>
                {Object.keys(settings.date_overrides || {}).sort().map((date) => (
                  <div key={date} className="flex items-center justify-between border-b last:border-0 border-slate-100 py-2">
                    <span className="text-sm font-semibold">{date}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700">סגור</span>
                      <Button variant="ghost" size="sm" className="h-7 text-rose-500" onClick={() => removeDateOverride(date)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">הוסף תאריך</Label>
                    <Input type="date" dir="ltr" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={addDateOverride} disabled={!newDate}>
                    <Plus className="w-4 h-4 ml-1" /> הוסף
                  </Button>
                </div>
                <p className="text-xs text-slate-400">לא לשכוח ללחוץ "שמירה" למטה כדי להחיל.</p>
              </CardContent>
            </Card>

            {/* ---- Coupons ---- */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold flex items-center gap-2"><Ticket className="w-5 h-5" /> קופונים</div>
                  {coupons && (
                    <Button variant="outline" size="sm" onClick={addCoupon}><Plus className="w-4 h-4 ml-1" /> קופון חדש</Button>
                  )}
                </div>
                {coupons === null ? (
                  <Button variant="outline" onClick={loadCoupons} disabled={couponsLoading}>
                    {couponsLoading ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען…</> : 'טען קופונים'}
                  </Button>
                ) : coupons.length === 0 ? (
                  <p className="text-sm text-slate-500">אין קופונים. אפשר להוסיף אחד למעלה.</p>
                ) : (
                  <div className="space-y-3">
                    {coupons.map((c) => (
                      <div key={c.id || 'new'} className={`border rounded-xl p-3 space-y-2 ${c.enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-5">
                            <Label className="text-xs">קוד</Label>
                            <Input dir="ltr" value={c.code || ''} onChange={(e) => setCouponField(c.id, 'code', e.target.value)} placeholder="BAG25" />
                          </div>
                          <div className="col-span-4">
                            <Label className="text-xs">סוג</Label>
                            <select className="w-full h-10 rounded-md border border-slate-200 text-sm px-2" value={c.discount_type}
                              onChange={(e) => setCouponField(c.id, 'discount_type', e.target.value)}>
                              <option value="percent">אחוז %</option>
                              <option value="fixed_cart">₪ מהסל</option>
                              <option value="fixed_product">₪ למוצר</option>
                            </select>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs">{c.discount_type === 'percent' ? '%' : '₪'}</Label>
                            <Input type="number" min="0" value={c.amount ?? ''} onChange={(e) => setCouponField(c.id, 'amount', e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-5">
                            <Label className="text-xs">מינ׳ הזמנה ₪</Label>
                            <Input type="number" min="0" value={c.minimum_amount ?? ''} onChange={(e) => setCouponField(c.id, 'minimum_amount', e.target.value)} />
                          </div>
                          <div className="col-span-5">
                            <Label className="text-xs">תוקף עד</Label>
                            <Input type="date" dir="ltr" value={c.expiry_date || ''} onChange={(e) => setCouponField(c.id, 'expiry_date', e.target.value)} />
                          </div>
                          <div className="col-span-2 flex flex-col items-center">
                            <Switch checked={!!c.enabled} onCheckedChange={(v) => setCouponField(c.id, 'enabled', v)} />
                            <span className="text-[10px] text-slate-400">{c.enabled ? 'פעיל' : 'כבוי'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={!!c.free_shipping} onCheckedChange={(v) => setCouponField(c.id, 'free_shipping', v)} />
                          <span className="text-xs text-slate-500">כולל משלוח חינם</span>
                        </div>
                        <div className="flex items-center justify-between">
                          {c.id ? <span className="text-xs text-slate-400">נוצל {c.usage_count || 0} פעמים</span> : <span className="text-xs text-emerald-600">קופון חדש</span>}
                          <div className="flex items-center gap-2">
                            {c.id ? (
                              <Button variant="ghost" size="sm" className="h-8 text-rose-500" onClick={() => deleteCoupon(c)} disabled={couponBusy === c.id}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                            <Button size="sm" onClick={() => saveCoupon(c)} disabled={couponBusy === (c.id ?? 'new') || !c.code}>
                              {couponBusy === (c.id ?? 'new') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'שמור'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-bold">🕐 שעות פעילות</div>
                <p className="text-xs text-slate-500">שעת פתיחה/סגירה לכל יום. השאירו טוקנים מיוחדים כמו <code>motzash+30</code> (צאת שבת) כפי שהם.</p>
                {['delivery', 'pickup'].map((svc) => (
                  <div key={svc} className="border border-slate-200 rounded-xl p-3">
                    <div className="font-semibold text-sm mb-1">{svc === 'delivery' ? '🚚 משלוח' : '🛍️ איסוף'}</div>
                    {DAYS.map((dname, day) => {
                      const ranges = (settings.hours?.[svc]?.[day] || settings.hours?.[svc]?.[String(day)] || []);
                      return (
                        <div key={day} className="flex items-center gap-2 py-1">
                          <span className="w-12 text-sm text-slate-600">{dname}</span>
                          {ranges.length ? ranges.map((r, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <Input dir="ltr" className="w-24 h-8 text-sm" value={r[0] ?? ''} onChange={(e) => setHour(svc, String(day), idx, 0, e.target.value)} />
                              <span className="text-slate-400">–</span>
                              <Input dir="ltr" className="w-24 h-8 text-sm" value={r[1] ?? ''} onChange={(e) => setHour(svc, String(day), idx, 1, e.target.value)} />
                            </div>
                          )) : <span className="text-xs text-slate-400">סגור</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-bold">📅 תזמון ספיישל (מנות בימים/שעות)</div>
                {Object.keys(settings.specials || {}).length === 0 && <p className="text-sm text-slate-500">אין מנות מתוזמנות.</p>}
                {Object.entries(settings.specials || {}).map(([pid, sp]) => {
                  const prod = (products || []).find((p) => String(p.id) === String(pid));
                  const days = (sp.days || []).map(Number);
                  return (
                    <div key={pid} className="border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="font-semibold text-sm">{prod ? prod.name : 'מנה #' + pid}</div>
                      <div className="flex flex-wrap gap-1">
                        {DAYS.map((dn, d) => (
                          <button key={d} type="button" onClick={() => toggleSpecialDay(pid, d)}
                            className={`text-xs px-2 py-1 rounded-full border ${days.includes(d) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-500'}`}>
                            {dn.slice(0, 1)}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">שעות</Label>
                        <Input dir="ltr" className="w-24 h-8 text-sm" value={sp.from || ''} onChange={(e) => setSpecial(pid, { from: e.target.value })} />
                        <span className="text-slate-400">–</span>
                        <Input dir="ltr" className="w-24 h-8 text-sm" value={sp.to || ''} onChange={(e) => setSpecial(pid, { to: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">שמות המנות מוצגים לאחר טעינת התפריט למטה.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold flex items-center gap-2"><Utensils className="w-5 h-5" /> עריכת תפריט</div>
                  <div className="flex items-center gap-2">
                    {products && <span className="text-xs text-slate-500">{products.length} מנות</span>}
                    {products && (
                      <Button variant="outline" size="sm" onClick={() => setNewProdOpen((o) => !o)}>
                        <Plus className="w-4 h-4 ml-1" /> מנה חדשה
                      </Button>
                    )}
                  </div>
                </div>
                {products === null ? (
                  <Button variant="outline" onClick={loadMenu} disabled={menuLoading}>
                    {menuLoading ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען…</> : 'טען את התפריט לעריכה'}
                  </Button>
                ) : (
                  <>
                    {newProdOpen && (
                      <div className="border-2 border-emerald-200 bg-emerald-50/50 rounded-xl p-3 space-y-2">
                        <div className="font-semibold text-sm text-emerald-800">מנה חדשה</div>
                        <Input placeholder="שם המנה" value={newProd.name} onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="number" placeholder="מחיר ₪" value={newProd.price} onChange={(e) => setNewProd((p) => ({ ...p, price: e.target.value }))} />
                          <select className="h-10 rounded-md border border-slate-200 text-sm px-2" value={newProd.category_id}
                            onChange={(e) => setNewProd((p) => ({ ...p, category_id: e.target.value }))}>
                            <option value="">קטגוריה…</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setNewProdOpen(false)}>ביטול</Button>
                          <Button size="sm" onClick={createProduct} disabled={creatingProd || !newProd.name}>
                            {creatingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : 'צור מנה'}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute top-3 right-3 text-slate-400" />
                      <Input className="pr-9" placeholder="חיפוש מנה…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="max-h-[60vh] overflow-auto space-y-2">
                      {products.filter((p) => !search || (p.name || '').includes(search)).map((p) => (
                        <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                          <div className="flex items-center gap-2">
                            <label className="relative cursor-pointer flex-shrink-0" title="החלף תמונה">
                              {p.image
                                ? <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-lg">+</div>}
                              {uploadingImgId === p.id && (
                                <span className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                                </span>
                              )}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => uploadImage(p, e.target.files && e.target.files[0])} />
                            </label>
                            <Input className="flex-1" value={p.name || ''} onChange={(e) => setProduct(p.id, 'name', e.target.value)} />
                            <Input type="number" className="w-20" value={p.price ?? ''} onChange={(e) => setProduct(p.id, 'price', e.target.value)} />
                            <div className="flex flex-col items-center">
                              <Switch checked={!!p.in_stock} onCheckedChange={(v) => setProduct(p.id, 'in_stock', v)} />
                              <span className="text-[10px] text-slate-400">{p.in_stock ? 'זמין' : 'אזל'}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-3">
                              <button className="text-xs text-slate-500 underline" onClick={() => setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))}>
                                {expanded[p.id] ? 'הסתר תיאור' : 'תיאור'}
                              </button>
                              <button className="text-xs text-slate-500 underline" onClick={() => {
                                const key = 'opts_' + p.id;
                                setExpanded((x) => ({ ...x, [key]: !x[key] }));
                                if (!prodOpts[p.id]) loadProdOpts(p.id);
                              }}>
                                {expanded['opts_' + p.id] ? 'הסתר תוספות' : 'תוספות'}
                              </button>
                            </div>
                            <Button size="sm" onClick={() => saveProduct(p)} disabled={savingId === p.id}>
                              {savingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedId === p.id ? 'נשמר ✓' : 'שמור'}
                            </Button>
                          </div>
                          {expanded[p.id] && (
                            <Textarea className="mt-2" rows={3} value={p.description || ''} onChange={(e) => setProduct(p.id, 'description', e.target.value)} />
                          )}
                          {expanded['opts_' + p.id] && (
                            <div className="mt-2 border-t border-slate-100 pt-2">
                              {ogGroups === null ? (
                                <p className="text-xs text-slate-400">טוען קבוצות…</p>
                              ) : ogGroups.length === 0 ? (
                                <p className="text-xs text-slate-400">אין קבוצות תוספות. צור אותן בכרטיס "תוספות ואופציות" למטה.</p>
                              ) : (
                                <>
                                  <div className="text-xs text-slate-500 mb-1">אילו קבוצות תוספות משויכות למנה:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {ogGroups.map((g) => {
                                      const on = (prodOpts[p.id] || []).some((r) => r.group_id === g.id);
                                      return (
                                        <button key={g.id} type="button" onClick={() => toggleProdGroup(p.id, g)}
                                          className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-500'}`}>
                                          {g.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="flex justify-end mt-2">
                                    <Button size="sm" variant="outline" onClick={() => saveProdOpts(p.id)} disabled={prodOptsBusy === p.id}>
                                      {prodOptsBusy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'שמור תוספות'}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">כאן עורכים שם, מחיר, תיאור, זמינות ותמונה (לחיצה על התמונה).</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ---- Option groups (modifiers / add-ons) ---- */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold flex items-center gap-2"><SlidersHorizontal className="w-5 h-5" /> תוספות ואופציות</div>
                  {ogGroups && <Button variant="outline" size="sm" onClick={addOgGroup}><Plus className="w-4 h-4 ml-1" /> קבוצה חדשה</Button>}
                </div>
                <p className="text-xs text-slate-500">קבוצות משותפות (גדלים, רטבים, תוספות). שינוי מחיר כאן מתעדכן בכל המנות שמשתמשות בקבוצה.</p>
                {ogGroups === null ? (
                  <Button variant="outline" onClick={loadOptionGroups} disabled={ogLoading}>
                    {ogLoading ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען…</> : 'טען תוספות ואופציות'}
                  </Button>
                ) : ogGroups.length === 0 ? (
                  <p className="text-sm text-slate-500">אין קבוצות. אפשר להוסיף אחת למעלה.</p>
                ) : (
                  <div className="space-y-3">
                    {ogGroups.map((g, gi) => (
                      <div key={g.id || 'new' + gi} className="border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input className="flex-1" placeholder="שם הקבוצה (למשל: גודל)" value={g.name || ''} onChange={(e) => setOgField(g.id, { name: e.target.value })} />
                          <select className="h-10 rounded-md border border-slate-200 text-sm px-2" value={g.type} onChange={(e) => setOgField(g.id, { type: e.target.value })}>
                            <option value="single">בחירה אחת</option>
                            <option value="multi">מרובה</option>
                          </select>
                        </div>
                        {g.used_by > 0 && <div className="text-[11px] text-slate-400">בשימוש ב־{g.used_by} מנות</div>}
                        <div className="space-y-1">
                          {(g.values || []).map((v, vi) => (
                            <div key={vi} className="flex items-center gap-2">
                              <Input className="flex-1 h-8 text-sm" placeholder="שם האפשרות" value={v.name || ''} onChange={(e) => setOgValue(g.id, vi, { name: e.target.value })} />
                              <Input type="number" className="w-20 h-8 text-sm" placeholder="₪" value={v.price ?? 0} onChange={(e) => setOgValue(g.id, vi, { price: e.target.value })} />
                              <button className="text-rose-400" onClick={() => removeOgValue(g.id, vi)}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                          <button className="text-xs text-indigo-600 underline" onClick={() => addOgValue(g.id)}>+ אפשרות</button>
                        </div>
                        <div className="flex items-center justify-between">
                          <Button variant="ghost" size="sm" className="h-8 text-rose-500" onClick={() => deleteOgGroup(g)} disabled={ogBusy === g.id}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" onClick={() => saveOgGroup(g)} disabled={ogBusy === (g.id || 'new') || !g.name}>
                            {ogBusy === (g.id || 'new') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'שמור'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ---- Payments + login (OTP) ---- */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-lg font-bold flex items-center gap-2"><CreditCard className="w-5 h-5" /> תשלומים והתחברות</div>

                {/* Payment gateways */}
                <div>
                  <Label className="text-sm font-semibold">אמצעי תשלום פעילים</Label>
                  {gateways === null ? (
                    <div className="mt-1"><Button variant="outline" size="sm" onClick={loadGateways} disabled={gwLoading}>
                      {gwLoading ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען…</> : 'טען אמצעי תשלום'}
                    </Button></div>
                  ) : gateways.length === 0 ? (
                    <p className="text-sm text-slate-500 mt-1">לא נמצאו אמצעי תשלום.</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {gateways.map((gw) => (
                        <div key={gw.id} className="flex items-center justify-between py-1.5 border-b last:border-0 border-slate-100">
                          <span className="text-sm">{gw.title}</span>
                          <div className="flex items-center gap-2">
                            {gwBusy === gw.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                            <Switch checked={!!gw.enabled} onCheckedChange={(v) => toggleGateway(gw, v)} disabled={gwBusy === gw.id} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* OTP / login */}
                <div className="border-t border-slate-100 pt-3">
                  <Label className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> התחברות לקוחות (OTP)</Label>

                  {settings.auth?.test_mode && (
                    <div className="mt-2 flex items-start gap-2 text-xs bg-rose-50 text-rose-700 rounded-lg p-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>מצב בדיקה פעיל — קוד ההתחברות מוצג על המסך לכל מי שמקליד טלפון. לכבות לפני שהאתר פתוח ללקוחות.</span>
                    </div>
                  )}

                  <div className="mt-2">
                    <Label className="text-xs">ספק שליחת קוד</Label>
                    <select className="w-full h-10 rounded-md border border-slate-200 text-sm px-2" value={settings.auth?.provider || 'console'}
                      onChange={(e) => { setAuth('provider', e.target.value); }}>
                      <option value="console">מסך בלבד (בדיקה)</option>
                      <option value="topalena">TOP ALENA — וואטסאפ + נפילה ל-SMS (מומלץ)</option>
                      <option value="whatsapp_cloud">WhatsApp ישיר (Meta Cloud)</option>
                      <option value="twilio_sms">SMS ישיר (Twilio)</option>
                    </select>
                    {settings.auth?.provider === 'topalena' && (
                      <>
                        <p className="text-xs text-emerald-700 mt-1">הקוד יישלח דרך מערכת ההודעות של TOP ALENA (אותו Twilio ששולח כבר למשמרות). בוואטסאפ אם יש תבנית מאושרת, אחרת ב-SMS — ולמשתמש יש כפתור "שלח ב-SMS" אם לא קיבל.</p>
                        <div className="mt-2 bg-slate-50 rounded-lg p-2">
                          <div className="text-xs text-slate-600 mb-1">כדי לשלוח את הקוד ב<b>וואטסאפ</b> (זול יותר) צריך תבנית מאושרת ממטא. אפשר להגיש אותה לאישור בלחיצה — עד שתאושר, הקוד ממשיך להישלח ב-SMS.</div>
                          {/* Persistent live status (survives refresh) */}
                          {otpTpl && (
                            otpTpl.approved
                              ? <div className="text-xs font-semibold text-emerald-700 mb-1">✅ התבנית מאושרת — הקוד נשלח בוואטסאפ</div>
                              : otpTpl.configured
                                ? <div className="text-xs font-semibold text-amber-700 mb-1">⏳ התבנית בבדיקה של מטא — בינתיים הקוד נשלח ב-SMS</div>
                                : <div className="text-xs text-slate-500 mb-1">התבנית עדיין לא הוגשה</div>
                          )}
                          <Button size="sm" variant="outline" onClick={submitOtpTemplate} disabled={otpTplBusy || (otpTpl && otpTpl.approved)}>
                            {otpTplBusy ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                            {otpTpl && otpTpl.approved ? 'התבנית מאושרת ✓' : otpTpl && otpTpl.configured ? 'בדוק סטטוס / הגש שוב' : 'הגש תבנית OTP לאישור וואטסאפ'}
                          </Button>
                          {otpTplMsg && <p className="text-xs text-slate-600 mt-1">{otpTplMsg}</p>}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm">מצב בדיקה (הצגת קוד על המסך)</span>
                    <Switch checked={!!settings.auth?.test_mode} onCheckedChange={(v) => setAuth('test_mode', v)} />
                  </div>

                  {settings.auth?.provider === 'whatsapp_cloud' && (
                    <div className="mt-2 space-y-2">
                      <div><Label className="text-xs">Access Token {settings.auth?.wa_configured ? '(מוגדר ✓ — השאירו ריק לשמירה)' : ''}</Label>
                        <Input dir="ltr" placeholder={settings.auth?.wa_configured ? '••••••••' : ''} onChange={(e) => setAuth('wa_token', e.target.value)} /></div>
                      <div><Label className="text-xs">Phone Number ID {settings.auth?.wa_configured ? '(מוגדר ✓)' : ''}</Label>
                        <Input dir="ltr" placeholder={settings.auth?.wa_configured ? '••••••••' : ''} onChange={(e) => setAuth('wa_phone_id', e.target.value)} /></div>
                      <div><Label className="text-xs">שם תבנית מאושרת</Label>
                        <Input dir="ltr" value={settings.auth?.wa_template || ''} onChange={(e) => setAuth('wa_template', e.target.value)} placeholder="alena_otp_he" /></div>
                    </div>
                  )}
                  {settings.auth?.provider === 'twilio_sms' && (
                    <div className="mt-2 space-y-2">
                      <div><Label className="text-xs">Account SID {settings.auth?.twilio_configured ? '(מוגדר ✓ — השאירו ריק לשמירה)' : ''}</Label>
                        <Input dir="ltr" placeholder={settings.auth?.twilio_configured ? '••••••••' : ''} onChange={(e) => setAuth('twilio_sid', e.target.value)} /></div>
                      <div><Label className="text-xs">Auth Token {settings.auth?.twilio_configured ? '(מוגדר ✓)' : ''}</Label>
                        <Input dir="ltr" placeholder={settings.auth?.twilio_configured ? '••••••••' : ''} onChange={(e) => setAuth('twilio_token', e.target.value)} /></div>
                      <div><Label className="text-xs">שולח (מספר / Sender ID)</Label>
                        <Input dir="ltr" value={settings.auth?.twilio_from || ''} onChange={(e) => setAuth('twilio_from', e.target.value)} placeholder="+1... או Alena" /></div>
                    </div>
                  )}

                  <div className="flex justify-end mt-3">
                    <Button size="sm" onClick={() => saveAuth()} disabled={quickBusy === 'auth'}>
                      {quickBusy === 'auth' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור הגדרות התחברות'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && <p className="text-sm font-semibold text-rose-600 text-center">{error}</p>}

            <div className="flex items-center justify-between gap-3 sticky bottom-3">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> שומר…</>
                  : savedAt ? <><Check className="w-4 h-4 ml-2" /> נשמר ✓</>
                  : <><Save className="w-4 h-4 ml-2" /> שמירה</>}
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-400"
                onClick={async () => { await base44.functions.disconnectDeliverySite({}); load(); }}>
                ניתוק
              </Button>
            </div>
          </div>
        )}
      </PageShell>
    </PageGuard>
  );
}
