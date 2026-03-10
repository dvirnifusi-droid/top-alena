import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Phone, MapPin, ShoppingBag, Search, Star, Pencil, Trash2,
  Mail, MessageSquare, Download, Upload, Plus, Send
} from "lucide-react";
import { format } from "date-fns";
import CustomerFormDialog from "@/components/delivery/CustomerFormDialog";
import SendMessageDialog from "@/components/delivery/SendMessageDialog";

const PLATFORM_LABELS = {
  "Wolt": "🔵 Wolt",
  "תן ביס": "🟠 תן ביס",
  "סיבוס": "🟡 סיבוס",
  "Mishloha": "🟢 Mishloha",
  "Valuecard": "🔴 Valuecard",
  "טלפון": "📞 טלפון",
};

export default function DeliveryCustomerClub() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageTarget, setMessageTarget] = useState(null); // null = כולם
  const importRef = useRef();

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    setLoading(true);
    const data = await base44.entities.DeliveryCustomer.list("-total_orders");
    setCustomers(data);
    setLoading(false);
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.customer_name || "").toLowerCase().includes(q) ||
      (c.customer_phone || "").includes(q) ||
      (c.neighborhood || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  });

  const handleDelete = async (c) => {
    if (!window.confirm(`למחוק את ${c.customer_name || c.customer_phone}?`)) return;
    await base44.entities.DeliveryCustomer.delete(c.id);
    setSelected(null);
    loadCustomers();
  };

  // --- ייצוא אקסל ---
  const exportExcel = () => {
    const headers = ["שם", "טלפון", "אימייל", "כתובת", "שכונה", "הזמנות", "סה״כ ₪", "הזמנה אחרונה", "הערות"];
    const rows = customers.map((c) => [
      c.customer_name || "",
      c.customer_phone || "",
      c.email || "",
      c.address || "",
      c.neighborhood || "",
      c.total_orders || 0,
      c.total_spent || 0,
      c.last_order_date || "",
      c.notes || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `לקוחות_משלוחים_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- ייבוא אקסל/CSV ---
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return alert("הקובץ ריק");

    // זיהוי headers אוטומטי
    const headerLine = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
    const findCol = (...names) => {
      for (const n of names) {
        const idx = headerLine.findIndex((h) => h.includes(n));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const cols = {
      name: findCol("שם", "name"),
      phone: findCol("טלפון", "phone", "mobile"),
      email: findCol("מייל", "אימייל", "email"),
      address: findCol("כתובת", "address"),
      neighborhood: findCol("שכונה", "neighborhood"),
      notes: findCol("הערות", "notes"),
    };

    let imported = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols2 = lines[i].split(",").map((v) => v.replace(/"/g, "").trim());
      const phone = cols.phone >= 0 ? cols2[cols.phone] : "";
      if (!phone) { skipped++; continue; }

      const existing = await base44.entities.DeliveryCustomer.filter({ customer_phone: phone });
      if (existing.length > 0) { skipped++; continue; }

      await base44.entities.DeliveryCustomer.create({
        customer_name: cols.name >= 0 ? cols2[cols.name] : "",
        customer_phone: phone,
        email: cols.email >= 0 ? cols2[cols.email] : "",
        address: cols.address >= 0 ? cols2[cols.address] : "",
        neighborhood: cols.neighborhood >= 0 ? cols2[cols.neighborhood] : "",
        notes: cols.notes >= 0 ? cols2[cols.notes] : "",
        total_orders: 0, total_spent: 0, orders: [],
      });
      imported++;
    }

    alert(`יובאו ${imported} לקוחות. דולגו ${skipped} (כבר קיימים או חסר טלפון)`);
    e.target.value = "";
    loadCustomers();
  };

  const totalOrders = customers.reduce((s, c) => s + (c.total_orders || 0), 0);
  const totalRevenue = customers.reduce((s, c) => s + (c.total_spent || 0), 0);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">מועדון לקוחות משלוחים</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { setShowMessageDialog(true); setMessageTarget(null); }}>
            <Send className="w-4 h-4 ml-1" /> שלח לכולם
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <Download className="w-4 h-4 ml-1" /> ייצוא CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
            <Upload className="w-4 h-4 ml-1" /> ייבוא CSV
          </Button>
          <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 ml-1" /> הוסף לקוח
          </Button>
        </div>
      </div>

      {/* סיכום */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-blue-700">{customers.length}</div><div className="text-xs text-muted-foreground">לקוחות</div></CardContent></Card>
        <Card className="bg-purple-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-purple-700">{totalOrders}</div><div className="text-xs text-muted-foreground">הזמנות</div></CardContent></Card>
        <Card className="bg-green-50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-700">₪{totalRevenue.toFixed(0)}</div><div className="text-xs text-muted-foreground">סה״כ הכנסה</div></CardContent></Card>
      </div>

      {/* חיפוש */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="חיפוש לפי שם, טלפון, שכונה..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* רשימה */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">טוען...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין לקוחות עדיין</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/30" onClick={() => setSelected(c)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{c.customer_name || "לא ידוע"}</span>
                      {(c.total_orders || 0) >= 5 && <Star className="w-4 h-4 text-amber-500 fill-amber-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{c.customer_phone}</span>
                      {c.email && <><Mail className="w-3.5 h-3.5 mr-2 flex-shrink-0" /><span className="truncate">{c.email}</span></>}
                    </div>
                    {c.neighborhood && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" /><span>{c.neighborhood}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-left flex-shrink-0 space-y-1">
                    <Badge variant="outline" className="text-xs">{c.total_orders || 0} הזמנות</Badge>
                    <div className="text-sm font-bold text-green-700 text-left">₪{(c.total_spent || 0).toFixed(0)}</div>
                    {c.last_order_date && <div className="text-xs text-muted-foreground">{format(new Date(c.last_order_date), "dd/MM")}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* פרופיל לקוח */}
      {selected && !showEditForm && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selected.customer_name || "לקוח"}
                {(selected.total_orders || 0) >= 5 && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* כפתורי פעולה */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingCustomer(selected); setShowEditForm(true); }}>
                  <Pencil className="w-3.5 h-3.5 ml-1" /> ערוך
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-blue-600" onClick={() => { setMessageTarget(selected); setShowMessageDialog(true); }}>
                  <MessageSquare className="w-3.5 h-3.5 ml-1" /> שלח הודעה
                </Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(selected)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* פרטים */}
              <div className="space-y-2 text-sm bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{selected.customer_phone}</span></div>
                {selected.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span>{selected.email}</span></div>}
                {selected.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{selected.address}</span></div>}
                {selected.neighborhood && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" /><span>שכונה: {selected.neighborhood}</span></div>}
                {selected.notes && <div className="text-muted-foreground text-xs mt-1">📝 {selected.notes}</div>}
              </div>

              {/* סטטיסטיקות */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center"><div className="text-xl font-bold">{selected.total_orders || 0}</div><div className="text-xs text-muted-foreground">הזמנות</div></div>
                <div className="bg-green-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-green-700">₪{(selected.total_spent || 0).toFixed(0)}</div><div className="text-xs text-muted-foreground">סה״כ</div></div>
              </div>

              {/* היסטוריית הזמנות */}
              {selected.orders && selected.orders.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">היסטוריית הזמנות</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {[...selected.orders].reverse().map((order, i) => (
                      <div key={i} className="bg-muted/40 rounded-lg p-2.5 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">{order.date ? format(new Date(order.date), "dd/MM/yyyy") : ""}</span>
                            {order.platform && (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">{PLATFORM_LABELS[order.platform] || order.platform}</span>
                            )}
                          </div>
                          <span className="font-bold text-green-700">₪{order.amount}</span>
                        </div>
                        {order.items_ordered && <p className="text-xs text-muted-foreground">{order.items_ordered}</p>}
                        {order.address && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{order.address}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* טפסי עריכה/הוספה */}
      {showAddForm && (
        <CustomerFormDialog onSave={() => { setShowAddForm(false); loadCustomers(); }} onClose={() => setShowAddForm(false)} />
      )}
      {showEditForm && editingCustomer && (
        <CustomerFormDialog customer={editingCustomer} onSave={() => { setShowEditForm(false); setEditingCustomer(null); setSelected(null); loadCustomers(); }} onClose={() => { setShowEditForm(false); setEditingCustomer(null); }} />
      )}

      {/* דיאלוג שליחת הודעה */}
      {showMessageDialog && (
        <SendMessageDialog
          customer={messageTarget}
          allCustomers={customers}
          onClose={() => { setShowMessageDialog(false); setMessageTarget(null); }}
        />
      )}
    </div>
  );
}