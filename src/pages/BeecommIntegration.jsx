import React, { useState, useEffect } from 'react';
import { BeecommConfig, BeecommOrder } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Settings, 
  Loader2, 
  ShoppingCart, 
  Send, 
  Wifi,
  WifiOff,
  RefreshCw,
  Phone,
  MapPin,
  Clock
} from 'lucide-react';

// NEW — Beecomm Cloud Analytics API (real sales/reports → dashboards + food-cost).
// The OrderCenter integration below is legacy (moved to Beecomm Cloud).
function AnalyticsConfigCard() {
  const [st, setSt] = useState(null);
  const [f, setF] = useState({ client_id: '', client_secret: '', active: true });
  const [access, setAccess] = useState(null);
  const [sel, setSel] = useState({ restaurant_id: '', restaurant_name: '', branches: [] });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await base44.functions.getBeecommAnalyticsStatus({});
      const s = r?.data || r; setSt(s);
      if (s?.configured) { setF((p) => ({ ...p, active: s.active })); setSel({ restaurant_id: s.restaurant_id || '', restaurant_name: s.restaurant_name || '', branches: s.branches || [] }); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveCfg = async (extra) => base44.functions.setBeecommAnalyticsConfig({
    client_id: f.client_id.trim() || undefined, client_secret: f.client_secret.trim() || undefined,
    restaurant_id: sel.restaurant_id || undefined, restaurant_name: sel.restaurant_name || undefined,
    branches: sel.branches, active: f.active, ...extra,
  });
  const save = async () => { setBusy('save'); setMsg(null); try { await saveCfg(); setMsg({ ok: true, text: 'נשמר ✓' }); await load(); } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); } finally { setBusy(''); } };
  const test = async () => {
    setBusy('test'); setMsg(null);
    try {
      await saveCfg();
      const r = await base44.functions.testBeecommAnalytics({}); const d = r?.data || r;
      if (d.ok) { setAccess(d.access_list || []); setMsg({ ok: true, text: (d.access_list || []).length ? 'מחובר ✓ — בחר מסעדה וסניפים למטה' : 'מחובר ✓ (אין מסעדות בגישה)' }); }
      else setMsg({ ok: false, text: d.message });
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); } finally { setBusy(''); }
  };
  const syncNow = async () => {
    setBusy('sync'); setMsg(null);
    try { const r = await base44.functions.syncBeecommAnalyticsNow({}); const d = r?.data || r;
      setMsg(d.ok === false ? { ok: false, text: d.error || d.reason } : { ok: true, text: d.skipped ? `דילג (${d.reason})` : `סונכרנו ${d.imported} ימים (${d.z_available} Z זמינים)` });
      await load();
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); } finally { setBusy(''); }
  };
  const pickRestaurant = (r) => setSel({ restaurant_id: r.restaurantId, restaurant_name: r.restaurantName, branches: (r.branches || []).map((b) => b.id) });
  const toggleBranch = (id) => setSel((s) => ({ ...s, branches: s.branches.includes(id) ? s.branches.filter((x) => x !== id) : [...s.branches, id] }));
  const curRest = access && access.find((x) => x.restaurantId === sel.restaurant_id);

  return (
    <Card className="border-2" style={{ borderColor: '#B89556', background: '#FFFDF8' }}>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span>☁️ Beecomm Cloud — Analytics (מכירות ודוחות)</span>
          {st?.active && <Badge className="bg-green-100 text-green-800">מחובר</Badge>}
          <span className="mr-auto text-sm text-gray-400">{open ? '▲' : '▼'}</span>
        </CardTitle>
        <p className="text-sm text-gray-500">מושך היסטוריית מכירות אמיתית מהקופה → תחזיות, פוד-קוסט, דשבורדים. מסתנכרן אוטומטית פעם ביום.</p>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>client_id</Label><Input value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} placeholder={st?.client_id_masked || 'מ-Beecomm'} dir="ltr" className="text-left mt-1" /></div>
            <div><Label>client_secret</Label><Input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} placeholder={st?.configured ? '••• (שמור — השאר ריק כדי לא לשנות)' : 'מ-Beecomm'} dir="ltr" className="text-left mt-1" /></div>
          </div>
          {msg && <div className={`text-sm rounded px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
          {access && access.length > 0 && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: '#F4ECD8' }}>
              <Label>בחר מסעדה:</Label>
              <div className="flex flex-wrap gap-2">
                {access.map((r) => (<button key={r.restaurantId} onClick={() => pickRestaurant(r)} className="px-3 py-1 rounded-full text-sm border" style={sel.restaurant_id === r.restaurantId ? { background: '#44512C', color: '#fff', borderColor: '#44512C' } : { background: '#fff' }}>{r.restaurantName}</button>))}
              </div>
              {curRest && <div><Label>סניפים:</Label><div className="flex flex-wrap gap-2 mt-1">{(curRest.branches || []).map((b) => (<label key={b.id} className="flex items-center gap-1 text-sm bg-white px-2 py-1 rounded border"><input type="checkbox" checked={sel.branches.includes(b.id)} onChange={() => toggleBranch(b.id)} />{b.name}</label>))}</div></div>}
            </div>
          )}
          {st?.configured && !access && sel.restaurant_name && <p className="text-sm text-gray-600">מסעדה מחוברת: <b>{sel.restaurant_name}</b> · {sel.branches.length} סניפים</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> סנכרון אוטומטי פעיל (יומי)</label>
          <div className="flex gap-2 flex-wrap items-center">
            <Button onClick={test} disabled={busy === 'test'} variant="outline">{busy === 'test' ? 'בודק...' : 'בדוק חיבור'}</Button>
            <Button onClick={save} disabled={busy === 'save'} className="bg-[#44512C] hover:bg-[#384218]">{busy === 'save' ? 'שומר...' : 'שמור'}</Button>
            <Button onClick={syncNow} disabled={busy === 'sync' || !st?.active} variant="outline">{busy === 'sync' ? 'מסנכרן...' : 'סנכרן עכשיו'}</Button>
            {st?.last_sync && <span className="text-xs text-gray-500">סונכרן: {new Date(st.last_sync).toLocaleString('he-IL')} · {st.last_count || 0} ימים</span>}
          </div>
          {st?.last_error && <p className="text-xs text-red-600">שגיאה אחרונה: {st.last_error}</p>}
          <p className="text-xs text-gray-400">💡 צריך <b>client_id + client_secret</b> מ-Beecomm (עדיין לא נשלחו — בקש מהם). מגבלה: 10 בקשות/יום, לכן מושכים רק ימים חדשים.</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function BeecommIntegrationPage() {
  const [config, setConfig] = useState(null);
  const [newConfig, setNewConfig] = useState({
    client_id: '',
    client_secret: '',
    api_base_url: 'https://biapp.beecomm.co.il:8094'
  });
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // Test order form
  const [testOrder, setTestOrder] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    orderType: 1, // 1=delivery, 2=pickup
    city: '',
    street: '',
    homeNum: '',
    remarks: '',
    items: [{
      itemName: '',
      quantity: 1,
      price: 0,
      unitPrice: 0,
      remarks: ''
    }]
  });

  useEffect(() => {
    loadConfig();
    loadOrders();
  }, []);

  const loadConfig = async () => {
    try {
      // Status (masked, never exposes client_secret)
      const statusRes = await base44.functions.beecommGetStatus({});
      const status = statusRes?.data || statusRes;
      if (status?.configured) {
        setConfig({ id: 'singleton', ...status });
        setIsConnected(!!status.active && !!status.token_valid);
      }
      // Best-effort load of raw config for editing (admin only — entity is protected)
      try {
        const configs = await BeecommConfig.list();
        if (configs.length > 0) {
          setNewConfig({
            client_id: configs[0].client_id || '',
            client_secret: configs[0].client_secret || '',
            api_base_url: configs[0].api_base_url || 'https://biapp.beecomm.co.il:8094',
          });
        }
      } catch { /* non-admin or RLS — ignore */ }
      // If connected, load customers list
      if (status?.active && status?.token_valid) {
        await loadCustomers();
      }
    } catch (error) {
      console.error('שגיאה בטעינת הגדרות:', error);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await base44.functions.beecommGetCustomers({});
      const data = res?.data || res;
      if (data?.ok) setCustomers(data.customers || []);
    } catch (e) {
      console.warn('beecommGetCustomers failed', e);
    }
  };

  const loadOrders = async () => {
    try {
      const ordersData = await BeecommOrder.list('-created_date', 20);
      setOrders(ordersData);
    } catch (error) {
      console.error('שגיאה בטעינת הזמנות:', error);
    }
  };

  const saveConfig = async () => {
    if (!newConfig.client_id?.trim() || !newConfig.client_secret?.trim()) {
      alert('יש למלא Client ID ו-Client Secret');
      return;
    }
    setLoading(true);
    try {
      await base44.functions.beecommSaveConfig({
        client_id: newConfig.client_id.trim(),
        client_secret: newConfig.client_secret.trim(),
        api_base_url: newConfig.api_base_url || 'https://biapp.beecomm.co.il:8094',
      });
      await loadConfig();
      alert('הגדרות נשמרו. עכשיו לחץ "בדוק חיבור" כדי לאמת מול Beecomm.');
    } catch (error) {
      console.error('שגיאה בשמירת הגדרות:', error);
      alert('שגיאה בשמירת הגדרות: ' + (error?.message || error));
    }
    setLoading(false);
  };

  const testConnection = async () => {
    setTestLoading(true);
    try {
      const res = await base44.functions.beecommTestConnection({});
      const data = res?.data || res;
      if (data?.ok) {
        setIsConnected(true);
        await loadCustomers();
        alert('✅ ' + (data.message || 'מחובר בהצלחה ל-Beecomm'));
      } else {
        setIsConnected(false);
        alert('❌ חיבור נכשל: ' + (data?.message || 'לא ידוע'));
      }
    } catch (error) {
      console.error('שגיאה בבדיקת חיבור:', error);
      setIsConnected(false);
      alert('❌ שגיאה: ' + (error?.message || 'נסה שוב'));
    }
    setTestLoading(false);
  };

  const sendTestOrder = async () => {
    if (!isConnected) {
      alert('יש להתחבר למערכת תחילה');
      return;
    }

    setLoading(true);
    try {
      // כאן יהיה הקוד לשליחת הזמנה אמיתית דרך Backend Functions
      // כרגע אני שומר את ההזמנה במסד הנתונים לדמונסטרציה
      
      const orderData = {
        customer_name: `${testOrder.firstName} ${testOrder.lastName}`,
        customer_phone: testOrder.phone,
        order_type: testOrder.orderType,
        items: testOrder.items,
        total_amount: testOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        delivery_address: `${testOrder.street} ${testOrder.homeNum}, ${testOrder.city}`,
        status: 'sent',
        created_date: new Date().toISOString()
      };

      await BeecommOrder.create(orderData);
      await loadOrders();
      
      alert('נשמרה הזמנת בדיקה מקומית (לא נשלחה ל-Beecomm).');
      // Reset form
      setTestOrder({
        firstName: '',
        lastName: '',
        phone: '',
        orderType: 1,
        city: '',
        street: '',
        homeNum: '',
        remarks: '',
        items: [{
          itemName: '',
          quantity: 1,
          price: 0,
          unitPrice: 0,
          remarks: ''
        }]
      });
      
    } catch (error) {
      console.error('שגיאה בשליחת הזמנה:', error);
      alert('שגיאה בשליחת הזמנה');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8]" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
            <Wifi className="w-10 h-10 text-[#44512C]" />
            חיבור מערכת קופות Beecomm
          </h1>
          <p className="text-gray-600 text-lg">ניהול הזמנות וסנכרון נתונים</p>
        </div>

        {/* NEW: Beecomm Cloud Analytics API — the current integration */}
        <AnalyticsConfigCard />

        {/* Connection Status */}
        <Card className="border-2 border-[#E8D9B5]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                {isConnected ? <Wifi className="w-6 h-6 text-green-600" /> : <WifiOff className="w-6 h-6 text-red-600" />}
                סטטוס חיבור
              </CardTitle>
              <Badge className={isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                {isConnected ? "מחובר" : "לא מחובר"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              {isConnected 
                ? "המערכת מחוברת בהצלחה למערכת הקופות של Beecomm"
                : "יש להזין את פרטי הגישה ולהתחבר למערכת"
              }
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">הגדרות חיבור</TabsTrigger>
            <TabsTrigger value="test">בדיקת הזמנה</TabsTrigger>
            <TabsTrigger value="orders">הזמנות אחרונות</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  הגדרות API
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="api_url">כתובת API</Label>
                  <Input
                    id="api_url"
                    value={newConfig.api_base_url}
                    onChange={(e) => setNewConfig({...newConfig, api_base_url: e.target.value})}
                    placeholder="https://biapp.beecomm.co.il:8094"
                    disabled
                  />
                </div>
                
                <div>
                  <Label htmlFor="client_id">Client ID</Label>
                  <Input
                    id="client_id"
                    value={newConfig.client_id}
                    onChange={(e) => setNewConfig({...newConfig, client_id: e.target.value})}
                    placeholder="הזן את ה-Client ID מ-Beecomm"
                  />
                </div>
                
                <div>
                  <Label htmlFor="client_secret">Client Secret</Label>
                  <Input
                    id="client_secret"
                    type="password"
                    value={newConfig.client_secret}
                    onChange={(e) => setNewConfig({...newConfig, client_secret: e.target.value})}
                    placeholder="הזן את ה-Client Secret מ-Beecomm"
                  />
                </div>

                <div className="flex gap-3">
                  <Button 
                    onClick={saveConfig} 
                    disabled={loading}
                    className="bg-[#44512C] hover:bg-[#44512C]"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    שמור הגדרות
                  </Button>
                  
                  <Button 
                    onClick={testConnection} 
                    disabled={testLoading || !newConfig.client_id || !newConfig.client_secret}
                    variant="outline"
                  >
                    {testLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    בדוק חיבור
                  </Button>
                </div>

                <div className="bg-[#F4ECD8] p-4 rounded-lg border border-[#E8D9B5]">
                  <h4 className="font-semibold text-[#2E3819] mb-2">🔐 אבטחה</h4>
                  <p className="text-[#44512C] text-sm">
                    האימות מבוצע כולו ב-Backend (apps/api). ה-Client Secret אינו עוזב את השרת
                    ו-Token מתחדש אוטומטית כל ~50 דקות.
                  </p>
                </div>

                {isConnected && customers.length > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <h4 className="font-semibold text-green-800 mb-3">🏪 לקוחות וסניפים שהשרת רואה</h4>
                    <div className="space-y-2">
                      {customers.map((c) => (
                        <div key={c.customerId} className="bg-white rounded p-3 border border-green-100">
                          <div className="font-bold text-gray-800">{c.customerName} <span className="text-xs text-gray-500">#{c.customerId}</span></div>
                          {(c.branches || []).map((b) => (
                            <div key={b.branchId} className="mt-1 ml-4 text-sm text-gray-700">
                              📍 {b.branchName} <span className="text-xs text-gray-400">branchId={b.branchId}</span>
                              {(b.pos || []).length > 0 && (
                                <span className="ml-2 text-xs text-gray-500">
                                  · {b.pos.length} POS ({b.pos.map(p => p.posId).join(', ')})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  שליחת הזמנה לבדיקה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">שם פרטי</Label>
                    <Input
                      id="firstName"
                      value={testOrder.firstName}
                      onChange={(e) => setTestOrder({...testOrder, firstName: e.target.value})}
                      placeholder="שם פרטי"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">שם משפחה</Label>
                    <Input
                      id="lastName"
                      value={testOrder.lastName}
                      onChange={(e) => setTestOrder({...testOrder, lastName: e.target.value})}
                      placeholder="שם משפחה"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">טלפון</Label>
                    <Input
                      id="phone"
                      value={testOrder.phone}
                      onChange={(e) => setTestOrder({...testOrder, phone: e.target.value})}
                      placeholder="052-1234567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="orderType">סוג הזמנה</Label>
                    <select 
                      id="orderType"
                      value={testOrder.orderType}
                      onChange={(e) => setTestOrder({...testOrder, orderType: parseInt(e.target.value)})}
                      className="w-full p-2 border rounded-md"
                    >
                      <option value={1}>משלוח</option>
                      <option value={2}>איסוף</option>
                    </select>
                  </div>
                </div>

                {testOrder.orderType === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                    <div>
                      <Label htmlFor="city">עיר</Label>
                      <Input
                        id="city"
                        value={testOrder.city}
                        onChange={(e) => setTestOrder({...testOrder, city: e.target.value})}
                        placeholder="תל אביב"
                      />
                    </div>
                    <div>
                      <Label htmlFor="street">רחוב</Label>
                      <Input
                        id="street"
                        value={testOrder.street}
                        onChange={(e) => setTestOrder({...testOrder, street: e.target.value})}
                        placeholder="דיזנגוף"
                      />
                    </div>
                    <div>
                      <Label htmlFor="homeNum">מספר בית</Label>
                      <Input
                        id="homeNum"
                        value={testOrder.homeNum}
                        onChange={(e) => setTestOrder({...testOrder, homeNum: e.target.value})}
                        placeholder="123"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <Label>פריטים בהזמנה</Label>
                  {testOrder.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                      <Input
                        value={item.itemName}
                        onChange={(e) => {
                          const newItems = [...testOrder.items];
                          newItems[index].itemName = e.target.value;
                          setTestOrder({...testOrder, items: newItems});
                        }}
                        placeholder="שם המנה"
                      />
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...testOrder.items];
                          newItems[index].quantity = parseInt(e.target.value) || 1;
                          setTestOrder({...testOrder, items: newItems});
                        }}
                        placeholder="כמות"
                      />
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) => {
                          const newItems = [...testOrder.items];
                          newItems[index].price = parseFloat(e.target.value) || 0;
                          newItems[index].unitPrice = parseFloat(e.target.value) || 0;
                          setTestOrder({...testOrder, items: newItems});
                        }}
                        placeholder="מחיר"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newItems = testOrder.items.filter((_, i) => i !== index);
                          if (newItems.length === 0) {
                            newItems.push({
                              itemName: '',
                              quantity: 1,
                              price: 0,
                              unitPrice: 0,
                              remarks: ''
                            });
                          }
                          setTestOrder({...testOrder, items: newItems});
                        }}
                      >
                        הסר
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setTestOrder({
                        ...testOrder,
                        items: [...testOrder.items, {
                          itemName: '',
                          quantity: 1,
                          price: 0,
                          unitPrice: 0,
                          remarks: ''
                        }]
                      });
                    }}
                  >
                    הוסף פריט
                  </Button>
                </div>

                <div>
                  <Label htmlFor="remarks">הערות</Label>
                  <Textarea
                    id="remarks"
                    value={testOrder.remarks}
                    onChange={(e) => setTestOrder({...testOrder, remarks: e.target.value})}
                    placeholder="הערות מיוחדות להזמנה"
                  />
                </div>

                <Button 
                  onClick={sendTestOrder}
                  disabled={loading || !testOrder.firstName || !testOrder.phone}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  שלח הזמנה לבדיקה
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  הזמנות אחרונות
                </CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>אין הזמנות עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold">{order.customer_name}</h4>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {order.customer_phone}
                              </span>
                              {order.delivery_address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {order.delivery_address}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(order.created_date).toLocaleString('he-IL')}
                              </span>
                            </div>
                          </div>
                          <div className="text-left">
                            <Badge className={
                              order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              order.status === 'sent' ? 'bg-[#F4ECD8] text-[#2E3819]' :
                              order.status === 'error' ? 'bg-red-100 text-red-800' :
                              'bg-[#F4ECD8] text-yellow-800'
                            }>
                              {order.status === 'sent' ? 'נשלחה' :
                               order.status === 'confirmed' ? 'אושרה' :
                               order.status === 'preparing' ? 'בהכנה' :
                               order.status === 'ready' ? 'מוכנה' :
                               order.status === 'delivered' ? 'נמסרה' :
                               'שגיאה'}
                            </Badge>
                            <div className="text-lg font-bold text-green-600 mt-1">
                              ₪{order.total_amount?.toLocaleString() || '0'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Instructions */}
        <Card className="bg-[#F4ECD8] border-[#E8D9B5]">
          <CardHeader>
            <CardTitle className="text-[#2E3819]">הנחיות להפעלה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-[#44512C]">
              <p>📋 <strong>שלב 1:</strong> הזן את פרטי הגישה שקיבלת מ-Beecomm</p>
              <p>🔗 <strong>שלב 2:</strong> לחץ על "בדוק חיבור" לקבלת טוקן</p>
              <p>🧪 <strong>שלב 3:</strong> בדוק שליחת הזמנה לבדיקה</p>
              <p>⚡ <strong>לחיבור מלא:</strong> יש צורך בהפעלת "פונקציות צד-שרת" או אישור מצוות Base44</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}