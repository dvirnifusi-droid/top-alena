import React, { useState, useEffect } from 'react';
import { Incident } from '@/entities/Incident';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  MessageSquare, 
  Calendar, 
  User, 
  Star,
  RefreshCw,
  Filter,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function EmployeeFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    employee: 'all',
    date: '',
    dateRange: 'all'
  });

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      // Get all staff incidents (employee feedback)
      const incidents = await Incident.filter({ 
        category: 'staff',
        visibility_level: 'managers_only' 
      }, '-incident_date');
      
      // Filter only feedback incidents
      const feedbackIncidents = incidents.filter(incident => 
        incident.incident_number?.startsWith('FEEDBACK-') || 
        incident.title?.includes('משוב עובד')
      );
      
      setFeedbacks(feedbackIncidents);
    } catch (error) {
      console.error('Error loading feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFeedbacks = feedbacks.filter(feedback => {
    if (filter.employee !== 'all' && !feedback.title.includes(filter.employee)) return false;
    if (filter.date && !feedback.incident_date.includes(filter.date)) return false;
    
    if (filter.dateRange !== 'all') {
      const feedbackDate = new Date(feedback.incident_date);
      const now = new Date();
      const days = filter.dateRange === 'week' ? 7 : filter.dateRange === 'month' ? 30 : 0;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      if (feedbackDate < cutoff) return false;
    }
    
    return true;
  });

  const getEmployeeNames = () => {
    const names = new Set();
    feedbacks.forEach(feedback => {
      const match = feedback.title.match(/משוב עובד: (.+?) -/);
      if (match) names.add(match[1]);
    });
    return Array.from(names);
  };

  const getAverageRatings = () => {
    let atmosphereTotal = 0, salesTotal = 0, effortTotal = 0, count = 0;
    
    filteredFeedbacks.forEach(feedback => {
      const description = feedback.description;
      const atmosphereMatch = description.match(/🏢 \*\*אווירה:\*\* (\d+)\/5/);
      const salesMatch = description.match(/💰 \*\*תחושת מכירה:\*\* (\d+)\/5/);
      const effortMatch = description.match(/💪 \*\*מאמץ אישי:\*\* (\d+)\/5/);
      
      if (atmosphereMatch && salesMatch && effortMatch) {
        atmosphereTotal += parseInt(atmosphereMatch[1]);
        salesTotal += parseInt(salesMatch[1]);
        effortTotal += parseInt(effortMatch[1]);
        count++;
      }
    });

    return count > 0 ? {
      atmosphere: (atmosphereTotal / count).toFixed(1),
      sales: (salesTotal / count).toFixed(1),
      effort: (effortTotal / count).toFixed(1),
      count
    } : { atmosphere: 0, sales: 0, effort: 0, count: 0 };
  };

  const stats = getAverageRatings();

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-blue-50 to-indigo-100" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 flex items-center gap-3">
              <MessageSquare className="w-8 h-8 lg:w-10 lg:h-10 text-blue-600" />
              משוב עובדים
            </h1>
            <p className="text-gray-600 mt-2">תובנות ומשוב מהעובדים על המשמרות</p>
          </div>
          <Button onClick={loadFeedbacks} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                סה"כ משובים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredFeedbacks.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">ממוצע אווירה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.atmosphere}</div>
                <div className="flex">
                  {Array.from({length: 5}).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(stats.atmosphere) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">ממוצע מכירות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.sales}</div>
                <div className="flex">
                  {Array.from({length: 5}).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(stats.sales) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">ממוצע מאמץ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.effort}</div>
                <div className="flex">
                  {Array.from({length: 5}).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(stats.effort) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              סינון משובים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>עובד</Label>
                <Select value={filter.employee} onValueChange={(value) => setFilter({...filter, employee: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל העובדים</SelectItem>
                    {getEmployeeNames().map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>תאריך ספציפי</Label>
                <Input 
                  type="date" 
                  value={filter.date}
                  onChange={(e) => setFilter({...filter, date: e.target.value})}
                />
              </div>

              <div>
                <Label>טווח זמן</Label>
                <Select value={filter.dateRange} onValueChange={(value) => setFilter({...filter, dateRange: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הזמן</SelectItem>
                    <SelectItem value="week">שבוע אחרון</SelectItem>
                    <SelectItem value="month">חודש אחרון</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feedbacks List */}
        <div className="space-y-4">
          {loading ? (
            <p className="text-center py-8">טוען משובים...</p>
          ) : filteredFeedbacks.length > 0 ? (
            filteredFeedbacks.map(feedback => (
              <Card key={feedback.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{feedback.title}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(feedback.incident_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {feedback.reported_by}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-line text-sm">
                    {feedback.description}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">אין משובים להצגה</h3>
                <p className="text-gray-500">לא נמצאו משובים עבור הסינון שנבחר</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}