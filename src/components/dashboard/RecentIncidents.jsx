import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, ChevronRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

const severityConfig = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
};

// נתוני דמו כברירת מחדל
const mockIncidents = [
  {
    id: 1,
    title: "תלונת לקוח על איחור במטבח",
    incident_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    location: "שולחן 12",
    severity: "medium"
  },
  {
    id: 2,
    title: "תקלה במכונת הקפה",
    incident_date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    location: "בר",
    severity: "high"
  },
  {
    id: 3,
    title: "החלקה במטבח",
    incident_date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    location: "מטבח",
    severity: "critical"
  }
];

export default function RecentIncidents({ incidents = [], isLoading = false, onRefresh = () => {} }) {
  const displayIncidents = (incidents && incidents.length > 0) ? incidents : mockIncidents;

  return (
    <Card className="shadow-lg border-slate-200 h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-orange-500" />
          <CardTitle className="text-slate-800">תקריות אחרונות</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm">
            הצג הכל <ChevronRight className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-2 rounded-lg">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))
          ) : (
            displayIncidents.slice(0, 5).map((incident) => (
              <div key={incident.id} className="flex items-center gap-4 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{incident.title}</p>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {incident.incident_date ? formatDistanceToNow(new Date(incident.incident_date), { addSuffix: true, locale: he }) : ''}
                    </span>
                    <span>|</span>
                    <span>{incident.location}</span>
                  </div>
                </div>
                <Badge className={severityConfig[incident.severity] || severityConfig.medium}>
                  {incident.severity}
                </Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}