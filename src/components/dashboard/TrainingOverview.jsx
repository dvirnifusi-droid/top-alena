import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// נתוני דמו
const mockTrainings = [
  { id: 1, title: "בטיחות במטבח", progress: 75 },
  { id: 2, title: "שירות לקוחות מתקדם", progress: 60 },
  { id: 3, title: "הכרת התפריט החדש", progress: 90 }
];

export default function TrainingOverview({ trainings = [], isLoading = false }) {
  const displayTrainings = trainings.length > 0 ? trainings : mockTrainings;

  return (
    <Card className="shadow-lg border-slate-200">
      <CardHeader className="flex flex-row items-center gap-3">
        <GraduationCap className="w-6 h-6 text-green-500" />
        <CardTitle className="text-slate-800">סטטוס הכשרות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))
        ) : (
          displayTrainings.map((training) => (
            <div key={training.id}>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm font-medium text-slate-700">{training.title}</p>
                <p className="text-sm font-semibold text-green-600">{training.progress || 75}%</p>
              </div>
              <Progress value={training.progress || 75} className="h-2" />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}