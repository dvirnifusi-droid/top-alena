// Reusable AI-scanner flow: upload a photo/PDF or paste text → the AI classifies
// & parses it → owner reviews and edits the preview → confirm imports to the
// right tables. Used by the /Scanner hub page and the in-page <AiScannerButton/>.
import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileText, Sparkles, Loader2, CheckCircle2, Trash2, Plus,
  ScanLine, AlertCircle, ArrowRight, ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Per-type editable columns + the top-level "meta" fields (title / list name / etc.).
const TYPE_CONFIG = {
  menu: {
    rowsKey: 'items',
    label: 'תפריט',
    addLabel: 'הוסף מנה',
    blank: { name: '', price: 0, category: '', description: '' },
    columns: [
      { key: 'name', label: 'שם המנה', flex: 3 },
      { key: 'price', label: 'מחיר', type: 'number', flex: 1 },
      { key: 'category', label: 'קטגוריה', flex: 2 },
    ],
  },
  checklist: {
    rowsKey: 'items',
    label: 'צ׳קליסט',
    addLabel: 'הוסף פריט',
    meta: [{ key: 'title', label: 'שם הצ׳קליסט' }],
    blank: { text: '' },
    columns: [{ key: 'text', label: 'משימה', flex: 6 }],
  },
  employees: {
    rowsKey: 'employees',
    label: 'עובדים',
    addLabel: 'הוסף עובד',
    blank: { full_name: '', phone: '', role: '', department: '' },
    columns: [
      { key: 'full_name', label: 'שם מלא', flex: 3 },
      { key: 'phone', label: 'טלפון', flex: 2 },
      { key: 'role', label: 'תפקיד', flex: 2 },
    ],
  },
  suppliers: {
    rowsKey: 'suppliers',
    label: 'ספקים',
    addLabel: 'הוסף ספק',
    blank: { company_name: '', contact_person: '', phone: '', email: '', category: '' },
    columns: [
      { key: 'company_name', label: 'שם החברה', flex: 3 },
      { key: 'contact_person', label: 'איש קשר', flex: 2 },
      { key: 'phone', label: 'טלפון', flex: 2 },
    ],
  },
  order_list: {
    rowsKey: 'items',
    label: 'רשימת הזמנות',
    addLabel: 'הוסף פריט',
    meta: [{ key: 'list_name', label: 'שם הרשימה' }],
    blank: { name: '', qty: 0, unit: '', supplier: '' },
    columns: [
      { key: 'name', label: 'מוצר', flex: 3 },
      { key: 'qty', label: 'כמות', type: 'number', flex: 1 },
      { key: 'unit', label: 'יחידה', flex: 1 },
      { key: 'supplier', label: 'ספק', flex: 2 },
    ],
  },
};

/**
 * @param {string}   [hint]        force a target type (skips classification) — e.g. "menu"
 * @param {function} [onImported]  called with the import summary after a successful import
 * @param {boolean}  [compact]     tighter styling for in-dialog use
 */
