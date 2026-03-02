import React, { useState, useRef } from "react";
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
    User as UserIcon // Add User icon and alias it to avoid conflict with the entity User
} from "lucide-react";

export default function ChecklistExecutionComponent({ checklist, user, onComplete, onCancel }) {
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [results, setResults] = useState({});
    const [notes, setNotes] = useState('');
    const [approvingManagerName, setApprovingManagerName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [startTime, setStartTime] = useState(new Date()); // Track start time for completion duration
    const fileInputRef = useRef(null);

    const currentItem = checklist.items?.[currentItemIndex];
    const progress = ((currentItemIndex) / (checklist.items?.length || 1)) * 100;

    const handleItemCheck = (checked) => {
        setResults(prev => ({
            ...prev,
            [currentItem.order]: {
                ...prev[currentItem.order],
                checked,
                requires_followup: currentItem.critical && !checked
            }
        }));
    };

    const handleNoteChange = (note) => {
        setResults(prev => ({
            ...prev,
            [currentItem.order]: {
                ...prev[currentItem.order],
                notes: note
            }
        }));
    };

    const handlePerformerChange = (performer) => {
        setResults(prev => ({
            ...prev,
            [currentItem.order]: {
                ...prev[currentItem.order],
                performed_by: performer
            }
        }));
    };

    const handlePhotoUpload = async (file) => {
        if (!file) return;

        setUploading(true);
        try {
            const { file_url } = await UploadFile({ file });
            setResults(prev => ({
                ...prev,
                [currentItem.order]: {
                    ...prev[currentItem.order],
                    photo_urls: [...(prev[currentItem.order]?.photo_urls || []), file_url]
                }
            }));
        } catch (error) {
            console.error('שגיאה בהעלאת תמונה:', error);
        }
        setUploading(false);
    };

    const handleRemovePhoto = (photoIndex) => {
        setResults(prev => ({
            ...prev,
            [currentItem.order]: {
                ...prev[currentItem.order],
                photo_urls: (prev[currentItem.order]?.photo_urls || []).filter((_, i) => i !== photoIndex)
            }
        }));
    };

    const nextItem = () => {
        if (currentItemIndex < checklist.items.length - 1) {
            setCurrentItemIndex(prev => prev + 1);
        }
    };

    const prevItem = () => {
        if (currentItemIndex > 0) {
            setCurrentItemIndex(prev => prev - 1);
        }
    };

    const calculateScore = () => {
        const totalItems = checklist.items.length;
        if (totalItems === 0) return 0;
        const completedItems = Object.values(results).filter(r => r.checked).length;
        return Math.round((completedItems / totalItems) * 100);
    };

    const restartChecklist = () => {
        if (window.confirm('האם אתה בטוח שברצונך להתחיל מחדש? כל התוצאות יימחקו.')) {
            setCurrentItemIndex(0);
            setResults({});
            setNotes('');
            setApprovingManagerName('');
            setStartTime(new Date()); // Reset start time
        }
    };

    const saveExecution = async () => {
        if (currentItemIndex === checklist.items.length - 1 && !approvingManagerName.trim()) {
            alert('חובה למלא שם אחמ"ש מאשר לפני שמירה.');
            return;
        }

        const score = calculateScore();
        const hasFollowUp = Object.values(results).some(r => r.requires_followup);
        const completedItems = Object.values(results).filter(r => r.checked).length;
        const failedItems = Object.values(results).filter(r => !r.checked).length;
        const criticalFailures = checklist.items.filter(item =>
            item.critical && !results[item.order]?.checked
        ).length;

        const executionData = {
            checklist_id: checklist.id,
            executed_by: user?.id || 'anonymous',
            executed_by_name: user?.full_name || 'משתמש אנונימי',
            approving_manager_name: approvingManagerName,
            execution_date: new Date().toISOString(),
            status: hasFollowUp ? 'requires_attention' : 'completed',
            results: Object.entries(results).map(([order, data]) => ({
                item_id: order,
                ...data
            })),
            overall_score: score,
            notes,
            follow_up_required: hasFollowUp
        };

        try {
            const savedExecution = await ChecklistExecution.create(executionData);

            // יצירת רשומת ארכיון מפורטת
            await createExecutionArchive(savedExecution, score, completedItems, failedItems, criticalFailures);

            onComplete();
        } catch (error) {
            console.error('שגיאה בשמירת ביצוע:', error);
        }
    };

    const createExecutionArchive = async (execution, score, completedItems, failedItems, criticalFailures) => {
        try {
            const now = new Date();
            const shiftType = now.getHours() < 16 ? 'morning' : 'evening';

            // הכנת תוצאות מפורטות עם תמונות ושמות מבצעים
            const detailedResults = checklist.items.map(item => {
                const itemResult = results[item.order] || {};
                return {
                    item_order: item.order,
                    area: item.area,
                    task: item.task,
                    completed: itemResult.checked || false,
                    notes: itemResult.notes || '',
                    photo_urls: itemResult.photo_urls || [],
                    performed_by: itemResult.performed_by || '', // שם המבצע של המשימה הספציפית
                    timestamp: new Date().toISOString() // Timestamp for when this item result was recorded/archived
                };
            });

            // סיכום בעיות
            const issues = checklist.items
                .filter(item => !results[item.order]?.checked)
                .map(item => `${item.area} - ${item.task}`)
                .join('; ');

            const archiveData = {
                original_execution_id: execution.id,
                checklist_title: checklist.title,
                executed_by_name: user?.full_name || 'משתמש לא ידוע',
                approving_manager_name: approvingManagerName,
                executed_by_id: user?.id || 'unknown',
                execution_date: execution.execution_date, // This is the save time of the main execution record
                shift_type: shiftType,
                overall_score: score,
                total_items: checklist.items.length,
                completed_items: completedItems,
                failed_items: failedItems,
                critical_failures: criticalFailures,
                // Calculate completion time from when the component loaded (startTime) to now
                completion_time_minutes: Math.floor((now.getTime() - startTime.getTime()) / 1000 / 60),
                detailed_results: detailedResults,
                general_notes: notes, // This refers to the overall notes state
                follow_up_required: Object.values(results).some(r => r.requires_followup),
                issues_summary: issues || 'אין בעיות'
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4" dir="rtl">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900">{checklist.title}</h1>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={restartChecklist} className="text-orange-600 border-orange-300 hover:bg-orange-50">
                            <RotateCcw className="w-4 h-4 mr-2" />
                            התחל מחדש
                        </Button>
                        <Button variant="outline" onClick={onCancel}>
                            <X className="w-4 h-4 mr-2" />
                            יציאה
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Progress value={progress} className="w-full" />
                    <p className="text-sm text-gray-600 text-center">
                        פריט {currentItemIndex + 1} מתוך {checklist.items.length}
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
                            </div>
                            <div className="space-y-2">
                                {currentItem.critical && (
                                    <Badge className="bg-red-100 text-red-800">קריטי</Badge>
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
                                variant={results[currentItem.order]?.checked ? "default" : "outline"}
                                size="lg"
                                onClick={() => handleItemCheck(true)}
                                className="min-w-32"
                            >
                                <CheckSquare className="w-5 h-5 mr-2" />
                                הושלם
                            </Button>
                            <Button
                                variant={results[currentItem.order]?.checked === false ? "destructive" : "outline"}
                                size="lg"
                                onClick={() => handleItemCheck(false)}
                                className="min-w-32"
                            >
                                <AlertTriangle className="w-5 h-5 mr-2" />
                                לא הושלם
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <h4 className="font-semibold">מי ביצע את המשימה?</h4>
                            <Input
                                placeholder="שם המלצר/ה שביצע/ה את המשימה (אופציונלי)"
                                value={results[currentItem.order]?.performed_by || ''}
                                onChange={(e) => handlePerformerChange(e.target.value)}
                                className="bg-blue-50 focus:ring-blue-500"
                            />
                        </div>

                        {/* Photo upload - multiple photos */}
                        <div className="space-y-4 p-4 bg-gray-50 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-gray-600"/>
                                    תמונות ({(results[currentItem.order]?.photo_urls || []).length})
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
                            {(results[currentItem.order]?.photo_urls || []).length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {(results[currentItem.order]?.photo_urls || []).map((url, i) => (
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

                        <div className="space-y-2">
                            <h4 className="font-semibold">הערות (אופציונלי)</h4>
                            <Textarea
                                placeholder="הוסף הערות לגבי הפריט הזה..."
                                value={results[currentItem.order]?.notes || ''}
                                onChange={(e) => handleNoteChange(e.target.value)}
                            />
                        </div>
                        
                        {currentItemIndex === checklist.items.length - 1 && (
                            <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <Label htmlFor="manager-signature" className="font-bold text-yellow-800 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5" />
                                    אישור אחמ"ש
                                </Label>
                                <Input
                                    id="manager-signature"
                                    placeholder="הזן שם מלא של האחמ״ש המאשר"
                                    value={approvingManagerName}
                                    onChange={(e) => setApprovingManagerName(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-yellow-700">חובה למלא שדה זה כדי לסיים את הצ'קליסט.</p>
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

                            {currentItemIndex === checklist.items.length - 1 ? (
                                <Button onClick={saveExecution} className="bg-green-600 hover:bg-green-700">
                                    <Save className="w-4 h-4 mr-2" />
                                    סיים ושמור
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
                                <span>{Object.values(results).filter(r => r.checked).length} / {checklist.items.length}</span>
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