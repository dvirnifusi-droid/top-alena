import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Phone, MapPin, ShoppingBag, Search, Star, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function DeliveryCustomerClub() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

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

  const totalCustomers = customers.length;
  const totalOrders = customers.reduce((s, c) => s + (c.total_orders || 0), 0);
  const totalRevenue = customers.reduce((s, c) => s + (c.total_spent || 0), 0);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">מועדון לקוחות משלוחים</h1>
      </div>

      {/* סיכום */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{totalCustomers}</div>
            <div className="text-xs text-muted-foreground">לקוחות</div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-purple-700">{totalOrders}</div>
            <div className="text-xs text-muted-foreground">הזמנות</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-700">₪{totalRevenue.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">סה״כ הכנסה</div>
          </CardContent>
        </Card>
      </div>

      {/* חיפוש */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          className="pr-9"
          placeholder="חיפוש לפי שם, טלפון, שכונה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* רשימת לקוחות */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">טוען...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין לקוחות עדיין</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/30"
              onClick={() => setSelected(c)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{c.customer_name || "לא ידוע"}</span>
                      {(c.total_orders || 0) >= 5 && (
                        <Star className="w-4 h-4 text-amber-500 fill-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{c.customer_phone}</span>
                    </div>
                    {c.neighborhood && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{c.neighborhood}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-left flex-shrink-0 space-y-1">
                    <Badge variant="outline" className="text-xs">
                      {c.total_orders || 0} הזמנות
                    </Badge>
                    <div className="text-sm font-bold text-green-700 text-left">
                      ₪{(c.total_spent || 0).toFixed(0)}
                    </div>
                    {c.last_order_date && (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(c.last_order_date), "dd/MM")}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* דיאלוג פרופיל לקוח */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selected.customer_name || "לקוח"}
                {(selected.total_orders || 0) >= 5 && (
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* פרטים */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{selected.customer_phone}</span>
                </div>
                {selected.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selected.address}</span>
                  </div>
                )}
                {selected.neighborhood && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <span>שכונה: {selected.neighborhood}</span>
                  </div>
                )}
              </div>

              {/* סטטיסטיקות */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{selected.total_orders || 0}</div>
                  <div className="text-xs text-muted-foreground">הזמנות</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-700">₪{(selected.total_spent || 0).toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">סה״כ</div>
                </div>
              </div>

              {/* היסטוריית הזמנות */}
              {selected.orders && selected.orders.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">היסטוריית הזמנות</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {[...selected.orders].reverse().map((order, i) => (
                      <div key={i} className="bg-muted/40 rounded-lg p-2.5 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-muted-foreground text-xs">
                            {order.date ? format(new Date(order.date), "dd/MM/yyyy") : ""}
                          </span>
                          <span className="font-bold text-green-700">₪{order.amount}</span>
                        </div>
                        {order.items_ordered && (
                          <p className="text-xs text-muted-foreground">{order.items_ordered}</p>
                        )}
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
    </div>
  );
}