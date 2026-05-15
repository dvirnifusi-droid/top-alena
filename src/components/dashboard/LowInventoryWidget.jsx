import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { PackageX, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';

export default function LowInventoryWidget() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await base44.entities.InventoryAlert.filter({ is_resolved: false });
        setAlerts(items.slice(0, 4));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Card className={`hover:shadow-lg transition-all ${alerts.length > 0 ? 'border-orange-200' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${alerts.length > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
            <PackageX className={`w-5 h-5 ${alerts.length > 0 ? 'text-orange-600' : 'text-green-600'}`} />
          </div>
          <span className="text-xs text-muted-foreground">מלאי</span>
        </div>
        {loading ? (
          <p className="text-2xl font-black">...</p>
        ) : alerts.length === 0 ? (
          <>
            <p className="text-2xl font-black text-green-600">✓ תקין</p>
            <p className="text-sm text-muted-foreground mt-1">📦 אין התראות מלאי</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-black text-orange-600">{alerts.length}</p>
            <p className="text-sm font-semibold text-muted-foreground mt-1">📦 התראות מלאי</p>
            <div className="mt-2 space-y-1">
              {alerts.map((a, i) => (
                <p key={i} className="text-xs text-orange-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {a.item_name || a.product_name || 'פריט'}
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}