import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, Pencil, Trash2, Loader2, Mail, MessageSquare } from 'lucide-react';

export default function MessageTemplates() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [showDialog, setShowDialog] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', type: 'email', subject: '', body: '' });

    useEffect(() => { loadTemplates(); }, []);

    const loadTemplates = async () => {
        setLoading(true);
        const data = await base44.entities.MessageTemplate.list('-created_date');
        setTemplates(data);
        setLoading(false);
    };

    const openNew = () => {
        setEditing(null);
        setForm({ name: '', type: 'email', subject: '', body: '' });
        setShowDialog(true);
    };

    const openEdit = (t) => {
        setEditing(t);
        setForm({ name: t.name, type: t.type, subject: t.subject || '', body: t.body });
        setShowDialog(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.body) return;
        setSaving(true);
        if (editing) {
            await base44.entities.MessageTemplate.update(editing.id, form);
        } else {
            await base44.entities.MessageTemplate.create(form);
        }
        setSaving(false);
        setShowDialog(false);
        loadTemplates();
    };

    const handleDelete = async (id) => {
        if (!confirm('למחוק תבנית זו?')) return;
        await base44.entities.MessageTemplate.delete(id);
        loadTemplates();
    };

    const filtered = typeFilter === 'all' ? templates : templates.filter(t => t.type === typeFilter);

    return (
        <div className="p-4 md:p-8" dir="rtl">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <FileText className="w-6 h-6 text-[#A04A2E]" />
                    <h1 className="text-2xl font-bold">תבניות הודעה</h1>
                </div>
                <Button onClick={openNew} className="bg-[#A04A2E] hover:bg-[#7A3722] text-white">
                    <Plus className="w-4 h-4 ml-1" /> תבנית חדשה
                </Button>
            </div>

            <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-4">
                <TabsList>
                    <TabsTrigger value="all">הכל</TabsTrigger>
                    <TabsTrigger value="email">מיילים</TabsTrigger>
                    <TabsTrigger value="sms">SMS</TabsTrigger>
                </TabsList>
            </Tabs>

            {loading ? (
                <div className="flex justify-center items-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-[#A04A2E]" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center text-gray-400 py-20">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>אין תבניות עדיין. צור את הראשונה!</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(t => (
                        <Card key={t.id} className="border hover:shadow-md transition-shadow">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base">{t.name}</CardTitle>
                                    <Badge className={t.type === 'email' ? 'bg-[#F4ECD8] text-[#44512C]' : 'bg-green-100 text-green-700'}>
                                        {t.type === 'email' ? <><Mail className="w-3 h-3 ml-1" />מייל</> : <><MessageSquare className="w-3 h-3 ml-1" />SMS</>}
                                    </Badge>
                                </div>
                                {t.subject && <p className="text-sm text-gray-500 font-medium">נושא: {t.subject}</p>}
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-gray-600 line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                                <div className="flex gap-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                                        <Pencil className="w-3 h-3 ml-1" /> עריכה
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)}>
                                        <Trash2 className="w-3 h-3 ml-1" /> מחק
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent dir="rtl" className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'עריכת תבנית' : 'תבנית חדשה'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>שם התבנית</Label>
                            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="למשל: ברכת יום הולדת" className="mt-1" />
                        </div>
                        <div>
                            <Label>סוג</Label>
                            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="email">מייל</SelectItem>
                                    <SelectItem value="sms">SMS</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {form.type === 'email' && (
                            <div>
                                <Label>נושא המייל</Label>
                                <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="נושא..." className="mt-1" />
                            </div>
                        )}
                        <div>
                            <Label>תוכן ההודעה</Label>
                            <p className="text-xs text-gray-400 mb-1">ניתן להשתמש ב-&#123;שם&#125; לשם הלקוח</p>
                            <Textarea
                                value={form.body}
                                onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                                rows={6}
                                placeholder="שלום {שם}, ..."
                                className="mt-1"
                            />
                        </div>
                        <Button onClick={handleSave} disabled={saving || !form.name || !form.body} className="w-full bg-[#A04A2E] hover:bg-[#7A3722]">
                            {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />שומר...</> : 'שמור תבנית'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}