import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Lightbulb, 
    TrendingUp, 
    Users, 
    Target, 
    DollarSign,
    CheckCircle,
    Clock
} from "lucide-react";

export default function InsightsPanel({ insights, onRefresh }) {
    const insightTypeIcons = {
        customer_behavior: Users,
        market_trend: TrendingUp,
        competitor_analysis: Target,
        performance_optimization: DollarSign,
        seasonal_opportunity: Lightbulb,
        cost_reduction: DollarSign,
        revenue_boost: TrendingUp
    };

    const insightTypeLabels = {
        customer_behavior: 'התנהגות לקוחות',
        market_trend: 'טרנד בשוק',
        competitor_analysis: 'ניתוח מתחרים',
        performance_optimization: 'אופטימיזציה',
        seasonal_opportunity: 'הזדמנות עונתית',
        cost_reduction: 'חיסכון בעלויות',
        revenue_boost: 'הגדלת הכנסות'
    };

    const impactColors = {
        low: 'bg-blue-100 text-blue-800',
        medium: 'bg-yellow-100 text-yellow-800',
        high: 'bg-orange-100 text-orange-800',
        game_changing: 'bg-red-100 text-red-800'
    };

    const urgencyColors = {
        low: 'bg-gray-100 text-gray-800',
        medium: 'bg-yellow-100 text-yellow-800',
        high: 'bg-orange-100 text-orange-800',
        critical: 'bg-red-100 text-red-800'
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">תובנות שיווקיות</h2>
                <Button onClick={onRefresh} variant="outline">
                    <Clock className="w-4 h-4 mr-2" />
                    רענן תובנות
                </Button>
            </div>

            {insights.length === 0 ? (
                <Card className="text-center p-8">
                    <CardContent>
                        <Lightbulb className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">אין תובנות זמינות</h3>
                        <p className="text-gray-600">תובנות חדשות יוצגו כאן ברגע שהמערכת תזהה דפוסים</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6">
                    {insights.map((insight) => {
                        const IconComponent = insightTypeIcons[insight.insight_type] || Lightbulb;
                        
                        return (
                            <Card key={insight.id} className="shadow-lg hover:shadow-xl transition-shadow">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full text-white">
                                                <IconComponent className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{insight.title}</CardTitle>
                                                <Badge variant="secondary">
                                                    {insightTypeLabels[insight.insight_type]}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Badge className={impactColors[insight.potential_impact]}>
                                                השפעה: {insight.potential_impact}
                                            </Badge>
                                            <Badge className={urgencyColors[insight.urgency]}>
                                                דחיפות: {insight.urgency}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-gray-700">{insight.description}</p>
                                    
                                    {insight.confidence_level && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">רמת ביטחון:</span>
                                            <div className="flex items-center gap-1">
                                                <div className="w-20 h-2 bg-gray-200 rounded-full">
                                                    <div 
                                                        className="h-2 bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                                                        style={{ width: `${insight.confidence_level}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-sm text-gray-600">{insight.confidence_level}%</span>
                                            </div>
                                        </div>
                                    )}

                                    {insight.recommended_actions && insight.recommended_actions.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-600" />
                                                פעולות מומלצות:
                                            </h4>
                                            <ul className="space-y-1">
                                                {insight.recommended_actions.map((action, index) => (
                                                    <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                                                        {action}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {insight.expected_roi && (
                                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-green-600" />
                                                <span className="text-sm font-medium text-green-800">
                                                    תשואה צפויה: {insight.expected_roi}%
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}