import React, { useState, useEffect } from "react";
import { Checklist, ChecklistExecution } from "@/entities/all";
import PageGuard from "../components/shared/PageGuard";
import { isMainAlena } from "@/lib/tenant";
import { User } from "@/entities/User";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare, Clock, CheckCircle, AlertTriangle, FileText, Pencil, Plus, Sparkles, Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import ChecklistCard from "../components/checklists/ChecklistCard";
import ChecklistExecutionComponent from "../components/checklists/ChecklistExecution";
import ChecklistEditDialog from "../components/checklists/ChecklistEditDialog";
import ChecklistArchive from "../components/checklists/ChecklistArchive";
import TaskAssignmentDialog from "../components/checklists/TaskAssignmentDialog"; // Import the new dialog
import ChecklistLiveRun from "../components/checklists/ChecklistLiveRun";
import { Employee } from '@/entities/all'; // Import Employee entity

function ChecklistsInner() {
    const [checklists, setChecklists] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedChecklist, setSelectedChecklist] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingChecklist, setEditingChecklist] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [assigningTasksFor, setAssigningTasksFor] = useState(null);
    const [shiftFilter, setShiftFilter] = useState('all');
    // Department filter — 'all' | 'floor' | 'bar' | 'kitchen' | 'managers'
    const [deptFilter, setDeptFilter] = useState('all');
    const [aiSuggesting, setAiSuggesting] = useState(false);
    const [aiChecklists, setAiChecklists] = useState(null);
    const [importingCl, setImportingCl] = useState(false);
    const [showTextImport, setShowTextImport] = useState(false);
    const [liveRunChecklist, setLiveRunChecklist] = useState(null);
    const [importTitle, setImportTitle] = useState('Order List');
    const [importItemsText, setImportItemsText] = useState('');

    const runAiSuggestChecklists = async () => {
        setAiSuggesting(true);
        try {
            const res = await base44.functions.suggestChecklists({});
            const data = res?.data || res;
            const lists = (data?.checklists || []).map((c) => ({ ...c, selected: true }));
            setAiChecklists(lists);
        } catch (e) {
            alert('שגיאה: ' + (e?.message || ''));
        } finally {
            setAiSuggesting(false);
        }
    };

    const importChecklists = async () => {
        if (!aiChecklists) return;
        setImportingCl(true);
        const chosen = aiChecklists.filter((c) => c.selected);
        try {
            for (const c of chosen) {
                await Checklist.create({
                    title: c.name,
                    // category + frequency are required (no DB default) — the AI
                    // suggestion returns department/shift, so map department→category
                    // and default frequency to daily. Omitting these was throwing
                    // "Invalid prisma.checklist.create() invocation".
                    category: c.category || c.department || 'כללי',
                    frequency: c.frequency || 'daily',
                    description: `${c.department || ''} · ${c.shift || ''}`.replace(/^ · | · $/g, '').trim(),
                    department: c.department || null,
                    shift: c.shift || null,
                    // Carry every field the execution + assignment screens read
                    // (order/task/critical), not just text — otherwise they show blank.
                    items: (c.items || []).map((text, i) => ({ id: `it_${Math.random().toString(36).slice(2, 8)}`, order: i + 1, task: text, text, area: '', critical: false, is_required: false })),
                    status: 'active',
                });
            }
            setAiChecklists(null);
            loadData();
        } catch (e) {
            alert('שגיאה בייבוא: ' + (e?.message || ''));
        } finally {
            setImportingCl(false);
        }
    };

    // Create ONE checklist from a title + pasted items (one per line). Section
    // headers (ALL-CAPS lines / lines with no lowercase) become "— HEADER —"
    // separators so a categorized list (Order List by category) stays readable.
    const importFromText = async () => {
        const rawLines = importItemsText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!importTitle.trim() || !rawLines.length) return;
        setImportingCl(true);
        try {
            // Dish → sub-tasks. A line starting with a bullet (-, •, *, ▪) is a
            // sub-task under the current heading; any other line is a HEADING
            // (dish/section) and becomes the `area` that groups the sub-tasks
            // beneath it — works in Hebrew and English. Prefix ★ = critical.
            // If there are no bullets at all, treat every line as a flat item.
            const bullet = /^[-•*▪·]\s+/;
            const anyBullets = rawLines.some((l) => bullet.test(l));
            const items = [];
            let area = '';
            let ord = 0;
            const mk = (t, crit) => ({ id: `it_${Math.random().toString(36).slice(2, 8)}`, order: ++ord, task: t, text: t, area, critical: !!crit, is_required: false });
            for (const line of rawLines) {
                if (!anyBullets) { items.push(mk(line, false)); continue; }
                if (bullet.test(line)) {
                    const crit = line.includes('★');
                    const t = line.replace(bullet, '').replace(/^★\s*/, '').trim();
                    if (t) items.push(mk(t, crit));
                } else {
                    area = line.replace(/^\d+\.\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim();
                }
            }
            if (!items.length) { setImportingCl(false); return; }
            await Checklist.create({
                title: importTitle.trim(), category: 'operational', frequency: 'daily', status: 'active',
                department: 'kitchen', color: 'orange',
                description: 'יובא מטקסט', items,
            });
            setShowTextImport(false); setImportItemsText('');
            loadData();
        } catch (e) {
            alert('שגיאה בייבוא: ' + (e?.message || ''));
        } finally {
            setImportingCl(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const currentUser = await User.me();
            setUser(currentUser);
            
            const [checklistsData, executionsData, employeesData] = await Promise.all([
                Checklist.list().then(data => data.filter(c => c.title !== "צ'ק ליסט אריזת משלוחים" && c.status === 'active')),
                ChecklistExecution.list('-execution_date'),
                Employee.list()
            ]);

            setChecklists(checklistsData);
            setExecutions(executionsData);
            setEmployees(employeesData);

        } catch (error) {
            console.error('שגיאה בטעינת נתונים:', error);
        }
        setLoading(false);
    };

    // Live-ish: refresh executions every 15s (+ on focus) so the cards' progress
    // bars reflect what cooks are marking in the shared prep run right now.
    const refreshExecutions = async () => {
        try {
            const data = await ChecklistExecution.list('-execution_date');
            setExecutions((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        } catch { /* ignore poll errors */ }
    };
    useEffect(() => {
        const tick = () => { if (!document.hidden && !isExecuting) refreshExecutions(); };
        const iv = setInterval(tick, 15000);
        const onVis = () => { if (!document.hidden && !isExecuting) refreshExecutions(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', onVis);
        return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExecuting]);

    const startExecution = (checklist) => {
        setSelectedChecklist(checklist);
        setIsExecuting(true);
    };

    const finishExecution = () => {
        setIsExecuting(false);
        setSelectedChecklist(null);
        loadData(); // Refresh data
    };

    const handleEditChecklist = (checklist) => {
        setEditingChecklist(checklist);
    };

    const handleDeleteChecklist = async (checklistId) => {
        if (window.confirm("האם אתה בטוח שברצונך למחוק צ'קליסט זה?")) {
            try {
                await Checklist.delete(checklistId);
                loadData(); // Refresh data
            } catch (error) {
                console.error('Error deleting checklist:', error);
                alert("שגיאה במחיקת הצ'קליסט");
            }
        }
    };

    const handleSaveChecklist = async (checklistData) => {
        try {
            if (editingChecklist?.id) {
                await Checklist.update(editingChecklist.id, checklistData);
            } else {
                await Checklist.create({ ...checklistData, status: 'active' });
            }
            setEditingChecklist(null);
            loadData();
        } catch (error) {
            console.error('Error saving checklist:', error);
            alert('שגיאה בשמירת הצ\'קליסט');
        }
    };
    
    const handleSaveAssignments = async (checklistWithNewAssignments) => {
        try {
            // When updating items, the API expects a complete 'items' array
            // If the Checklist.update method supports partial updates, only send 'items'.
            // Otherwise, merge 'items' into the existing checklist object before sending.
            const updatedChecklist = { ...checklistWithNewAssignments, items: checklistWithNewAssignments.items };
            await Checklist.update(checklistWithNewAssignments.id, updatedChecklist);
            setAssigningTasksFor(null); // Close the dialog
            loadData(); // Refresh data to show updated assignments
            alert('השיוכים נשמרו בהצלחה!');
        } catch (error) {
            console.error('Error saving assignments:', error);
            alert('שגיאה בשמירת השיוכים');
        }
    };


    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-[#F4ECD8] to-[#F4ECD8] flex justify-center items-center">
                <div className="text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-[#B89556] rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                        <CheckSquare className="w-10 h-10 text-white animate-bounce" />
                    </div>
                    <p className="text-gray-700 text-lg font-medium">טוען צ'קליסטים נהדרים...</p>
                </div>
            </div>
        );
    }

    if (isExecuting && selectedChecklist) {
        return (
            <ChecklistExecutionComponent
                checklist={selectedChecklist}
                user={user}
                onComplete={finishExecution}
                onCancel={finishExecution}
            />
        );
    }

    // Active-tab list after applying the shift + department filters. Computed once
    // so the grid and the "no results" empty state stay in sync.
    const visibleChecklists = checklists.filter(c => {
        if (shiftFilter !== 'all' && c.shift && c.shift !== 'all' && c.shift !== shiftFilter) return false;
        if (deptFilter !== 'all' && c.department !== deptFilter) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#FAF5E8] to-[#F4ECD8] p-4 md:p-8" dir="rtl">
            {/* Alena's signature serif for headings (premium, restaurant feel). */}
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&display=swap'); .chk-serif{font-family:'Frank Ruhl Libre',serif;letter-spacing:-0.01em}`}</style>
            <div className="max-w-7xl mx-auto">
                {/* Header — clean, warm and restrained to match the app's line */}
                <div className="mb-6 md:mb-8 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#44512C] flex items-center justify-center shadow-sm shrink-0">
                        <CheckSquare className="w-6 h-6 text-[#F4ECD8]" />
                    </div>
                    <div>
                        <h1 className="chk-serif text-2xl md:text-3xl font-black text-[#1F1B17] leading-tight">רשימות בדיקה</h1>
                        <p className="text-sm text-[#7A6F5D]">ניהול הצ'קליסטים היומיים של המסעדה</p>
                    </div>
                </div>

                <Tabs defaultValue="active" className="w-full space-y-6">
                    {/* טאבים - גריד 2x2 במובייל, שורה אחת בדסקטופ */}
                    <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-white p-1.5 rounded-2xl border border-[#E8D9B5] shadow-sm gap-1 h-auto">
                        <TabsTrigger value="active" className="py-2.5 px-3 text-sm font-bold rounded-xl text-[#7A6F5D] data-[state=active]:bg-[#44512C] data-[state=active]:text-white transition-all">
                            🎯 פעילים
                        </TabsTrigger>
                        <TabsTrigger value="procedures" className="py-2.5 px-3 text-sm font-bold rounded-xl text-[#7A6F5D] data-[state=active]:bg-[#44512C] data-[state=active]:text-white transition-all">
                            📋 נהלים
                        </TabsTrigger>
                        <TabsTrigger value="archive" className="py-2.5 px-3 text-sm font-bold rounded-xl text-[#7A6F5D] data-[state=active]:bg-[#44512C] data-[state=active]:text-white transition-all">
                            🗂️ ארכיון
                        </TabsTrigger>
                        <TabsTrigger value="stats" className="py-2.5 px-3 text-sm font-bold rounded-xl text-[#7A6F5D] data-[state=active]:bg-[#44512C] data-[state=active]:text-white transition-all">
                            📊 סטטיסטיקות
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                                <span className="text-xs font-bold text-gray-500 self-center">משמרת</span>
                                {[
                                    { value: 'all', label: '🔁 הכל' },
                                    { value: 'morning', label: '🌅 בוקר' },
                                    { value: 'evening', label: '🌆 ערב' },
                                    { value: 'thursday', label: '🎉 חמישי' },
                                ].map(s => (
                                    <Button
                                        key={s.value}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShiftFilter(s.value)}
                                        className={`rounded-xl ${shiftFilter === s.value ? 'bg-[#44512C] hover:bg-[#3a4526] text-white border-[#44512C]' : 'border-[#E8D9B5] text-[#7A6F5D]'}`}
                                    >
                                        {s.label}
                                    </Button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button variant="outline" onClick={runAiSuggestChecklists} disabled={aiSuggesting} className="gap-1">
                                    {aiSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {aiSuggesting ? 'AI...' : 'הצע לפי הפרופיל'}
                                </Button>
                                <Button variant="outline" onClick={() => setShowTextImport((v) => !v)} className="gap-1">
                                    <Upload className="w-4 h-4" /> ייבוא מטקסט
                                </Button>
                                <Button
                                    onClick={() => setEditingChecklist({})}
                                    className="bg-[#A04A2E] hover:bg-[#8B3D24] text-white"
                                >
                                    <Plus className="w-4 h-4 ml-1" /> צ'קליסט חדש
                                </Button>
                            </div>
                        </div>
                        {/* Department chip row — sits directly under the shift filters */}
                        <div className="flex flex-wrap gap-2">
                            <span className="text-xs font-bold text-gray-500 self-center">מחלקה</span>
                            {[
                                { value: 'all', label: '🗂️ כל המחלקות' },
                                { value: 'floor', label: '🍽️ פלור' },
                                { value: 'bar', label: '🍷 בר' },
                                { value: 'kitchen', label: '🍳 מטבח' },
                                { value: 'managers', label: '👔 מנהלים' },
                            ].map(d => {
                                const isActive = deptFilter === d.value;
                                return (
                                    <button
                                        key={d.value}
                                        onClick={() => setDeptFilter(d.value)}
                                        className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-colors ${
                                            isActive
                                                ? 'bg-[#A04A2E] border-[#A04A2E] text-white'
                                                : 'bg-white border-[#E8D9B5] text-[#7A6F5D] hover:border-[#D9BD83]'
                                        }`}
                                    >
                                        {d.label}
                                    </button>
                                );
                            })}
                        </div>
                        {showTextImport && (
                            <Card className="mb-4 border-emerald-200 bg-white/80">
                                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> ייבוא צ'קליסט מטקסט</CardTitle></CardHeader>
                                <CardContent className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium">שם הצ'קליסט</label>
                                        <Input value={importTitle} onChange={(e) => setImportTitle(e.target.value)} placeholder="Order List" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">פריטים — כתוב <b>כותרת מנה/קבוצה</b> בשורה, ותחתיה כל תת-משימה עם <code>-</code>. (★ בתחילת שורה = קריטי)</label>
                                        <Textarea value={importItemsText} onChange={(e) => setImportItemsText(e.target.value)} rows={10} placeholder={"פוקאצ'ה\n- לאפות פוקאצ'ה\n- ריבה עונתית\n- טחינה גולמית\n\nצלחת חריפים\n- סחוג\n- צ'ילי קלוי\n- שיפקה"} />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setShowTextImport(false)}>ביטול</Button>
                                        <Button size="sm" onClick={importFromText} disabled={importingCl || !importItemsText.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                            {importingCl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא צ׳קליסט'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {aiChecklists && (
                            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold flex items-center gap-1">
                                        <Sparkles className="w-4 h-4 text-amber-600" /> הצעות AI ({aiChecklists.length})
                                    </h3>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => { const allSel = aiChecklists.every(c => c.selected); setAiChecklists(aiChecklists.map(c => ({ ...c, selected: !allSel }))); }}>בחר הכל / נקה</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setAiChecklists(null)}>ביטול</Button>
                                        <Button size="sm" onClick={importChecklists} disabled={importingCl || !aiChecklists.some(c => c.selected)}>
                                            {importingCl ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                                            ייבא נבחרים
                                        </Button>
                                    </div>
                                </div>
                                {aiChecklists.map((c, i) => (
                                    <label key={i} className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={c.selected}
                                            onChange={(e) => {
                                                const next = [...aiChecklists];
                                                next[i] = { ...c, selected: e.target.checked };
                                                setAiChecklists(next);
                                            }}
                                            className="mt-1"
                                        />
                                        <div className="flex-1">
                                            <div className="font-bold text-sm">{c.name}</div>
                                            <div className="text-xs text-slate-500 mb-1">{c.department} · {c.shift}</div>
                                            <ul className="text-xs text-slate-600 list-disc mr-4">
                                                {(c.items || []).map((it, j) => <li key={j}>{it}</li>)}
                                            </ul>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {visibleChecklists.map((checklist) => (
                                <div key={checklist.id} className="transform transition-all duration-500">
                                    <ChecklistCard
                                        checklist={checklist}
                                        onStart={startExecution}
                                        executions={executions.filter(e => e.checklist_id === checklist.id)}
                                        onEdit={handleEditChecklist}
                                        onDelete={handleDeleteChecklist}
                                        onAssignTasks={() => setAssigningTasksFor(checklist)}
                                        onLiveRun={setLiveRunChecklist}
                                    />
                                </div>
                            ))}
                        </div>
                        {checklists.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="w-32 h-32 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center mx-auto mb-6 opacity-50">
                                    <CheckSquare className="w-16 h-16 text-white" />
                                </div>
                                <p className="text-2xl text-gray-500 font-medium">אין צ'קליסטים פעילים כרגע</p>
                                <p className="text-gray-400 mt-2">צור צ'קליסט חדש או פעל קיימים</p>
                            </div>
                        ) : visibleChecklists.length === 0 && (
                            <div className="text-center py-16">
                                <p className="text-xl text-gray-500 font-medium mb-4">אין צ'קליסטים בסינון הזה</p>
                                <Button
                                    variant="outline"
                                    onClick={() => { setShiftFilter('all'); setDeptFilter('all'); }}
                                >
                                    נקה סינון
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="procedures">
                        {isMainAlena() ? (
                        <Card className="shadow-sm border border-[#E8D9B5] bg-white overflow-hidden rounded-2xl">
                            <CardHeader className="bg-[#44512C] text-white rounded-t-lg relative overflow-hidden">
                                <div className="flex justify-between items-center relative">
                                    <CardTitle className="chk-serif text-2xl md:text-3xl flex items-center gap-4 font-black">
                                        <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center">
                                            <FileText className="w-7 h-7" />
                                        </div>
                                        נוהל אריזת משלוחים - רטבים ותוספות
                                    </CardTitle>
                                    <Link to={createPageUrl("AiDashboard")}>
                                        <Button variant="outline" className="bg-white/20 text-white hover:bg-white hover:text-orange-600 transition-all duration-300 border-white/30 font-bold">
                                            <Pencil className="w-4 h-4 mr-2" />
                                            ערוך נוהל
                                        </Button>
                                    </Link>
                                </div>
                                <CardDescription className="text-orange-100 text-lg relative">
                                    כמויות מדויקות של רטבים ותוספות לכל מנה במשלוח 🍽️
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* עמודה ראשונה */}
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                                            🥗 מנות עיקריות
                                        </h3>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">חציל</span>
                                                <span className="text-orange-600 font-semibold">2 טחינה</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">פרנה ומטבלים</span>
                                                <span className="text-orange-600 font-semibold">2 שום קונפי, 2 טחינות</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">בטטה בורלה</span>
                                                <span className="text-orange-600 font-semibold">1 טחינה</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">כרוב שרוף</span>
                                                <span className="text-orange-600 font-semibold">1 טחינה, 1 עמבה</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">תפוח אדמה קריספי</span>
                                                <span className="text-orange-600 font-semibold">2 איולי פסטו, 2 קטשופ, 2 מיונז</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">צ׳יפס מתובל</span>
                                                <span className="text-orange-600 font-semibold">3 קטשופ, 3 מיונז</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">עראייס אסאדו</span>
                                                <span className="text-orange-600 font-semibold">2 טחינה עמבה (או רגילה), 2 חריף</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* עמודה שנייה */}
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                                            🥙 סלטים ואחרות
                                        </h3>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">סלט שוק</span>
                                                <span className="text-orange-600 font-semibold">2 רוטב סלט</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">סלט סלקים</span>
                                                <span className="text-orange-600 font-semibold">2 רוטב סלט סלקים</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">סלט עלים</span>
                                                <span className="text-orange-600 font-semibold">2 רוטב סלט עלים</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">המבורגר קלאסי</span>
                                                <span className="text-orange-600 font-semibold">2 איולי, 2 קטשופ, 2 מיונז</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">עלינא בורגר</span>
                                                <span className="text-orange-600 font-semibold">2 איולי, 2 קטשופ, 2 מיונז</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">מועבט גדול</span>
                                                <span className="text-orange-600 font-semibold">2 פיתות, 2 טחינות, 2 עמבות</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                                <span className="font-medium">צלחת</span>
                                                <span className="text-orange-600 font-semibold">סלט, רוטב סלט, 2 טחינות, חריף</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* הנחיות מיוחדות */}
                                <div className="mt-8 p-6 bg-[#F4ECD8] rounded-lg border border-[#E8D9B5]">
                                    <h3 className="text-xl font-bold text-[#2E3819] mb-4">📋 הנחיות מיוחדות</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div className="p-4 bg-white rounded-lg border border-[#F4ECD8]">
                                                <h4 className="font-bold text-gray-800 mb-2">🥖 פרנה בשרים</h4>
                                                <p className="text-sm text-gray-600">• לצד מנה: טחינה 1 בלבד</p>
                                                <p className="text-sm text-gray-600">• במשלוח: הטחינה שביקשו בפנים</p>
                                            </div>
                                            
                                            <div className="p-4 bg-white rounded-lg border border-[#F4ECD8]">
                                                <h4 className="font-bold text-gray-800 mb-2">🥙 עלינא בפיתה</h4>
                                                <p className="text-sm text-gray-600">• לצד מנה: טחינה 1 בלבד</p>
                                                <p className="text-sm text-gray-600">• במשלוח (לא וולט): הטחינה שביקשו בפנים</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="p-4 bg-white rounded-lg border border-[#F4ECD8]">
                                                <h4 className="font-bold text-gray-800 mb-2">🥖 פרנה אסאדו</h4>
                                                <p className="text-sm text-gray-600">• איולי</p>
                                            </div>
                                            
                                            <div className="p-4 bg-white rounded-lg border border-[#F4ECD8]">
                                                <h4 className="font-bold text-gray-800 mb-2">🥙 פיתה ילדים</h4>
                                                <p className="text-sm text-gray-600">• לא שמים כלום כברירת מחדל</p>
                                                <p className="text-sm text-gray-600">• אם ביקשו טחינה בפנים → טחינה בפנים + עוד בצד</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4 p-4 bg-[#FAF5E8] rounded-lg border border-yellow-200">
                                        <h4 className="font-bold text-yellow-800 mb-2">💰 תוספת פיתה</h4>
                                        <p className="text-sm text-yellow-700">יש לחייב ב-3 שקלים</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        ) : (
                          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E8D9B5] text-center">
                            <FileText className="w-12 h-12 mx-auto text-[#D9BD83] mb-3" />
                            <h3 className="text-xl font-bold text-[#1F1B17] mb-1">אין נהלים עדיין</h3>
                            <p className="text-[#7A6F5D] mb-4">בנה נהלים משלך למסעדה — כמויות רטבים, אריזת משלוחים, הכנות ועוד.</p>
                            <Link to={createPageUrl("AiDashboard")}>
                              <Button className="bg-[#A04A2E] hover:bg-[#8B3D24] text-white font-bold">
                                <Pencil className="w-4 h-4 ml-2" /> הוסף נוהל
                              </Button>
                            </Link>
                          </div>
                        )}
                    </TabsContent>

                    <TabsContent value="archive">
                        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E8D9B5]">
                            <ChecklistArchive />
                        </div>
                    </TabsContent>

                    <TabsContent value="stats">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { icon: CheckCircle, tint: 'bg-emerald-50 text-emerald-600', num: 'text-emerald-600', label: 'הושלמו השבוע',
                                  value: executions.filter(e => e.status === 'completed' && e.execution_date && (Date.now() - new Date(e.execution_date).getTime()) < 7*24*60*60*1000).length },
                                { icon: Clock, tint: 'bg-[#F4ECD8] text-[#7A5A2E]', num: 'text-[#7A5A2E]', label: 'בתהליך כעת',
                                  value: executions.filter(e => e.status === 'in_progress').length },
                                { icon: AlertTriangle, tint: 'bg-rose-50 text-rose-600', num: 'text-rose-600', label: 'דורשים תשומת לב',
                                  value: executions.filter(e => e.status === 'requires_attention').length },
                            ].map((s, i) => (
                                <Card key={i} className="bg-white border border-[#E8D9B5] shadow-sm rounded-2xl">
                                    <CardContent className="p-5 flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.tint}`}>
                                            <s.icon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className={`text-4xl font-black leading-none ${s.num}`}>{s.value}</div>
                                            <p className="text-sm text-[#7A6F5D] mt-1">{s.label}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* דיאלוג עריכת צ'קליסט */}
            <ChecklistEditDialog
                isOpen={!!editingChecklist}
                checklist={editingChecklist}
                employees={employees}
                onClose={() => setEditingChecklist(null)}
                onSave={handleSaveChecklist}
            />

            {/* דיאלוג שיוך משימות */}
            <TaskAssignmentDialog
                isOpen={!!assigningTasksFor}
                checklist={assigningTasksFor}
                employees={employees}
                onClose={() => setAssigningTasksFor(null)}
                onSave={handleSaveAssignments}
            />
            {liveRunChecklist && (
                <ChecklistLiveRun
                    checklist={liveRunChecklist}
                    user={user}
                    onClose={() => setLiveRunChecklist(null)}
                />
            )}
        </div>
    );
}

export default function ChecklistsPage() {
    return (
        <PageGuard pageName="Checklists" pageTitle="צ'קליסטים">
            <ChecklistsInner />
        </PageGuard>
    );
}