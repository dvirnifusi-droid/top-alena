import React, { useState, useEffect } from "react";
import { ChecklistExecutionArchive } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, User, Clock, CheckCircle, AlertTriangle, Search, Eye, ShieldCheck, Pencil, Save, X, Trash2, MoreHorizontal, Image } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from "@/components/ui/alert-dialog";

export default function ChecklistArchive() {
    const [archives, setArchives] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        shiftType: 'all',
        dateFrom: '',
        dateTo: ''
    });
    const [selectedArchive, setSelectedArchive] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedResults, setEditedResults] = useState([]);
    const [editedDate, setEditedDate] = useState('');
    const [editedShiftType, setEditedShiftType] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [viewingPhoto, setViewingPhoto] = useState(null);

    useEffect(() => {
        loadArchives();
    }, []);

    const loadArchives = async () => {
        setLoading(true);
        try {
            const data = await ChecklistExecutionArchive.list('-execution_date', 100);
            setArchives(data);
        } catch (error) {
            console.error('Error loading archives:', error);
        }
        setLoading(false);
    };

    const handleEditStart = () => {
        if (selectedArchive?.detailed_results) {
            setEditedResults([...selectedArchive.detailed_results]);
            setEditedDate(selectedArchive.execution_date.split('T')[0]); // Extract date part
            setEditedShiftType(selectedArchive.shift_type);
            setIsEditing(true);
        }
    };

    const handleEditCancel = () => {
        setIsEditing(false);
        setEditedResults([]);
        setEditedDate('');
        setEditedShiftType('');
    };

    const handleResultChange = (index, field, value) => {
        setEditedResults(prev => prev.map((result, i) => 
            i === index ? { ...result, [field]: value } : result
        ));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            // חשב מחדש את הסטטיסטיקות
            const completedCount = editedResults.filter(r => r.completed).length;
            const failedCount = editedResults.filter(r => !r.completed).length;
            const newScore = Math.round((completedCount / editedResults.length) * 100);

            // Create new execution date with time preserved but date updated
            const originalDateTime = new Date(selectedArchive.execution_date);
            const newDate = new Date(editedDate);
            const updatedExecutionDate = new Date(
                newDate.getFullYear(),
                newDate.getMonth(),
                newDate.getDate(),
                originalDateTime.getHours(),
                originalDateTime.getMinutes(),
                originalDateTime.getSeconds()
            ).toISOString();

            const updatedArchive = {
                ...selectedArchive,
                detailed_results: editedResults,
                completed_items: completedCount,
                failed_items: failedCount,
                overall_score: newScore,
                execution_date: updatedExecutionDate,
                shift_type: editedShiftType
            };

            await ChecklistExecutionArchive.update(selectedArchive.id, updatedArchive);
            
            // עדכן את הארכיון המוצג ואת הרשימה
            setSelectedArchive(updatedArchive);
            setArchives(prev => prev.map(archive => 
                archive.id === selectedArchive.id ? updatedArchive : archive
            ));
            
            setIsEditing(false);
            alert('השינויים נשמרו בהצלחה!');
        } catch (error) {
            console.error('Error saving changes:', error);
            alert('שגיאה בשמירת השינויים');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteArchive = async (archiveId) => {
        setDeletingId(archiveId);
        try {
            await ChecklistExecutionArchive.delete(archiveId);
            setArchives(prev => prev.filter(archive => archive.id !== archiveId));
            
            // אם מוחק את הארכיון שפתוח כרגע, סגור את הדיאלוג
            if (selectedArchive && selectedArchive.id === archiveId) {
                setSelectedArchive(null);
                setIsEditing(false);
                setEditedResults([]);
            }
            
            alert('הצ\'קליסט נמחק בהצלחה מהארכיון');
        } catch (error) {
            console.error('Error deleting archive:', error);
            alert('שגיאה במחיקת הצ\'קליסט');
        } finally {
            setDeletingId(null);
        }
    };

    const filteredArchives = archives.filter(archive => {
        const searchMatch = !filters.search || 
            archive.checklist_title.toLowerCase().includes(filters.search.toLowerCase()) ||
            archive.executed_by_name.toLowerCase().includes(filters.search.toLowerCase()) ||
            (archive.approving_manager_name && archive.approving_manager_name.toLowerCase().includes(filters.search.toLowerCase()));
        
        const shiftMatch = filters.shiftType === 'all' || archive.shift_type === filters.shiftType;
        
        const dateMatch = (!filters.dateFrom || archive.execution_date >= filters.dateFrom) &&
                         (!filters.dateTo || archive.execution_date <= filters.dateTo);
        
        return searchMatch && shiftMatch && dateMatch;
    });

    const getShiftBadge = (shiftType) => {
        const badges = {
            morning: { text: 'בוקר', class: 'bg-yellow-100 text-yellow-800' },
            evening: { text: 'ערב', class: 'bg-blue-100 text-blue-800' },
            night: { text: 'לילה', class: 'bg-purple-100 text-purple-800' }
        };
        const badge = badges[shiftType] || { text: shiftType, class: 'bg-gray-100 text-gray-800' };
        return <Badge className={badge.class}>{badge.text}</Badge>;
    };

    const getScoreBadge = (score) => {
        if (score >= 90) return <Badge className="bg-green-100 text-green-800">{score}%</Badge>;
        if (score >= 70) return <Badge className="bg-yellow-100 text-yellow-800">{score}%</Badge>;
        return <Badge className="bg-red-100 text-red-800">{score}%</Badge>;
    };

    if (loading) {
        return <div className="text-center p-8">טוען ארכיון...</div>;
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>ארכיון ביצועי צ'קליסטים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="חפש לפי צ'קליסט או מבצע..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="pl-10"
                            />
                        </div>
                        
                        <Select value={filters.shiftType} onValueChange={(value) => setFilters(prev => ({ ...prev, shiftType: value }))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל המשמרות</SelectItem>
                                <SelectItem value="morning">בוקר</SelectItem>
                                <SelectItem value="evening">ערב</SelectItem>
                                <SelectItem value="night">לילה</SelectItem>
                            </SelectContent>
                        </Select>
                        
                        <Input
                            type="date"
                            placeholder="מתאריך"
                            value={filters.dateFrom}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        />
                        
                        <Input
                            type="date"
                            placeholder="עד תאריך"
                            value={filters.dateTo}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredArchives.map((archive) => (
                    <Card key={archive.id} className="hover:shadow-lg transition-shadow relative">
                        <div className="absolute top-4 left-4">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setSelectedArchive(archive)}>
                                        <Eye className="w-4 h-4 mr-2" />
                                        צפה בפרטים
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem 
                                                onSelect={(e) => e.preventDefault()}
                                                className="text-red-600 focus:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                מחק מהארכיון
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent dir="rtl">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    פעולה זו תמחק את הצ'קליסט "{archive.checklist_title}" מהארכיון לצמיתות. 
                                                    לא ניתן לבטל פעולה זו.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteArchive(archive.id)}
                                                    className="bg-red-600 hover:bg-red-700"
                                                    disabled={deletingId === archive.id}
                                                >
                                                    {deletingId === archive.id ? 'מוחק...' : 'מחק'}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <CardHeader className="pb-3 pr-12">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">{archive.checklist_title}</CardTitle>
                                {getScoreBadge(archive.overall_score)}
                            </div>
                            <div className="flex gap-2 mt-2">
                                {getShiftBadge(archive.shift_type)}
                                {archive.critical_failures > 0 && (
                                    <Badge className="bg-red-100 text-red-800">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        {archive.critical_failures} כשלים קריטיים
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <User className="w-4 h-4" />
                                <span>בוצע ע"י: {archive.executed_by_name}</span>
                            </div>
                             {archive.approving_manager_name && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <ShieldCheck className="w-4 h-4 text-green-600" />
                                    <span>אושר ע"י: {archive.approving_manager_name}</span>
                                </div>
                            )}
                            
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Calendar className="w-4 h-4" />
                                <span>{format(new Date(archive.execution_date), 'dd/MM/yyyy HH:mm')}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Clock className="w-4 h-4" />
                                <span>{archive.completion_time_minutes} דק' | {archive.completed_items}/{archive.total_items} הושלמו</span>
                            </div>

                            {archive.follow_up_required && (
                                <Badge className="bg-orange-100 text-orange-800 w-full justify-center">
                                    דורש מעקב נוסף
                                </Badge>
                            )}
                            
                            <Button
                                variant="outline"
                                className="w-full mt-3"
                                onClick={() => setSelectedArchive(archive)}
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                צפה בפרטים המלאים
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredArchives.length === 0 && (
                <Card>
                    <CardContent className="p-8 text-center">
                        <p className="text-gray-500">לא נמצאו רשומות ארכיון התואמות לחיפוש</p>
                    </CardContent>
                </Card>
            )}

            {/* דיאלוג פרטים מלאים עם עריכה */}
            <Dialog open={!!selectedArchive} onOpenChange={() => {
                setSelectedArchive(null);
                setIsEditing(false);
                setEditedResults([]);
                setEditedDate('');
                setEditedShiftType('');
            }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    {selectedArchive && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center justify-between">
                                    <DialogTitle className="flex items-center justify-between">
                                        {selectedArchive.checklist_title}
                                        {getScoreBadge(selectedArchive.overall_score)}
                                    </DialogTitle>
                                    <div className="flex gap-2">
                                        {!isEditing ? (
                                            <Button onClick={handleEditStart} variant="outline" size="sm">
                                                <Pencil className="w-4 h-4 mr-2" />
                                                ערוך תוצאות
                                            </Button>
                                        ) : (
                                            <>
                                                <Button onClick={handleEditCancel} variant="outline" size="sm">
                                                    <X className="w-4 h-4 mr-2" />
                                                    בטל
                                                </Button>
                                                <Button onClick={handleSaveChanges} size="sm" disabled={isSaving}>
                                                    <Save className="w-4 h-4 mr-2" />
                                                    {isSaving ? 'שומר...' : 'שמור שינויים'}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </DialogHeader>
                            
                            <div className="space-y-6">
                                {/* עריכת תאריך ומשמרת */}
                                {isEditing && (
                                    <Card className="bg-blue-50">
                                        <CardHeader>
                                            <CardTitle className="text-blue-900">עריכת פרטים בסיסיים</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>תאריך</Label>
                                                <Input
                                                    type="date"
                                                    value={editedDate}
                                                    onChange={(e) => setEditedDate(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <Label>סוג משמרת</Label>
                                                <Select value={editedShiftType} onValueChange={setEditedShiftType}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="morning">בוקר</SelectItem>
                                                        <SelectItem value="evening">ערב</SelectItem>
                                                        <SelectItem value="night">לילה</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* מידע כללי */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                                        <div className="text-2xl font-bold text-blue-600">{selectedArchive.overall_score}%</div>
                                        <div className="text-sm text-blue-800">ציון כללי</div>
                                    </div>
                                    <div className="text-center p-3 bg-green-50 rounded-lg">
                                        <div className="text-2xl font-bold text-green-600">{selectedArchive.completed_items}</div>
                                        <div className="text-sm text-green-800">הושלמו</div>
                                    </div>
                                    <div className="text-center p-3 bg-red-50 rounded-lg">
                                        <div className="text-2xl font-bold text-red-600">{selectedArchive.failed_items}</div>
                                        <div className="text-sm text-red-800">נכשלו</div>
                                    </div>
                                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                                        <div className="text-2xl font-bold text-orange-600">{selectedArchive.completion_time_minutes}</div>
                                        <div className="text-sm text-orange-800">דקות</div>
                                    </div>
                                </div>

                                {/* פרטי ביצוע */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>פרטי הביצוע</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div><strong>מבצע:</strong> {selectedArchive.executed_by_name}</div>
                                        {selectedArchive.approving_manager_name && (
                                            <div><strong>אישור אחמ"ש:</strong> {selectedArchive.approving_manager_name}</div>
                                        )}
                                        <div><strong>תאריך:</strong> {format(new Date(selectedArchive.execution_date), 'dd/MM/yyyy HH:mm')}</div>
                                        <div><strong>משמרת:</strong> {getShiftBadge(selectedArchive.shift_type)}</div>
                                        {selectedArchive.issues_summary !== 'אין בעיות' && (
                                            <div><strong>בעיות שנמצאו:</strong> {selectedArchive.issues_summary}</div>
                                        )}
                                        {selectedArchive.general_notes && (
                                            <div><strong>הערות כלליות:</strong> {selectedArchive.general_notes}</div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* תוצאות מפורטות - עם עריכה */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            תוצאות מפורטות
                                            {isEditing && <span className="text-sm text-blue-600 mr-2">(מצב עריכה)</span>}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {(isEditing ? editedResults : selectedArchive.detailed_results)?.map((result, index) => (
                                                <div 
                                                    key={index} 
                                                    className={`p-3 rounded-lg border ${result.completed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <div className="font-semibold">{result.area} - {result.task}</div>
                                                            
                                                            {isEditing ? (
                                                                <div className="mt-2 space-y-2">
                                                                    <div className="flex items-center gap-4">
                                                                        <label className="flex items-center gap-2">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={result.completed}
                                                                                onChange={(e) => handleResultChange(index, 'completed', e.target.checked)}
                                                                                className="w-4 h-4"
                                                                            />
                                                                            <span className="text-sm font-medium">הושלם</span>
                                                                        </label>
                                                                    </div>
                                                                    <Input
                                                                        placeholder="מי ביצע את המשימה?"
                                                                        value={result.performed_by || ''}
                                                                        onChange={(e) => handleResultChange(index, 'performed_by', e.target.value)}
                                                                        className="text-sm"
                                                                    />
                                                                    {result.notes && (
                                                                        <div className="text-sm text-gray-600">הערות: {result.notes}</div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {result.performed_by && (
                                                                        <div className="text-sm text-blue-600 mt-1">
                                                                            <strong>בוצע ע"י:</strong> {result.performed_by}
                                                                        </div>
                                                                    )}
                                                                    {result.notes && (
                                                                        <div className="text-sm text-gray-600 mt-1">הערות: {result.notes}</div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {!isEditing && (
                                                                result.completed ? (
                                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                                ) : (
                                                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                                                )
                                                            )}
                                                            {result.photo_url && (
                                                               <Button
                                                                   size="sm"
                                                                   variant="outline"
                                                                   onClick={() => setViewingPhoto(result.photo_url)}
                                                                   className="flex items-center gap-1"
                                                               >
                                                                   <Image className="w-3 h-3" />
                                                                   צפה בתמונה
                                                               </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}