import React, { useState, useEffect } from "react";
import { Checklist, ChecklistExecution } from "@/entities/all";
import { User } from "@/entities/User";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, Clock, CheckCircle, AlertTriangle, FileText, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import ChecklistCard from "../components/checklists/ChecklistCard";
import ChecklistExecutionComponent from "../components/checklists/ChecklistExecution";
import ChecklistEditDialog from "../components/checklists/ChecklistEditDialog";
import ChecklistArchive from "../components/checklists/ChecklistArchive";
import TaskAssignmentDialog from "../components/checklists/TaskAssignmentDialog"; // Import the new dialog
import { Employee } from '@/entities/all'; // Import Employee entity

export default function ChecklistsPage() {
    const [checklists, setChecklists] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedChecklist, setSelectedChecklist] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingChecklist, setEditingChecklist] = useState(null);
    const [employees, setEmployees] = useState([]); // Add state for employees
    const [assigningTasksFor, setAssigningTasksFor] = useState(null); // State for the new dialog

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
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-100 flex justify-center items-center">
                <div className="text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
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
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-100 p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header מושלם */}
                <div className="text-center mb-12 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-blue-400/20 rounded-3xl -rotate-1"></div>
                    <div className="relative bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-lg border border-white/50">
                        <h1 className="text-5xl font-black text-transparent bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 bg-clip-text mb-4 flex items-center justify-center gap-4">
                            <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl rotate-3 hover:rotate-0 transition-transform duration-500">
                                <CheckSquare className="w-8 h-8 text-white" />
                            </div>
                            רשימות בדיקה
                            <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-xl -rotate-3 hover:rotate-0 transition-transform duration-500">
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
                        <TabsTrigger value="archive" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-purple-500 data-[state=active]:text-white transition-all">
                            🗂️ ארכיון
                        </TabsTrigger>
                        <TabsTrigger value="stats" className="py-3 px-3 text-sm font-bold rounded-xl data-[state=active]:bg-blue-500 data-[state=active]:text-white transition-all">
                            📊 סטטיסטיקות
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-6">
                        <div className="flex justify-end">
                            <Button
                                onClick={() => setEditingChecklist({})}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <Plus className="w-4 h-4 ml-1" /> צ'קליסט חדש
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {checklists.map((checklist, index) => (
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
                        <Card className="shadow-2xl border-0 bg-gradient-to-br from-white via-orange-50 to-red-50 backdrop-blur-sm overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 text-white rounded-t-lg relative overflow-hidden">
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
                                <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
                                    <h3 className="text-xl font-bold text-blue-800 mb-4">📋 הנחיות מיוחדות</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div className="p-4 bg-white rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-gray-800 mb-2">🥖 פרנה בשרים</h4>
                                                <p className="text-sm text-gray-600">• לצד מנה: טחינה 1 בלבד</p>
                                                <p className="text-sm text-gray-600">• במשלוח: הטחינה שביקשו בפנים</p>
                                            </div>
                                            
                                            <div className="p-4 bg-white rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-gray-800 mb-2">🥙 עלינא בפיתה</h4>
                                                <p className="text-sm text-gray-600">• לצד מנה: טחינה 1 בלבד</p>
                                                <p className="text-sm text-gray-600">• במשלוח (לא וולט): הטחינה שביקשו בפנים</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="p-4 bg-white rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-gray-800 mb-2">🥖 פרנה אסאדו</h4>
                                                <p className="text-sm text-gray-600">• איולי</p>
                                            </div>
                                            
                                            <div className="p-4 bg-white rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-gray-800 mb-2">🥙 פיתה ילדים</h4>
                                                <p className="text-sm text-gray-600">• לא שמים כלום כברירת מחדל</p>
                                                <p className="text-sm text-gray-600">• אם ביקשו טחינה בפנים → טחינה בפנים + עוד בצד</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                        <h4 className="font-bold text-yellow-800 mb-2">💰 תוספת פיתה</h4>
                                        <p className="text-sm text-yellow-700">יש לחייב ב-3 שקלים</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
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

                            <Card className="bg-gradient-to-br from-red-50 to-pink-100 border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-3 text-red-800">
                                        <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
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