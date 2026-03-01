import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Clock } from "lucide-react";

export default function ChecklistHistory({ executions, checklists }) {
    const getChecklistTitle = (checklistId) => {
        const checklist = checklists.find(c => c.id === checklistId);
        return checklist?.title || 'צ\'קליסט לא ידוע';
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-4 h-4 text-green-600" />;
            case 'requires_attention':
                return <AlertTriangle className="w-4 h-4 text-red-600" />;
            default:
                return <Clock className="w-4 h-4 text-orange-600" />;
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-100 text-green-800">הושלם</Badge>;
            case 'requires_attention':
                return <Badge className="bg-red-100 text-red-800">דורש תשומת לב</Badge>;
            case 'in_progress':
                return <Badge className="bg-blue-100 text-blue-800">בתהליך</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">היסטוריית ביצועים</h3>
            
            {executions.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <p className="text-gray-500">עדיין לא בוצעו צ'קליסטים</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {executions.map((execution) => (
                        <Card key={execution.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-lg">
                                            {getChecklistTitle(execution.checklist_id)}
                                        </h4>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            {getStatusIcon(execution.status)}
                                            <span>
                                                {new Date(execution.execution_date).toLocaleString('he-IL')}
                                            </span>
                                        </div>
                                        {execution.notes && (
                                            <p className="text-sm text-gray-600 mt-2">
                                                <strong>הערות:</strong> {execution.notes}
                                            </p>
                                        )}
                                    </div>
                                    
                                    <div className="text-left space-y-2">
                                        {getStatusBadge(execution.status)}
                                        {execution.overall_score && (
                                            <div className="text-sm text-gray-600">
                                                ציון: <span className="font-bold">{execution.overall_score}%</span>
                                            </div>
                                        )}
                                        {execution.completion_time_minutes && (
                                            <div className="text-sm text-gray-600">
                                                זמן ביצוע: {execution.completion_time_minutes} דק'
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {execution.follow_up_required && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                                        <p className="text-sm text-red-800">
                                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                                            נדרש מעקב נוסף
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}