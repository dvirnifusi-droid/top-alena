import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, CheckCircle, Loader2, AlertCircle } from "lucide-react";

const ENTITIES = [
  "Employee", "WorkShift", "ShiftTracking", "TipReport", "DailySales",
  "ShiftEndReport", "MenuItem", "MenuTrainingResult", "QueueEntry", "Customer",
  "TimeTreat", "RestaurantProfile", "Incident", "Delivery", "Courier",
  "TrainingVideo", "TriviaQuestion", "GameQuestion", "QueueGameSession",
  "DeviceAsset", "GeminiFileCache", "KnowledgeBase", "StaffQuestion",
  "PendingQuestion", "ChecklistExecution", "Checklist", "LeaveRequest",
  "ShiftSwapRequest", "EmployeeAvailability", "CoinTransaction", "ShoutOut",
  "DailyChallenge", "ShiftMessage", "Reward", "Achievement", "UserAchievement",
  "EmployeePerformance", "StaffPerformance", "DailyBrief", "Reservation",
  "Table", "Order", "TableSession", "CustomerFeedback", "ManualSurvey",
  "TipReport", "Inventory", "Supplier", "Invoice", "InvoiceItem",
  "CampaignLog", "MessageTemplate", "MarketingTask", "MarketingGoal",
  "BrainstormSession", "MarketingInsight", "TrainingCourse", "TrainingEnrollment",
  "TrainingLesson", "Quiz", "QuizQuestion", "GamificationRule", "Apparel",
  "EmployeeApparel", "BeecommConfig", "BeecommOrder", "SeatingLayout",
  "DeliveryCustomer", "EmployeeStory", "ConversationScript", "ToneScenario",
  "Role", "WorkPosition", "ReservationSettings", "Event", "Product",
  "ServiceStep", "AiSuggestion", "PendingInvitation"
];

const toCSV = (rows) => {
  if (!rows || rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const lines = rows.map(row =>
    keys.map(k => {
      const val = row[k];
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...lines].join("\n");
};

export default function DataExport() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [results, setResults] = useState([]);

  const handleExport = async () => {
    setStatus("loading");
    setResults([]);
    const zip = new JSZip();
    const total = ENTITIES.length;
    setProgress({ current: 0, total, name: "" });

    const exportResults = [];

    for (let i = 0; i < ENTITIES.length; i++) {
      const name = ENTITIES[i];
      setProgress({ current: i + 1, total, name });
      try {
        const data = await base44.entities[name].list();
        const csv = toCSV(data);
        zip.file(`${name}.csv`, csv);
        exportResults.push({ name, count: data.length, ok: true });
      } catch {
        exportResults.push({ name, count: 0, ok: false });
      }
    }

    setResults(exportResults);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topalena-export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("done");
  };

  return (
    <div className="max-w-2xl mx-auto p-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Download className="w-6 h-6 text-primary" />
            ייצוא כל הדאטה
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            מוריד את כל הטבלאות כקובץ ZIP עם CSV נפרד לכל ישות
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleExport}
            disabled={status === "loading"}
            className="w-full"
            size="lg"
          >
            {status === "loading" ? (
              <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> מייצא... ({progress.current}/{progress.total}) {progress.name}</>
            ) : (
              <><Download className="w-4 h-4 ml-2" /> ייצא הכל כ-ZIP</>
            )}
          </Button>

          {status === "loading" && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-4 space-y-1 max-h-72 overflow-y-auto text-sm">
              {results.map(r => (
                <div key={r.name} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted">
                  <span className="flex items-center gap-2">
                    {r.ok
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <AlertCircle className="w-4 h-4 text-red-400" />}
                    {r.name}
                  </span>
                  <span className="text-muted-foreground">{r.ok ? `${r.count} רשומות` : "שגיאה"}</span>
                </div>
              ))}
            </div>
          )}

          {status === "done" && (
            <p className="text-green-600 font-semibold text-center">✅ הקובץ הורד בהצלחה!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}