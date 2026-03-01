import React, { useState, useEffect } from 'react';
import { QuizQuestion, Quiz } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Edit, Trash2, ChevronDown, ChevronUp, Image, X } from 'lucide-react';

function QuestionForm({ question, quizId, onSave, onCancel }) {
    const [form, setForm] = useState({
        question_text: question?.question_text || '',
        options: question?.options?.length ? [...question.options] : ['', '', '', ''],
        correct_answer: question?.correct_answer || '',
        explanation: question?.explanation || '',
        image_url: question?.image_url || ''
    });
    const [uploading, setUploading] = useState(false);

    const updateOption = (index, value) => {
        const opts = [...form.options];
        opts[index] = value;
        // if this was the correct answer, update it too
        if (form.correct_answer === form.options[index]) {
            setForm(prev => ({ ...prev, options: opts, correct_answer: value }));
        } else {
            setForm(prev => ({ ...prev, options: opts }));
        }
    };

    const addOption = () => setForm(prev => ({ ...prev, options: [...prev.options, ''] }));
    const removeOption = (index) => {
        const opts = form.options.filter((_, i) => i !== index);
        setForm(prev => ({ ...prev, options: opts, correct_answer: prev.correct_answer === prev.options[index] ? '' : prev.correct_answer }));
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setForm(prev => ({ ...prev, image_url: file_url }));
        setUploading(false);
    };

    const handleSave = () => {
        if (!form.question_text.trim()) return alert('הכנס טקסט שאלה');
        if (!form.correct_answer) return alert('בחר תשובה נכונה');
        if (form.options.filter(o => o.trim()).length < 2) return alert('הוסף לפחות 2 אפשרויות');
        onSave({ ...form, quiz_id: quizId, options: form.options.filter(o => o.trim()) });
    };

    return (
        <div className="space-y-4" dir="rtl">
            <div>
                <Label>טקסט השאלה *</Label>
                <Textarea value={form.question_text} onChange={e => setForm(p => ({ ...p, question_text: e.target.value }))} rows={3} placeholder="הכנס את השאלה..." />
            </div>

            <div>
                <Label>תמונה לשאלה (אופציונלי)</Label>
                <div className="flex gap-2 mt-1">
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="q-image-upload" />
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('q-image-upload').click()} disabled={uploading}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Image className="w-4 h-4 ml-1" />}
                        {uploading ? 'מעלה...' : 'העלה תמונה'}
                    </Button>
                    {form.image_url && (
                        <div className="flex items-center gap-2">
                            <img src={form.image_url} alt="preview" className="h-10 w-10 object-cover rounded" />
                            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(p => ({ ...p, image_url: '' }))}><X className="w-3 h-3" /></Button>
                        </div>
                    )}
                </div>
            </div>

            <div>
                <Label>אפשרויות תשובה *</Label>
                <p className="text-xs text-gray-500 mb-2">לחץ על האפשרות הנכונה כדי לסמן אותה</p>
                <div className="space-y-2">
                    {form.options.map((opt, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <button
                                type="button"
                                onClick={() => setForm(p => ({ ...p, correct_answer: opt }))}
                                className={`w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors ${form.correct_answer === opt && opt ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
                                title="סמן כתשובה נכונה"
                            />
                            <Input
                                value={opt}
                                onChange={e => updateOption(i, e.target.value)}
                                placeholder={`אפשרות ${i + 1}`}
                                className={form.correct_answer === opt && opt ? 'border-green-400 bg-green-50' : ''}
                            />
                            {form.options.length > 2 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600 p-1">
                                    <X className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addOption}>
                    <Plus className="w-3 h-3 ml-1" /> הוסף אפשרות
                </Button>
            </div>

            <div>
                <Label>הסבר לתשובה (אופציונלי)</Label>
                <Textarea value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} rows={2} placeholder="הסבר מדוע התשובה נכונה..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}>ביטול</Button>
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">שמור שאלה</Button>
            </div>
        </div>
    );
}

function QuizSection({ quiz, questions, onEditQuestion, onDeleteQuestion, onAddQuestion }) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <Card className="mb-4">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCollapsed(p => !p)}>
                            {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </button>
                        <CardTitle className="text-lg">{quiz.title}</CardTitle>
                        <Badge variant="secondary">{questions.length} שאלות</Badge>
                        {quiz.passing_score && <Badge variant="outline">ציון מעבר: {quiz.passing_score}%</Badge>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onAddQuestion(quiz.quiz_id)}>
                        <Plus className="w-4 h-4 ml-1" /> שאלה חדשה
                    </Button>
                </div>
            </CardHeader>
            {!collapsed && (
                <CardContent>
                    {questions.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">אין שאלות במבחן זה עדיין</p>
                    )}
                    <div className="space-y-3">
                        {questions.map((q, i) => (
                            <div key={q.id} className="flex gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                                <span className="text-sm font-bold text-gray-400 flex-shrink-0 w-6">{i + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2">
                                        {q.image_url && <img src={q.image_url} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0" />}
                                        <div className="flex-1">
                                            <p className="font-medium text-sm">{q.question_text}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {q.options?.map((opt, oi) => (
                                                    <Badge key={oi} variant={opt === q.correct_answer ? 'default' : 'outline'} className={`text-xs ${opt === q.correct_answer ? 'bg-green-500' : ''}`}>
                                                        {opt}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => onEditQuestion(q)} className="p-1 h-7 w-7">
                                        <Edit className="w-3 h-3 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => onDeleteQuestion(q.id)} className="p-1 h-7 w-7">
                                        <Trash2 className="w-3 h-3 text-red-600" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export default function QuizManager() {
    const [quizzes, setQuizzes] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingQuestion, setEditingQuestion] = useState(null);
    const [addingToQuizId, setAddingToQuizId] = useState(null);
    const [showQuizForm, setShowQuizForm] = useState(false);
    const [newQuizForm, setNewQuizForm] = useState({ title: '', quiz_id: '', passing_score: 80 });

    const loadData = async () => {
        setLoading(true);
        const [q, qq] = await Promise.all([Quiz.list(), QuizQuestion.list()]);
        setQuizzes(q);
        setQuestions(qq);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleSaveQuestion = async (data) => {
        if (editingQuestion) {
            await QuizQuestion.update(editingQuestion.id, data);
        } else {
            await QuizQuestion.create(data);
        }
        setEditingQuestion(null);
        setAddingToQuizId(null);
        loadData();
    };

    const handleDeleteQuestion = async (id) => {
        if (!window.confirm('למחוק שאלה זו?')) return;
        await QuizQuestion.delete(id);
        loadData();
    };

    const handleCreateQuiz = async () => {
        if (!newQuizForm.title || !newQuizForm.quiz_id) return alert('הכנס שם ומזהה למבחן');
        await Quiz.create(newQuizForm);
        setShowQuizForm(false);
        setNewQuizForm({ title: '', quiz_id: '', passing_score: 80 });
        loadData();
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

    return (
        <div dir="rtl">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">ניהול מבחנים</h2>
                    <p className="text-sm text-gray-500 mt-1">ערוך שאלות, תשובות ואפשרויות. בכל מבחן השאלות יוצגו רנדומלית.</p>
                </div>
                <Button onClick={() => setShowQuizForm(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 ml-1" /> מבחן חדש
                </Button>
            </div>

            {quizzes.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <p>אין מבחנים עדיין. צור מבחן חדש כדי להתחיל.</p>
                </div>
            )}

            {quizzes.map(quiz => (
                <QuizSection
                    key={quiz.id}
                    quiz={quiz}
                    questions={questions.filter(q => q.quiz_id === quiz.quiz_id)}
                    onEditQuestion={setEditingQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                    onAddQuestion={setAddingToQuizId}
                />
            ))}

            {/* Dialog - עריכת שאלה */}
            <Dialog open={!!editingQuestion} onOpenChange={() => setEditingQuestion(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader><DialogTitle>עריכת שאלה</DialogTitle></DialogHeader>
                    {editingQuestion && (
                        <QuestionForm
                            question={editingQuestion}
                            quizId={editingQuestion.quiz_id}
                            onSave={handleSaveQuestion}
                            onCancel={() => setEditingQuestion(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog - הוספת שאלה */}
            <Dialog open={!!addingToQuizId} onOpenChange={() => setAddingToQuizId(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader><DialogTitle>הוספת שאלה חדשה</DialogTitle></DialogHeader>
                    {addingToQuizId && (
                        <QuestionForm
                            quizId={addingToQuizId}
                            onSave={handleSaveQuestion}
                            onCancel={() => setAddingToQuizId(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog - מבחן חדש */}
            <Dialog open={showQuizForm} onOpenChange={setShowQuizForm}>
                <DialogContent dir="rtl">
                    <DialogHeader><DialogTitle>מבחן חדש</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>שם המבחן *</Label>
                            <Input value={newQuizForm.title} onChange={e => setNewQuizForm(p => ({ ...p, title: e.target.value }))} placeholder="לדוגמה: מבחן שירות לקוחות" />
                        </div>
                        <div>
                            <Label>מזהה ייחודי (quiz_id) *</Label>
                            <Input value={newQuizForm.quiz_id} onChange={e => setNewQuizForm(p => ({ ...p, quiz_id: e.target.value }))} placeholder="לדוגמה: customer_service_quiz" />
                            <p className="text-xs text-gray-500 mt-1">זה המזהה שמשמש לחיבור המבחן לשיעור בקורס</p>
                        </div>
                        <div>
                            <Label>ציון מעבר (%)</Label>
                            <Input type="number" value={newQuizForm.passing_score} onChange={e => setNewQuizForm(p => ({ ...p, passing_score: parseInt(e.target.value) || 80 }))} min="1" max="100" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowQuizForm(false)}>ביטול</Button>
                            <Button onClick={handleCreateQuiz} className="bg-blue-600 hover:bg-blue-700">צור מבחן</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}