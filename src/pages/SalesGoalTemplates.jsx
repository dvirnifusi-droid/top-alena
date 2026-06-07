import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Save } from 'lucide-react';

const EMPTY = { name: '', dish_label: '', emoji: '🍰', default_target: 30, default_coins_per_sale: 50, is_active: true, sort_order: 0 };

export default function SalesGoalTemplates() {
    const [rows, setRows] = useState([]);
    const [draft, setDraft] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const list = await base44.entities.SalesGoalTemplate.list('sort_order');
        setRows(list || []);
    };
    useEffect(() => { load(); }, []);

    const create = async () => {
        setSaving(true);
        try {
            await base44.entities.SalesGoalTemplate.create({
                ...draft,
                default_target: Number(draft.default_target) || 1,
                default_coins_per_sale: Number(draft.default_coins_per_sale) || 1,
                sort_order: Number(draft.sort_order) || 0,
            });
            setDraft(EMPTY);
            await load();
        } finally { setSaving(false); }
    };

    const update = async (row, field, value) => {
        const next = { ...row, [field]: value };
        await base44.entities.SalesGoalTemplate.update(row.id, { [field]: value });
        setRows(rows.map(r => r.id === row.id ? next : r));
    };

    const remove = async (id) => {
        if (!confirm('למחוק את התבנית?')) return;
        await base44.entities.SalesGoalTemplate.delete(id);
        await load();
    };

    return (
        <div className="p-6 max-w-4xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-6">🎯 תבניות יעדי מכירה</h1>

            <Card className="mb-6 bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                    <h2 className="font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> תבנית חדשה</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><Label>שם</Label><Input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="מבצע קינוחים" /></div>
                        <div><Label>שם המנה</Label><Input value={draft.dish_label} onChange={e => setDraft(p => ({ ...p, dish_label: e.target.value }))} placeholder="קינוח" /></div>
                        <div><Label>אימוג'י</Label><Input value={draft.emoji} onChange={e => setDraft(p => ({ ...p, emoji: e.target.value }))} maxLength={4} /></div>
                        <div><Label>יעד ברירת מחדל</Label><Input type="number" value={draft.default_target} onChange={e => setDraft(p => ({ ...p, default_target: e.target.value }))} /></div>
                        <div><Label>מטבעות פר מכירה</Label><Input type="number" value={draft.default_coins_per_sale} onChange={e => setDraft(p => ({ ...p, default_coins_per_sale: e.target.value }))} /></div>
                        <div><Label>סדר</Label><Input type="number" value={draft.sort_order} onChange={e => setDraft(p => ({ ...p, sort_order: e.target.value }))} /></div>
                    </div>
                    <Button onClick={create} disabled={saving || !draft.name || !draft.dish_label} className="mt-4">צור</Button>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {rows.map(r => (
                    <Card key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
                            <span className="text-2xl">{r.emoji}</span>
                            <div className="flex-1 min-w-[160px]">
                                <Input value={r.name} onChange={e => update(r, 'name', e.target.value)} />
                                <Input className="mt-2" value={r.dish_label} onChange={e => update(r, 'dish_label', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-2 w-24">
                                <Label className="text-xs">יעד</Label>
                                <Input type="number" value={r.default_target} onChange={e => update(r, 'default_target', Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col gap-2 w-24">
                                <Label className="text-xs">🪙/מכירה</Label>
                                <Input type="number" value={r.default_coins_per_sale} onChange={e => update(r, 'default_coins_per_sale', Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Label className="text-xs">פעיל</Label>
                                <Switch checked={r.is_active} onCheckedChange={v => update(r, 'is_active', v)} />
                            </div>
                            <Button variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
