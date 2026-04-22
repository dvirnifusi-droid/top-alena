import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Phone, MessageSquare, Download, Search, Gift, AlertTriangle, TrendingDown, Cloud, Ban, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function QueueHistory() {
  const [entries, setEntries] = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [customers, setCustomers] = useState({});
  const [treats, setTreats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [partySizeFilter, setPartySizeFilter] = useState('all');
  const [abandonedOnly, setAbandonedOnly] = useState(false);
  const [specificDate, setSpecificDate] = useState('');
  const [blacklistedCustomers, setBlacklistedCustomers] = useState(new Set());
  const [avgOrderValue, setAvgOrderValue] = useState(120);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const all = await base44.entities.QueueEntry.list('-timestamp_register', 500);
        setEntries(all);

        // טען customers לmapping
        const custs = await base44.entities.Customer.list();
        const custMap = {};
        custs.forEach(c => { custMap[c.phone] = c; });
        setCustomers(custMap);

        // טען treats
        const treatsArr = await base44.entities.TimeTreat.list();
        const treatsMap = {};
        treatsArr.forEach(t => { treatsMap[t.id] = t; });
        setTreats(treatsMap);

        setLoading(false);
      } catch (e) {
        console.error('Error fetching data:', e);
        setLoading(false);
      }
    };
    fetchData();
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

    // סנן לפי תאריך ספציפי
    if (specificDate) {
      const selectedDate = new Date(specificDate);
      const selectedDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      filtered = filtered.filter(e => {
        const entryDate = new Date(e.timestamp_register);
        const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
        return entryDay.getTime() === selectedDay.getTime();
      });
    }

    // סנן לפי גודל קבוצה
    if (partySizeFilter !== 'all') {
      if (partySizeFilter === '2plus') filtered = filtered.filter(e => e.party_size >= 2);
      else if (partySizeFilter === '6plus') filtered = filtered.filter(e => e.party_size >= 6);
      else filtered = filtered.filter(e => e.party_size === parseInt(partySizeFilter));
    }

    // סנן נטישות בלבד
    if (abandonedOnly) {
      filtered = filtered.filter(e => e.status === 'abandoned');
    }

    // חיפוש לפי שם או טלפון
    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.phone?.includes(searchTerm)
      );
    }

    setFilteredEntries(filtered);
  }, [entries, statusFilter, dateFilter, searchTerm, partySizeFilter, abandonedOnly, specificDate]);

  // חישוב זמן המתנה בדקות
  const getWaitTime = (entry) => {
    if (!entry.timestamp_approved && !entry.timestamp_register) return 0;
    const startTime = entry.timestamp_approved || entry.timestamp_register;
    const endTime = entry.timestamp_end || new Date().toISOString();
    const minutes = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
    return minutes;
  };

  // חיזוי Churn Risk - כמה פעמים הלקוח נטש כשחיכה יותר מ-20 דקות
  const getChurnRisk = (entry) => {
    if (entry.status !== 'active') return null;
    const pastAbandonments = entries.filter(e =>
      e.phone === entry.phone && 
      e.status === 'abandoned' && 
      getWaitTime(e) > 20
    ).length;
    
    if (pastAbandonments >= 2) return 'high';
    if (pastAbandonments === 1) return 'medium';
    return 'low';
  };

  // Lost Revenue - הכסף שהאבדנו בגלל נטישות
  const getLostRevenue = () => {
    const abandoned = filteredEntries.filter(e => e.status === 'abandoned');
    return abandoned.reduce((sum, e) => sum + (e.party_size * avgOrderValue), 0);
  };

  // Toggle blacklist
  const toggleBlacklist = (phone) => {
    const updated = new Set(blacklistedCustomers);
    if (updated.has(phone)) {
      updated.delete(phone);
    } else {
      updated.add(phone);
    }
    setBlacklistedCustomers(updated);
  };

  // סיכום נתונים
  const calculateStats = () => {
    const totalCount = filteredEntries.length;
    const seatedCount = filteredEntries.filter(e => e.status === 'seated').length;
    const abandonedCount = filteredEntries.filter(e => e.status === 'abandoned').length;
    const totalDiners = filteredEntries.reduce((sum, e) => sum + (e.party_size || 0), 0);
    const abandonedDiners = filteredEntries.filter(e => e.status === 'abandoned').reduce((sum, e) => sum + (e.party_size || 0), 0);
    
    // זמן המתנה ממוצע (רק להושבים)
    const seatedEntries = filteredEntries.filter(e => e.status === 'seated');
    const avgWaitTime = seatedEntries.length > 0
      ? Math.round(seatedEntries.reduce((sum, e) => sum + getWaitTime(e), 0) / seatedEntries.length)
      : 0;

    // יחס המרה
    const conversionRate = totalCount > 0 ? Math.round((seatedCount / totalCount) * 100) : 0;

    // שעת שיא
    const hourCounts = {};
    filteredEntries.forEach(e => {
      const hour = new Date(e.timestamp_register).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.keys(hourCounts).length > 0
      ? parseInt(Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b))
      : null;

    // סועדים שישבו בפועל
    const seatedDiners = totalDiners - abandonedDiners;

    return { totalCount, seatedCount, abandonedCount, totalDiners, abandonedDiners, seatedDiners, avgWaitTime, conversionRate, peakHour };
  };

  const stats = calculateStats();

  const exportToCSV = () => {
    const headers = ['שם', 'טלפון', 'גודל קבוצה', 'סטטוס', 'תאריך הרשמה', 'זמן המתנה (דק)', 'פינוק', 'דירוג', 'הערות'];
    const rows = filteredEntries.map(e => [
      e.customer_name,
      e.phone,
      e.party_size,
      e.status,
      new Date(e.timestamp_register).toLocaleString('he-IL'),
      getWaitTime(e),
      e.treated ? 'כן' : 'לא',
      e.feedback_rating || '-',
      e.notes || '-'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    // הוסף סיכום בסוף
    const summaryRows = [
      '',
      'סיכום',
      '',
      ['סה"כ הזמנות', stats.totalCount],
      ['סה"כ סועדים', stats.totalDiners],
      ['הושבו', stats.seatedCount],
      ['נטשו', `${stats.abandonedCount} (${stats.abandonedDiners} סועדים)`],
      ['זמן המתנה ממוצע', `${stats.avgWaitTime} דקות`],
      ['יחס המרה', `${stats.conversionRate}%`],
      stats.peakHour !== null ? ['שעת שיא', `${stats.peakHour}:00`] : []
    ];

    const csvWithSummary = csv + '\n' + summaryRows
      .filter(row => row.length > 0)
      .map(row => Array.isArray(row) ? `"${row[0]}","${row[1]}"` : row)
      .join('\n');

    const blob = new Blob([csvWithSummary], { type: 'text/csv;charset=utf-8;' });
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

      {/* סטטיסטיקה Analytics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-purple-600 font-bold">זמן המתנה ממוצע</p>
            <p className="text-2xl font-black text-purple-700">{stats.avgWaitTime}</p>
            <p className="text-xs text-purple-500">דקות</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-teal-600 font-bold">יחס המרה</p>
            <p className="text-2xl font-black text-teal-700">{stats.conversionRate}%</p>
            <p className="text-xs text-teal-500">{stats.seatedCount}/{stats.totalCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-orange-600 font-bold">שעת שיא</p>
            <p className="text-2xl font-black text-orange-700">{stats.peakHour ?? '-'}</p>
            <p className="text-xs text-orange-500">:00</p>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-indigo-600 font-bold">סה"כ סועדים</p>
            <p className="text-2xl font-black text-indigo-700">{stats.totalDiners}</p>
            <p className="text-xs text-indigo-500">הרשומים</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-300">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-green-700 font-bold">✅ ישבו בפועל</p>
            <p className="text-2xl font-black text-green-800">{stats.seatedDiners}</p>
            <p className="text-xs text-green-600">סועדים</p>
          </CardContent>
        </Card>
        <Card className="bg-pink-50 border-pink-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-pink-600 font-bold">❌ נטשו</p>
            <p className="text-2xl font-black text-pink-700">{stats.abandonedDiners}</p>
            <p className="text-xs text-pink-500">סועדים</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-red-600 font-bold">💸 הכסף האבוד</p>
            <p className="text-2xl font-black text-red-700">₪{getLostRevenue().toLocaleString()}</p>
            <p className="text-xs text-red-500">נטישות × מחיר</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-sm text-slate-600 font-bold">סה"כ הזמנות</p>
            <p className="text-2xl font-black text-slate-700">{stats.totalCount}</p>
            <p className="text-xs text-slate-500">בתוצאות</p>
          </CardContent>
        </Card>
      </div>

      {/* סנונים וחיפוש */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
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

        {/* סנן גודל קבוצה */}
        <select
          value={partySizeFilter}
          onChange={(e) => setPartySizeFilter(e.target.value)}
          className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">כל גודל קבוצה</option>
          <option value="1">1 סועד בלבד</option>
          <option value="2plus">2+ סועדים</option>
          <option value="6plus">6+ סועדים</option>
        </select>

        {/* סנן תאריך ספציפי */}
        <input
          type="date"
          value={specificDate}
          onChange={(e) => setSpecificDate(e.target.value)}
          className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />

        {/* סנן נטישות */}
        <label className="flex items-center gap-2 border-2 border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={abandonedOnly}
            onChange={(e) => setAbandonedOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium text-gray-700">נטישות בלבד</span>
        </label>

        {/* סנן ממוצע הזמנה */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">💰 ממוצע הזמנה (לחישוב הכסף האבוד)</label>
          <input
            type="number"
            value={avgOrderValue}
            onChange={(e) => setAvgOrderValue(parseInt(e.target.value) || 120)}
            className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
            placeholder="120"
          />
        </div>

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



      {/* טבלה */}
      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
          <thead className="bg-gray-100 border-b-2 border-gray-200">
            <tr>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">שם</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">טלפון</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">סועדים</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">סטטוס</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">⚠️ סכנת נטישה</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">⏱️ זמן המתנה</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">🎁 פינוק</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">🛍️ מתנה שרכש</th>
              <th className="text-right px-4 py-3 font-black text-sm text-gray-700">דירוג</th>
              <th className="text-center px-4 py-3 font-black text-sm text-gray-700">🏆 דרגה</th>
              <th className="text-center px-4 py-3 font-black text-sm text-gray-700">💰 מטבעות</th>
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
              filteredEntries.map(entry => {
                 const waitTime = getWaitTime(entry);
                 const waitColor = waitTime > 40 ? 'text-red-700 bg-red-50' : waitTime > 20 ? 'text-yellow-700 bg-yellow-50' : 'text-green-700 bg-green-50';
                 const customer = customers[entry.phone];
                 const tierEmoji = { vip: '👑', frequent: '⭐', regular: '👤' };
                 const churnRisk = getChurnRisk(entry);
                 const isBlacklisted = blacklistedCustomers.has(entry.phone);

                 return (
                 <tr key={entry.id} className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${isBlacklisted ? 'bg-red-50' : ''}`}>
                   <td className={`px-4 py-3 font-semibold ${isBlacklisted ? 'text-red-700' : 'text-gray-800'}`}>
                     {isBlacklisted && <span className="mr-1">🚫</span>}
                     {entry.customer_name}
                   </td>
                   <td className="px-4 py-3 text-gray-700 font-mono text-sm">{entry.phone}</td>
                   <td className="px-4 py-3 text-gray-700 text-center">{entry.party_size}</td>
                   <td className="px-4 py-3">
                     <span className="text-sm">
                       {STATUS_LABELS[entry.status] || entry.status}
                     </span>
                   </td>
                   <td className="px-4 py-3 text-center">
                     {churnRisk === 'high' && (
                       <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold flex items-center justify-center gap-1 w-fit mx-auto">
                         <AlertTriangle className="w-3 h-3" />
                         גבוהה
                       </span>
                     )}
                     {churnRisk === 'medium' && (
                       <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold">⚠️ בינונית</span>
                     )}
                     {churnRisk === 'low' && (
                       <span className="text-xs text-gray-400">-</span>
                     )}
                   </td>
                  <td className={`px-4 py-3 text-center font-bold text-sm rounded-lg ${waitColor}`}>
                    {waitTime} דק'
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.treated ? (
                      <span className="text-xl">🎁</span>
                    ) : (
                      <span className="text-gray-300 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.selected_treat_id && treats[entry.selected_treat_id] ? (() => {
                      const treat = treats[entry.selected_treat_id];
                      const redeemed = entry.treat_redeemed;
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-purple-700">
                            {treat.emoji} {treat.name}
                          </span>
                          {redeemed ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> מומש
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                await base44.entities.QueueEntry.update(entry.id, { treat_redeemed: true });
                                setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, treat_redeemed: true } : e));
                              }}
                              className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold transition-all active:scale-95"
                            >
                              ✓ מממש
                            </button>
                          )}
                        </div>
                      );
                    })() : (
                      <span className="text-gray-300 text-sm">-</span>
                    )}
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
                  <td className="px-4 py-3 text-center">
                    {customer ? (
                      <span className="text-base" title={`${customer.visit_count} ביקורים`}>
                        {tierEmoji[customer.loyalty_tier] || '👤'}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">new</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {customer ? (
                      <span className="font-bold text-purple-700">{customer.coin_balance}</span>
                    ) : (
                      <span className="text-gray-300 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center flex gap-1 justify-center flex-wrap">
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
                    <button
                      onClick={() => toggleBlacklist(entry.phone)}
                      title={isBlacklisted ? 'הסר מרשימה שחורה' : 'הוסף לרשימה שחורה'}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isBlacklisted
                          ? 'bg-red-200 text-red-700 hover:bg-red-300'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* הערה */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-bold mb-2">💡 עמודות חדשות:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>⏱️ זמן המתנה:</strong> אדום (40+ דק'), צהוב (20-40 דק'), ירוק (פחות מ-20)</li>
          <li><strong>🎁 פינוק:</strong> סימון האם המארחת נתנה משהו בתור</li>
          <li><strong>Analytics:</strong> זמן ממוצע, יחס המרה, שעת שיא וסיכום סועדים</li>
          <li><strong>פילטרים:</strong> גדול קבוצה וסנן נטישות בלבד</li>
          <li><strong>Excel:</strong> עכשיו מכיל גם סיכום ביצועים</li>
        </ul>
      </div>
    </div>
  );
}