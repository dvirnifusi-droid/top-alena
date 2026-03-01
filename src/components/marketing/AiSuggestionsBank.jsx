import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiSuggestion } from '@/entities/AiSuggestion';
import { 
    Archive, 
    Search, 
    Play, 
    CheckCircle, 
    Filter,
    Lightbulb,
    Target,
    TrendingUp,
    Users,
    DollarSign,
    Settings,
    Brain,
    Eye
} from "lucide-react";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function AiSuggestionsBank({ suggestions, onRefresh }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedSuggestion, setSelectedSuggestion] = useState(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);

    const typeLabels = {
        marketing_task: 'משימת שיווק',
        revenue_strategy: 'אסטרטגיית הכנסות', 
        menu_optimization: 'אופטימיזציית תפריט',
        customer_retention: 'שימור לקוחות',
        operational_improvement: 'שיפור תפעולי',
        staff_advice: 'ייעוץ לצוות',
        general_business: 'עסקי כללי'
    };

    const statusLabels = {
        saved: 'נשמר',
        planning: 'בתכנון',
        in_progress: 'בתהליך',
        completed: 'הושלם',
        dismissed: 'נדחה'
    };

    const impactColors = {
        low: 'bg-blue-100 text-blue-800',
        medium: 'bg-yellow-100 text-yellow-800',
        high: 'bg-orange-100 text-orange-800',
        game_changing: 'bg-red-100 text-red-800'
    };

    const effortColors = {
        low: 'bg-green-100 text-green-800',
        medium: 'bg-yellow-100 text-yellow-800',
        high: 'bg-red-100 text-red-800'
    };

    const statusColors = {
        saved: 'bg-gray-100 text-gray-800',
        planning: 'bg-blue-100 text-blue-800',
        in_progress: 'bg-orange-100 text-orange-800',
        completed: 'bg-green-100 text-green-800',
        dismissed: 'bg-red-100 text-red-800'
    };

    const getTypeIcon = (type) => {
        const icons = {
            marketing_task: Target,
            revenue_strategy: DollarSign,
            menu_optimization: Settings,
            customer_retention: Users,
            operational_improvement: TrendingUp,
            staff_advice: Users,
            general_business: Brain
        };
        return icons[type] || Lightbulb;
    };

    const filteredSuggestions = suggestions.filter(suggestion => {
        const matchesSearch = suggestion.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            suggestion.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (suggestion.tags && suggestion.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
        
        const matchesType = selectedType === 'all' || suggestion.suggestion_type === selectedType;
        const matchesStatus = selectedStatus === 'all' || suggestion.implementation_status === selectedStatus;

        return matchesSearch && matchesType && matchesStatus;
    });

    const handleStatusUpdate = async (suggestionId, newStatus) => {
        try {
            await AiSuggestion.update(suggestionId, { implementation_status: newStatus });
            onRefresh();
        } catch (error) {
            console.error('Error updating suggestion status:', error);
        }
    };

    const handleAddNotes = async (suggestionId, notes) => {
        try {
            await AiSuggestion.update(suggestionId, { notes });
            onRefresh();
        } catch (error) {
            console.error('Error adding notes:', error);
        }
    };

    const openDetailDialog = (suggestion) => {
        setSelectedSuggestion(suggestion);
        setShowDetailDialog(true);
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-xl bg-gradient-to-r from-green-50 to-emerald-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                        <Archive className="w-6 h-6" />
                        מאגר הצעות AI - כל הרעיונות הטובים במקום אחד
                    </CardTitle>
                    <p className="text-green-600">כאן נשמרות כל ההצעות של ה-AI כדי שלא תאבד אותן!</p>
                </CardHeader>
            </Card>

            {/* פילטרים וחיפוש */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="חפש הצעות..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger>
                                <SelectValue placeholder="סוג הצעה" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל הסוגים</SelectItem>
                                {Object.entries(typeLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="סטטוס" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל הסטטוסים</SelectItem>
                                {Object.entries(statusLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">
                                {filteredSuggestions.length} מתוך {suggestions.length} הצעות
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* רשימת הצעות */}
            <div className="grid gap-4">
                {filteredSuggestions.length === 0 ? (
                    <Card className="text-center p-8">
                        <CardContent>
                            <div className="space-y-4">
                                <Archive className="w-12 h-12 mx-auto text-gray-400" />
                                <h3 className="text-lg font-semibold">אין הצעות תואמות</h3>
                                <p className="text-gray-600">נסה לשנות את הפילטרים או המילות החיפוש</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    filteredSuggestions.map((suggestion) => {
                        const IconComponent = getTypeIcon(suggestion.suggestion_type);
                        
                        return (
                            <Card key={suggestion.id} className="shadow-md hover:shadow-lg transition-shadow">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-3 flex-1">
                                            <div className="p-2 bg-purple-100 rounded-md">
                                                <IconComponent className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-lg">{suggestion.title}</h3>
                                                <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                                                    {suggestion.content.substring(0, 150)}...
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openDetailDialog(suggestion)}
                                        >
                                            <Eye className="w-4 h-4 ml-2" />
                                            פרטים
                                        </Button>
                                    </div>
                                    
                                    <div className="flex gap-2 flex-wrap mt-3">
                                        <Badge className={statusColors[suggestion.implementation_status]}>
                                            {statusLabels[suggestion.implementation_status]}
                                        </Badge>
                                        
                                        <Badge variant="outline">
                                            {typeLabels[suggestion.suggestion_type]}
                                        </Badge>
                                        
                                        {suggestion.estimated_impact && (
                                            <Badge className={impactColors[suggestion.estimated_impact]}>
                                                השפעה: {suggestion.estimated_impact}
                                            </Badge>
                                        )}
                                        
                                        {suggestion.estimated_effort && (
                                            <Badge className={effortColors[suggestion.estimated_effort]}>
                                                מאמץ: {suggestion.estimated_effort}
                                            </Badge>
                                        )}
                                        
                                        {suggestion.tags && suggestion.tags.slice(0, 3).map((tag, index) => (
                                            <Badge key={index} variant="outline" className="text-xs">
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </CardHeader>
                                
                                <CardContent className="pt-0">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-500">
                                            נוצר: {format(new Date(suggestion.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                                        </span>
                                        
                                        <div className="flex gap-2">
                                            {suggestion.implementation_status === 'saved' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleStatusUpdate(suggestion.id, 'planning')}
                                                    className="bg-blue-500 hover:bg-blue-600"
                                                >
                                                    <Play className="w-4 h-4 ml-1" />
                                                    התחל תכנון
                                                </Button>
                                            )}
                                            
                                            {suggestion.implementation_status === 'planning' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleStatusUpdate(suggestion.id, 'in_progress')}
                                                    className="bg-orange-500 hover:bg-orange-600"
                                                >
                                                    <Target className="w-4 h-4 ml-1" />
                                                    התחל יישום
                                                </Button>
                                            )}
                                            
                                            {suggestion.implementation_status === 'in_progress' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleStatusUpdate(suggestion.id, 'completed')}
                                                    className="bg-green-500 hover:bg-green-600"
                                                >
                                                    <CheckCircle className="w-4 h-4 ml-1" />
                                                    הושלם
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* דיאלוג פרטים מלא */}
            <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    {selectedSuggestion && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-xl">{selectedSuggestion.title}</DialogTitle>
                            </DialogHeader>
                            
                            <div className="space-y-6">
                                <div className="flex gap-2 flex-wrap">
                                    <Badge className={statusColors[selectedSuggestion.implementation_status]}>
                                        {statusLabels[selectedSuggestion.implementation_status]}
                                    </Badge>
                                    <Badge variant="outline">
                                        {typeLabels[selectedSuggestion.suggestion_type]}
                                    </Badge>
                                    {selectedSuggestion.estimated_impact && (
                                        <Badge className={impactColors[selectedSuggestion.estimated_impact]}>
                                            השפעה: {selectedSuggestion.estimated_impact}
                                        </Badge>
                                    )}
                                    {selectedSuggestion.estimated_effort && (
                                        <Badge className={effortColors[selectedSuggestion.estimated_effort]}>
                                            מאמץ: {selectedSuggestion.estimated_effort}
                                        </Badge>
                                    )}
                                </div>
                                
                                <div>
                                    <h4 className="font-semibold mb-2">תוכן ההצעה:</h4>
                                    <div className="bg-gray-50 p-4 rounded-lg">
                                        <p className="whitespace-pre-wrap">{selectedSuggestion.content}</p>
                                    </div>
                                </div>
                                
                                {selectedSuggestion.ai_context && (
                                    <div>
                                        <h4 className="font-semibold mb-2">הקשר:</h4>
                                        <p className="text-gray-600">{selectedSuggestion.ai_context}</p>
                                    </div>
                                )}
                                
                                {selectedSuggestion.tags && selectedSuggestion.tags.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2">תגיות:</h4>
                                        <div className="flex gap-1 flex-wrap">
                                            {selectedSuggestion.tags.map((tag, index) => (
                                                <Badge key={index} variant="outline" className="text-xs">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                <div>
                                    <h4 className="font-semibold mb-2">הערות:</h4>
                                    <Textarea
                                        placeholder="הוסף הערות או רעיונות נוספים..."
                                        defaultValue={selectedSuggestion.notes || ''}
                                        onBlur={(e) => handleAddNotes(selectedSuggestion.id, e.target.value)}
                                        className="min-h-24"
                                    />
                                </div>
                                
                                <div className="flex justify-between items-center pt-4 border-t">
                                    <span className="text-sm text-gray-500">
                                        נוצר: {format(new Date(selectedSuggestion.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                                    </span>
                                    
                                    <div className="flex gap-2">
                                        <Select
                                            value={selectedSuggestion.implementation_status}
                                            onValueChange={(newStatus) => {
                                                handleStatusUpdate(selectedSuggestion.id, newStatus);
                                                setSelectedSuggestion({...selectedSuggestion, implementation_status: newStatus});
                                            }}
                                        >
                                            <SelectTrigger className="w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(statusLabels).map(([key, label]) => (
                                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        
                                        <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                                            סגור
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}