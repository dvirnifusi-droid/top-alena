import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Play, Lightbulb, Target, Expand, Star, StarIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MarketingTaskDetails from './MarketingTaskDetails';

export default function MarketingTaskCard({ task, index, onComplete, onUpdateTask, isCompleting, priorityColors }) {
    const [showDetails, setShowDetails] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    const handleStarToggle = () => {
        const updatedTask = {
            ...task,
            is_starred: !task.is_starred,
            status: task.is_starred ? 'pending' : 'starred'
        };
        onUpdateTask(updatedTask);
    };

    const handleStartTask = () => {
        const updatedTask = {
            ...task,
            status: 'in_progress'
        };
        onUpdateTask(updatedTask);
        setShowDetails(true);
    };

    const platformIcons = {
        instagram: '📸',
        facebook: '👥',
        google: '🔍',
        tiktok: '🎵',
        email: '📧',
        whatsapp: '💬',
        website: '🌐',
        multiple: '🔄'
    };

    return (
        <>
            <Card className={`shadow-lg hover:shadow-xl transition-all duration-300 border-2 ${priorityColors[task.priority]} relative overflow-hidden`}>
                {/* Priority indicator */}
                <div className={`absolute top-0 right-0 w-16 h-16 transform rotate-45 translate-x-8 -translate-y-8 ${task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
                
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    {index}
                                </div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <span>{platformIcons[task.platform] || '📱'}</span>
                                    {task.title}
                                </CardTitle>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleStarToggle}
                                    className={`p-1 ${task.is_starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                                >
                                    {task.is_starred ? <Star className="w-5 h-5 fill-current" /> : <StarIcon className="w-5 h-5" />}
                                </Button>
                            </div>
                            
                            <div className="flex gap-2 flex-wrap mb-3">
                                <Badge className={priorityColors[task.priority]}>
                                    {task.priority === 'urgent' ? '🚨 דחוף' : 
                                     task.priority === 'high' ? '⚡ גבוה' :
                                     task.priority === 'medium' ? '📝 בינוני' : '⏰ נמוך'}
                                </Badge>
                                
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {task.estimated_time || 15} דק'
                                </Badge>
                                
                                <Badge variant="secondary">
                                    {task.platform}
                                </Badge>

                                {task.status === 'in_progress' && (
                                    <Badge className="bg-blue-100 text-blue-800">בתהליך</Badge>
                                )}

                                {task.is_starred && (
                                    <Badge className="bg-yellow-100 text-yellow-800">⭐ מועדף</Badge>
                                )}
                            </div>

                            {task.status === 'in_progress' && task.progress_percentage > 0 && (
                                <div className="mb-3">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-gray-600">התקדמות:</span>
                                        <span className="text-sm font-semibold">{task.progress_percentage}%</span>
                                    </div>
                                    <Progress value={task.progress_percentage} className="h-2" />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            {task.status === 'pending' || task.status === 'starred' ? (
                                <Button
                                    onClick={handleStartTask}
                                    className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                                    size="sm"
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    התחל
                                </Button>
                            ) : task.status === 'in_progress' ? (
                                <Button
                                    onClick={() => setShowDetails(true)}
                                    variant="outline"
                                    size="sm"
                                >
                                    <Target className="w-4 h-4 mr-2" />
                                    המשך
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => onComplete(task.id)}
                                    disabled={isCompleting}
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                                    size="sm"
                                >
                                    {isCompleting ? (
                                        <>
                                            <Clock className="w-4 h-4 mr-2 animate-spin" />
                                            מסיים...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            סיימתי
                                        </>
                                    )}
                                </Button>
                            )}
                            
                            <Button
                                onClick={() => setShowDetails(true)}
                                variant="outline"
                                size="sm"
                            >
                                <Expand className="w-4 h-4 mr-2" />
                                פרטים
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                    <p className="text-gray-700">{task.description}</p>
                    
                    {task.ai_reasoning && (
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-blue-600" />
                                <span className="font-semibold text-blue-800">למה זה חשוב עכשיו?</span>
                            </div>
                            <p className="text-blue-700 text-sm">{task.ai_reasoning}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-xl">{task.title}</DialogTitle>
                    </DialogHeader>
                    <MarketingTaskDetails 
                        task={task}
                        onUpdateTask={onUpdateTask}
                        onClose={() => setShowDetails(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}