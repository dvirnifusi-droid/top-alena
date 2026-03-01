import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarketingGoal } from "@/entities/MarketingGoal";
import { Target, Plus, TrendingUp, DollarSign, Users, Star } from "lucide-react";

export default function GoalsTracker({ goals, onRefresh }) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newGoal, setNewGoal] = useState({
        goal_name: '',
        goal_type: 'sales_increase',
        target_value: '',
        current_value: '',
        measurement_unit: 'percentage',
        target_date: ''
    });

    const handleAddGoal = async () => {
        if (!newGoal.goal_name || !newGoal.target_value || !newGoal.target_date) {
            alert('אנא מלא את כל השדות הנדרשים');
            return;
        }

        try {
            await MarketingGoal.create({
                ...newGoal,
                start_date: new Date().toISOString().split('T')[0],
                current_value: newGoal.current_value || 0,
                progress_percentage: 0
            });
            
            setNewGoal({
                goal_name: '',
                goal_type: 'sales_increase',
                target_value: '',
                current_value: '',
                measurement_unit: 'percentage',
                target_date: ''
            });
            setShowAddForm(false);
            onRefresh();
        } catch (error) {
            console.error('Error adding goal:', error);
            alert('שגיאה בהוספת היעד');
        }
    };

    const goalTypeIcons = {
        sales_increase: DollarSign,
        customer_acquisition: Users,
        brand_awareness: TrendingUp,
        social_engagement: Star,
        repeat_customers: Users,
        average_order_value: DollarSign,
        online_presence: TrendingUp,
        review_score: Star
    };

    const goalTypeLabels = {
        sales_increase: 'הגדלת מכירות',
        customer_acquisition: 'רכישת לקוחות',
        brand_awareness: 'מודעות למותג',
        social_engagement: 'מעורבות ברשתות',
        repeat_customers: 'לקוחות חוזרים',
        average_order_value: 'ערך הזמנה ממוצע',
        online_presence: 'נוכחות דיגיטלית',
        review_score: 'ציון ביקורות'
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">מעקב יעדים</h2>
                <Button onClick={() => setShowAddForm(!showAddForm)}>
                    <Plus className="w-4 h-4 mr-2" />
                    הוסף יעד
                </Button>
            </div>

            {showAddForm && (
                <Card className="border-2 border-dashed border-blue-300 bg-blue-50">
                    <CardHeader>
                        <CardTitle>יעד חדש</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">שם היעד</label>
                                <Input
                                    value={newGoal.goal_name}
                                    onChange={(e) => setNewGoal({...newGoal, goal_name: e.target.value})}
                                    placeholder="למשל: הגדלת מכירות ב-50%"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">סוג יעד</label>
                                <Select value={newGoal.goal_type} onValueChange={(value) => setNewGoal({...newGoal, goal_type: value})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(goalTypeLabels).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">ערך יעד</label>
                                <Input
                                    type="number"
                                    value={newGoal.target_value}
                                    onChange={(e) => setNewGoal({...newGoal, target_value: e.target.value})}
                                    placeholder="100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">ערך נוכחי</label>
                                <Input
                                    type="number"
                                    value={newGoal.current_value}
                                    onChange={(e) => setNewGoal({...newGoal, current_value: e.target.value})}
                                    placeholder="50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">יחידת מידה</label>
                                <Select value={newGoal.measurement_unit} onValueChange={(value) => setNewGoal({...newGoal, measurement_unit: value})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">אחוזים</SelectItem>
                                        <SelectItem value="absolute_number">מספר מוחלט</SelectItem>
                                        <SelectItem value="money">כסף</SelectItem>
                                        <SelectItem value="rating">דירוג</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">תאריך יעד</label>
                                <Input
                                    type="date"
                                    value={newGoal.target_date}
                                    onChange={(e) => setNewGoal({...newGoal, target_date: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={handleAddGoal}>שמור יעד</Button>
                            <Button variant="outline" onClick={() => setShowAddForm(false)}>ביטול</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6">
                {goals.length === 0 ? (
                    <Card className="text-center p-8">
                        <CardContent>
                            <Target className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                            <h3 className="text-lg font-semibold mb-2">עוד אין יעדים</h3>
                            <p className="text-gray-600">הוסף יעד ראשון כדי להתחיל לעקוב אחר ההתקדמות</p>
                        </CardContent>
                    </Card>
                ) : (
                    goals.map((goal) => {
                        const IconComponent = goalTypeIcons[goal.goal_type] || Target;
                        const progress = goal.current_value && goal.target_value ? 
                            Math.min((goal.current_value / goal.target_value) * 100, 100) : 0;
                        
                        return (
                            <Card key={goal.id} className="shadow-lg">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <IconComponent className="w-8 h-8 text-blue-600" />
                                            <div>
                                                <CardTitle>{goal.goal_name}</CardTitle>
                                                <Badge variant="secondary">{goalTypeLabels[goal.goal_type]}</Badge>
                                            </div>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-2xl font-bold text-blue-600">{progress.toFixed(0)}%</div>
                                            <div className="text-sm text-gray-500">הושלם</div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <Progress value={progress} className="h-3" />
                                        <div className="flex justify-between text-sm text-gray-600">
                                            <span>נוכחי: {goal.current_value}</span>
                                            <span>יעד: {goal.target_value}</span>
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            יעד עד: {new Date(goal.target_date).toLocaleDateString('he-IL')}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}