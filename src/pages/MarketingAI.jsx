import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketingTask, MarketingGoal, BrainstormSession, MarketingInsight, RestaurantProfile, AiSuggestion } from "@/entities/all";
import { InvokeLLM } from "@/integrations/Core";
import { 
    Brain, 
    Target, 
    TrendingUp, 
    Calendar, 
    BarChart3,
    Loader2,
    TestTube2,
    Archive
} from "lucide-react";

import BrainstormingPanel from '../components/marketing/BrainstormingPanel';
import GoalsTracker from '../components/marketing/GoalsTracker';
import InsightsPanel from '../components/marketing/InsightsPanel';
import DailyPlan from '../components/marketing/DailyPlan';
import RestaurantProfilePanel from '../components/marketing/RestaurantProfilePanel';
import MarketingPostLab from '../components/marketing/MarketingPostLab';
import AiSuggestionsBank from '../components/marketing/AiSuggestionsBank';

export default function MarketingAIPage() {
    const [tasks, setTasks] = useState([]);
    const [goals, setGoals] = useState([]);
    const [insights, setInsights] = useState([]);
    const [brainstormSessions, setBrainstormSessions] = useState([]);
    const [restaurantProfile, setRestaurantProfile] = useState(null);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generateDailyPlan, setGenerateDailyPlan] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [tasksData, goalsData, insightsData, sessionsData, profileData, suggestionsData] = await Promise.all([
                MarketingTask.list('-due_date'),
                MarketingGoal.filter({ status: 'active' }),
                MarketingInsight.list('-created_date', 10),
                BrainstormSession.list('-session_date', 5),
                RestaurantProfile.list('', 1),
                AiSuggestion.list('-created_date', 50).catch(() => [])
            ]);
            
            setTasks(tasksData);
            setGoals(goalsData);
            setInsights(insightsData);
            setBrainstormSessions(sessionsData);
            setRestaurantProfile(profileData[0] || null);
            setAiSuggestions(suggestionsData);
        } catch (error) {
            console.error('Error loading marketing data:', error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSaveProfile = async (profileData) => {
        setLoading(true);
        try {
            if (restaurantProfile && restaurantProfile.id) {
                const updated = await RestaurantProfile.update(restaurantProfile.id, profileData);
                setRestaurantProfile(updated);
            } else {
                const newProfile = await RestaurantProfile.create(profileData);
                setRestaurantProfile(newProfile);
            }
            await loadData();
        } catch (error) {
            console.error('Error saving restaurant profile:', error);
        }
        setLoading(false);
    };

    // פונקציה לשמירת הצעות AI - עטופה ב-useCallback
    const saveAiSuggestion = useCallback(async (suggestionData) => {
        try {
            await AiSuggestion.create(suggestionData);
            // רענון רשימת ההצעות
            const updatedSuggestions = await AiSuggestion.list('-created_date', 50);
            setAiSuggestions(updatedSuggestions);
        } catch (error) {
            console.error('Error saving AI suggestion:', error);
        }
    }, [setAiSuggestions]); // setAiSuggestions is a stable function reference from useState, but explicitly listing it for clarity.

    const generateDailyTasks = useCallback(async () => {
        if (!restaurantProfile) {
            alert("אנא מלא ושמור את פרופיל המסעדה לפני יצירת תוכנית יומית.");
            return;
        }

        setGenerateDailyPlan(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const dayName = new Date().toLocaleDateString('he-IL', { weekday: 'long' });
            
            const profileContext = JSON.stringify({
                cuisine: restaurantProfile.cuisine_style,
                targetAudience: restaurantProfile.target_audience,
                goals: restaurantProfile.primary_goals,
                challenges: restaurantProfile.current_challenges
            });

            const prompt = `
                אתה יועץ שיווק מומחה למסעדות. המטרה שלך היא לעזור למסעדה להכפיל את המכירות תוך 6 חודשים.

                פרופיל המסעדה: ${profileContext}
                
                היום הוא ${dayName}, ${today}.
                
                בהתבסס על פרופיל המסעדה, צור רשימה של 5-7 משימות שיווק יומיות להיום, כולל:
                1. פוסט לאינסטגרם או פייסבוק
                2. סטורי לאינסטגרם
                3. פעילות בגוגל לעסק שלי
                4. ניהול ביקורות
                5. משימות נוספות בהתאם ליום בשבוע ופרופיל המסעדה.
                
                לכל משימה ספק:
                - task_type מהרשימה: social_media_post, story_upload, google_ads, facebook_ads, instagram_ads, email_campaign, content_creation, customer_engagement, influencer_outreach, review_management, seo_optimization, event_promotion, loyalty_program, seasonal_campaign
                - כותרת קצרה וברורה בעברית
                - תיאור מפורט בעברית של כיצד לבצע
                - הצעת תוכן מוכנה לשימוש בעברית
                - הסבר מדוע זה חשוב עכשיו בעברית
                - זמן משוער לביצוע
                - פלטפורמה (instagram, facebook, google, tiktok, email, whatsapp, website, multiple)
                - עדיפות (low, medium, high, urgent)
                - הוראות צעד אחר צעד מפורטות בעברית
                
                התמקד ברעיונות יצירתיים שיבדלו את המסעדה מהמתחרים. כל הטקסטים חייבים להיות בעברית בלבד.
            `;

            const aiResponse = await InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        tasks: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    task_type: { 
                                        type: "string",
                                        enum: ["social_media_post", "story_upload", "google_ads", "facebook_ads", "instagram_ads", "email_campaign", "content_creation", "customer_engagement", "influencer_outreach", "review_management", "seo_optimization", "event_promotion", "loyalty_program", "seasonal_campaign"]
                                    },
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    platform: { 
                                        type: "string",
                                        enum: ["instagram", "facebook", "google", "tiktok", "email", "whatsapp", "website", "multiple"]
                                    },
                                    estimated_time: { type: "integer" },
                                    priority: { 
                                        type: "string",
                                        enum: ["low", "medium", "high", "urgent"]
                                    },
                                    suggested_content: { type: "string" },
                                    ai_reasoning: { type: "string" },
                                    detailed_steps: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                step_number: { type: "integer" },
                                                title: { type: "string" },
                                                description: { type: "string" },
                                                estimated_minutes: { type: "integer" },
                                                tools_needed: { type: "array", items: { type: "string" } },
                                                tips: { type: "array", items: { type: "string" } }
                                            }
                                        }
                                    }
                                },
                                required: ["task_type", "title", "description", "platform", "priority"]
                            }
                        }
                    }
                }
            });

            // שמירת המשימות החדשות
            if (aiResponse.tasks && Array.isArray(aiResponse.tasks)) {
                for (const taskData of aiResponse.tasks) {
                    // הוספת שדות חסרים
                    const fullTaskData = {
                        task_type: taskData.task_type || 'social_media_post',
                        title: taskData.title,
                        description: taskData.description,
                        platform: taskData.platform || 'instagram',
                        estimated_time: taskData.estimated_time || 30,
                        priority: taskData.priority || 'medium',
                        suggested_content: taskData.suggested_content || '',
                        ai_reasoning: taskData.ai_reasoning || '',
                        due_date: today,
                        status: 'pending',
                        progress_percentage: 0,
                        is_starred: false,
                        detailed_steps: taskData.detailed_steps || []
                    };
                    
                    await MarketingTask.create(fullTaskData);
                    
                    // שמירת הצעה במאגר
                    await saveAiSuggestion({
                        suggestion_type: 'marketing_task',
                        title: taskData.title,
                        content: `${taskData.description}\n\nתוכן מוצע: ${taskData.suggested_content}`,
                        ai_context: `משימה יומית ליום ${dayName}`,
                        priority: taskData.priority || 'medium',
                        category: taskData.platform,
                        estimated_impact: 'medium',
                        estimated_effort: taskData.estimated_time > 30 ? 'high' : taskData.estimated_time > 15 ? 'medium' : 'low',
                        tags: [taskData.platform, 'יומי', dayName]
                    });
                }
            }

            loadData();
        } catch (error) {
            console.error('Error generating daily tasks:', error);
            alert('שגיאה ביצירת משימות. נסה שוב.');
        }
        setGenerateDailyPlan(false);
    }, [restaurantProfile, saveAiSuggestion, loadData]);

    const todaysTasks = tasks.filter(task => {
        const today = new Date().toISOString().split('T')[0];
        return task.due_date === today && task.status !== 'completed';
    });

    const completedToday = tasks.filter(task => {
        const today = new Date().toISOString().split('T')[0];
        return task.completion_date && task.completion_date.startsWith(today);
    });

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
                <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
                        <Brain className="w-10 h-10 text-purple-600" />
                        יועץ השיווק החכם 🚀
                    </h1>
                    <p className="text-gray-600 text-lg">המערכת שתכפיל את המכירות שלך תוך 6 חודשים</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-blue-100">משימות היום</p>
                                    <p className="text-3xl font-bold">{todaysTasks.length}</p>
                                </div>
                                <Calendar className="w-10 h-10 text-blue-200" />
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-green-100">הושלמו היום</p>
                                    <p className="text-3xl font-bold">{completedToday.length}</p>
                                </div>
                                <Target className="w-10 h-10 text-green-200" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-purple-100">יעדים פעילים</p>
                                    <p className="text-3xl font-bold">{goals.length}</p>
                                </div>
                                <TrendingUp className="w-10 h-10 text-purple-200" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-orange-100">הצעות במאגר</p>
                                    <p className="text-3xl font-bold">{aiSuggestions.length}</p>
                                </div>
                                <Archive className="w-10 h-10 text-orange-200" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="daily" className="w-full">
                    <TabsList className="grid w-full grid-cols-8 bg-gradient-to-r from-white/80 via-white/60 to-white/80 backdrop-blur-xl p-2 h-auto rounded-2xl border border-white/20 shadow-xl">
                        <TabsTrigger value="daily" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white transition-all duration-300">
                            📅 תוכנית יומית
                        </TabsTrigger>
                        <TabsTrigger value="suggestions" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white transition-all duration-300">
                            💾 מאגר הצעות
                        </TabsTrigger>
                        <TabsTrigger value="profile" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-orange-500 data-[state=active]:text-white transition-all duration-300">
                            🚀 פרופיל
                        </TabsTrigger>
                        <TabsTrigger value="lab" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-blue-500 data-[state=active]:text-white transition-all duration-300">
                            <TestTube2 className="w-4 h-4 ml-2" />
                             מעבדה
                        </TabsTrigger>
                        <TabsTrigger value="brainstorm" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white transition-all duration-300">
                            💡 סיעור מוחות
                        </TabsTrigger>
                        <TabsTrigger value="goals" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-teal-500 data-[state=active]:text-white transition-all duration-300">
                            🎯 יעדים
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white transition-all duration-300">
                            📊 תובנות
                        </TabsTrigger>
                        <TabsTrigger value="analytics" className="py-3 px-6 text-sm font-bold rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white transition-all duration-300">
                            📈 ניתוח
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="daily" className="mt-8">
                        <DailyPlan 
                            tasks={todaysTasks}
                            onRefresh={loadData}
                            onGenerateNew={generateDailyTasks}
                            isGenerating={generateDailyPlan}
                        />
                    </TabsContent>

                    <TabsContent value="suggestions" className="mt-8">
                        <AiSuggestionsBank 
                            suggestions={aiSuggestions}
                            onRefresh={() => {
                                AiSuggestion.list('-created_date', 50).then(setAiSuggestions);
                            }}
                        />
                    </TabsContent>

                    <TabsContent value="profile" className="mt-8">
                        <RestaurantProfilePanel
                            profile={restaurantProfile}
                            onSave={handleSaveProfile}
                        />
                    </TabsContent>

                    <TabsContent value="lab" className="mt-8">
                        <MarketingPostLab onSaveSuggestion={saveAiSuggestion} />
                    </TabsContent>

                    <TabsContent value="brainstorm" className="mt-8">
                        <BrainstormingPanel 
                            sessions={brainstormSessions}
                            onRefresh={loadData}
                            onSaveSuggestion={saveAiSuggestion}
                        />
                    </TabsContent>

                    <TabsContent value="goals" className="mt-8">
                        <GoalsTracker 
                            goals={goals}
                            onRefresh={loadData}
                        />
                    </TabsContent>

                    <TabsContent value="insights" className="mt-8">
                        <InsightsPanel 
                            insights={insights}
                            onRefresh={loadData}
                        />
                    </TabsContent>

                    <TabsContent value="analytics" className="mt-8">
                        <Card className="shadow-xl">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="w-6 h-6" />
                                    ניתוח ביצועים
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-600">בקרוב: ניתוח מתקדם של ביצועי השיווק ותחזיות צמיחה</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}