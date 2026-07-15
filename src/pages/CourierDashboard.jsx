import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Phone, MapPin, CheckCircle2, Clock, Package, User } from "lucide-react";
import { format } from "date-fns";
import { sendPushoverOnDeliveryStatus } from "@/functions/sendPushoverOnDeliveryStatus";

export default function CourierDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      // טען את כל המשלוחים המוקצים לשליח הזה
      const deliveryData = await base44.entities.Delivery.filter({ 
        courier_name: user.full_name || user.email 
      });
      setDeliveries(deliveryData.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  const handlePickupDelivery = async (delivery) => {
    if (delivery.delivery_status === "picked_up") {
      alert("המשלוח כבר הורם!");
      return;
    }

    await base44.entities.Delivery.update(delivery.id, {
      delivery_status: "picked_up",
      picked_up_at: new Date().toISOString(),
    });

    // שלח Pushover notification
    try {
      await sendPushoverOnDeliveryStatus({
        delivery_id: delivery.id,
        status: "picked_up",
        customer_name: delivery.customer_name,
        address: delivery.address,
      });
    } catch (e) {
      console.error("Error sending push notification:", e);
    }

    loadData();
  };

  const handleDeliverDelivery = async (delivery) => {
    if (delivery.delivery_status === "delivered") {
      alert("המשלוח כבר הוריד!");
      return;
    }

    if (delivery.delivery_status !== "picked_up") {
      alert("צריך להרים את המשלוח קודם!");
      return;
    }

    await base44.entities.Delivery.update(delivery.id, {
      delivery_status: "delivered",
      delivered_at: new Date().toISOString(),
    });

    // שלח Pushover notification
    try {
      await sendPushoverOnDeliveryStatus({
        delivery_id: delivery.id,
        status: "delivered",
        customer_name: delivery.customer_name,
        address: delivery.address,
      });
    } catch (e) {
      console.error("Error sending push notification:", e);
    }

    loadData();
  };

  const handleOpenDetails = (delivery) => {
    setSelectedDelivery(delivery);
    setShowDetailsDialog(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "picked_up": return "bg-[#F4ECD8] text-[#2E3819]";
      case "delivered": return "bg-green-100 text-green-800";
      default: return "bg-red-100 text-red-800";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "picked_up": return "🚴 בדרך";
      case "delivered": return "✅ הוריד";
      default: return "⏳ ממתין";
    }
  };

  const pending = deliveries.filter((d) => d.delivery_status === "pending");
  const pickedUp = deliveries.filter((d) => d.delivery_status === "picked_up");
  const delivered = deliveries.filter((d) => d.delivery_status === "delivered");

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      {/* כותרת */}
      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-4 text-white">
        <h1 className="text-2xl font-bold">{currentUser?.full_name || "שליח"}</h1>
        <p className="text-sm opacity-90">אפליקציית המשלוחים שלך</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : deliveries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין לך משלוחים עדיין</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* ממתינים להרמה */}
          {pending.length > 0 && (
            <>
              <div className="text-sm font-semibold text-red-700 flex items-center gap-1">
                <Clock className="w-4 h-4" /> ממתינים להרמה ({pending.length})
              </div>
              <div className="space-y-3">
                {pending.map((delivery) => (
                  <DeliveryCard
                    key={delivery.id}
                    delivery={delivery}
                    onDetails={() => handleOpenDetails(delivery)}
                    onPickup={() => handlePickupDelivery(delivery)}
                    onDeliver={() => handleDeliverDelivery(delivery)}
                  />
                ))}
              </div>
            </>
          )}

          {/* בדרך */}
          {pickedUp.length > 0 && (
            <>
              <div className="text-sm font-semibold text-[#44512C] flex items-center gap-1 mt-6">
                <Clock className="w-4 h-4" /> בדרך ({pickedUp.length})
              </div>
              <div className="space-y-3">
                {pickedUp.map((delivery) => (
                  <DeliveryCard
                    key={delivery.id}
                    delivery={delivery}
                    onDetails={() => handleOpenDetails(delivery)}
                    onPickup={() => handlePickupDelivery(delivery)}
                    onDeliver={() => handleDeliverDelivery(delivery)}
                  />
                ))}
              </div>
            </>
          )}

          {/* הורדו */}
          {delivered.length > 0 && (
            <>
              <div className="text-sm font-semibold text-green-700 flex items-center gap-1 mt-6">
                <CheckCircle2 className="w-4 h-4" /> הורדו ({delivered.length})
              </div>
              <div className="space-y-3">
                {delivered.map((delivery) => (
                  <DeliveryCard
                    key={delivery.id}
                    delivery={delivery}
                    onDetails={() => handleOpenDetails(delivery)}
                    onPickup={() => handlePickupDelivery(delivery)}
                    onDeliver={() => handleDeliverDelivery(delivery)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* דיאלוג פרטים */}
      {selectedDelivery && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>פרטי המשלוח</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedDelivery.customer_name || "ללא שם"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedDelivery.customer_phone || "אין"}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                  <span>{selectedDelivery.address}</span>
                </div>
              </div>

              <div className="bg-[#F4ECD8] rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900 mb-2">סטטוס משלוח</p>
                <Badge className={getStatusColor(selectedDelivery.delivery_status)}>
                  {getStatusLabel(selectedDelivery.delivery_status)}
                </Badge>
              </div>

              {selectedDelivery.items_ordered && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-1">מה הוזמן</p>
                  <p className="text-sm">{selectedDelivery.items_ordered}</p>
                </div>
              )}

              <div className="flex gap-2 pt-3">
                {selectedDelivery.delivery_status === "pending" && (
                  <Button className="flex-1" onClick={() => { handlePickupDelivery(selectedDelivery); setShowDetailsDialog(false); }}>
                    🚴 הרם משלוח
                  </Button>
                )}
                {selectedDelivery.delivery_status === "picked_up" && (
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { handleDeliverDelivery(selectedDelivery); setShowDetailsDialog(false); }}>
                    ✅ הורד משלוח
                  </Button>
                )}
                {selectedDelivery.delivery_status === "delivered" && (
                  <Button disabled className="flex-1">✅ הוריד בהצלחה</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DeliveryCard({ delivery, onDetails, onPickup, onDeliver }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onDetails}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{delivery.customer_name || "ללא שם"}</span>
              {delivery.customer_phone && <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            </div>
            <div className="flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground truncate">{delivery.address}</span>
            </div>
            {delivery.neighborhood && (
              <span className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 inline-block">{delivery.neighborhood}</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Badge
              className={
                delivery.delivery_status === "picked_up"
                  ? "bg-[#F4ECD8] text-[#2E3819]"
                  : delivery.delivery_status === "delivered"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }
            >
              {delivery.delivery_status === "picked_up"
                ? "🚴 בדרך"
                : delivery.delivery_status === "delivered"
                ? "✅ הוריד"
                : "⏳ ממתין"}
            </Badge>
            <div className="flex gap-1">
              {delivery.delivery_status === "pending" && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickup();
                  }}
                  className="bg-[#44512C] hover:bg-[#44512C] h-7"
                >
                  הרם
                </Button>
              )}
              {delivery.delivery_status === "picked_up" && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeliver();
                  }}
                  className="bg-green-600 hover:bg-green-700 h-7"
                >
                  הורד
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}