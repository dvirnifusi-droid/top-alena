import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Camera, Package, CheckCircle2, Clock, Phone, MapPin, User,
  Banknote, Users, Pencil, Trash2, MessageSquare, AlertTriangle, Send,
} from "lucide-react";
import { sendDeliveryToTelegram } from "@/functions/sendDeliveryToTelegram";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const ISSUE_TYPES = [
  { value: "delayed", label: "⏰ עיכוב במשלוח" },
  { value: "compensation_needed", label: "💸 צריך פיצוי ללקוח" },
  { value: "wrong_address", label: "📍 כתובת שגויה" },
  { value: "wrong_order", label: "❌ הזמנה שגויה" },
  { value: "customer_complaint", label: "😤 תלונת לקוח" },
  { value: "damaged", label: "📦 משלוח פגום" },
  { value: "other", label: "📝 אחר" },
];

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(null);
  const [showNoteDialog, setShowNoteDialog] = useState(null);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [courierName, setCourierName] = useState("");
  const [noteData, setNoteData] = useState({ issue_type: "", notes: "" });
  const [showTelegramDialog, setShowTelegramDialog] = useState(null); // delivery object
  const [prepTime, setPrepTime] = useState(15);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [sessionToken, setSessionToken] = useState(localStorage.getItem("telegram_session_token") || "");
  const [formData, setFormData] = useState({
    customer_name: "", customer_phone: "", address: "",
    cash_amount: "", courier_name: "", payment_status: "unpaid",
    platform: "", items_ordered: "", neighborhood: "", opened_by: "",
  });

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoScan") === "1") {
      // מחכה קצת לטעינת הדף ואז פותח מיד את בחירת הקובץ
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 300);
    }
  }, []);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef();

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => { loadDeliveries(selectedDate); }, [selectedDate]);

  const loadDeliveries = async (date) => {
    setLoading(true);
    const data = await base44.entities.Delivery.filter({ date }, "-created_date");
    setDeliveries(data);
    setLoading(false);
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setScanning(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `אתה מומחה בקריאת פתקי משלוח. נתח את התמונה בקפידה ומצא:

1. שם הלקוח - השם הפרטי/משפחה של המזמין בלבד. אל תבלבל עם שם הרחוב.
2. מספר טלפון - 10 ספרות, הסר מקפים ורווחים. אם יש כמה מספרים, קח את המספר של הלקוח (לא של המשלוחית).
3. כתובת מלאה - שם הרחוב + מספר בית + עיר. קרא בעיון! כתובת היא בדרך כלל: "רחוב X מספר Y, עיר". אם יש קומה/דירה כלול גם אותם.
4. סכום - חפש את הסכום הסופי הכתוב בפתק. זה יכול להיות:
   - "מזומן" = סכום לתשלום במזומן (שים בשדה cash_amount)
   - "סה״כ" או מספר ללא הערה = סכום כולל של ההזמנה (שים בשדה total_amount)
   כל שדה חייב להיות מספר בלבד. אם אתה רואה "מזומן 100" - זה מזומן. אם אתה רואה "סה״כ 150" - זה סה״כ.
5. פלטפורמת ההזמנה - חפש לוגו או שם של: Wolt, תן ביס, סיבוס, Mishloha, Valuecard, טלפון. אם לא מזהה - השאר ריק.

חשוב מאוד לגבי כתובת:
- קרא את כל הטקסט בתמונה בקפידה
- הכתובת כוללת שם רחוב בעברית/אנגלית + מספר + שם עיר
- אל תחסיר את שם העיר
- אל תבלבל שם לקוח עם שם רחוב

החזר JSON בלבד:
{"customer_name":"...","customer_phone":"...","address":"...","cash_amount":0,"total_amount":0,"platform":"..."}

אם לא מצאת שדה, השאר 0. הסכומים חייבים להיות מספרים.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            customer_name: { type: "string" },
            customer_phone: { type: "string" },
            address: { type: "string" },
            cash_amount: { type: "number" },
            total_amount: { type: "number" },
            platform: { type: "string" },
          },
        },
      });
      setFormData((prev) => ({
        ...prev,
        customer_name: result.customer_name || "",
        customer_phone: result.customer_phone || "",
        address: result.address || "",
        cash_amount: result.cash_amount ? String(result.cash_amount) : result.total_amount ? String(result.total_amount) : "",
        platform: result.platform || "",
        photo_url: file_url,
        opened_by: currentUser?.full_name || currentUser?.email || "",
      }));
      setEditingDelivery(null);
      setShowAddDialog(true);
    } catch (err) {
      console.error(err);
      setShowAddDialog(true);
    } finally {
      setScanning(false);
    }
  };

  const handleManualAdd = () => {
    setPhotoPreview(null);
    setEditingDelivery(null);
    setFormData({
      customer_name: "", customer_phone: "", address: "",
      cash_amount: "", courier_name: "", payment_status: "unpaid",
      platform: "", items_ordered: "", neighborhood: "",
      opened_by: currentUser?.full_name || currentUser?.email || "",
    });
    setShowAddDialog(true);
  };

  const handleEditDelivery = (delivery) => {
    setEditingDelivery(delivery);
    setPhotoPreview(null);
    setFormData({
      customer_name: delivery.customer_name || "",
      customer_phone: delivery.customer_phone || "",
      address: delivery.address || "",
      cash_amount: String(delivery.cash_amount || ""),
      courier_name: delivery.courier_name || "",
      payment_status: delivery.payment_status || "unpaid",
      platform: delivery.platform || "",
      items_ordered: delivery.items_ordered || "",
      neighborhood: delivery.neighborhood || "",
      notes: delivery.notes || "",
      photo_url: delivery.photo_url || "",
    });
    setShowAddDialog(true);
  };

  const performSave = async () => {
    const amount = Number(formData.cash_amount) || 0;
    const cleanPhone = (formData.customer_phone || "").replace(/-/g, "");
    const payload = { ...formData, cash_amount: amount, customer_phone: cleanPhone };

    let savedDelivery;
    if (editingDelivery) {
      await base44.entities.Delivery.update(editingDelivery.id, payload);
      savedDelivery = { ...editingDelivery, ...payload };
    } else {
      savedDelivery = await base44.entities.Delivery.create({ ...payload, date: today, payment_status: "unpaid" });
      // שמור/עדכן במועדון לקוחות
      if (cleanPhone) {
        const existing = await base44.entities.DeliveryCustomer.filter({ customer_phone: cleanPhone });
        const orderEntry = { date: today, amount, items_ordered: formData.items_ordered || "", address: formData.address || "", platform: formData.platform || "" };
        if (existing.length > 0) {
          const c = existing[0];
          const orders = [...(c.orders || []), orderEntry];
          const updatedName = formData.customer_name
            ? formData.customer_name
            : (c.customer_name === "לקוח לא מזוהה" ? "לקוח לא מזוהה" : c.customer_name);
          await base44.entities.DeliveryCustomer.update(c.id, {
            customer_name: updatedName,
            address: formData.address || c.address,
            neighborhood: formData.neighborhood || c.neighborhood,
            orders, total_orders: orders.length,
            total_spent: (c.total_spent || 0) + amount,
            last_order_date: today,
          });
        } else {
          await base44.entities.DeliveryCustomer.create({
            customer_name: formData.customer_name || "",
            customer_phone: cleanPhone,
            address: formData.address || "",
            neighborhood: formData.neighborhood || "",
            orders: [orderEntry], total_orders: 1,
            total_spent: amount, last_order_date: today,
          });
        }
      }
    }

    setShowAddDialog(false);
    setEditingDelivery(null);
    setPhotoPreview(null);
    loadDeliveries(selectedDate);
    return savedDelivery;
  };

  const handleSaveDelivery = async () => {
    await performSave();
  };

  const handleSaveAndDispatch = async () => {
    const saved = await performSave();
    if (saved) {
      setPrepTime(15);
      setShowTelegramDialog(saved);
    }
  };

  const handleDeleteDelivery = async (delivery) => {
    if (!window.confirm(`למחוק את המשלוח של ${delivery.customer_name || delivery.address}?`)) return;
    await base44.entities.Delivery.delete(delivery.id);
    loadDeliveries(selectedDate);
  };

  const handleSaveNote = async () => {
    await base44.entities.Delivery.update(showNoteDialog.id, {
      issue_type: noteData.issue_type || null,
      notes: noteData.notes,
    });
    setShowNoteDialog(null);
    loadDeliveries(selectedDate);
  };

  const handleSendToTelegram = async () => {
    if (!sessionToken) {
      setShowSessionDialog(true);
      return;
    }

    const d = showTelegramDialog;
    const phone = d.customer_phone;
    const address = d.address;

    if (!phone) { alert("חסר מספר טלפון במשלוח זה!"); return; }
    if (!address) { alert("חסרה כתובת במשלוח זה!"); return; }

    setSendingTelegram(true);
    await sendDeliveryToTelegram({ phone, address, prep_time: prepTime, sessionToken });
    setSendingTelegram(false);
    setShowTelegramDialog(null);
  };

  const handleSaveSessionToken = () => {
    localStorage.setItem("telegram_session_token", sessionToken);
    setShowSessionDialog(false);
    alert("✅ Session Token נשמר בהצלחה!");
  };

  const handleMarkPaid = async (delivery) => {
    await base44.entities.Delivery.update(delivery.id, { payment_status: "paid" });
    setShowMarkPaidDialog(null);
    loadDeliveries(selectedDate);
  };

  const handleMarkUnpaid = async (delivery) => {
    await base44.entities.Delivery.update(delivery.id, { payment_status: "unpaid", courier_name: courierName });
    setCourierName("");
    setShowMarkPaidDialog(null);
    loadDeliveries(selectedDate);
  };

  const totalCash = deliveries.reduce((s, d) => s + (d.cash_amount || 0), 0);
  const paid = deliveries.filter((d) => d.payment_status === "paid");
  const unpaid = deliveries.filter((d) => d.payment_status === "unpaid");

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛵 משלוחים היום</h1>
        <div className="hidden sm:flex gap-2">
          <Link to={createPageUrl("DeliveryCustomerClub")}>
            <Button variant="outline" size="sm"><Users className="w-4 h-4 ml-1" /> מועדון לקוחות</Button>
          </Link>
          <Button onClick={handleManualAdd} variant="outline" size="sm">+ הוסף ידנית</Button>
          <Button onClick={() => fileInputRef.current?.click()} className="bg-primary text-primary-foreground" size="sm">
            <Camera className="w-4 h-4 ml-1" /> צלם פתק
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
      </div>

      {/* כפתור צלם פתק - מובייל בלבד */}
      <div className="sm:hidden">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-5 flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="w-10 h-10" />
          <span className="text-xl font-bold">צלם פתק</span>
          <span className="text-sm opacity-80">לחץ לסריקה מהירה</span>
        </button>
        <div className="flex gap-2 mt-2">
          <Button onClick={handleManualAdd} variant="outline" className="flex-1">+ הוסף ידנית</Button>
          <Link to={createPageUrl("DeliveryCustomerClub")} className="flex-1">
            <Button variant="outline" className="w-full"><Users className="w-4 h-4 ml-1" /> מועדון לקוחות</Button>
          </Link>
        </div>
      </div>

      {/* פילטר תאריך */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button size="sm" variant={selectedDate === today ? "default" : "outline"} onClick={() => setSelectedDate(today)}>היום</Button>
        <Button size="sm" variant={selectedDate === yesterday ? "default" : "outline"} onClick={() => setSelectedDate(yesterday)}>אתמול</Button>
        <input type="date" className="border rounded-md px-2 py-1 text-sm" value={customDate} max={today}
          onChange={(e) => { setCustomDate(e.target.value); if (e.target.value) setSelectedDate(e.target.value); }} />
        {selectedDate !== today && selectedDate !== yesterday && (
          <span className="text-sm text-muted-foreground">📅 {new Date(selectedDate + "T12:00:00").toLocaleDateString('he-IL')}</span>
        )}
      </div>

      {scanning && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center text-blue-700 font-medium">⏳ מנתח את הפתק...</CardContent>
        </Card>
      )}

      {/* סיכום */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gray-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{deliveries.length}</div><div className="text-xs text-muted-foreground">סה״כ משלוחים</div></CardContent></Card>
        <Card className="bg-green-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-700">{paid.length}</div><div className="text-xs text-muted-foreground">שולמו</div></CardContent></Card>
        <Card className="bg-red-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-700">{unpaid.length}</div><div className="text-xs text-muted-foreground">לא שולמו</div></CardContent></Card>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-amber-700" />
            <span className="font-bold text-amber-800">סיכום מזומן</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-xs text-muted-foreground">סה״כ מזומן</div><div className="text-xl font-bold">₪{totalCash.toFixed(2)}</div></div>
            <div><div className="text-xs text-muted-foreground">טרם נגבה</div><div className="text-xl font-bold text-red-600">₪{unpaid.reduce((s, d) => s + (d.cash_amount || 0), 0).toFixed(2)}</div></div>
          </div>
        </CardContent>
      </Card>

      {/* רשימת משלוחים */}
      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : deliveries.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין משלוחים עדיין</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {unpaid.length > 0 && (
            <>
              <div className="text-sm font-semibold text-red-700 flex items-center gap-1"><Clock className="w-4 h-4" /> לא שולמו ({unpaid.length})</div>
              {unpaid.map((d) => (
                <DeliveryCard key={d.id} delivery={d}
                  onAction={() => setShowMarkPaidDialog(d)}
                  onEdit={() => handleEditDelivery(d)}
                  onDelete={() => handleDeleteDelivery(d)}
                  onNote={() => { setNoteData({ issue_type: d.issue_type || "", notes: d.notes || "" }); setShowNoteDialog(d); }}
                  onTelegram={() => { setPrepTime(15); setShowTelegramDialog(d); }}
                />
              ))}
            </>
          )}
          {paid.length > 0 && (
            <>
              <div className="text-sm font-semibold text-green-700 flex items-center gap-1 mt-4"><CheckCircle2 className="w-4 h-4" /> שולמו ({paid.length})</div>
              {paid.map((d) => (
                <DeliveryCard key={d.id} delivery={d}
                  onAction={() => setShowMarkPaidDialog(d)}
                  onEdit={() => handleEditDelivery(d)}
                  onDelete={() => handleDeleteDelivery(d)}
                  onNote={() => { setNoteData({ issue_type: d.issue_type || "", notes: d.notes || "" }); setShowNoteDialog(d); }}
                  onTelegram={() => { setPrepTime(15); setShowTelegramDialog(d); }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* דיאלוג הוספה/עריכה */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) setEditingDelivery(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingDelivery ? "✏️ עריכת משלוח" : "פרטי משלוח"}</DialogTitle>
          </DialogHeader>
          {photoPreview && <img src={photoPreview} className="w-full rounded-lg max-h-40 object-cover" alt="פתק" />}
          <div className="space-y-3">
            <div><Label>שם לקוח</Label><Input value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="שם הלקוח" /></div>
            <div><Label>טלפון</Label><Input value={formData.customer_phone} onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })} placeholder="מספר טלפון" /></div>
            <div><Label>כתובת</Label><Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="כתובת" /></div>
            <div><Label>סכום (₪) - מזומן או סה״כ</Label><Input type="number" value={formData.cash_amount} onChange={(e) => setFormData({ ...formData, cash_amount: e.target.value })} placeholder="0" /></div>
            <div>
              <Label>פלטפורמה <span className="text-xs text-muted-foreground">(זוהתה אוטומטית – ניתן לשנות)</span></Label>
              <Select value={formData.platform || ""} onValueChange={(v) => setFormData({ ...formData, platform: v })}>
                <SelectTrigger><SelectValue placeholder="זוהתה אוטומטית" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wolt">🔵 Wolt</SelectItem>
                  <SelectItem value="תן ביס">🟠 תן ביס</SelectItem>
                  <SelectItem value="סיבוס">🟡 סיבוס</SelectItem>
                  <SelectItem value="Mishloha">🟢 Mishloha</SelectItem>
                  <SelectItem value="Valuecard">🔴 Valuecard</SelectItem>
                  <SelectItem value="טלפון">📞 טלפון</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>מה הוזמן</Label><Input value={formData.items_ordered || ""} onChange={(e) => setFormData({ ...formData, items_ordered: e.target.value })} placeholder="פירוט ההזמנה (אופציונלי)" /></div>
            <div><Label>שכונה</Label><Input value={formData.neighborhood || ""} onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} placeholder="שכונה" /></div>
            <div><Label>שם השליח</Label><Input value={formData.courier_name} onChange={(e) => setFormData({ ...formData, courier_name: e.target.value })} placeholder="מי לוקח את המשלוח?" /></div>
            <div><Label>נרשם על ידי</Label><Input value={formData.opened_by || ""} onChange={(e) => setFormData({ ...formData, opened_by: e.target.value })} placeholder="שם העובד שפתח את המשלוח" /></div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveDelivery}>{editingDelivery ? "שמור שינויים" : "שמור משלוח"}</Button>
              {!editingDelivery && (
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSaveAndDispatch}>
                  <Send className="w-4 h-4 ml-1" /> שמור וצוות משלוח
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג סטטוס תשלום */}
      {showMarkPaidDialog && (
        <Dialog open={!!showMarkPaidDialog} onOpenChange={() => setShowMarkPaidDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader><DialogTitle>עדכון סטטוס תשלום</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{showMarkPaidDialog.customer_name || showMarkPaidDialog.address} — ₪{showMarkPaidDialog.cash_amount}</p>
              {showMarkPaidDialog.payment_status === "unpaid" ? (
                <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleMarkPaid(showMarkPaidDialog)}>
                  <CheckCircle2 className="w-4 h-4 ml-2" /> סמן כשולם
                </Button>
              ) : (
                <>
                  <Label>שם השליח שלקח</Label>
                  <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="שם השליח" />
                  <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => handleMarkUnpaid(showMarkPaidDialog)}>סמן כלא שולם</Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* דיאלוג צוות משלוח טלגרם */}
      {showTelegramDialog && (
        <Dialog open={!!showTelegramDialog} onOpenChange={() => setShowTelegramDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader><DialogTitle>🚴 צוות משלוח חדש</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {showTelegramDialog.customer_phone
                    ? <span className="font-medium">{showTelegramDialog.customer_phone}</span>
                    : <span className="text-red-500 font-semibold">⚠️ חסר טלפון!</span>}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {showTelegramDialog.address
                    ? <span className="font-medium">{showTelegramDialog.address}</span>
                    : <span className="text-red-500 font-semibold">⚠️ חסרה כתובת!</span>}
                </div>
              </div>

              <div>
                <Label>זמן הכנה (דקות): <span className="font-bold text-primary">{prepTime}</span></Label>
                <input
                  type="range" min={10} max={30} step={5}
                  value={prepTime}
                  onChange={(e) => setPrepTime(Number(e.target.value))}
                  className="w-full mt-2 accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>10 דק׳</span><span>20 דק׳</span><span>30 דק׳</span>
                </div>
              </div>

              <div className="bg-blue-50 rounded p-2 text-xs text-blue-700 font-mono text-center">
                /{showTelegramDialog.address || "???"}&{showTelegramDialog.customer_phone || "??"}, {prepTime} דקות
              </div>

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleSendToTelegram}
                disabled={sendingTelegram || !showTelegramDialog.customer_phone || !showTelegramDialog.address}
              >
                <Send className="w-4 h-4 ml-2" />
                {sendingTelegram ? "שולח..." : "שלח לצוות משלוח"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* דיאלוג ה-Session Token */}
      <Dialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>🔑 הזנת Telegram Session Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900">
              <p className="font-semibold mb-2">📚 איך להשיג את ה-Session Token?</p>
              <ol className="space-y-1 text-xs list-decimal list-inside">
                <li>הריצ UserBot לוקלי על המחשב שלך</li>
                <li>בצע אימות עם הטלפון שלך דרך הקוד שהטלגרם יותר לך</li>
                <li>שמור את ה-Session String (שיוצג בקונסול)</li>
                <li>הדבק אותו כאן</li>
              </ol>
            </div>

            <div>
              <Label className="font-semibold mb-2 block">Session Token</Label>
              <Textarea
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                placeholder="הדבק את ה-session string כאן... (מ-MTProto authentication)"
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSaveSessionToken} disabled={!sessionToken}>
                ✅ שמור Token
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowSessionDialog(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג הערה */}
      {showNoteDialog && (
        <Dialog open={!!showNoteDialog} onOpenChange={() => setShowNoteDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader><DialogTitle>📝 הערה למשלוח</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{showNoteDialog.customer_name || showNoteDialog.address}</p>
            <div className="space-y-3">
              <div>
                <Label>סוג בעיה</Label>
                <Select value={noteData.issue_type || ""} onValueChange={(v) => setNoteData({ ...noteData, issue_type: v })}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג בעיה" /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>פירוט / סיבה</Label>
                <Textarea value={noteData.notes} onChange={(e) => setNoteData({ ...noteData, notes: e.target.value })} placeholder="תאר את הבעיה בפירוט..." rows={3} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSaveNote}>שמור הערה</Button>
                {(showNoteDialog.issue_type || showNoteDialog.notes) && (
                  <Button variant="outline" className="text-red-600" onClick={async () => {
                    await base44.entities.Delivery.update(showNoteDialog.id, { issue_type: null, notes: "" });
                    setShowNoteDialog(null);
                    loadDeliveries(selectedDate);
                  }}>מחק הערה</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DeliveryCard({ delivery, onAction, onEdit, onDelete, onNote, onTelegram }) {
  const issueLabel = ISSUE_TYPES.find((t) => t.value === delivery.issue_type)?.label;

  return (
    <Card className={`border-2 ${delivery.payment_status === "paid" ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            {delivery.customer_name && (
              <div className="flex items-center gap-1 text-sm font-medium">
                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{delivery.customer_name}</span>
              </div>
            )}
            {delivery.customer_phone && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{delivery.customer_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{delivery.address}</span>
            </div>
            {delivery.courier_name && delivery.payment_status === "unpaid" && (
              <div className="text-xs text-red-600 font-medium">שליח: {delivery.courier_name}</div>
            )}
            {delivery.opened_by && (
              <div className="text-xs text-muted-foreground">נרשם ע״י: {delivery.opened_by}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {delivery.platform && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-medium">{delivery.platform}</span>
              )}
              {delivery.created_date && (
                <span className="text-xs text-muted-foreground">
                  🕐 {new Date(delivery.created_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {/* הערה */}
            {(delivery.issue_type || delivery.notes) && (
              <div className="mt-1 bg-yellow-50 border border-yellow-200 rounded p-2 text-xs space-y-0.5">
                {issueLabel && <div className="font-semibold text-yellow-800">{issueLabel}</div>}
                {delivery.notes && <div className="text-yellow-700">{delivery.notes}</div>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="font-bold text-base">₪{delivery.cash_amount}</span>
            <Badge
              className={`cursor-pointer text-xs ${delivery.payment_status === "paid" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-red-100 text-red-800 hover:bg-red-200"}`}
              onClick={onAction}
            >
              {delivery.payment_status === "paid" ? "✓ שולם" : "⏳ לא שולם"}
            </Badge>
            {/* כפתורי פעולה */}
            <div className="flex gap-1">
              <button onClick={onTelegram} className="p-1 rounded hover:bg-green-100 text-green-600" title="צוות משלוח">
                <Send className="w-3.5 h-3.5" />
              </button>
              <button onClick={onNote} className="p-1 rounded hover:bg-yellow-100 text-yellow-600" title="הוסף הערה">
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              <button onClick={onEdit} className="p-1 rounded hover:bg-blue-100 text-blue-600" title="ערוך">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1 rounded hover:bg-red-100 text-red-600" title="מחק">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}