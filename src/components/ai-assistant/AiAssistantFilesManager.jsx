import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Upload, Trash2, FileText, Download, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const MAX_MB = 50;

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('he-IL'); } catch { return iso; }
}

export default function AiAssistantFilesManager() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [description, setDescription] = useState('');
  const inputRef = useRef(null);

  const load = async () => {
    try {
      const res = await base44.functions.listAiAssistantFiles({});
      setFiles(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      console.error('listAiAssistantFiles failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`הקובץ גדול מדי. גודל מקסימלי: ${MAX_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error('upload returned empty url');
      await base44.functions.createAiAssistantFile({
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_url,
        file_size: file.size,
        description: description.trim() || null,
      });
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch (e) {
      console.error('upload failed:', e);
      alert(`שגיאה בהעלאה: ${e?.response?.data?.message || e?.message || 'unknown'}`);
    } finally {
      setUploading(false);
    }
  };

  const toggle = async (f) => {
    try {
      await base44.functions.updateAiAssistantFile({ id: f.id, is_active: !f.is_active });
      await load();
    } catch (e) {
      alert('שגיאה בעדכון');
    }
  };

  const remove = async (f) => {
    if (!confirm(`למחוק את הקובץ "${f.file_name}"? פעולה זו לא ניתנת לביטול.`)) return;
    try {
      await base44.functions.deleteAiAssistantFile({ id: f.id });
      await load();
    } catch (e) {
      alert('שגיאה במחיקה');
    }
  };

  const migrateFromDrive = async () => {
    if (!confirm('להעביר את כל הקבצים מ-Google Drive לתוך האפליקציה? קבצים שכבר קיימים בשם זהה - ידולגו.')) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await base44.functions.migrateDriveToAiAssistantFiles({});
      const data = res?.data || res;
      setMigrationResult(data);
      await load();
    } catch (e) {
      console.error('migration failed:', e);
      alert(`שגיאה בייבוא: ${e?.response?.data?.message || e?.message || 'unknown'}`);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Card className="shadow-xl" dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-purple-600" />
              ידע של דביר (קבצים שהצ'אט קורא)
            </CardTitle>
            <CardDescription className="mt-1">
              העלה תפריטים, נהלים, חוברות הדרכה - דביר ה-AI יסרוק את הכל ויענה למשתמשים על סמך התוכן הזה.
              גודל מקסימלי לקובץ: {MAX_MB}MB. כל סוגי הקבצים מתקבלים (PDF, Word, Excel, תמונות, טקסט).
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/OnboardingQuestionnaire"
              className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100"
            >
              📋 מלא שאלון הצטרפות
            </a>
            <Button
              onClick={migrateFromDrive}
              disabled={migrating}
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {migrating ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Download className="w-4 h-4 ml-2" />}
              ייבוא חד-פעמי מ-Google Drive
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Upload zone */}
        <div className="border-2 border-dashed border-purple-200 rounded-2xl p-5 bg-purple-50/40">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              ref={inputRef}
              type="file"
              className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer cursor-pointer"
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </div>
          <div className="mt-3">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר (אופציונלי) - למה הקובץ הזה? לדוגמה: 'תפריט ארוחת בוקר 2026'"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          {uploading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-purple-700">
              <Loader2 className="w-4 h-4 animate-spin" /> מעלה...
            </div>
          )}
        </div>

        {/* Migration result */}
        {migrationResult && (
          <div className="border rounded-xl p-4 bg-amber-50/50 text-sm">
            <div className="font-semibold mb-2">תוצאות הייבוא מ-Drive:</div>
            <div className="grid grid-cols-3 gap-2">
              <div>✅ הועברו: <strong>{migrationResult.migrated}</strong></div>
              <div>⏭️ דולגו: <strong>{migrationResult.skipped}</strong></div>
              <div>❌ שגיאות: <strong>{migrationResult.errors}</strong></div>
            </div>
            {migrationResult.details?.length > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-gray-600">פרטים מלאים</summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {migrationResult.details.map((d, i) => (
                    <li key={i}>{d.file}: <code className="text-gray-500">{d.status}</code>{d.error && <span className="text-red-500"> — {d.error}</span>}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Files list */}
        {loading ? (
          <div className="text-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : files.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="w-12 h-12 mx-auto opacity-30 mb-2" />
            <p>עדיין לא הועלו קבצים. תעלה את הראשון או ייבא מ-Drive.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map(f => {
              const geminiAge = f.gemini_uploaded_at ? Date.now() - new Date(f.gemini_uploaded_at).getTime() : null;
              const geminiFresh = geminiAge !== null && geminiAge < 47 * 3600 * 1000;
              return (
                <div key={f.id} className={`flex items-center gap-3 border rounded-xl p-3 ${f.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                  <FileText className="w-8 h-8 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{f.file_name}</span>
                      {f.source === 'drive_migration' && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Drive</span>}
                      {geminiFresh ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle className="w-3 h-3" /> Gemini cached</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400"><AlertCircle className="w-3 h-3" /> ייטען בקריאה הבאה</span>
                      )}
                    </div>
                    {f.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{f.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      <span>{f.mime_type}</span>
                      {f.file_size && <span>• {fmtSize(f.file_size)}</span>}
                      <span>• הועלה {fmtDate(f.created_date)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={f.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="הורד">
                      <Download className="w-4 h-4" />
                    </a>
                    <div className="flex items-center gap-1">
                      <Switch checked={!!f.is_active} onCheckedChange={() => toggle(f)} />
                    </div>
                    <button onClick={() => remove(f)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="מחק">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-gray-400 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          קבצים פעילים נשלחים אוטומטית ל-Gemini. כל קובץ מתרענן מול Gemini אחת ל-47 שעות (לפני שפג התוקף שלהם בצד Google).
        </div>
      </CardContent>
    </Card>
  );
}
