import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';

const CATEGORIES = {
  friends: '👯 ארוחת חברים',
  date: '💕 דייט רומנטי',
  family: '👨‍👩‍👧‍👦 משפחה',
  bday: '🎉 יום הולדת',
  girls: '💃 ערב בנות',
  business: '💼 עסקים',
};

export default function GameQuestionsAdmin() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ question: '', category: 'friends' });

  const fetchQuestions = async () => {
    const qs = await base44.entities.GameQuestion.list('-updated_date', 100);
    setQuestions(qs);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleSave = async () => {
    if (!formData.question.trim()) {
      alert('נא להזין שאלה');
      return;
    }

    if (editingId) {
      await base44.entities.GameQuestion.update(editingId, {
        question: formData.question.trim(),
        category: formData.category,
      });
    } else {
      await base44.entities.GameQuestion.create({
        question: formData.question.trim(),
        category: formData.category,
        game_type: 'question_game',
        is_active: true,
      });
    }

    setFormData({ question: '', category: 'friends' });
    setEditingId(null);
    setShowForm(false);
    fetchQuestions();
  };

  const handleDelete = async (id) => {
    if (confirm('האם אתה בטוח?')) {
      await base44.entities.GameQuestion.delete(id);
      fetchQuestions();
    }
  };

  const handleToggleActive = async (id, current) => {
    await base44.entities.GameQuestion.update(id, { is_active: !current });
    fetchQuestions();
  };

  const handleEdit = (q) => {
    setEditingId(q.id);
    setFormData({ question: q.question, category: q.category });
    setShowForm(true);
  };

  const categoryGroups = Object.keys(CATEGORIES).reduce((acc, cat) => {
    acc[cat] = questions.filter(q => q.category === cat);
    return acc;
  }, {});

  const totalQuestions = questions.length;
  const activeQuestions = questions.filter(q => q.is_active).length;

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-800">📝 ניהול שאלות המשחקים</h1>
          <p className="text-gray-500 text-sm">עריכה והוספה של שאלות למשחקי קבוצה</p>
        </div>
        <Button
          onClick={() => {
            setFormData({ question: '', category: 'friends' });
            setEditingId(null);
            setShowForm(true);
          }}
          className="bg-primary hover:bg-primary/90 text-white font-black py-2 px-4 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          הוסף שאלה
        </Button>
      </div>

      {/* סטטיסטיקה */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-blue-700">{totalQuestions}</p>
            <p className="text-xs text-blue-600">סה"כ שאלות</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-black text-green-700">{activeQuestions}</p>
            <p className="text-xs text-green-600">פעילות</p>
          </CardContent>
        </Card>
      </div>

      {/* טופס הוספה/עריכה */}
      {showForm && (
        <Card className="mb-6 border-2 border-primary">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-gray-800">
              {editingId ? '✏️ עריכת שאלה' : '➕ שאלה חדשה'}
            </h3>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">שאלה</label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                placeholder='הזן שאלה, למשל: [שם]: מה הדבר הכי מוזר שאכלת?'
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none h-24"
              />
              <p className="text-xs text-gray-400 mt-1">💡 השתמש ב-[שם] כחלק מהשאלה</p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-2">קטגוריה</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {Object.entries(CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                <Save className="w-4 h-4" />
                שמור
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ question: '', category: 'friends' });
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                <X className="w-4 h-4" />
                ביטול
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* שאלות לפי קטגוריה */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">טוען...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(CATEGORIES).map(([catKey, catLabel]) => (
            <div key={catKey}>
              <h2 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b-2 border-gray-300">
                {catLabel} ({categoryGroups[catKey].length})
              </h2>

              {categoryGroups[catKey].length === 0 ? (
                <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500 text-sm">
                  אין שאלות בקטגוריה זו
                </div>
              ) : (
                <div className="space-y-2">
                  {categoryGroups[catKey].map(q => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-lg border-2 flex items-start justify-between gap-3 ${
                        q.is_active
                          ? 'bg-white border-gray-300'
                          : 'bg-gray-100 border-gray-300 opacity-60'
                      }`}
                    >
                      <p className="text-sm text-gray-700 flex-1">
                        {q.question}
                      </p>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(q)}
                          className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-all"
                          title="עריכה"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(q.id, q.is_active)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-sm font-bold ${
                            q.is_active
                              ? 'bg-green-100 hover:bg-yellow-200 text-green-700 hover:text-yellow-700'
                              : 'bg-gray-300 hover:bg-green-100 text-gray-600 hover:text-green-700'
                          }`}
                          title={q.is_active ? 'כבה' : 'הפעל'}
                        >
                          {q.is_active ? '✓' : '○'}
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center transition-all"
                          title="מחיקה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* עדכון מהיר */}
      <div className="mt-8 bg-purple-50 border-2 border-purple-300 rounded-xl p-4 text-sm text-purple-700">
        <p className="font-bold mb-2">💡 טיפ:</p>
        <p>
          השתמש בתבנית [שם] כדי שהשם יוחלף אוטומטית בזמן המשחק. לדוגמה:
          <br />
          <code className="bg-purple-100 px-1 rounded">"[שם]: מה הפאדיחה הגדולה ביותר שלך?"</code>
        </p>
      </div>
    </div>
  );
}