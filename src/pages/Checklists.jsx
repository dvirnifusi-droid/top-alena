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
        const lines = importItemsText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!importTitle.trim() || !lines.length) return;
        setImportingCl(true);
        try {
            const items = lines.map((line, i) => {
                const isHeader = line.length < 40 && line === line.toUpperCase() && /[A-Za-zֽ-׿]/.test(line) && !/\d/.test(line);
                const text = isHeader ? `— ${line} —` : line;
                return { id: `it_${Math.random().toString(36).slice(2, 8)}`, order: i + 1, task: text, text, area: '', critical: false, is_required: !isHeader ? false : false };
            });
            await Checklist.create({
                title: importTitle.trim(), category: 'הזמנות', frequency: 'daily', status: 'active',
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-[#F4ECD8] to-[#F4ECD8] p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header מושלם */}
                <div className="text-center mb-12 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-blue-400/20 rounded-3xl -rotate-1"></div>
                    <div className="relative bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-lg border border-white/50">
                        <h1 className="text-5xl font-black text-transparent bg-gradient-to-r from-emerald-600 via-[#B89556] to-[#44512C] bg-clip-text mb-4 flex items-center justify-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-[#B89556] rounded-2xl flex items-center justify-center shadow-xl rotate-3 hover:rotate-0 transition-transform duration-500">
                                <CheckSquare className="w-8 h-8 text-white" />
                            </div>
                            רשימות בדיקה
                            <div className="w-16 h-16 bg-gradient-to-r from-[#B89556] to-[#44512C] rounded-2xl flex items-center justify-center shadow-xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                                <CheckSquare className="w-8 h-8 text-white" />
                            </div>
                        </h1>
                        <p className="text-xl text-gray-600 font-medium">ניהול מקצועי לצ'קליסטים יומיים בטעם של מקצועיות ✨</p>
                    </div>
                </div>

                <Tabs defaultValue="active" className="w-full space-y-6">
                    {/* טאבים - גריד 2x2 במובייל, שורה אחת בדסקטופ */}
                    <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-white/80 backdrop-blur-xl p-1.5 rounded-2xl border border-white/30 shadow-lg gap-1 h-auto">
                        <TabsTrigger value="active" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-emerald-500 data-[state=active]:text-white transition-all">
                            🎯 פעילים
                        </TabsTrigger>
                        <TabsTrigger value="procedures" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-orange-500 data-[state=active]:text-white transition-all">
                            📋 נהלים
                        </TabsTrigger>
                        <TabsTrigger value="archive" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-[#A04A2E] data-[state=active]:text-white transition-all">
                            🗂️ ארכיון
                        </TabsTrigger>
                        <TabsTrigger value="stats" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-[#44512C] data-[state=active]:text-white transition-all">
                            📊 סטטיסטיקות
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 'all', label: '🔁 הכל' },
                                    { value: 'morning', label: '🌅 בוקר' },
                                    { value: 'evening', label: '🌆 ערב' },
                                    { value: 'thursday', label: '🎉 חמישי' },
                                ].map(s => (
                                    <Button
                                        key={s.value}
                                        variant={shiftFilter === s.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setShiftFilter(s.value)}
                                        className="rounded-xl"
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
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Plus className="w-4 h-4 ml-1" /> צ'קליסט חדש
                                </Button>
                            </div>
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
                                        <label className="text-sm font-medium">פריטים (שורה לכל פריט; שורות ב-CAPS הופכות לכותרות קטגוריה)</label>
                                        <Textarea value={importItemsText} onChange={(e) => setImportItemsText(e.target.value)} rows={10} placeholder={'MEAT & POULTRY\nBeef — ribeye\nChicken thighs\nFISH & SEAFOOD\nSalmon fillet'} />
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
                        {/* Department chip row — second-level filter */}
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: 'all', label: '🗂️ כל המחלקות', color: 'gray' },
                                { value: 'floor', label: '🍽️ פלור', color: 'amber' },
                                { value: 'bar', label: '🍷 בר', color: 'rose' },
                                { value: 'kitchen', label: '🍳 מטבח', color: 'orange' },
                                { value: 'managers', label: '👔 מנהלים', color: 'blue' },
                            ].map(d => {
                                const isActive = deptFilter === d.value;
                                const palette = {
                                    gray: isActive ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                                    amber: isActive ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                                    rose: isActive ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100',
                                    orange: isActive ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100',
                                    blue: isActive ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                                };
                                return (
                                    <button
                                        key={d.value}
                                        onClick={() => setDeptFilter(d.value)}
                                        className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${palette[d.color]}`}
                                    >
                                        {d.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {checklists.filter(c => {
                                if (shiftFilter !== 'all' && c.shift && c.shift !== 'all' && c.shift !== shiftFilter) return false;
                                if (deptFilter !== 'all' && c.department !== deptFilter) return false;
                                return true;
                            }).map((checklist, index) => (
                                <div key={checklist.id} className="transform hover:scale-105 transition-all duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                                    <ChecklistCard
                                        checklist={checklist}
                                        onStart={startExecution}
                                        executions={executions.filter(e => e.checklist_id === checklist.id)}
                                        onEdit={handleEditChecklist}
                                        onDelete={handleDeleteChecklist}
                                        onAssignTasks={() => setAssigningTasksFor(checklist)}
                                    />
                                </div>
                            ))}
                        </div>
                        {checklists.length === 0 && (
                            <div className="text-center py-20">
                                <div className="w-32 h-32 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center mx-auto mb-6 opacity-50">
                                    <CheckSquare className="w-16 h-16 text-white" />
                                </div>
                                <p className="text-2xl text-gray-500 font-medium">אין צ'קליסטים פעילים כרגע</p>
                                <p className="text-gray-400 mt-2">צור צ'קליסט חדש או פעל קיימים</p>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="procedures">
                        {isMainAlena() ? (
                        <Card className="shadow-2xl border-0 bg-gradient-to-br from-white via-orange-50 to-red-50 backdrop-blur-sm overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-orange-600 via-red-600 to-[#A04A2E] text-white rounded-t-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-orange-400/20 to-red-400/20"></div>
                                <div className="flex justify-between items-center relative">
                                    <CardTitle className="text-3xl flex items-center gap-4 font-black">
                                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
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
                          <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-10 shadow-xl border border-white/50 text-center">
                            <FileText className="w-12 h-12 mx-auto text-orange-300 mb-3" />
                            <h3 className="text-xl font-bold text-slate-700 mb-1">אין נהלים עדיין</h3>
                            <p className="text-slate-500 mb-4">בנה נהלים משלך למסעדה — כמויות רטבים, אריזת משלוחים, הכנות ועוד.</p>
                            <Link to={createPageUrl("AiDashboard")}>
                              <Button className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                <Pencil className="w-4 h-4 mr-2" /> הוסף נוהל
                              </Button>
                            </Link>
                          </div>
                        )}
                    </TabsContent>

                    <TabsContent value="archive">
                        <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/50">
                            <ChecklistArchive />
                        </div>
                    </TabsContent>

                    <TabsContent value="stats">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <Card className="bg-gradient-to-br from-green-50 to-emerald-100 border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-3 text-emerald-800">
                                        <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                                            <CheckCircle className="w-6 h-6 text-white" />
                                        </div>
                                        הושלמו השבוע
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-4xl font-black text-emerald-600 mb-2">
                                        {executions.filter(e => e.status === 'completed').length}
                                    </div>
                                    <p className="text-emerald-700 font-medium">צ'קליסטים מושלמים ✨</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-orange-50 to-amber-100 border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-3 text-orange-800">
                                        <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg">
                                            <Clock className="w-6 h-6 text-white" />
                                        </div>
                                        בתהליך
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-4xl font-black text-orange-600 mb-2">
                                        {executions.filter(e => e.status === 'in_progress').length}
                                    </div>
                                    <p className="text-orange-700 font-medium">מתבצעים כעת 🔄</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-red-50 to-[#F4ECD8] border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-3 text-red-800">
                                        <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-[#A04A2E] rounded-xl flex items-center justify-center shadow-lg">
                                            <AlertTriangle className="w-6 h-6 text-white" />
                                        </div>
                                        דורשים תשומת לב
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-4xl font-black text-red-600 mb-2">
                                        {executions.filter(e => e.status === 'requires_attention').length}
                                    </div>
                                    <p className="text-red-700 font-medium">דרושה בדיקה 🚨</p>
                                </CardContent>
                            </Card>
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