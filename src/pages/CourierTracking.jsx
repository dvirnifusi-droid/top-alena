import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Package, Clock, User, Navigation } from "lucide-react";
import { format } from "date-fns";

export default function CourierTracking() {
  const [couriers, setCouriers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [courierData, deliveryData] = await Promise.all([
        base44.entities.Courier.filter({ status: "active" }),
        base44.entities.Delivery.list("-created_date", 100),
      ]);
      setCouriers(courierData);
      setDeliveries(deliveryData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  const getCourierDeliveries = (courierName) => {
    return deliveries.filter((d) => d.courier_name === courierName);
  };

  const getCourierStats = (courierName) => {
    const cDeliveries = getCourierDeliveries(courierName);
    const pending = cDeliveries.filter((d) => d.delivery_status === "pending").length;
    const pickedUp = cDeliveries.filter((d) => d.delivery_status === "picked_up").length;
    const delivered = cDeliveries.filter((d) => d.delivery_status === "delivered").length;
    const totalAmount = cDeliveries.reduce((sum, d) => sum + (d.cash_amount || 0), 0);
    
    return { pending, pickedUp, delivered, totalAmount, total: cDeliveries.length };
  };

  const optimizeDeliveryOrder = (deliveries) => {
    if (deliveries.length === 0) return [];
    
    // סדר: pending → picked_up → delivered
    const statusOrder = { pending: 0, picked_up: 1, delivered: 2 };
    
    return [...deliveries].sort((a, b) => {
      // ראשית לפי סטטוס
      const statusDiff = (statusOrder[a.delivery_status] || 3) - (statusOrder[b.delivery_status] || 3);
      if (statusDiff !== 0) return statusDiff;
      
      // אחר כך לפי שכונה (כדי לקבץ קרוב)
      const neighborhoodDiff = (a.neighborhood || "").localeCompare(b.neighborhood || "", "he");
      if (neighborhoodDiff !== 0) return neighborhoodDiff;
      
      // לבסוף לפי סדר יצירה
      return new Date(b.created_date) - new Date(a.created_date);
    });
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">🗺️ מעקב שליחים חי</h1>
        <p className="text-sm opacity-90">עדכון בזמן אמת של כל השליחים ומשלוחיהם</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : couriers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין שליחים פעילים</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {couriers.map((courier) => {
            const stats = getCourierStats(courier.name);
            const courierDeliveries = getCourierDeliveries(courier.name);

            return (
              <Card key={courier.id} className="border-2 border-blue-100">
                {/* Courier Header */}
                <CardHeader className="bg-blue-50 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                        {courier.name.charAt(0)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{courier.name}</CardTitle>
                        {courier.phone && (
                          <a
                            href={`tel:${courier.phone}`}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3" /> {courier.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    {stats.total > 0 && (
                      <div className="text-right text-sm">
                        <div className="font-bold text-lg">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">משלוחים</div>
                      </div>
                    )}
                  </div>

                  {/* Stats Row */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Badge className="bg-red-100 text-red-800">⏳ {stats.pending}</Badge>
                    <Badge className="bg-blue-100 text-blue-800">🚴 {stats.pickedUp}</Badge>
                    <Badge className="bg-green-100 text-green-800">✅ {stats.delivered}</Badge>
                    {stats.totalAmount > 0 && (
                      <Badge className="bg-amber-100 text-amber-800">₪{stats.totalAmount}</Badge>
                    )}
                  </div>
                </CardHeader>

                {/* Deliveries List */}
                <CardContent className="p-3 space-y-2 max-h-96 overflow-y-auto">
                  {courierDeliveries.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      אין משלוחים
                    </div>
                  ) : (
                    optimizeDeliveryOrder(courierDeliveries).map((delivery) => (
                      <div
                        key={delivery.id}
                        className="border rounded-lg p-2 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* Customer Name */}
                            {delivery.customer_name && (
                              <div className="font-medium text-sm truncate">
                                {delivery.customer_name}
                              </div>
                            )}

                            {/* Address */}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{delivery.address}</span>
                            </div>

                            {/* Phone */}
                            {delivery.customer_phone && (
                              <a
                                href={`tel:${delivery.customer_phone}`}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <Phone className="w-3 h-3 flex-shrink-0" />
                                <span>{delivery.customer_phone}</span>
                              </a>
                            )}

                            {/* Amount & Time */}
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              {delivery.cash_amount > 0 && (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                                  ₪{delivery.cash_amount}
                                </span>
                              )}
                              {delivery.created_date && (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(delivery.created_date), "HH:mm")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="flex-shrink-0">
                            <Badge
                              className={
                                delivery.delivery_status === "delivered"
                                  ? "bg-green-100 text-green-800"
                                  : delivery.delivery_status === "picked_up"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {delivery.delivery_status === "delivered"
                                ? "✅ הוריד"
                                : delivery.delivery_status === "picked_up"
                                ? "🚴 בדרך"
                                : "⏳ ממתין"}
                            </Badge>
                          </div>
                        </div>

                        {/* Neighborhood */}
                        {delivery.neighborhood && (
                          <div className="text-xs text-muted-foreground mt-1 pl-6">
                            📍 {delivery.neighborhood}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && deliveries.length > 0 && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {deliveries.filter((d) => d.delivery_status === "pending").length}
                </div>
                <div className="text-xs text-muted-foreground">ממתינים</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {deliveries.filter((d) => d.delivery_status === "picked_up").length}
                </div>
                <div className="text-xs text-muted-foreground">בדרך</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {deliveries.filter((d) => d.delivery_status === "delivered").length}
                </div>
                <div className="text-xs text-muted-foreground">הורדו</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  ₪{deliveries.reduce((sum, d) => sum + (d.cash_amount || 0), 0)}
                </div>
                <div className="text-xs text-muted-foreground">סה״כ מזומן</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}