export default function ScannerPanel({ hint, onImported, compact = false }) {
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState('input'); // input | scanning | preview | importing | done
  const [scan, setScan] = useState(null);       // { classification, label, parsed, count, preview_text, confidence }
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const cfg = scan && TYPE_CONFIG[scan.classification];

  const reset = () => {
    setText(''); setFileName(''); setPhase('input'); setScan(null);
    setRows([]); setMeta({}); setSummary(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const runScan = async ({ file_url, freeText }) => {
    setPhase('scanning'); setError('');
    try {
      const res = await base44.functions.aiScanContent({ file_url, text: freeText, hint });
      const data = res?.data || res;
      const type = data?.classification;
      const conf = TYPE_CONFIG[type];
      if (!conf || !data?.parsed) {
        setScan(data);
        setError(data?.preview_text || 'לא זיהיתי סוג מסמך שאני יודע לייבא. נסה תמונה חדה יותר או הדבק טקסט.');
        setPhase('input');
        return;
      }
      const parsedRows = Array.isArray(data.parsed[conf.rowsKey]) ? data.parsed[conf.rowsKey] : [];
      const m = {};
      (conf.meta || []).forEach((f) => { m[f.key] = data.parsed[f.key] || ''; });
      setScan(data); setRows(parsedRows); setMeta(m); setPhase('preview');
    } catch (e) {
      setError(e?.message || 'שגיאה בסריקה. נסה שוב.');
      setPhase('input');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPhase('scanning'); setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await runScan({ file_url });
    } catch (err) {
      setError(err?.message || 'שגיאה בהעלאת הקובץ.');
      setPhase('input');
    }
  };

  const handleScanText = () => {
    if (!text.trim()) { toast.error('הדבק טקסט קודם'); return; }
    runScan({ freeText: text.trim() });
  };

  const updateRow = (i, key, value) => setRows(rows.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));
  const addRow = () => setRows([...rows, { ...cfg.blank }]);

  const confirmImport = async () => {
    setPhase('importing'); setError('');
    try {
      const parsed = { ...scan.parsed, ...meta, [cfg.rowsKey]: rows };
      const res = await base44.functions.importScanned({ classification: scan.classification, parsed });
      const data = res?.data || res;
      setSummary(data);
      setPhase('done');
      toast.success(data?.message || 'יובא בהצלחה');
      onImported?.(data);
    } catch (e) {
      setError(e?.message || 'שגיאה בייבוא.');
      setPhase('preview');
    }
  };

  // ── DONE ────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="text-center py-8 px-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>
        <h3 className="font-display text-2xl text-[#2A2018] mb-1">יובא בהצלחה</h3>
        <p className="text-[#8A7C64] mb-6">{summary?.message}</p>
        <Button onClick={reset} variant="outline" className="rounded-xl">
          <ScanLine className="w-4 h-4 ml-1.5" /> סרוק עוד מסמך
        </Button>
      </div>
    );
  }

  // ── PREVIEW ─────────────────────────────────────────────────────────────
  if (phase === 'preview' || phase === 'importing') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge className="bg-[var(--brand-primary,#A04A2E)] text-white border-0">{cfg.label}</Badge>
            <span className="text-sm text-[#8A7C64]">{rows.length} פריטים · בדוק ותקן לפני ייבוא</span>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="text-[#8A7C64]">התחל מחדש</Button>
        </div>

        {(cfg.meta || []).map((f) => (
          <div key={f.key}>
            <label className="text-xs font-bold text-[#8A7C64] block mb-1">{f.label}</label>
            <Input value={meta[f.key] || ''} onChange={(e) => setMeta({ ...meta, [f.key]: e.target.value })} className="font-bold" />
          </div>
        ))}

        <div className="rounded-xl border border-[#EADFC8] overflow-hidden">
          <div className="hidden md:flex gap-2 bg-[#F7EFDD] px-3 py-2 text-xs font-bold text-[#8A7C64]">
            {cfg.columns.map((c) => <div key={c.key} style={{ flex: c.flex }}>{c.label}</div>)}
            <div className="w-8" />
          </div>
          <div className="divide-y divide-[#EADFC8] max-h-[45vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-col md:flex-row gap-2 px-3 py-2 bg-white/60">
                {cfg.columns.map((c) => (
                  <div key={c.key} style={{ flex: c.flex }} className="w-full">
                    <span className="md:hidden text-[10px] text-[#B8A98C]">{c.label}</span>
                    <Input
                      type={c.type === 'number' ? 'number' : 'text'}
                      value={row[c.key] ?? ''}
                      onChange={(e) => updateRow(i, c.key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
                <button onClick={() => removeRow(i)} className="w-8 h-8 shrink-0 flex items-center justify-center text-red-400 hover:text-red-600 self-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {rows.length === 0 && <div className="px-3 py-6 text-center text-sm text-[#B8A98C]">אין פריטים — הוסף ידנית או סרוק שוב</div>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={addRow} className="rounded-xl border-dashed">
            <Plus className="w-4 h-4 ml-1" /> {cfg.addLabel}
          </Button>
          <Button onClick={confirmImport} disabled={phase === 'importing' || rows.length === 0}
            className="rounded-xl bg-[var(--brand-primary,#A04A2E)] hover:opacity-90 text-white px-6">
            {phase === 'importing'
              ? <><Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> מייבא...</>
              : <><CheckCircle2 className="w-4 h-4 ml-1.5" /> אשר וייבא {rows.length}</>}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
      </div>
    );
  }

  // ── SCANNING ────────────────────────────────────────────────────────────
  if (phase === 'scanning') {
    return (
      <div className="text-center py-10">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 rounded-2xl bg-[var(--brand-primary,#A04A2E)]/10 animate-ping" />
          <div className="relative w-16 h-16 rounded-2xl bg-[var(--brand-primary,#A04A2E)] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white animate-pulse" />
          </div>
        </div>
        <p className="font-display text-lg text-[#2A2018]">קורא את המסמך…</p>
        <p className="text-sm text-[#8A7C64]">{fileName || 'מזהה ומחלץ פריטים'}</p>
      </div>
    );
  }

  // ── INPUT ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-[#D9C8A6] bg-[#FBF6EA] hover:bg-[#F7EFDD] hover:border-[var(--brand-primary,#A04A2E)] transition-colors py-8 px-4 flex flex-col items-center gap-2 group"
      >
        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
          <Upload className="w-7 h-7 text-[var(--brand-primary,#A04A2E)]" />
        </div>
        <span className="font-display text-lg text-[#2A2018]">גרור, צלם או בחר קובץ</span>
        <span className="text-xs text-[#8A7C64] flex items-center gap-3">
          <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> תמונה</span>
          <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> PDF</span>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />

      <div className="flex items-center gap-3 text-xs text-[#B8A98C]">
        <div className="flex-1 h-px bg-[#EADFC8]" /> או הדבק טקסט <div className="flex-1 h-px bg-[#EADFC8]" />
      </div>

      <Textarea
        rows={compact ? 3 : 4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="הדבק כאן רשימה — תפריט, משימות, עובדים, ספקים…"
        className="text-sm"
      />
      <Button onClick={handleScanText} disabled={!text.trim()} className="w-full rounded-xl bg-[var(--brand-primary,#A04A2E)] hover:opacity-90 text-white">
        <Sparkles className="w-4 h-4 ml-1.5" /> סרוק את הטקסט <ArrowRight className="w-4 h-4 mr-1.5" />
      </Button>

      {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}</p>}
    </div>
  );
}
