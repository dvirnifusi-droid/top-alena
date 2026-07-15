import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, Eye, Trash2, CheckCircle2, Bell } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { format, isAfter, subHours } from "date-fns";

export default function StoriesNotifications() {
  const [user, setUser] = useState(null);
  const [stories, setStories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        if (!currentUser) return;

        // `employee_id` on stories holds an Employee id, not the auth User id
        // (they differ). Resolve the current Employee by email — the same
        // email-match pattern used in EmployeeHome.jsx / CharacterLounge.jsx.
        const allEmployees = await base44.entities.Employee.list();
        const currentEmployee = allEmployees.find(
          e => e.email?.toLowerCase() === currentUser.email?.toLowerCase()
        );

        // Load all stories
        const allStories = await base44.entities.EmployeeStory.list("-created_date", 1000);
        setStories(allStories);

        // Generate notifications for user's stories
        const userStories = currentEmployee
          ? allStories.filter(s => s.employee_id === currentEmployee.id)
          : [];
        const notifs = [];

        userStories.forEach(story => {
          // New likes
          const likes = story.likes || [];
          likes.forEach(employeeId => {
            notifs.push({
              id: `like-${story.id}-${employeeId}`,
              type: "like",
              story_id: story.id,
              story_caption: story.caption,
              employee_id: employeeId,
              timestamp: story.created_date,
              read: false
            });
          });

          // New comments
          const comments = story.comments || [];
          comments.forEach(comment => {
            notifs.push({
              id: `comment-${story.id}-${comment.employee_id}`,
              type: "comment",
              story_id: story.id,
              story_caption: story.caption,
              employee_name: comment.employee_name,
              comment_text: comment.text,
              timestamp: comment.created_at,
              read: false
            });
          });

          // New views
          const views = story.views || [];
          views.forEach(view => {
            notifs.push({
              id: `view-${story.id}-${view.employee_id}`,
              type: "view",
              story_id: story.id,
              story_caption: story.caption,
              employee_name: view.employee_name,
              timestamp: story.created_date,
              read: false
            });
          });

          // New questions
          const questions = story.questions || [];
          questions.forEach(question => {
            notifs.push({
              id: `question-${story.id}-${question.employee_id}`,
              type: "question",
              story_id: story.id,
              story_caption: story.caption,
              employee_name: question.employee_name,
              question_text: question.text,
              timestamp: question.created_at,
              read: false
            });
          });
        });

        // Sort by timestamp (newest first)
        notifs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setNotifications(notifs);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">טוען...</div>;
  }

  if (!user) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-bold text-red-700 mb-2">⚠️ נדרשת התחברות</h2>
            <p className="text-red-600">אנא התחבר לצפייה בהודעות</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter notifications
  const filtered = notifications.filter(n => {
    if (filter === "all") return true;
    return n.type === filter;
  });

  // Get emoji for notification type
  const getIcon = (type) => {
    switch (type) {
      case "like": return <Heart className="w-5 h-5 text-red-500" />;
      case "comment": return <MessageCircle className="w-5 h-5 text-[#44512C]" />;
      case "view": return <Eye className="w-5 h-5 text-[#A04A2E]" />;
      case "question": return <MessageCircle className="w-5 h-5 text-green-500" />;
      default: return null;
    }
  };

  const getLabel = (type) => {
    switch (type) {
      case "like": return "❤️ לייק";
      case "comment": return "💬 תגובה";
      case "view": return "👁️ צפייה";
      case "question": return "❓ שאלה";
      default: return "";
    }
  };

  const getColor = (type) => {
    switch (type) {
      case "like": return "bg-red-50 border-red-200";
      case "comment": return "bg-[#F4ECD8] border-[#E8D9B5]";
      case "view": return "bg-[#F4ECD8] border-purple-200";
      case "question": return "bg-green-50 border-green-200";
      default: return "";
    }
  };

  // Count by type
  const counts = {
    all: notifications.length,
    like: notifications.filter(n => n.type === "like").length,
    comment: notifications.filter(n => n.type === "comment").length,
    view: notifications.filter(n => n.type === "view").length,
    question: notifications.filter(n => n.type === "question").length,
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <PageHeader title="הודעות סטוריז" subtitle="כל הפעילות בסטוריז שלך" icon={Bell} />

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: "all", label: `כל ההודעות (${counts.all})` },
          { value: "like", label: `לייקים (${counts.like})` },
          { value: "comment", label: `תגובות (${counts.comment})` },
          { value: "view", label: `צפיות (${counts.view})` },
          { value: "question", label: `שאלות (${counts.question})` }
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              filter === value
                ? "bg-primary text-primary-foreground"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">אין הודעות</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((notif) => (
            <Card key={notif.id} className={`border-2 ${getColor(notif.type)}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="mt-1 flex-shrink-0">
                    {getIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className="text-xs">{getLabel(notif.type)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(notif.timestamp), "dd/MM HH:mm")}
                      </span>
                    </div>

                    {/* Notification Message */}
                    {notif.type === "like" && (
                      <p className="text-sm">
                        <span className="font-semibold">מישהו</span> אהב את הסטורי שלך
                        {notif.story_caption && <span className="text-muted-foreground">: "{notif.story_caption}"</span>}
                      </p>
                    )}

                    {notif.type === "comment" && (
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="font-semibold">{notif.employee_name}</span> הוסיף תגובה
                        </p>
                        <p className="bg-white/50 rounded p-2 text-xs">"{notif.comment_text}"</p>
                      </div>
                    )}

                    {notif.type === "view" && (
                      <p className="text-sm">
                        <span className="font-semibold">{notif.employee_name}</span> צפה בסטורי שלך
                        {notif.story_caption && <span className="text-muted-foreground">: "{notif.story_caption}"</span>}
                      </p>
                    )}

                    {notif.type === "question" && (
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="font-semibold">{notif.employee_name}</span> שאל שאלה
                        </p>
                        <p className="bg-white/50 rounded p-2 text-xs">"{notif.question_text}"</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}