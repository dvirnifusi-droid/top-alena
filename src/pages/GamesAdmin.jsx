import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Save, X, ToggleLeft, ToggleRight } from 'lucide-react';

const DEFAULT_QUESTION = { question: '', options: ['', '', '', ''], answer: 0, is_active: true };

export default function GamesAdmin() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | question object
  const [form, setForm] = useState(DEFAULT_QUESTION);

  const load = async () => {
    const q = await base44.entities.TriviaQuestion.list('-created_date', 200);
    setQuestions(q);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ ...DEFAULT_QUESTION, options: ['', '', '', ''] });
    setEditing('new');
  };

  const openEdit = (q) => {
    setForm({ ...q, options: [...q.options] });
    setEditing(q);
  };

  const cancel = () => { setEditing(null); };

  const save = async () => {
    if (!form.question.trim()) return alert('נא למלא שאלה');
    if (form.options.some(o => !o.trim())) return alert('נא למלא את כל 4 התשובות');
    if (editing === 'new') {
      await base44.entities.TriviaQuestion.create(form);
    } else {
      await base44.entities.TriviaQuestion.update(editing.id, form);
    }
    setEditing(null);
    load();
  };

  const remove = async (id) => {
    if (!confirm('למחוק שאלה זו?')) return;
    await base44.entities.TriviaQuestion.delete(id);
    load();
  };

  const toggleActive = async (q) => {
    await base44.entities.TriviaQuestion.update(q.id, { is_active: !q.is_active });
    load();
  };

  const setOption = (i, val) => {
    const opts = [...form.options];
    opts[i] = val;
    setForm({ ...form, options: opts });
  };

  return (
    <div className="p-4 sm:p-8 min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-800">🎮 ניהול משחקי ממתינים</h1>
            <p className="text-gray-500 text-sm">ערוך שאלות טריוויה שמוצגות ללקוחות בתור</p>
          </div>
          <Button onClick={openNew} className="bg-[#A04A2E] hover:bg-[#7A3722]">
            <Plus className="w-4 h-4 ml-1" /> שאלה חדשה
          </Button>
        </div>

        {/* Edit / New Form */}
        {editing && (
          <Card className="mb-6 border-[#D9BD83] bg-[#F4ECD8]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-[#7A3722]">
                {editing === 'new' ? '➕ הוספת שאלה חדשה' : '✏️ עריכת שאלה'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1">השאלה</label>
                <input
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400"
                  value={form.question}
                  onChange={e => setForm({ ...form, question: e.target.value })}
                  placeholder="למשל: מה המנה הפופולרית ביותר?"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2">4 תשובות אפשריות</label>
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        onClick={() => setForm({ ...form, answer: i })}
                        className={`w-7 h-7 rounded-full text-xs font-black flex-shrink-0 border-2 transition-all ${
                          form.answer === i
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'bg-white border-gray-300 text-gray-400'
                        }`}
                        title="סמן כתשובה נכונה"
                      >
                        {['א', 'ב', 'ג', 'ד'][i]}
                      </button>
                      <input
                        className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                        value={opt}
                        onChange={e => setOption(i, e.target.value)}
                        placeholder={`תשובה ${['א', 'ב', 'ג', 'ד'][i]}`}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">לחץ על האות הירוקה לסימון התשובה הנכונה</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button onClick={save} className="bg-[#A04A2E] hover:bg-[#7A3722]">
                  <Save className="w-4 h-4 ml-1" /> שמור
                </Button>
                <Button variant="outline" onClick={cancel}>
                  <X className="w-4 h-4 ml-1" /> ביטול
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Questions list */}
        {loading ? (
          <p className="text-center text-gray-400 py-10">טוען...</p>
        ) : questions.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">❓</p>
              <p className="font-bold">אין שאלות עדיין</p>
              <p className="text-sm">לחץ על "שאלה חדשה" להוספה</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id} className={`${!q.is_active ? 'opacity-50' : ''} transition-opacity`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <span className="text-gray-400 font-bold text-sm flex-shrink-0 mt-0.5">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm">{q.question}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {q.options?.map((opt, i) => (
                        <div key={i} className={`text-xs px-2 py-1 rounded-lg ${i === q.answer ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                          {['א', 'ב', 'ג', 'ד'][i]}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => toggleActive(q)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all" title={q.is_active ? 'השבת' : 'הפעל'}>
                      {q.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button onClick={() => openEdit(q)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F4ECD8] text-[#44512C] transition-all">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(q.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-400 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}