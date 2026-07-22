import React, { useState, useRef, useEffect } from "react";
import { base44 } from '@/api/base44Client';
import { ChecklistExecution, ChecklistExecutionArchive } from "@/entities/all";
// Assuming User entity is used for `user` prop
import { UploadFile } from "@/integrations/Core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    CheckSquare,
    Camera,
    AlertTriangle,
    ArrowRight,
    ArrowLeft,
    Save,
    X,
    Upload,
    ShieldCheck,
    RotateCcw,
    Loader2,
    User as UserIcon // Add User icon and alias it to avoid conflict with the entity User
} from "lucide-react";

// SAME item key scheme as ChecklistLiveRun — both modes write to the same
// shared daily run, so the keys must match exactly.
const keyOf = (item, i) => String(item?.id || (item?.order != null ? `o${item.order}` : `i${i}`));

export default function ChecklistExecutionComponent({ checklist, user, onComplete, onCancel }) {
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    // results = the SHARED daily run's results object (keyed by keyOf), loaded
    // from and saved to the server on every action — so a reload keeps the
    // progress and a second employee (in either mode) works on the same run.
    const [results, setResults] = useState({});
    const [execId, setExecId] = useState(null);
    const [hydrating, setHydrating] = useState(true);
    const [notes, setNotes] = useState('');
    const [approvingManagerName, setApprovingManagerName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [aiSummary, setAiSummary] = useState('');
    const [saving, setSaving] = useState(false);
    const [startTime, setStartTime] = useState(new Date()); // Track start time for completion duration
    const [photoWarn, setPhotoWarn] = useState(false); // blocks "completed" until a required photo is added
    const fileInputRef = useRef(null);
    const lastInteractionRef = useRef(0);
    const mark = () => { lastInteractionRef.current = Date.now(); };

    const isManager = ['admin', 'owner'].includes(String(user?.role || ''));
    const items = Array.isArray(checklist.items) ? checklist.items : [];
    const currentItem = items[currentItemIndex];
    const curKey = currentItem ? keyOf(currentItem, currentItemIndex) : '';
    const progress = ((currentItemIndex) / (items.length || 1)) * 100;

    // Open (or join) the shared daily run and hydrate whatever was already
    // marked — in either mode, by anyone. Jump to the first unfinished item.
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await base44.functions.openChecklistLiveRun({ checklist_id: checklist.id });
                const ex = (res?.data || res)?.execution;
                if (alive && ex) {
                    setExecId(ex.id);
                    setResults(ex.results || {});
                    const idx = items.findIndex((it, i) => !(ex.results || {})[keyOf(it, i)]?.checked);
                    if (idx > 0) setCurrentItemIndex(idx);
                }
            } catch (e) { console.warn('open shared run', e); }
            if (alive) setHydrating(false);
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checklist.id]);

    // Live refresh — every 12s + on focus, silent + idle-guarded so it never
    // clobbers text mid-typing. Shows marks other employees make in parallel.
    useEffect(() => {
        if (!execId) return;
        const pull = async () => {
            if (document.hidden || Date.now() - lastInteractionRef.current < 5000) return;
            try {
                const row = await ChecklistExecution.get(execId);
                if (row?.results) setResults((prev) => (JSON.stringify(prev) === JSON.stringify(row.results) ? prev : row.results));
            } catch { /* ignore */ }
        };
        const iv = setInterval(pull, 12000);
        const onVis = () => { if (!document.hidden) pull(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', onVis);
        return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
    }, [execId]);

    // Save one item's fields to the shared run (server-side jsonb merge — safe
    // against a colleague marking a different item at the same moment).
    const patchItem = async (k, patch, checked) => {
        if (!execId) return;
        try {
            const res = await base44.functions.toggleChecklistLiveItem({
                execution_id: execId, item_key: k,
                ...(checked !== undefined ? { checked } : {}),
                ...(patch ? { patch } : {}),
            });
            const srv = (res?.data || res)?.results;
            if (srv) setResults(srv);
        } catch (e) { console.warn('save item', e); }
    };

    const handleItemCheck = (checked) => {
        // A "photo required" item can't be marked done without at least one photo.
        if (checked && currentItem.requires_photo_evidence && !(results[curKey]?.photo_urls || []).length) {
            setPhotoWarn(true);
            return;
        }
        setPhotoWarn(false);
        mark();
        const followup = !!(currentItem.critical && !checked);
        setResults(prev => ({
            ...prev,
            [curKey]: { ...prev[curKey], checked, requires_followup: followup }
        }));
        patchItem(curKey, { requires_followup: followup }, checked);
    };

    const handleNoteChange = (note) => {
        mark();
        setResults(prev => ({ ...prev, [curKey]: { ...prev[curKey], notes: note } }));
    };

    const handlePerformerChange = (performer) => {
        mark();
        setResults(prev => ({ ...prev, [curKey]: { ...prev[curKey], performed_by: performer } }));
    };

    const handlePhotoUpload = async (file) => {
        if (!file) return;
        mark();
        setUploading(true);
        try {
            const { file_url } = await UploadFile({ file });
            const urls = [...(results[curKey]?.photo_urls || []), file_url];
            setResults(prev => ({ ...prev, [curKey]: { ...prev[curKey], photo_urls: urls } }));
            patchItem(curKey, { photo_urls: urls, photo_url: urls[0] || null });
            setPhotoWarn(false); // photo added — clear the "photo required" block

            // AI review — advisory only, never blocks the upload
            if (currentItem.ai_review) {
                setReviewing(true);
                try {
                    const res = await base44.functions.reviewChecklistItem({
                        checklist_id: checklist.id,
                        item_order: currentItem.order,
                        photo_url: file_url,
                    });
                    const rev = res?.data || res;
                    setResults(prev => ({ ...prev, [curKey]: { ...prev[curKey], ai_review: rev } }));
                    patchItem(curKey, { ai_review: rev });
                } catch { /* advisory only — ignore */ }
                setReviewing(false);
            }
        } catch (error) {
            console.error('שגיאה בהעלאת תמונה:', error);
        }
        setUploading(false);
    };

    const handleRemovePhoto = (photoIndex) => {
        mark();
        const urls = (results[curKey]?.photo_urls || []).filter((_, i) => i !== photoIndex);
        setResults(prev => ({ ...prev, [curKey]: { ...prev[curKey], photo_urls: urls } }));
        patchItem(curKey, { photo_urls: urls, photo_url: urls[0] || null });
    };

    const nextItem = () => {
        if (currentItemIndex < items.length - 1) {
            setPhotoWarn(false);
            setCurrentItemIndex(prev => prev + 1);
        }
    };

    const prevItem = () => {
        if (currentItemIndex > 0) {
            setPhotoWarn(false);
            setCurrentItemIndex(prev => prev - 1);
        }
    };

    const calculateScore = () => {
        const totalItems = items.length;
        if (totalItems === 0) return 0;
        const completedItems = Object.values(results).filter(r => r && r.checked).length;
        return Math.round((completedItems / totalItems) * 100);
    };

    // Manager-only: resets the SHARED run for everyone (not just this screen).
    const restartChecklist = async () => {
        if (!window.confirm('האם אתה בטוח שברצונך להתחיל מחדש? הצ\'קליסט המשותף יאופס לכל העובדים.')) return;
        try {
            await base44.functions.resetChecklistLiveRun({ checklist_id: checklist.id });
            const res = await base44.functions.openChecklistLiveRun({ checklist_id: checklist.id });
            const ex = (res?.data || res)?.execution;
            setExecId(ex?.id || null);
            setResults(ex?.results || {});
        } catch (e) {
            alert('איפוס נכשל — רק מנהל יכול לאפס צ\'קליסט.');
            return;
        }
        setCurrentItemIndex(0);
        setNotes('');
        setApprovingManagerName('');
        setAiSummary('');
        setStartTime(new Date()); // Reset start time
    };

    const saveExecution = async () => {
        if (currentItemIndex === items.length - 1 && !approvingManagerName.trim()) {
            alert('חובה למלא שם אחמ"ש מאשר לפני שמירה.');
            return;
        }
        setSaving(true);

        const score = calculateScore();
        const hasFollowUp = Object.values(results).some(r => r && r.requires_followup);
        const completedItems = Object.values(results).filter(r => r && r.checked).length;
        const failedItems = items.filter((item, i) => !results[keyOf(item, i)]?.checked).length;
        const criticalFailures = items.filter((item, i) =>
            item.critical && !results[keyOf(item, i)]?.checked
        ).length;

        // AI end-of-run summary — advisory only, must NOT block the save
        let summary = aiSummary;
        try {
            const resultsArr = items.map((item, i) => ({
                item_order: item.order ?? i,
                task: item.task,
                ...(results[keyOf(item, i)] || {}),
            })).filter(r => r.checked !== undefined || r.notes || r.photo_urls?.length);
            const s = await base44.functions.summarizeChecklistExecution({ results: resultsArr });
            summary = (s?.data || s)?.ai_summary || '';
            setAiSummary(summary);
        } catch { /* advisory */ }

        const now = new Date();
        const completionMinutes = Math.floor((now.getTime() - startTime.getTime()) / 1000 / 60);

        try {
            let savedId = execId;
            if (execId) {
                // Close the SHARED run — this is the ONLY thing that "resets" the
                // checklist: the next open starts a fresh run.
                await base44.functions.finishChecklistLiveRun({
                    execution_id: execId,
                    status: hasFollowUp ? 'requires_attention' : 'completed',
                    overall_score: score,
                    notes,
                    ai_summary: summary,
                    approving_manager_name: approvingManagerName,
                    follow_up_required: hasFollowUp,
                    completion_time_minutes: completionMinutes,
                });
            } else {
                // Fallback (shared run unavailable) — save a standalone record.
                const savedExecution = await ChecklistExecution.create({
                    checklist_id: checklist.id,
                    executed_by: user?.id || 'anonymous',
                    executed_by_name: user?.full_name || 'משתמש אנונימי',
                    approving_manager_name: approvingManagerName,
                    execution_date: new Date().toISOString(),
                    status: hasFollowUp ? 'requires_attention' : 'completed',
                    results,
                    overall_score: score,
                    notes,
                    ai_summary: summary,
                    follow_up_required: hasFollowUp
                });
                savedId = savedExecution.id;
            }

            // יצירת רשומת ארכיון מפורטת
            await createExecutionArchive(savedId, score, completedItems, failedItems, criticalFailures, summary, completionMinutes);

            onComplete();
        } catch (error) {
            console.error('שגיאה בשמירת ביצוע:', error);
            alert('שגיאה בשמירת הביצוע. נסה שוב.');
        }
        setSaving(false);
    };

    const createExecutionArchive = async (executionId, score, completedItems, failedItems, criticalFailures, summaryText, completionMinutes) => {
        try {
            const now = new Date();
            const shiftType = now.getHours() < 16 ? 'morning' : 'evening';

            // הכנת תוצאות מפורטות עם תמונות ושמות מבצעים
            const detailedResults = items.map((item, i) => {
                const itemResult = results[keyOf(item, i)] || {};
                return {
                    item_order: item.order ?? i,
                    area: item.area,
                    task: item.task,
                    completed: itemResult.checked || false,
                    notes: itemResult.notes || '',
                    photo_urls: itemResult.photo_urls || (itemResult.photo_url ? [itemResult.photo_url] : []),
                    photo_url: (itemResult.photo_urls || [])[0] || itemResult.photo_url || null,
                    performed_by: itemResult.performed_by || itemResult.checked_by || '', // שם המבצע של המשימה הספציפית
                    ai_review: itemResult.ai_review || null,
                    timestamp: itemResult.checked_at || new Date().toISOString() // When this item was actually marked
                };
            });

            // סיכום בעיות
            const issues = items
                .filter((item, i) => !results[keyOf(item, i)]?.checked)
                .map(item => `${item.area} - ${item.task}`)
                .join('; ');

            const archiveData = {
                original_execution_id: executionId,
                checklist_title: checklist.title,
                executed_by_name: user?.full_name || 'משתמש לא ידוע',
                approving_manager_name: approvingManagerName,
                executed_by_id: user?.id || 'unknown',
                execution_date: new Date().toISOString(),
                shift_type: shiftType,
                overall_score: score,
                total_items: items.length,
                completed_items: completedItems,
                failed_items: failedItems,
                critical_failures: criticalFailures,
                // Calculate completion time from when the component loaded (startTime) to now
                completion_time_minutes: completionMinutes,
                detailed_results: detailedResults,
                general_notes: notes, // This refers to the overall notes state
                follow_up_required: Object.values(results).some(r => r && r.requires_followup),
                issues_summary: issues || 'אין בעיות',
                ai_summary: summaryText || aiSummary || ''
            };

            await ChecklistExecutionArchive.create(archiveData);
            console.log('רשומת ארכיון נוצרה בהצלחה');

        } catch (error) {
            console.error('שגיאה ביצירת רשומת ארכיון:', error);
        }
    };

    if (!currentItem) {
        return <div>שגיאה: לא נמצאו פריטים בצ'קליסט</div>;
    }

    if (hydrating) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-[#F4ECD8] to-[#F4ECD8] flex items-center justify-center" dir="rtl">
                <div className="text-center space-y-3">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
                    <p className="text-gray-600 font-medium">טוען את ההתקדמות המשותפת...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-[#F4ECD8] to-[#F4ECD8] p-4" dir="rtl">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="space-y-3">
                    {/* Clear, always-visible back button — lets a confused user return
                        to the checklist list to pick a different one (olive&fig UX request). */}
                    <button
                        onClick={onCancel}
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 hover:text-emerald-900 bg-white/70 hover:bg-white rounded-lg px-3 py-1.5 shadow-sm border border-emerald-200"
                    >
                        <ArrowRight className="w-4 h-4" />
                        חזרה לצ'קליסטים
                    </button>
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{checklist.title}</h1>
                            {execId && <p className="text-xs text-emerald-700 font-semibold mt-0.5">🔄 נשמר חי — כל הצוות רואה את אותה התקדמות</p>}
                        </div>
                        {isManager && (
                            <Button variant="outline" size="sm" onClick={restartChecklist} className="text-orange-600 border-orange-300 hover:bg-orange-50">
                                <RotateCcw className="w-4 h-4 ml-1.5" />
                                התחל מחדש
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Progress value={progress} className="w-full" />
                    <p className="text-sm text-gray-600 text-center">
                        פריט {currentItemIndex + 1} מתוך {items.length}
                    </p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-xl mb-2">
                                    {currentItem.area} - {currentItem.task}
                                </CardTitle>
                                <p className="text-gray-600">{currentItem.description}</p>
                                {currentItem.assigned_to_employee_name && (
                                     <div className="mt-2 flex items-center gap-2 text-sm text-blue-700 font-semibold p-2 bg-blue-50 rounded-lg">
                                        <UserIcon className="w-4 h-4"/>
                                        <span>משויך ל: {currentItem.assigned_to_employee_name}</span>
                                    </div>
                                )}
                                {results[curKey]?.checked && results[curKey]?.checked_by && (
                                    <div className="mt-2 text-xs text-emerald-700 font-semibold">
                                        ✓ סומן ע"י {results[curKey].checked_by}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                {currentItem.critical && (
                                    <Badge className="bg-red-100 text-red-800">קריטי</Badge>
                                )}
                                {currentItem.requires_photo_evidence && (
                                    <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1"><Camera className="w-3 h-3" /> צילום חובה</Badge>
                                )}
                                <Badge variant="outline">{currentItem.points} נקודות</Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {currentItem.help_text && (
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-sm text-blue-800">
                                    💡 {currentItem.help_text}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-center space-x-4">
                            <Button
                                variant={results[curKey]?.checked ? "default" : "outline"}
                                size="lg"
                                onClick={() => handleItemCheck(true)}
                                className="min-w-32"
                            >
                                <CheckSquare className="w-5 h-5 mr-2" />
                                הושלם
                            </Button>
                            <Button
                                variant={results[curKey]?.checked === false ? "destructive" : "outline"}
                                size="lg"
                                onClick={() => handleItemCheck(false)}
                                className="min-w-32"
                            >
                                <AlertTriangle className="w-5 h-5 mr-2" />
                                לא הושלם
                            </Button>
                        </div>

                        {photoWarn && (
                            <div className="flex items-center justify-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                <Camera className="w-4 h-4" /> המשימה מסומנת "צילום חובה" — צריך להוסיף תמונה לפני שמסמנים "הושלם".
                            </div>
                        )}

                        <div className="space-y-2">
                            <h4 className="font-semibold">מי ביצע את המשימה?</h4>
                            <Input
                                placeholder="שם המלצר/ה שביצע/ה את המשימה (אופציונלי)"
                                value={results[curKey]?.performed_by || ''}
                                onChange={(e) => handlePerformerChange(e.target.value)}
                                onBlur={() => patchItem(curKey, { performed_by: results[curKey]?.performed_by || '' })}
                                className="bg-blue-50 focus:ring-blue-500"
                            />
                        </div>

                        {/* Photo upload - multiple photos */}
                        <div className="space-y-4 p-4 bg-gray-50 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-gray-600"/>
                                    תמונות ({(results[curKey]?.photo_urls || []).length})
                                </h4>
                                <Button
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {uploading ? 'מעלה...' : 'הוסף תמונה'}
                                </Button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => { handlePhotoUpload(e.target.files?.[0]); e.target.value = ''; }}
                                className="hidden"
                            />
                            {(results[curKey]?.photo_urls || []).length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {(results[curKey]?.photo_urls || []).map((url, i) => (
                                        <div key={i} className="relative group">
                                            <img src={url} alt={`תמונה ${i + 1}`} className="w-full h-20 object-cover rounded-lg border" />
                                            <button
                                                onClick={() => handleRemovePhoto(i)}
                                                className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* AI review: reference block + spinner + verdict (advisory) */}
                        {currentItem.ai_review && (currentItem.reference_photo_urls?.length || currentItem.expected_criteria) && (
                            <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
                                {currentItem.expected_criteria && <div className="mb-1">🎯 <b>נדרש:</b> {currentItem.expected_criteria}</div>}
                                {!!currentItem.reference_photo_urls?.length && (
                                    <div className="flex gap-2 flex-wrap">
                                        {currentItem.reference_photo_urls.map((u, i) => <img key={i} src={u} alt="ייחוס" className="w-16 h-16 object-cover rounded border" />)}
                                    </div>
                                )}
                            </div>
                        )}
                        {reviewing && <div className="mt-2 text-sm text-slate-500">🔍 בודק את התמונה...</div>}
                        {results[curKey]?.ai_review && (() => {
                            const v = results[curKey].ai_review;
                            const style = v.verdict === 'ok' ? 'bg-emerald-50 text-emerald-800' : v.verdict === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600';
                            const icon = v.verdict === 'ok' ? '✓' : v.verdict === 'attention' ? '⚠️' : '❓';
                            return <div className={`mt-2 p-2 rounded text-sm ${style}`}>{icon} {v.feedback} <span className="opacity-60">(המלצה בלבד)</span></div>;
                        })()}

                        <div className="space-y-2">
                            <h4 className="font-semibold">הערות (אופציונלי)</h4>
                            <Textarea
                                placeholder="הוסף הערות לגבי הפריט הזה..."
                                value={results[curKey]?.notes || ''}
                                onChange={(e) => handleNoteChange(e.target.value)}
                                onBlur={() => patchItem(curKey, { notes: results[curKey]?.notes || '' })}
                            />
                        </div>

                        {currentItemIndex === items.length - 1 && aiSummary && (
                            <div className="my-2 p-3 bg-indigo-50 border border-indigo-200 rounded text-sm whitespace-pre-line">
                                <b>🤖 סיכום AI לפני חתימה:</b>{'\n'}{aiSummary}
                            </div>
                        )}

                        {currentItemIndex === items.length - 1 && (
                            <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <Label htmlFor="manager-signature" className="font-bold text-yellow-800 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5" />
                                    אישור אחמ"ש
                                </Label>
                                <Input
                                    id="manager-signature"
                                    placeholder="הזן שם מלא של האחמ״ש המאשר"
                                    value={approvingManagerName}
                                    onChange={(e) => { mark(); setApprovingManagerName(e.target.value); }}
                                    required
                                />
                                <p className="text-xs text-yellow-700">חובה למלא שדה זה כדי לסיים את הצ'קליסט — הסיום סוגר את הריצה המשותפת ושולח לארכיון.</p>
                            </div>
                        )}


                        <div className="flex justify-between items-center pt-4">
                            <Button
                                variant="outline"
                                onClick={prevItem}
                                disabled={currentItemIndex === 0}
                            >
                                <ArrowRight className="w-4 h-4 mr-2" />
                                הקודם
                            </Button>

                            {currentItemIndex === items.length - 1 ? (
                                <Button onClick={saveExecution} disabled={saving} className="bg-green-600 hover:bg-green-700">
                                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    {saving ? 'שומר...' : 'סיים ושמור'}
                                </Button>
                            ) : (
                                <Button onClick={nextItem}>
                                    הבא
                                    <ArrowLeft className="w-4 h-4 ml-2" />
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">התקדמות כללית</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>פריטים שהושלמו:</span>
                                <span>{Object.values(results).filter(r => r && r.checked).length} / {items.length}</span>
                            </div>
                            <Progress value={calculateScore()} />
                            <div className="text-center text-sm text-gray-600">
                                ציון נוכחי: {calculateScore()}%
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
