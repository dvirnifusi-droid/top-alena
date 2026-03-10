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
  Banknote, Users, Pencil, Trash2, MessageSquare, AlertTriangle,
} from "lucide-react";
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
  const [formData, setFormData] = useState({
    customer_name: "", customer_phone: "", address: "",
    cash_amount: "", courier_name: "", payment_status: "unpaid",
    platform: "", items_ordered: "", neighborhood: "",
  });
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
        prompt: `נתח את תמונת פתק המשלוח הזו ומצא:
- שם הלקוח (השם שמופיע בפתק כשם המזמין/לקוח - לא שם הרחוב!)
- מספר טלפון
- כתובת מלאה
- סכום לתשלום במזומן (מספר בלבד)
- פלטפורמת ההזמנה - חפש לוגו או שם של: Wolt, תן ביס, סיבוס, Mishloha, Valuecard. אם לא מזהה - השאר ריק.

החזר JSON בלבד בפורמט:
{"customer_name":"...","customer_phone":"...","address":"...","cash_amount":0,"platform":"..."}

אם לא מצאת שדה, השאר ריק. הסכום צריך להיות מספר בלבד.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            customer_name: { type: "string" },
            customer_phone: { type: "string" },
            address: { type: "string" },
            cash_amount: { type: "number" },
            platform: { type: "string" },
          },
        },
      });
      setFormData((prev) => ({
        ...prev,
        customer_name: result.customer_name || "",
        customer_phone: result.customer_phone || "",
        address: result.address || "",
        cash_amount: result.cash_amount ? String(result.cash_amount) : "",
        platform: result.platform || "",
        photo_url: file_url,
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

  const handleSaveDelivery = async () => {
    const amount = Number(formData.cash_amount) || 0;
    const payload = { ...formData, cash_amount: amount };

    if (editingDelivery) {
      await base44.entities.Delivery.update(editingDelivery.id, payload);
    } else {
      await base44.entities.Delivery.create({ ...payload, date: today, payment_status: "unpaid" });
      // שמור/עדכן במועדון לקוחות
      if (formData.customer_phone) {
        const existing = await base44.entities.DeliveryCustomer.filter({ customer_phone: formData.customer_phone });
        const orderEntry = { date: today, amount, items_ordered: formData.items_ordered || "", address: formData.address || "", platform: formData.platform || "" };
        if (existing.length > 0) {
          const c = existing[0];
          const orders = [...(c.orders || []), orderEntry];
          await base44.entities.DeliveryCustomer.update(c.id, {
            customer_name: formData.customer_name || c.customer_name,
            address: formData.address || c.address,
            neighborhood: formData.neighborhood || c.neighborhood,
            orders, total_orders: orders.length,
            total_spent: (c.total_spent || 0) + amount,
            last_order_date: today,
          });
        } else {
          await base44.entities.DeliveryCustomer.create({
            customer_name: formData.customer_name || "",
            customer_phone: formData.customer_phone,
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
        <div className="flex gap-2">
          <Link to={createPageUrl("DeliveryCustomerClub")}>
            <Button variant="outline" size="sm"><Users className="w-4 h-4 ml-1" /> מועדון לקוחות</Button>
          </Link>
          <Button onClick={handleManualAdd} variant="outline" size="sm">+ הוסף ידנית</Button>
          <Button onClick={() => fileInputRef.current?.click()} className="bg-primary text-primary-foreground" size="sm">
            <Camera className="w-4 h-4 ml-1" /> צלם פתק
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
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
            <div><Label>סכום מזומן (₪)</Label><Input type="number" value={formData.cash_amount} onChange={(e) => setFormData({ ...formData, cash_amount: e.target.value })} placeholder="0" /></div>
            <div>
              <Label>פלטפורמה</Label>
              <Select value={formData.platform || ""} onValueChange={(v) => setFormData({ ...formData, platform: v })}>
                <SelectTrigger><SelectValue placeholder="בחר פלטפורמה" /></SelectTrigger>
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
            <Button className="w-full" onClick={handleSaveDelivery}>{editingDelivery ? "שמור שינויים" : "שמור משלוח"}</Button>
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

function DeliveryCard({ delivery, onAction, onEdit, onDelete, onNote }) {
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