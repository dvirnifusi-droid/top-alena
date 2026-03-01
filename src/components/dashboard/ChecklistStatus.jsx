import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, CheckCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// נתוני דמו
const mockExecutions = [
  { id: 1, title: "בדיקת פתיחה - בר", status: "completed" },
  { id: 2, title: "בדיקת מטבח - בוקר", status: "completed" },
  { id: 3, title: "בדיקת ניקיון - שירותים", status: "requires_attention" }
];

export default function ChecklistStatus({ executions = [], isLoading = false }) {
  const displayExecutions = executions.length > 0 ? executions : mockExecutions;

  return (
    <Card className="shadow-lg border-slate-200">
      <CardHeader className="flex flex-row items-center gap-3">
        <CheckSquare className="w-6 h-6 text-purple-500" />
        <CardTitle className="text-slate-800">בדיקות אחרונות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
        ) : (
          displayExecutions.slice(0, 5).map((exec) => (
            <div key={exec.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70">
              <p className="font-medium text-sm text-slate-700">{exec.title || 'בדיקה כללית'}</p>
              {exec.status === 'completed' ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs font-semibold">הושלם</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-semibold">דורש טיפול</span>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}