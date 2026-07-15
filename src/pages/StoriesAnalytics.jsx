import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Eye, Heart, Upload, MessageCircle, Camera } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { format, subDays, startOfDay } from "date-fns";

const COLORS = ["#ff7300", "#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export default function StoriesAnalytics() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    const allStories = await base44.entities.EmployeeStory.list("-created_date", 1000);
    
    // Filter by date range
    const cutoffDate = subDays(new Date(), timeRange);
    const filtered = allStories.filter(s => new Date(s.created_date) > cutoffDate);
    
    setStories(filtered);
    setLoading(false);
  };

  // Daily stats
  const dailyStats = {};
  stories.forEach(story => {
    const day = format(new Date(story.created_date), "dd/MM");
    if (!dailyStats[day]) {
      dailyStats[day] = { day, posts: 0, views: 0, likes: 0, comments: 0 };
    }
    dailyStats[day].posts += 1;
    dailyStats[day].views += (story.views?.length || 0);
    dailyStats[day].likes += (story.likes?.length || 0);
    dailyStats[day].comments += (story.comments?.length || 0);
  });
  const dailyChartData = Object.values(dailyStats).sort((a, b) => a.day.localeCompare(b.day));

  // Employee breakdown
  const employeeStats = {};
  stories.forEach(story => {
    if (!employeeStats[story.employee_name]) {
      employeeStats[story.employee_name] = 0;
    }
    employeeStats[story.employee_name] += 1;
  });
  const topEmployees = Object.entries(employeeStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, value: count }));

  // Media type breakdown
  const mediaTypes = { image: 0, video: 0 };
  stories.forEach(s => {
    mediaTypes[s.media_type]++;
  });
  const mediaTypeData = [
    { name: "תמונות", value: mediaTypes.image },
    { name: "סרטונים", value: mediaTypes.video }
  ];

  // Summary stats
  const totalPosts = stories.length;
  const totalViews = stories.reduce((sum, s) => sum + (s.views?.length || 0), 0);
  const totalLikes = stories.reduce((sum, s) => sum + (s.likes?.length || 0), 0);
  const totalComments = stories.reduce((sum, s) => sum + (s.comments?.length || 0), 0);
  const avgEngagement = totalPosts > 0 ? Math.round((totalViews + totalLikes * 2 + totalComments * 3) / totalPosts) : 0;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4" dir="rtl">
      <PageHeader title="ניתוח סטוריז" subtitle="סטטיסטיקות מפורטות של כל הסטוריז" icon={Camera} />

      {/* Time Range Filter */}
      <div className="flex gap-2">
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            onClick={() => setTimeRange(days)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              timeRange === days
                ? "bg-primary text-primary-foreground"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {days} ימים
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">טוען...</div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Upload className="w-5 h-5 text-[#44512C]" />
                  <span className="text-xs text-muted-foreground">סטוריז</span>
                </div>
                <div className="text-2xl font-bold">{totalPosts}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-[#A04A2E]" />
                  <span className="text-xs text-muted-foreground">צפיות</span>
                </div>
                <div className="text-2xl font-bold">{totalViews}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  <span className="text-xs text-muted-foreground">לייקים</span>
                </div>
                <div className="text-2xl font-bold">{totalLikes}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-5 h-5 text-green-500" />
                  <span className="text-xs text-muted-foreground">תגובות</span>
                </div>
                <div className="text-2xl font-bold">{totalComments}</div>
              </CardContent>
            </Card>
          </div>

          {/* Engagement Score */}
          <Card className="bg-gradient-to-r from-[#F4ECD8] to-[#F4ECD8] border-[#E8D9B5]">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black">{avgEngagement}</div>
                <div>
                  <h3 className="font-bold text-lg">ממוצע Engagement</h3>
                  <p className="text-sm text-muted-foreground">לכל סטורי</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Trends */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold mb-4">מגמה יומית</h3>
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="posts" stroke="#8884d8" name="סטוריז" />
                    <Line type="monotone" dataKey="views" stroke="#82ca9d" name="צפיות" />
                    <Line type="monotone" dataKey="likes" stroke="#ffc658" name="לייקים" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתונים</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Employees */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">עובדים הכי פעילים</h3>
                {topEmployees.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={topEmployees}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8884d8" name="סטוריז" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">אין נתונים</p>
                )}
              </CardContent>
            </Card>

            {/* Media Type */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-bold mb-4">סוגי תוכן</h3>
                {mediaTypeData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={mediaTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {mediaTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">אין נתונים</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}