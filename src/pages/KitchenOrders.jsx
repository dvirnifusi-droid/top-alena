import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Bike, ShoppingBag, Clock, Phone, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

// Phase 1 of docs/WOO-TOPALENA-ORDERS-SPEC.md — the queue, read only.
// The stage buttons that write back to WooCommerce are phase 2; this screen
// deliberately shows no controls it cannot honour yet.

const STAGE = {
  received: { label: 'ממתינה לאישור', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  accepted: { label: 'בהכנה', tone: 'bg-sky-100 text-sky-900 border-sky-300' },
  ready: { label: 'מוכנה', tone: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  out: { label: 'יצאה', tone: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  delivered: { label: 'נמסרה', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
  cancelled: { label: 'בוטלה', tone: 'bg-rose-100 text-rose-900 border-rose-300' },
};

export default function KitchenOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.getWooOrders({});
      setOrders(Array.isArray(res?.orders) ? res.orders : []);
      setError('');
      setUpdatedAt(new Date());
    } catch (e) {
      // Say it plainly. A kitchen screen that silently shows a stale list is
      // worse than one that admits it lost contact.
      setError(e?.message || 'לא הצלחנו לטעון את ההזמנות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <PageGuard pageName="KitchenOrders">
      <PageShell>
        <PageHeader
          title="הזמנות מהאתר"
          subtitle="מתעדכן לבד כל 30 שניות"
          actions={
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
              רענון
            </Button>
          }
        />

        {error && (
          <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900">
            {error}
          </div>
        )}

        {loading && orders.length === 0 && (
          <div className="flex justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {!loading && orders.length === 0 && !error && (
          <Card>
            <CardContent className="py-14 text-center text-slate-500">
              אין הזמנות פעילות כרגע
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => {
            const stage = STAGE[o.stage] || STAGE.received;
            const late = typeof o.lateMin === 'number' && o.lateMin > 0;
            return (
              <Card key={o.id} className={late ? 'border-rose-400 border-2' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-lg">#{o.number}</span>
                        <Badge className={`border ${stage.tone}`}>{stage.label}</Badge>
                        <Badge variant="outline" className="gap-1">
                          {o.fulfillment === 'pickup' ? (
                            <><ShoppingBag className="w-3 h-3" /> איסוף</>
                          ) : (
                            <><Bike className="w-3 h-3" /> משלוח</>
                          )}
                        </Badge>
                      </div>
                      <div className="mt-1 font-semibold truncate">{o.customerName}</div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="font-extrabold text-lg">₪{Math.round(Number(o.total) || 0)}</div>
                      <div className={`text-sm flex items-center gap-1 justify-end ${late ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                        <Clock className="w-3.5 h-3.5" />
                        {late ? `באיחור ${o.lateMin} דק׳` : `${o.waitingMin} דק׳`}
                      </div>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm">
                    {(Array.isArray(o.items) ? o.items : []).map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="text-slate-500">{it.qty}× </span>
                          {it.name}
                          {Array.isArray(it.options) && it.options.length > 0 && (
                            <span className="text-slate-500"> · {it.options.join(' · ')}</span>
                          )}
                        </span>
                        <span className="text-slate-500 shrink-0">₪{Math.round(Number(it.total) || 0)}</span>
                      </li>
                    ))}
                  </ul>

                  {(o.customerPhone || o.address) && (
                    <div className="mt-3 pt-3 border-t text-sm text-slate-600 space-y-1">
                      {o.customerPhone && (
                        <a href={`tel:${o.customerPhone}`} className="flex items-center gap-1.5 hover:underline">
                          <Phone className="w-3.5 h-3.5" /> {o.customerPhone}
                        </a>
                      )}
                      {o.address && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> {o.address}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {updatedAt && (
          <p className="mt-4 text-center text-xs text-slate-400">
            עודכן {updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </PageShell>
    </PageGuard>
  );
}
