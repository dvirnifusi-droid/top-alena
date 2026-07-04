import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { InvoiceItem } from '@/entities/InvoiceItem';
import { Inventory } from '@/entities/Inventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

// Review screen for an email-imported invoice: editable fields, per-line
// inventory action, one Approve that commits invoice + inventory together.
export default function InvoiceReviewModal({ invoice, supplierName, onClose, onDone }) {
  const [fields, setFields] = useState({
    invoice_number: invoice.invoice_number || '',
    invoice_date: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : '',
    total_amount: invoice.total_amount ?? 0,
    payment_status: invoice.payment_status || 'unpaid',
  });
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [its, inv] = await Promise.all([
          InvoiceItem.filter({ invoice_id: invoice.id }),
          Inventory.list(),
        ]);
        setItems((its || []).map(it => ({ ...it, inventory_action: it.inventory_action || 'create_new' })));
        setInventory(inv || []);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [invoice.id]);

  const setItem = (idx, patch) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const invNameById = Object.fromEntries(inventory.map(i => [i.id, i.item_name]));

  const approve = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await base44.functions.emailInvoiceApprove({
        invoice_id: invoice.id,
        invoice_number: fields.invoice_number,
        invoice_date: fields.invoice_date,
        total_amount: Number(fields.total_amount) || 0,
        payment_status: fields.payment_status,
        items: items.map(it => ({
          id: it.id,
          product_name: it.product_name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          unit: it.unit || null,
          inventory_action: it.inventory_action,
          inventory_item_id: it.inventory_action === 'add_existing' ? it.inventory_item_id : null,
        })),
      });
      onDone();
    } catch (e) {
      setError(e.message); setBusy(false);
    }
  };

  const reject = async () => {
    if (busy) return;
    if (!window.confirm('לדחות את החשבונית? היא לא תיכנס למערכת והמלאי לא יעודכן.')) return;
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.emailInvoiceReject({ invoice_id: invoice.id });
      if (res?.data?.sender_blocked) {
        window.alert('השולח נחסם אחרי שתי דחיות — מיילים ממנו לא ייסרקו יותר (ניתן לבטל בהגדרות תיבות מייל).');
      }
      onDone();
    } catch (e) {
      setError(e.message); setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            בדיקת חשבונית — {supplierName || 'ספק לא ידוע'}
            <Badge variant="outline">נקלט ממייל</Badge>
          </DialogTitle>
        </DialogHeader>

        {error && <div className="p-3 rounded bg-red-50 text-red-800 text-sm">{error}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          {invoice.file_url && (
            <iframe title="invoice-file" src={invoice.file_url} className="w-full h-96 border rounded-lg bg-white" />
          )}
          <div className="space-y-3">
            <label className="block text-sm">
              מספר חשבונית
              <Input dir="ltr" value={fields.invoice_number}
                onChange={e => setFields(f => ({ ...f, invoice_number: e.target.value }))} />
            </label>
            <label className="block text-sm">
              תאריך
              <Input type="date" value={fields.invoice_date}
                onChange={e => setFields(f => ({ ...f, invoice_date: e.target.value }))} />
            </label>
            <label className="block text-sm">
              סכום כולל (₪)
              <Input type="number" dir="ltr" value={fields.total_amount}
                onChange={e => setFields(f => ({ ...f, total_amount: e.target.value }))} />
            </label>
            <label className="block text-sm">
              סטטוס תשלום
              <Select value={fields.payment_status} onValueChange={v => setFields(f => ({ ...f, payment_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">לא שולם</SelectItem>
                  <SelectItem value="paid">שולם</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">פריטים ועדכון מלאי</h3>
          {items.length === 0 && (
            <p className="text-sm text-slate-500">לא זוהו שורות פריטים בחשבונית — אישור יכניס את החשבונית בלבד, בלי עדכון מלאי.</p>
          )}
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-2">
                <Input className="col-span-3" value={it.product_name}
                  onChange={e => setItem(idx, { product_name: e.target.value })} />
                <Input className="col-span-1" type="number" dir="ltr" value={it.quantity}
                  onChange={e => setItem(idx, { quantity: e.target.value })} />
                <Input className="col-span-2" type="number" dir="ltr" value={it.unit_price} placeholder="מחיר ליח'"
                  onChange={e => setItem(idx, { unit_price: e.target.value })} />
                <div className="col-span-3">
                  <Select value={it.inventory_action} onValueChange={v => setItem(idx, { inventory_action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add_existing">הוסף לפריט קיים</SelectItem>
                      <SelectItem value="create_new">פריט מלאי חדש</SelectItem>
                      <SelectItem value="skip">דלג (בלי מלאי)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  {it.inventory_action === 'add_existing' && (
                    <Select value={it.inventory_item_id || ''} onValueChange={v => setItem(idx, { inventory_item_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר פריט מלאי">{invNameById[it.inventory_item_id] || 'בחר פריט מלאי'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {it.inventory_action === 'create_new' && <span className="text-sm text-green-700">ייווצר פריט חדש במלאי</span>}
                  {it.inventory_action === 'skip' && <span className="text-sm text-slate-400">ללא עדכון מלאי</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={reject} disabled={busy}>
            <XCircle className="w-4 h-4 ml-2" />דחה
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={approve}
            disabled={busy || items.some(it => it.inventory_action === 'add_existing' && !it.inventory_item_id)}>
            {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <CheckCircle className="w-4 h-4 ml-2" />}
            אשר חשבונית + עדכן מלאי
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
