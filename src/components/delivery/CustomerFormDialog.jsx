import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";

export default function CustomerFormDialog({ customer, onSave, onClose }) {
  const [form, setForm] = useState({
    customer_name: customer?.customer_name || "",
    customer_phone: customer?.customer_phone || "",
    email: customer?.email || "",
    address: customer?.address || "",
    neighborhood: customer?.neighborhood || "",
    notes: customer?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.customer_phone) return alert("מספר טלפון הוא שדה חובה");
    setSaving(true);
    if (customer) {
      await base44.entities.DeliveryCustomer.update(customer.id, form);
    } else {
      // בדוק אם כבר קיים
      const existing = await base44.entities.DeliveryCustomer.filter({ customer_phone: form.customer_phone });
      if (existing.length > 0) {
        alert("לקוח עם טלפון זה כבר קיים במערכת");
        setSaving(false);
        return;
      }
      await base44.entities.DeliveryCustomer.create({
        ...form,
        customer_name: form.customer_name || "לקוח לא מזוהה",
        total_orders: 0, total_spent: 0, orders: [],
      });
    }
    setSaving(false);
    onSave();
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{customer ? "✏️ עריכת לקוח" : "➕ הוספת לקוח"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>שם לקוח <span className="text-muted-foreground text-xs font-normal">(אופציונלי)</span></Label>
            <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="אם לא ידוע – השאר ריק" />
          </div>
          <div><Label>טלפון *</Label><Input value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} placeholder="05X-XXXXXXX" /></div>
          <div><Label>אימייל</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="example@mail.com" /></div>
          <div><Label>כתובת</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="רחוב ומספר" /></div>
          <div><Label>שכונה</Label><Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} placeholder="שכונה" /></div>
          <div><Label>הערות</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="הערות נוספות..." rows={2} /></div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
            <Button variant="outline" onClick={onClose}>ביטול</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}