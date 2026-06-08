import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeBase } from "@/entities/all";
import { Brain, Plus, Check } from "lucide-react";

export default function AiQuickAdd() {
    const [isOpen, setIsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        category: '',
        title: '',
        content: '',
        keywords: ''
    });

    const handleSave = async () => {
        if (!formData.title || !formData.content || !formData.category) return;

        setSaving(true);
        try {
            await KnowledgeBase.create({
                ...formData,
                keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k),
                last_updated: new Date().toISOString(),
                updated_by: 'admin'
            });
            
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setIsOpen(false);
                setFormData({ category: '', title: '', content: '', keywords: '' });
            }, 2000);
        } catch (error) {
            console.error('שגיאה בשמירה:', error);
        }
        setSaving(false);
    };

    if (!isOpen) {
        return (
            <Card className="bg-gradient-to-r from-[#A04A2E] to-[#44512C] text-white cursor-pointer hover:shadow-lg transition-all duration-300" onClick={() => setIsOpen(true)}>
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <Brain className="w-10 h-10" />
                        <div>
                            <h3 className="text-xl font-bold">הוסף ידע לעוזר הדיגיטלי</h3>
                            <p className="text-[#F4ECD8]">הכנס מתכונים, נהלים ומידע חדש</p>
                        </div>
                        <Plus className="w-6 h-6" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-xl">
            <CardHeader className="bg-gradient-to-r from-[#A04A2E] to-[#44512C] text-white">
                <CardTitle className="flex items-center gap-2">
                    <Brain className="w-6 h-6" />
                    הוספת ידע חדש לעוזר הדיגיטלי
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                {success ? (
                    <div className="text-center py-8">
                        <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-green-700">נשמר בהצלחה!</h3>
                        <p className="text-gray-600">המידע נוסף לבסיס הידע של העוזר הדיגיטלי</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">קטגוריה</label>
                                <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
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
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">כותרת</label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                                    placeholder="למשל: מתכון לחומוס הבית"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium mb-2">תוכן מפורט</label>
                            <Textarea
                                value={formData.content}
                                onChange={(e) => setFormData({...formData, content: e.target.value})}
                                placeholder="הזן את המידע המפורט כאן..."
                                className="h-32"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium mb-2">מילות מפתח (מופרדות בפסיקים)</label>
                            <Input
                                value={formData.keywords}
                                onChange={(e) => setFormData({...formData, keywords: e.target.value})}
                                placeholder="למשל: חומוס, מתכון, טחינה, איך מכינים"
                            />
                        </div>
                        
                        <div className="flex gap-4">
                            <Button 
                                onClick={handleSave} 
                                disabled={saving || !formData.title || !formData.content || !formData.category}
                                className="flex-1 bg-[#A04A2E] hover:bg-[#7A3722]"
                            >
                                {saving ? 'שומר...' : 'שמור'}
                            </Button>
                            <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                                ביטול
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}