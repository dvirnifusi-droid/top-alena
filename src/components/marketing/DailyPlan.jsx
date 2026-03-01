import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Clock, RefreshCw, Zap, Play, Star } from "lucide-react";
import { MarketingTask } from '@/entities/MarketingTask';

import MarketingTaskCard from './MarketingTaskCard';

export default function DailyPlan({ tasks, onRefresh, onGenerateNew, isGenerating }) {
    const [completingTask, setCompletingTask] = useState(null);

    const handleCompleteTask = async (taskId) => {
        setCompletingTask(taskId);
        try {
            await MarketingTask.update(taskId, {
                status: 'completed',
                completion_date: new Date().toISOString()
            });
            onRefresh();
        } catch (error) {
            console.error('Error completing task:', error);
        } finally {
            setCompletingTask(null);
        }
    };

    const handleUpdateTask = async (updatedTask) => {
        try {
            await MarketingTask.update(updatedTask.id, updatedTask);
            onRefresh();
        } catch (error) {
            console.error('Error updating task:', error);
        }
    };

    const priorityColors = {
        urgent: 'bg-red-100 text-red-800 border-red-200',
        high: 'bg-orange-100 text-orange-800 border-orange-200',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        low: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    // סינון משימות לפי סטטוס
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    const inProgressTasks = tasks.filter(task => task.status === 'in_progress');
    const starredTasks = tasks.filter(task => task.is_starred || task.status === 'starred');
    const completedTasks = tasks.filter(task => task.status === 'completed');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">ניהול משימות שיווק</h2>
                <div className="flex gap-3">
                    <Button onClick={onRefresh} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        רענן
                    </Button>
                    <Button 
                        onClick={onGenerateNew} 
                        disabled={isGenerating}
                        className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                        <Zap className="w-4 h-4 mr-2" />
                        {isGenerating ? 'יוצר משימות...' : 'צור משימות חדשות'}
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="pending" className="relative">
                        📋 לביצוע ({pendingTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="in_progress" className="relative">
                        🔄 בתהליך ({inProgressTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="starred" className="relative">
                        ⭐ מועדפים ({starredTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="relative">
                        ✅ הושלמו ({completedTasks.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                    {pendingTasks.length === 0 ? (
                        <Card className="text-center p-8 border-dashed">
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                                        <Play className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold">אין משימות חדשות</h3>
                                    <p className="text-gray-600">כל המשימות או בתהליך או הושלמו. מעולה!</p>
                                    <Button 
                                        onClick={onGenerateNew}
                                        disabled={isGenerating}
                                        className="bg-gradient-to-r from-purple-500 to-blue-500"
                                    >
                                        <Zap className="w-4 h-4 mr-2" />
                                        {isGenerating ? 'יוצר...' : 'צור משימות חדשות'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6">
                            {pendingTasks
                                .sort((a, b) => {
                                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                                })
                                .map((task, index) => (
                                    <MarketingTaskCard
                                        key={task.id}
                                        task={task}
                                        index={index + 1}
                                        onComplete={handleCompleteTask}
                                        onUpdateTask={handleUpdateTask}
                                        isCompleting={completingTask === task.id}
                                        priorityColors={priorityColors}
                                    />
                                ))
                            }
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="in_progress" className="space-y-4">
                    {inProgressTasks.length === 0 ? (
                        <Card className="text-center p-8">
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                                        <Clock className="w-8 h-8 text-blue-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold">אין משימות בתהליך</h3>
                                    <p className="text-gray-600">התחל לעבוד על משימה כדי לראות אותה כאן</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6">
                            {inProgressTasks.map((task, index) => (
                                <MarketingTaskCard
                                    key={task.id}
                                    task={task}
                                    index={index + 1}
                                    onComplete={handleCompleteTask}
                                    onUpdateTask={handleUpdateTask}
                                    isCompleting={completingTask === task.id}
                                    priorityColors={priorityColors}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="starred" className="space-y-4">
                    {starredTasks.length === 0 ? (
                        <Card className="text-center p-8">
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 mx-auto bg-yellow-100 rounded-full flex items-center justify-center">
                                        <Star className="w-8 h-8 text-yellow-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold">אין משימות מועדפות</h3>
                                    <p className="text-gray-600">סמן משימות בכוכב כדי לחזור אליהן מאוחר יותר</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6">
                            {starredTasks.map((task, index) => (
                                <MarketingTaskCard
                                    key={task.id}
                                    task={task}
                                    index={index + 1}
                                    onComplete={handleCompleteTask}
                                    onUpdateTask={handleUpdateTask}
                                    isCompleting={completingTask === task.id}
                                    priorityColors={priorityColors}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="completed" className="space-y-4">
                    {completedTasks.length === 0 ? (
                        <Card className="text-center p-8">
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold">אין משימות מושלמות</h3>
                                    <p className="text-gray-600">המשימות שתשלים יופיעו כאן</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6">
                            {completedTasks.map((task, index) => (
                                <MarketingTaskCard
                                    key={task.id}
                                    task={task}
                                    index={index + 1}
                                    onComplete={handleCompleteTask}
                                    onUpdateTask={handleUpdateTask}
                                    isCompleting={completingTask === task.id}
                                    priorityColors={priorityColors}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}