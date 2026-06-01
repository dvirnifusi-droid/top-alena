import React, { useState, useEffect } from 'react';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeBase, StaffQuestion, PendingQuestion, MenuItem, RestaurantInfo } from "@/entities/all";
import { Plus, Search, Brain, MessageSquare, BookOpen, Shield, Users, Coffee, Settings, Trash2, Edit, Utensils, CheckCircle, Info, RefreshCw } from "lucide-react";
import { refreshGeminiFiles } from "@/functions/refreshGeminiFiles";
import AiDailySummaryWidget from "@/components/dashboard/AiDailySummaryWidget";
import AiAssistantFilesManager from "@/components/ai-assistant/AiAssistantFilesManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


function AiDashboardInner() {
    const [knowledgeItems, setKnowledgeItems] = useState([]);
    const [recentQuestions, setRecentQuestions] = useState([]);
    const [pendingQuestions, setPendingQuestions] = useState([]);
    const [menuItems, setMenuItems] = useState([]); // State for menu items
    const [restaurantInfo, setRestaurantInfo] = useState([]); // New state for restaurant info
    const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false); // New dialog state
    const [editingMenuItem, setEditingMenuItem] = useState(null);
    const [editingInfo, setEditingInfo] = useState(null); // New editing state
    const [menuFormData, setMenuFormData] = useState({
        name: '',
        category: '',
        price: '',
        description: '',
        is_recommended: false,
        talking_points: ''
    });
    const [infoFormData, setInfoFormData] = useState({ // New form data
        info_type: '',
        title: '',
        content: '',
        is_active: true,
        priority: 'medium',
        keywords: ''
    });
    const [formState, setFormState] = useState({
        category: '',
        title: '',
        content: '',
        keywords: ''
    });
    const [newQA, setNewQA] = useState({
        question: '',
        answer: '',
        keywords: ''
    });
    const [isAdding, setIsAdding] = useState(false);
    const [isAddingQA, setIsAddingQA] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [pendingAnswers, setPendingAnswers] = useState({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshResult, setRefreshResult] = useState(null);

    const handleRefreshGeminiFiles = async () => {
        setIsRefreshing(true);
        setRefreshResult(null);
        try {
            const res = await refreshGeminiFiles({});
            setRefreshResult({ success: true, count: res.data?.files?.length || 0 });
        } catch (e) {
            setRefreshResult({ success: false, error: e.message });
        }
        setIsRefreshing(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [knowledge, questions, pending, menu, info] = await Promise.all([
                KnowledgeBase.list('-last_updated'),
                StaffQuestion.list('-created_date', 20),
                PendingQuestion.filter({ status: 'pending' }, '-created_date').catch(() => []), // Gracefully handle if PendingQuestion fails
                MenuItem.list().catch(() => []), // Gracefully handle if MenuItem fails
                RestaurantInfo.filter({ is_active: true }).catch(() => []) // Load restaurant info
            ]);
            
            setKnowledgeItems(knowledge);
            setRecentQuestions(questions);
            setPendingQuestions(pending);
            setMenuItems(menu);
            setRestaurantInfo(info);
            // Optionally, reset pending answers state when data is reloaded
            setPendingAnswers({}); 

        } catch (error) {
            console.error('Error loading data:', error);
            // General error handling if any part of Promise.all fails unexpectedly
            setKnowledgeItems([]);
            setRecentQuestions([]);
            setPendingQuestions([]);
            setMenuItems([]);
            setRestaurantInfo([]); // Clear restaurant info on error
        }
        setLoading(false);
    };

    const handleAnswerPendingQuestion = async (questionId, answer) => {
        try {
            const question = pendingQuestions.find(q => q.id === questionId);

            if (question) {
                // יצירת ידע חדש בבסיס הנתונים
                const knowledgeItem = await KnowledgeBase.create({
                    category: 'general', // מתחילים ככללי, אפשר לערוך אחר כך
                    title: question.question,
                    content: answer,
                    keywords: question.question.split(' ').filter(word => word.length > 3), // מילות מפתח אוטומטיות
                    last_updated: new Date().toISOString(),
                    updated_by: 'admin' // In a real app, this would be the logged-in user
                });

                // עדכון השאלה הממתינה
                await PendingQuestion.update(questionId, {
                    status: 'processed',
                    admin_answer: answer,
                    knowledge_base_id: knowledgeItem.id
                });

                loadData(); // רענון הנתונים
                alert('התשובה נשמרה בהצלחה! דביר יוכל לענות על השאלה הזו בפעם הבאה.');
            }
        } catch (error) {
            console.error('Error processing pending question:', error);
            alert('שגיאה בשמירת התשובה');
        }
    };

    const handleDeletePendingQuestion = async (questionId) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את השאלה הזו?')) {
            try {
                await PendingQuestion.delete(questionId);
                // מחיקה הצליחה - רענון הנתונים
                loadData();
            } catch (error) {
                console.error('Error deleting pending question:', error);
                
                // אם השגיאה היא 404 - השאלה כבר לא קיימת
                // יש לשים לב שאופן הטיפול בשגיאות תלוי באיך ה-API מחזיר אותן.
                // כאן מניחים ש-error.message יכיל מידע רלוונטי.
                if (error.message.includes('404') || error.message.toLowerCase().includes('not found')) {
                    // פשוט נרענן את הנתונים כדי להסיר אותה מהמסך
                    loadData();
                } else {
                    // שגיאה אחרת - נציג הודעה למשתמש
                    alert('שגיאה במחיקת השאלה: ' + error.message);
                }
            }
        }
    };

    const handleItemSubmit = async () => {
        const dataToSubmit = {
            ...formState,
            keywords: formState.keywords.split(',').map(k => k.trim()).filter(k => k !== ''),
            last_updated: new Date().toISOString(),
            updated_by: 'admin'
        };

        try {
            if (editingItem) {
                // Update existing item
                await KnowledgeBase.update(editingItem.id, dataToSubmit);
            } else {
                // Create new item
                if (!formState.title || !formState.content || !formState.category) return;
                await KnowledgeBase.create(dataToSubmit);
            }

            setFormState({ category: '', title: '', content: '', keywords: '' });
            setIsAdding(false);
            setEditingItem(null);
            loadData();
        } catch (error) {
            console.error('Error submitting item:', error);
        }
    };

    const handleEditClick = (item) => {
        setEditingItem(item);
        setFormState({
            ...item,
            // Ensure keywords are an array before joining, and join them for the input field
            keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : '',
        });
        setIsAdding(true); // Open the form for editing
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to the form
    };

    const handleAddNewClick = () => {
        setEditingItem(null); // Clear any editing state
        setFormState({ category: '', title: '', content: '', keywords: '' }); // Clear form fields
        setIsAdding(true); // Open the form for adding
    };

    const cancelForm = () => {
        setEditingItem(null); // Clear editing state
        setIsAdding(false); // Close the form
        setFormState({ category: '', title: '', content: '', keywords: '' }); // Clear form fields
    };

    const handleAddQA = async () => {
        if (!newQA.question || !newQA.answer) return;

        try {
            await KnowledgeBase.create({
                category: 'qa_pairs',
                title: newQA.question,
                content: newQA.answer,
                keywords: newQA.keywords.split(',').map(k => k.trim()).filter(k => k !== ''),
                last_updated: new Date().toISOString(),
                updated_by: 'admin'
            });

            setNewQA({ question: '', answer: '', keywords: '' });
            setIsAddingQA(false);
            loadData();
        } catch (error) {
            console.error('Error adding Q&A:', error);
        }
    };

    const deleteItem = async (id) => {
        try {
            await KnowledgeBase.delete(id);
            loadData();
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    };

    const handleOpenMenuDialog = (item = null) => {
        if (item) {
            setEditingMenuItem(item);
            setMenuFormData({
                name: item.name || '',
                category: item.category || '',
                price: item.price !== undefined ? String(item.price) : '', // Convert price to string for input
                description: item.description || '',
                is_recommended: item.is_recommended || false,
                talking_points: item.talking_points || ''
            });
        } else {
            setEditingMenuItem(null);
            setMenuFormData({
                name: '', category: '', price: '', description: '', is_recommended: false, talking_points: ''
            });
        }
        setIsMenuDialogOpen(true);
    };

    const handleSaveMenuItem = async () => {
        const dataToSave = {
            ...menuFormData,
            price: parseFloat(menuFormData.price) || 0,
            cost: (parseFloat(menuFormData.price) || 0) * 0.3, // Default cost logic
        };

        if (!dataToSave.name || !dataToSave.category || dataToSave.price <= 0) {
            alert('נא למלא שם, קטגוריה ומחיר תקין.');
            return;
        }

        try {
            if (editingMenuItem) {
                await MenuItem.update(editingMenuItem.id, dataToSave);
            } else {
                await MenuItem.create(dataToSave);
            }
            setIsMenuDialogOpen(false);
            loadData();
        } catch (error) {
            console.error("Failed to save menu item", error);
            alert("שגיאה בשמירת פריט התפריט.");
        }
    };
    
    const handleDeleteMenuItem = async (itemId) => {
        if (window.confirm("האם למחוק פריט זה מהתפריט?")) {
            try {
                await MenuItem.delete(itemId);
                loadData();
            } catch (error) {
                console.error("Failed to delete menu item", error);
                alert("שגיאה במחיקת פריט.");
            }
        }
    };

    // New functions for restaurant info management
    const handleOpenInfoDialog = (item = null) => {
        if (item) {
            setEditingInfo(item);
            setInfoFormData({
                info_type: item.info_type || '',
                title: item.title || '',
                content: item.content || '',
                is_active: item.is_active !== undefined ? item.is_active : true,
                priority: item.priority || 'medium',
                keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : ''
            });
        } else {
            setEditingInfo(null);
            setInfoFormData({
                info_type: '', title: '', content: '', is_active: true, priority: 'medium', keywords: ''
            });
        }
        setIsInfoDialogOpen(true);
    };

    const handleSaveRestaurantInfo = async () => {
        const dataToSave = {
            ...infoFormData,
            keywords: infoFormData.keywords.split(',').map(k => k.trim()).filter(k => k !== '')
        };

        if (!dataToSave.info_type || !dataToSave.title || !dataToSave.content) {
            alert('נא למלא את כל השדות הנדרשים.');
            return;
        }

        try {
            if (editingInfo) {
                await RestaurantInfo.update(editingInfo.id, dataToSave);
            } else {
                await RestaurantInfo.create(dataToSave);
            }
            setIsInfoDialogOpen(false);
            loadData();
        } catch (error) {
            console.error("Failed to save restaurant info", error);
            alert("שגיאה בשמירת המידע.");
        }
    };
    
    const handleDeleteRestaurantInfo = async (itemId) => {
        if (window.confirm("האם למחוק את המידע הזה?")) {
            try {
                await RestaurantInfo.delete(itemId);
                loadData();
            } catch (error) {
                console.error("Failed to delete restaurant info", error);
                alert("שגיאה במחיקת המידע.");
            }
        }
    };


    const categoryIcons = {
        menu: Coffee,
        procedures: BookOpen,
        policies: Shield,
        safety: Shield,
        customer_service: Users,
        technical: Settings,
        training: Brain,
        general: MessageSquare,
        qa_pairs: MessageSquare
    };

    const categoryColors = {
        menu: 'bg-orange-100 text-orange-800',
        procedures: 'bg-blue-100 text-blue-800',
        policies: 'bg-purple-100 text-purple-800',
        safety: 'bg-red-100 text-red-800',
        customer_service: 'bg-green-100 text-green-800',
        technical: 'bg-gray-100 text-gray-800',
        training: 'bg-indigo-100 text-indigo-800',
        general: 'bg-yellow-100 text-yellow-800',
        qa_pairs: 'bg-pink-100 text-pink-800'
    };

    const infoTypeLabels = {
        kashrut: 'כשרויות',
        hours: 'שעות פעילות',
        location: 'מיקום וגישה',
        policies: 'מדיניות',
        general: 'מידע כללי',
        special_services: 'שירותים מיוחדים',
        reservations: 'הזמנות',
        payment: 'תשלום',
        accessibility: 'נגישות'
    };

    const priorityColors = {
        low: 'bg-gray-100 text-gray-800',
        medium: 'bg-blue-100 text-blue-800',
        high: 'bg-orange-100 text-orange-800',
        critical: 'bg-red-100 text-red-800'
    };

    const filteredItems = knowledgeItems.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.keywords && Array.isArray(item.keywords) && item.keywords.some(keyword => keyword.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
                        <Brain className="w-10 h-10 text-blue-600" />
                        מרכז בקרת AI
                    </h1>
                    <p className="text-gray-600 text-lg">ניהול בסיס הידע של המערכת החכמה</p>
                    <div className="mt-4 flex flex-col items-center gap-2">
                        <Button
                            onClick={handleRefreshGeminiFiles}
                            disabled={isRefreshing}
                            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            {isRefreshing ? 'מעדכן קבצים מ-Drive...' : '🔄 רענן קבצי Gemini מ-Drive עכשיו'}
                        </Button>
                        {refreshResult && (
                            <p className={`text-sm font-medium ${refreshResult.success ? 'text-green-600' : 'text-red-600'}`}>
                                {refreshResult.success ? `✅ עודכנו ${refreshResult.count} קבצים בהצלחה!` : `❌ שגיאה: ${refreshResult.error}`}
                            </p>
                        )}
                    </div>
                </div>

                {/* AI Daily Summary */}
                <AiDailySummaryWidget />

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-blue-100">פריטי ידע</p>
                                    <p className="text-3xl font-bold">{knowledgeItems.length}</p>
                                </div>
                                <BookOpen className="w-10 h-10 text-blue-200" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-green-100">שאלות השבוע</p>
                                    <p className="text-3xl font-bold">{recentQuestions.length}</p>
                                </div>
                                <MessageSquare className="w-10 h-10 text-green-200" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-purple-100">מתכונים</p>
                                    <p className="text-3xl font-bold">{knowledgeItems.filter(item => item.category === 'menu').length}</p>
                                </div>
                                <Coffee className="w-10 h-10 text-purple-200" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-red-500 to-pink-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-red-100">שאלות ממתינות</p>
                                    <p className="text-3xl font-bold">{pendingQuestions.length}</p>
                                </div>
                                <MessageSquare className="w-10 h-10 text-red-200" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* שאלות ממתינות לטיפול - עם שיפור קל */}
                {pendingQuestions.length > 0 && (
                    <Card className="shadow-xl border-2 border-red-500 bg-red-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-red-700">
                                <MessageSquare className="w-6 h-6 animate-pulse" />
                                שאלות שדביר לא הצליח לענות - מחכות לתשובה שלך!
                            </CardTitle>
                            <CardDescription className="text-red-600">
                                למד את דביר את התשובות האלה, והוא ידע אותן לפעם הבאה.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {pendingQuestions.map((question) => (
                                    <div key={question.id} className="border rounded-lg p-4 bg-white shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="font-semibold text-gray-800">שאלה: {question.question}</h3>
                                                <p className="text-sm text-gray-500 mt-1">נשאל על ידי: {question.asked_by || 'לא ידוע'}</p>
                                                <p className="text-xs text-gray-400 mt-1">{new Date(question.created_date).toLocaleString('he-IL')}</p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:bg-red-100 flex-shrink-0"
                                                onClick={() => handleDeletePendingQuestion(question.id)}
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            <Textarea
                                                placeholder="הכנס את התשובה המדויקת כאן..."
                                                value={pendingAnswers[question.id] || ''} // Use state for value
                                                onChange={(e) => setPendingAnswers(prev => ({ ...prev, [question.id]: e.target.value }))} // Update state on change
                                                className="bg-white focus:ring-red-500"
                                            />
                                            <Button
                                                onClick={() => {
                                                    const answer = pendingAnswers[question.id] || ''; // Read from state
                                                    if (answer.trim()) {
                                                        handleAnswerPendingQuestion(question.id, answer);
                                                    } else {
                                                        alert('אנא הכנס תשובה');
                                                    }
                                                }}
                                                className="bg-red-600 hover:bg-red-700"
                                            >
                                                שמור תשובה ולמד את דביר
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Management Tabs */}
                <Tabs defaultValue="menu" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-white/80 via-white/60 to-white/80 backdrop-blur-xl p-2 h-auto rounded-2xl border border-white/20 shadow-xl">
                        <TabsTrigger value="menu" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white transition-all duration-300">
                            🍽️ ניהול תפריט
                        </TabsTrigger>
                        <TabsTrigger value="info" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white transition-all duration-300">
                            📋 מידע כללי על המסעדה
                        </TabsTrigger>
                        <TabsTrigger value="files" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white transition-all duration-300">
                            📚 ידע של דביר
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="menu" className="mt-8">
                        <Card className="shadow-xl">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2">
                                        <Utensils className="w-6 h-6 text-green-600" />
                                        ניהול תפריט לסימולציית AI
                                    </CardTitle>
                                    <Button onClick={() => handleOpenMenuDialog()} className="bg-green-600 hover:bg-green-700">
                                        <Plus className="w-4 h-4 ml-2"/>
                                        הוסף פריט לתפריט
                                    </Button>
                                </div>
                                <CardDescription>כאן תוכלו לעדכן את התפריט שה-AI ישתמש בו בסימולציות. סמנו מנות כמומלצות כדי שה-AI יתמקד בהן.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>שם מנה</TableHead>
                                                <TableHead>קטגוריה</TableHead>
                                                <TableHead>מחיר</TableHead>
                                                <TableHead>מומלץ?</TableHead>
                                                <TableHead>פעולות</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {menuItems.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.name}</TableCell>
                                                    <TableCell>{item.category}</TableCell>
                                                    <TableCell>₪{item.price}</TableCell>
                                                    <TableCell>
                                                        {item.is_recommended && <CheckCircle className="w-5 h-5 text-green-500" />}
                                                    </TableCell>
                                                    <TableCell className="flex gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => handleOpenMenuDialog(item)}><Edit className="w-4 h-4" /></Button>
                                                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteMenuItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="info" className="mt-8">
                        <Card className="shadow-xl">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2">
                                        <Info className="w-6 h-6 text-blue-600" />
                                        מידע כללי על המסעדה לסימולציות
                                    </CardTitle>
                                    <Button onClick={() => handleOpenInfoDialog()} className="bg-blue-600 hover:bg-blue-700">
                                        <Plus className="w-4 h-4 ml-2"/>
                                        הוסף מידע
                                    </Button>
                                </div>
                                <CardDescription>הגדירו מידע כללי שה-AI ישתמש בו בסימולציות - כשרויות, שעות פעילות, מדיניות וכו'.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-y-auto">
                                    <div className="grid gap-4">
                                        {restaurantInfo.map((item) => (
                                            <div key={item.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <h3 className="font-semibold">{item.title}</h3>
                                                            <Badge className={priorityColors[item.priority] || 'bg-gray-100'}>
                                                                {infoTypeLabels[item.info_type] || item.info_type}
                                                            </Badge>
                                                            {item.priority === 'critical' && (
                                                                <Badge className="bg-red-100 text-red-800">קריטי</Badge>
                                                            )}
                                                            {!item.is_active && (
                                                                <Badge variant="destructive" className="bg-red-100 text-red-800">לא פעיל</Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-gray-600 text-sm line-clamp-2 mb-2">
                                                            {item.content}
                                                        </p>
                                                        {item.keywords && Array.isArray(item.keywords) && item.keywords.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {item.keywords.map((keyword, index) => (
                                                                    <Badge key={index} variant="outline" className="text-xs">
                                                                        {keyword}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button variant="ghost" size="sm" onClick={() => handleOpenInfoDialog(item)}>
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteRestaurantInfo(item.id)}
                                                            className="text-red-600 hover:text-red-800"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="files" className="mt-8">
                        <AiAssistantFilesManager />
                    </TabsContent>
                </Tabs>

                {/* Dialog for Add/Edit Menu Item */}
                <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
                    <DialogContent dir="rtl">
                        <DialogHeader>
                            <DialogTitle>{editingMenuItem ? 'עריכת פריט בתפריט' : 'הוספת פריט חדש'}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <Input placeholder="שם המנה" value={menuFormData.name} onChange={e => setMenuFormData({...menuFormData, name: e.target.value})}/>
                             <Select value={menuFormData.category} onValueChange={value => setMenuFormData({...menuFormData, category: value})}>
                                <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="מזאטים בחמארה">מזאטים בחמארה</SelectItem>
                                    <SelectItem value="ראשונות">ראשונות</SelectItem>
                                    <SelectItem value="עיקריות">עיקריות</SelectItem>
                                    <SelectItem value="המבורגרים">המבורגרים</SelectItem>
                                    <SelectItem value="סלטים">סלטים</SelectItem>
                                    <SelectItem value="קינוחים">קינוחים</SelectItem>
                                    <SelectItem value="אלכוהול / קוקטיילים">אלכוהול / קוקטיילים</SelectItem>
                                    <SelectItem value="יין">יין</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="number" placeholder="מחיר" value={menuFormData.price} onChange={e => setMenuFormData({...menuFormData, price: e.target.value})}/>
                            <Textarea placeholder="תיאור קצר של המנה" value={menuFormData.description} onChange={e => setMenuFormData({...menuFormData, description: e.target.value})}/>
                            <Textarea placeholder="נקודות לשיחה (משפטי מכירה למלצר)" value={menuFormData.talking_points} onChange={e => setMenuFormData({...menuFormData, talking_points: e.target.value})}/>
                            <div className="flex items-center space-x-2 space-x-reverse">
                                <Switch id="is-recommended" checked={menuFormData.is_recommended} onCheckedChange={checked => setMenuFormData({...menuFormData, is_recommended: checked})}/>
                                <Label htmlFor="is-recommended" className="cursor-pointer">סמן כמנה מומלצת להיום</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsMenuDialogOpen(false)}>ביטול</Button>
                            <Button onClick={handleSaveMenuItem}>שמור פריט</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Dialog for Add/Edit Restaurant Info */}
                <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                    <DialogContent dir="rtl" className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingInfo ? 'עריכת מידע' : 'הוספת מידע חדש על המסעדה'}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <Select value={infoFormData.info_type} onValueChange={value => setInfoFormData({...infoFormData, info_type: value})}>
                                <SelectTrigger><SelectValue placeholder="בחר סוג מידע" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="kashrut">כשרויות</SelectItem>
                                    <SelectItem value="hours">שעות פעילות</SelectItem>
                                    <SelectItem value="location">מיקום וגישה</SelectItem>
                                    <SelectItem value="policies">מדיניות</SelectItem>
                                    <SelectItem value="general">מידע כללי</SelectItem>
                                    <SelectItem value="special_services">שירותים מיוחדים</SelectItem>
                                    <SelectItem value="reservations">הזמנות</SelectItem>
                                    <SelectItem value="payment">תשלום</SelectItem>
                                    <SelectItem value="accessibility">נגישות</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input placeholder="כותרת המידע" value={infoFormData.title} onChange={e => setInfoFormData({...infoFormData, title: e.target.value})}/>
                            <Textarea 
                                placeholder="תוכן המידע המפורט (למשל: 'המסעדה כשרה למהדרין תחת השגחת הרבנות הראשית')" 
                                value={infoFormData.content} 
                                onChange={e => setInfoFormData({...infoFormData, content: e.target.value})}
                                className="h-32"
                            />
                            <Input placeholder="מילות מפתח (מופרדות בפסיקים)" value={infoFormData.keywords} onChange={e => setInfoFormData({...infoFormData, keywords: e.target.value})}/>
                            <Select value={infoFormData.priority} onValueChange={value => setInfoFormData({...infoFormData, priority: value})}>
                                <SelectTrigger><SelectValue placeholder="חשיבות" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">נמוכה</SelectItem>
                                    <SelectItem value="medium">בינונית</SelectItem>
                                    <SelectItem value="high">גבוהה</SelectItem>
                                    <SelectItem value="critical">קריטית</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex items-center space-x-2 space-x-reverse">
                                <Switch id="is-active" checked={infoFormData.is_active} onCheckedChange={checked => setInfoFormData({...infoFormData, is_active: checked})}/>
                                <Label htmlFor="is-active" className="cursor-pointer">פעיל בסימולציות</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsInfoDialogOpen(false)}>ביטול</Button>
                            <Button onClick={handleSaveRestaurantInfo}>שמור מידע</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Quick Q&A Addition */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="w-6 h-6 text-pink-600" />
                                הוספת שאלה-תשובה מהירה
                            </CardTitle>
                            <Button onClick={() => setIsAddingQA(!isAddingQA)} className="bg-pink-600 hover:bg-pink-700">
                                {isAddingQA ? 'ביטול' : 'הוסף ש"ת'}
                            </Button>
                        </div>
                    </CardHeader>
                    {isAddingQA && (
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">השאלה</label>
                                <Input
                                    value={newQA.question}
                                    onChange={(e) => setNewQA({...newQA, question: e.target.value})}
                                    placeholder="למשל: איזה קוקטיילים יש חמוץ ומתוק?"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">התשובה</label>
                                <Textarea
                                    value={newQA.answer}
                                    onChange={(e) => setNewQA({...newQA, answer: e.target.value})}
                                    placeholder="התשובה המלאה לשאלה..."
                                    className="h-24"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">מילות מפתח נוספות (מופרדות בפסיקים)</label>
                                <Input
                                    value={newQA.keywords}
                                    onChange={(e) => setNewQA({...newQA, keywords: e.target.value})}
                                    placeholder="למשל: חמוץ, מתוק, משקאות, בר"
                                />
                            </div>
                            <Button onClick={handleAddQA} className="w-full bg-pink-600 hover:bg-pink-700">
                                שמור שאלה ותשובה
                            </Button>
                        </CardContent>
                    )}
                </Card>

                {/* Add/Edit New Item */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2">
                                <Plus className="w-6 h-6" />
                                {editingItem ? 'עריכת פריט ידע' : 'הוספת ידע חדש'}
                            </CardTitle>
                            <Button onClick={isAdding ? cancelForm : handleAddNewClick}>
                                {isAdding ? 'ביטול' : 'הוסף פריט'}
                            </Button>
                        </div>
                    </CardHeader>
                    {isAdding && (
                        <CardContent className="space-y-4 pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">קטגוריה</label>
                                    <Select value={formState.category} onValueChange={(value) => setFormState({...formState, category: value})}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="בחר קטגוריה" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="menu">תפריט ומתכונים</SelectItem>
                                            <SelectItem value="procedures">נהלים</SelectItem>
                                            <SelectItem value="policies">מדיניות</SelectItem>
                                            <SelectItem value="safety">בטיחות</SelectItem>
                                            <SelectItem value="customer_service">שירות לקוחות</SelectItem>
                                            <SelectItem value="technical">טכני</SelectItem>
                                            <SelectItem value="training">הדרכות</SelectItem>
                                            <SelectItem value="general">כללי</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">כותרת</label>
                                    <Input
                                        value={formState.title}
                                        onChange={(e) => setFormState({...formState, title: e.target.value})}
                                        placeholder="למשל: מתכון לחומוס הבית"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">תוכן מפורט</label>
                                <Textarea
                                    value={formState.content}
                                    onChange={(e) => setFormState({...formState, content: e.target.value})}
                                    placeholder="הזן את המידע המפורט כאן..."
                                    className="h-32"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">מילות מפתח (מופרדות בפסיקים)</label>
                                <Input
                                    value={formState.keywords}
                                    onChange={(e) => setFormState({...formState, keywords: e.target.value})}
                                    placeholder="למשל: חומוס, מתכון, טחינה, איך מכינים"
                                />
                            </div>
                            <Button onClick={handleItemSubmit} className="w-full bg-blue-600 hover:bg-blue-700">
                                {editingItem ? 'שמור שינויים' : 'שמור פריט'}
                            </Button>
                        </CardContent>
                    )}
                </Card>

                {/* Search and Knowledge Base */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="w-6 h-6" />
                            בסיס הידע
                        </CardTitle>
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="חפש בבסיס הידע..."
                            className="max-w-md"
                        />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                            {filteredItems.length === 0 && !loading && (
                                <p className="text-center text-gray-500">לא נמצאו פריטים תואמים.</p>
                            )}
                            {loading ? (
                                <p className="text-center text-gray-500">טוען נתונים...</p>
                            ) : (
                                filteredItems.map((item) => {
                                    const IconComponent = categoryIcons[item.category] || MessageSquare;
                                    return (
                                        <div key={item.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <IconComponent className="w-4 h-4" />
                                                        <h3 className="font-semibold">{item.title}</h3>
                                                        <Badge className={categoryColors[item.category] || 'bg-gray-100'}>
                                                            {item.category === 'qa_pairs' ? 'ש"ת מהירה' : item.category}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-gray-600 text-sm line-clamp-2 mb-2">
                                                        {item.content}
                                                    </p>
                                                    {item.keywords && Array.isArray(item.keywords) && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.keywords.map((keyword, index) => (
                                                                <Badge key={index} variant="outline" className="text-xs">
                                                                    {keyword}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(item)}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => deleteItem(item.id)}
                                                        className="text-red-600 hover:text-red-800"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Questions */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="w-6 h-6" />
                            שאלות אחרונות מהצוות
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {recentQuestions.length === 0 && !loading && (
                                <p className="text-center text-gray-500">אין שאלות אחרונות.</p>
                            )}
                            {loading ? (
                                <p className="text-center text-gray-500">טוען שאלות...</p>
                            ) : (
                                recentQuestions.slice(0, 10).map((question) => (
                                    <div key={question.id} className="border-b pb-3">
                                        <p className="font-medium text-sm">{question.question}</p>
                                        <p className="text-gray-600 text-xs mt-1 line-clamp-2">{question.answer}</p>
                                        <div className="flex justify-between items-center mt-2">
                                            <Badge variant="outline" className="text-xs">
                                                {question.category}
                                            </Badge>
                                            <span className="text-xs text-gray-500">
                                                {new Date(question.created_date).toLocaleDateString('he-IL')}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function AiDashboard() {
    return (
        <PageGuard pageName="AiDashboard" pageTitle="מרכז בקרת AI">
            <AiDashboardInner />
        </PageGuard>
    );
}