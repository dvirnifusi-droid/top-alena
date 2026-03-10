import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Briefcase, Phone, Plus, Edit, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";

export default function Couriers() {
  const [couriers, setCouriers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCourier, setEditingCourier] = useState(null);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", status: "active", bank_account: "", notes: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [courierData, deliveryData] = await Promise.all([
      base44.entities.Courier.list(),
      base44.entities.Delivery.list(),
    ]);
    setCouriers(courierData);
    setDeliveries(deliveryData);
    setLoading(false);
  };

  const handleSaveCourier = async () => {
    if (!formData.name.trim()) {
      alert("שם השליח חובה!");
      return;
    }

    if (editingCourier) {
      await base44.entities.Courier.update(editingCourier.id, formData);
    } else {
      await base44.entities.Courier.create(formData);
    }

    setShowAddDialog(false);
    setEditingCourier(null);
    setFormData({ name: "", phone: "", status: "active", bank_account: "", notes: "" });
    loadData();
  };

  const handleEditCourier = (courier) => {
    setEditingCourier(courier);
    setFormData(courier);
    setShowAddDialog(true);
  };

  const handleDeleteCourier = async (courier) => {
    if (!window.confirm(`למחוק את ${courier.name}?`)) return;
    await base44.entities.Courier.delete(courier.id);
    loadData();
  };

  const handleOpenDetails = (courier) => {
    setSelectedCourier(courier);
    setShowDetailsDialog(true);
  };

  const calculateCourierStats = (courier) => {
    const courierDeliveries = deliveries.filter((d) => d.courier_name === courier.name);
    const today = format(new Date(), "yyyy-MM-dd");
    const todayDeliveries = courierDeliveries.filter((d) => d.date === today);

    const totalToday = todayDeliveries.reduce((sum, d) => sum + (Number(d.cash_amount) || 0), 0);
    const totalAll = courierDeliveries.reduce((sum, d) => sum + (Number(d.cash_amount) || 0), 0);
    const paidToday = todayDeliveries.filter((d) => d.payment_status === "paid").reduce((sum, d) => sum + (Number(d.cash_amount) || 0), 0);
    const paidAll = courierDeliveries.filter((d) => d.payment_status === "paid").reduce((sum, d) => sum + (Number(d.cash_amount) || 0), 0);

    return {
      deliveriesToday: todayDeliveries.length,
      totalToday,
      paidToday,
      owedToday: totalToday - paidToday,
      deliveriesAll: courierDeliveries.length,
      totalAll,
      paidAll,
      owedAll: totalAll - paidAll,
      deliveries: courierDeliveries,
    };
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" dir="rtl">
      {/* כותרת וכפתור הוספה */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🚴 שליחים</h1>
        <Button onClick={() => { setEditingCourier(null); setFormData({ name: "", phone: "", status: "active", bank_account: "", notes: "" }); setShowAddDialog(true); }} className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 ml-2" /> הוסף שליח
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : couriers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין שליחים עדיין</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {couriers.map((courier) => {
            const stats = calculateCourierStats(courier);
            return (
              <Card key={courier.id} className={courier.status === "inactive" ? "opacity-50" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg">{courier.name}</CardTitle>
                      {courier.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {courier.phone}</p>}
                    </div>
                    <Badge className={courier.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {courier.status === "active" ? "פעיל" : "לא פעיל"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* סטטיסטיקות היום */}
                  <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-blue-900">היום</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">משלוחים:</span> <span className="font-bold">{stats.deliveriesToday}</span></div>
                      <div><span className="text-muted-foreground">סה״כ:</span> <span className="font-bold">₪{stats.totalToday}</span></div>
                      <div><span className="text-green-700">שולם:</span> <span className="font-bold text-green-700">₪{stats.paidToday}</span></div>
                      <div><span className="text-red-700">חייב:</span> <span className="font-bold text-red-700">₪{stats.owedToday}</span></div>
                    </div>
                  </div>

                  {/* סטטיסטיקות כללי */}
                  <div className="bg-amber-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-900">בכללי</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">משלוחים:</span> <span className="font-bold">{stats.deliveriesAll}</span></div>
                      <div><span className="text-muted-foreground">סה״כ:</span> <span className="font-bold">₪{stats.totalAll}</span></div>
                      <div><span className="text-green-700">שולם:</span> <span className="font-bold text-green-700">₪{stats.paidAll}</span></div>
                      <div><span className="text-red-700">חייב:</span> <span className="font-bold text-red-700">₪{stats.owedAll}</span></div>
                    </div>
                  </div>

                  {/* כפתורים */}
                  <div className="flex gap-2">
                    <Button onClick={() => handleOpenDetails(courier)} variant="outline" size="sm" className="flex-1">
                      <TrendingUp className="w-3.5 h-3.5 ml-1" /> פרטים
                    </Button>
                    <Button onClick={() => handleEditCourier(courier)} variant="outline" size="sm">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => handleDeleteCourier(courier)} variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* דיאלוג הוספה/עריכה */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingCourier ? "✏️ עדכון שליח" : "➕ שליח חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>שם</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="שם השליח" />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="מספר טלפון" />
            </div>
            <div>
              <Label>פרטי בנק</Label>
              <Input value={formData.bank_account} onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })} placeholder="מספר חשבון וקוד בנק" />
            </div>
            <div>
              <Label>הערות</Label>
              <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="הערות כלליות" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveCourier}>{editingCourier ? "עדכן" : "הוסף"}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג פרטים */}
      {selectedCourier && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>פרטי {selectedCourier.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedCourier.phone && <p><span className="font-semibold">📞 טלפון:</span> {selectedCourier.phone}</p>}
              {selectedCourier.bank_account && <p><span className="font-semibold">🏦 בנק:</span> {selectedCourier.bank_account}</p>}
              {selectedCourier.notes && <p><span className="font-semibold">📝 הערות:</span> {selectedCourier.notes}</p>}

              <div className="border-t pt-4">
                <h3 className="font-bold mb-3">📦 משלוחים</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {calculateCourierStats(selectedCourier).deliveries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">אין משלוחים</p>
                  ) : (
                    calculateCourierStats(selectedCourier).deliveries.map((delivery) => (
                      <div key={delivery.id} className="bg-gray-50 rounded p-2 text-sm">
                        <div className="font-semibold">{delivery.customer_name || delivery.address}</div>
                        <div className="text-xs text-muted-foreground flex justify-between">
                          <span>{delivery.date}</span>
                          <span className={delivery.payment_status === "paid" ? "text-green-700" : "text-red-700"}>₪{delivery.cash_amount} - {delivery.payment_status === "paid" ? "✓ שולם" : "⏳ לא שולם"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">📍 {delivery.address}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}