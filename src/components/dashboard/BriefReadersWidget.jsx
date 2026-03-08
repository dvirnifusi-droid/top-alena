import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

export default function BriefReadersWidget() {
  const [data, setData] = useState({ lunch: [], dinner: [] });
  const [loading, setLoading] = useState(true);

  const loadBriefReaders = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const briefs = await base44.entities.DailyBrief.filter({ date: today });

      const result = { lunch: [], dinner: [] };

      for (const brief of briefs) {
        const shiftType = brief.shift_type || 'lunch';
        if (!result[shiftType]) result[shiftType] = [];

        // רשימת עובדים שקראו
        if (brief.read_by && brief.read_by.length > 0) {
          const employees = await base44.entities.Employee.list();
          const readers = brief.read_by
            .map(id => employees.find(e => e.id === id)?.full_name)
            .filter(Boolean);
          
          result[shiftType] = readers;
        }
      }

      setData(result);
    } catch (error) {
      console.error('Error loading brief readers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBriefReaders();
    const interval = setInterval(loadBriefReaders, 30000); // Refresh every 30 seconds
    
    // Subscribe to DailyBrief changes for real-time updates
    const unsubscribe = base44.entities.DailyBrief.subscribe((event) => {
      if (event.type === 'update') {
        loadBriefReaders();
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const ShiftSection = ({ type, label, readers }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-800">{label}</h3>
      </div>
      {readers.length > 0 ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-semibold text-green-800">{readers.length} עובדים קראו את הבריף</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <span className="text-gray-600">לא פתחו בדקים בעדיין</span>
        </div>
      )}
    </div>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          עובדים שקראו את הבריף
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin w-5 h-5 text-gray-400" />
          </div>
        ) : data.lunch.length === 0 && data.dinner.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <AlertCircle className="w-4 h-4" />
            <span>לא פורסמו תדריכים להיום</span>
          </div>
        ) : (
          <>
            <ShiftSection type="lunch" label="☀️ צהריים" readers={data.lunch} />
            <div className="border-t pt-3" />
            <ShiftSection type="dinner" label="🌙 ערב" readers={data.dinner} />
          </>
        )}
      </CardContent>
    </Card>
  );
}