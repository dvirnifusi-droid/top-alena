// Drop-in button that opens the AI scanner focused on ONE target type.
// Place on any page: <AiScannerButton target="menu" onImported={reload} />
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScanLine } from 'lucide-react';
import ScannerPanel from './ScannerPanel';

const TITLES = {
  menu: 'סריקת תפריט',
  checklist: 'סריקת צ׳קליסט',
  employees: 'סריקת רשימת עובדים',
  suppliers: 'סריקת רשימת ספקים',
  order_list: 'סריקת רשימת הזמנות',
};

export default function AiScannerButton({ target, onImported, label, variant = 'outline', size = 'sm', className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={`rounded-xl gap-1.5 ${className}`} onClick={() => setOpen(true)}>
        <ScanLine className="w-4 h-4" /> {label || 'סרוק ויבא'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-[var(--brand-primary,#A04A2E)]" /> {TITLES[target] || 'סריקה חכמה'}
            </DialogTitle>
          </DialogHeader>
          <ScannerPanel
            hint={target}
            compact
            onImported={(summary) => { onImported?.(summary); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
