import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Heart, Upload, TrendingUp } from "lucide-react";
import { format } from "date-fns";

export default function StoriesLeaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("all");

  useEffect(() => {
    loadLeaderboard();
  }, [timeRange]);

  const loadLeaderboard = async () => {
    setLoading(true);
    const allStories = await base44.entities.EmployeeStory.list("-created_date", 1000);
    
    // Filter by date if needed
    let filtered = allStories;
    if (timeRange === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filtered = allStories.filter(s => new Date(s.created_date) > weekAgo);
    } else if (timeRange === "month") {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      filtered = allStories.filter(s => new Date(s.created_date) > monthAgo);
    }

    // Aggregate by employee
    const employeeStats = {};
    filtered.forEach(story => {
      if (!employeeStats[story.employee_id]) {
        employeeStats[story.employee_id] = {
          employee_id: story.employee_id,
          employee_name: story.employee_name,
          avatar_url: story.avatar_url,
          stories_posted: 0,
          total_views: 0,
          total_likes: 0,
          total_comments: 0,
          engagement_score: 0,
        };
      }
      
      const stats = employeeStats[story.employee_id];
      stats.stories_posted += 1;
      stats.total_views += (story.views?.length || 0);
      stats.total_likes += (story.likes?.length || 0);
      stats.total_comments += (story.comments?.length || 0);
      stats.engagement_score = stats.total_views * 1 + stats.total_likes * 2 + stats.total_comments * 3;
    });

    // Sort by engagement score
    const sorted = Object.values(employeeStats)
      .sort((a, b) => b.engagement_score - a.engagement_score);

    setLeaderboard(sorted);
    setLoading(false);
  };

  const getRankBadge = (rank) => {
    if (rank === 0) return "🥇";
    if (rank === 1) return "🥈";
    if (rank === 2) return "🥉";
    return `${rank + 1}.`;
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold mb-2">🏆 לוח דירוג סטוריז</h1>
        <p className="text-muted-foreground">דירוג עובדים לפי פעילות וecommerce בסטוריז</p>
      </div>

      {/* Time Range Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setTimeRange("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            timeRange === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          כל הזמן
        </button>
        <button
          onClick={() => setTimeRange("month")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            timeRange === "month"
              ? "bg-primary text-primary-foreground"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          חודש אחרון
        </button>
        <button
          onClick={() => setTimeRange("week")}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            timeRange === "week"
              ? "bg-primary text-primary-foreground"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          שבוע אחרון
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : leaderboard.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">אין נתונים</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((employee, index) => (
            <Card key={employee.employee_id} className={`border-2 ${index < 3 ? "bg-[#FAF5E8] border-yellow-200" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="text-3xl font-black w-12 h-12 flex items-center justify-center rounded-full bg-gray-100">
                    {getRankBadge(index)}
                  </div>

                  {/* Avatar & Name */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                      {employee.avatar_url
                        ? <img src={employee.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <span className="text-lg font-bold flex items-center justify-center h-full">{employee.employee_name?.charAt(0)}</span>}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{employee.employee_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        דרגת engagement: {Math.round(employee.engagement_score)}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{employee.stories_posted}</div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Upload className="w-3 h-3" /> סטוריז
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{employee.total_views}</div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Eye className="w-3 h-3" /> צפיות
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-500">{employee.total_likes}</div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Heart className="w-3 h-3" /> לייקים
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[#44512C]">{employee.total_comments}</div>
                      <div className="text-xs text-muted-foreground">תגובות</div>
                    </div>
                  </div>

                  {/* Mobile Stats */}
                  <div className="sm:hidden flex gap-2">
                    <Badge variant="outline">📤 {employee.stories_posted}</Badge>
                    <Badge variant="outline">👁️ {employee.total_views}</Badge>
                    <Badge variant="outline">❤️ {employee.total_likes}</Badge>
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