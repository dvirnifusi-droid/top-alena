import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Phone, MessageSquare, Download, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function QueueHistory() {
  const [entries, setEntries] = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const all = await base44.entities.QueueEntry.list('-timestamp_register', 500);
        setEntries(all);
        setLoading(false);
      } catch (e) {
        console.error('Error fetching queue history:', e);
        setLoading(false);
      }
    };
    fetchEntries();
  }, []);

  useEffect(() => {
    let filtered = entries;

    // סנן לפי סטטוס
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }

    // סנן לפי תאריך
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(e => {
        const entryDate = new Date(e.timestamp_register);
        const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
        if (dateFilter === 'today') return entryDay.getTime() === today.getTime();
        if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return entryDay.getTime() >= weekAgo.getTime();
        }
        if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return entryDay.getTime() >= monthAgo.getTime();
        }
        return true;
      });
    }

    // חיפוש לפי שם או טלפון
    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.phone?.includes(searchTerm)
      );
    }

    setFilteredEntries(filtered);
  }, [entries, statusFilter, dateFilter, searchTerm]);

  const exportToCSV = () => {
    const headers = ['שם', 'טלפון', 'גודל קבוצה', 'סטטוס', 'תאריך הרשמה', 'דירוג', 'הערות'];
    const rows = filteredEntries.map(e => [
      e.customer_name,
      e.phone,
      e.party_size,
      e.status,
      new Date(e.timestamp_register).toLocaleString('he-IL'),
      e.feedback_rating || '-',
      e.notes || '-'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `queue-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const STATUS_LABELS = {
    pending: '⏳ ממתין לאישור',
    active: '🟢 פעיל בתור',
    seated: '✅ הוּשב',
    abandoned: '❌ נטש',
  };

  if (loading) {
    return <div className="p-4 text-center">טוען...</div>;
  }

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50" dir="rtl">
      {/* כותרת */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-800 mb-2">📋 היסטוריית תור</h1>
        <p className="text-gray-500 text-sm">כל הלקוחות שהיו בתור עם פרטי קשר</p>
      </div>

      {/* סנונים וחיפוש */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* חיפוש */}
        <div className="relative">
          <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חפש לפי שם או טלפון"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* סנן סטטוס */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="pending">ממתין לאישור</option>
          <option value="active">פעיל בתור</option>
          <option value="seated">הוּשב</option>
          <option value="abandoned">נטש</option>
        </select>

        {/* סנן תאריך */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">כל הזמן</option>
          <option value="today">היום</option>
          <option value="week">השבוע</option>
          <option value="month">החודש</option>
        </select>

        {/* יצוא */}
        <Button
          onClick={exportToCSV}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          יצוא Excel
        </Button>
      </div>

      {/* סטטיסטיקה קצרה */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-blue-700">{filteredEntries.length}</p>
            <p className="text-xs text-blue-600">תוצאות</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-green-700">{filteredEntries.filter(e => e.status === 'seated').length}</p>
            <p className="text-xs text-green-600">הוּשבו</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-red-700">{filteredEntries.filter(e => e.status === 'abandoned').length}</p>
            <p className="text-xs text-red-600">נטשו</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-yellow-700">
              {filteredEntries.filter(e => e.feedback_rating && e.feedback_rating >= 4).length}
            </p>
            <p className="text-xs text-yellow-600">דירוג גבוה</p>
          </CardContent>
        </Card>
      </div>

      {/* טבלה */}
      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
          <thead className="bg-gray-100 border-b-2 border-gray-200">
            <tr>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">שם</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">טלפון</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">סועדים</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">סטטוס</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">תאריך</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">דירוג</th>
              <th className="text-center px-4 py-3 font-black text-sm text-gray-700">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-gray-400 text-sm">
                  אין תוצאות
                </td>
              </tr>
            ) : (
              filteredEntries.map(entry => (
                <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-800">{entry.customer_name}</td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-sm">{entry.phone}</td>
                  <td className="px-4 py-3 text-gray-700 text-center">{entry.party_size}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm">
                      {STATUS_LABELS[entry.status] || entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {new Date(entry.timestamp_register).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.feedback_rating ? (
                      <span className="text-lg">
                        {'⭐'.repeat(entry.feedback_rating)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center flex gap-2 justify-center">
                    <a
                      href={`tel:${entry.phone}`}
                      title="התקשר"
                      className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition-all"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                    <a
                      href={`sms:${entry.phone}`}
                      title="שלח SMS"
                      className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-all"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* הערה */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-bold mb-1">💡 טיפ:</p>
        <p>לחץ על אייקון הטלפון להתקשר או על הסמס להודעה. אתה יכול גם ליצוא את הנתונים ל-Excel.</p>
      </div>
    </div>
  );
}