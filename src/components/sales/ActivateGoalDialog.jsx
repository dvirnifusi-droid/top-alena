import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ActivateGoalDialog({ open, onClose, onActivated }) {
    const [templates, setTemplates] = useState([]);
    const [picked, setPicked] = useState(null);
    const [target, setTarget] = useState('');
    const [coins, setCoins] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open) return;
        base44.entities.SalesGoalTemplate.filter({ is_active: true }, 'sort_order').then(list => {
            setTemplates(list || []);
        });
    }, [open]);

    const pick = (t) => {
        setPicked(t);
        setTarget(String(t.default_target));
        setCoins(String(t.default_coins_per_sale));
        setError(null);
    };

    const activate = async () => {
        if (!picked) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await base44.functions.activateSalesGoal({
                template_id: picked.id,
                target: Number(target),
                coins_per_sale: Number(coins),
            });
            onActivated?.((result?.data || result)?.goal);
            setPicked(null);
            onClose();
        } catch (e) {
            setError(e?.message || 'שגיאה');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md" dir="rtl">
                <DialogHeader><DialogTitle>הפעלת יעד חדש</DialogTitle></DialogHeader>
                {!picked && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        {templates.map(t => (
                            <Card key={t.id} className="cursor-pointer hover:shadow-md" onClick={() => pick(t)}>
                                <CardContent className="p-3 text-center">
                                    <div className="text-3xl">{t.emoji}</div>
                                    <div className="font-bold mt-1">{t.name}</div>
                                    <div className="text-xs text-gray-500 mt-1">{t.default_target} · {t.default_coins_per_sale}🪙</div>
                                </CardContent>
                            </Card>
                        ))}
                        {templates.length === 0 && <p className="col-span-2 text-center text-gray-500">אין תבניות פעילות. צור ב-/SalesGoalTemplates</p>}
                    </div>
                )}
                {picked && (
                    <div className="space-y-3 mt-3">
                        <div className="text-center text-3xl">{picked.emoji}</div>
                        <div className="text-center font-bold">{picked.name}</div>
                        <div>
                            <Label>יעד</Label>
                            <Input type="number" value={target} onChange={e => setTarget(e.target.value)} />
                        </div>
                        <div>
                            <Label>מטבעות פר מכירה</Label>
                            <Input type="number" value={coins} onChange={e => setCoins(e.target.value)} />
                        </div>
                        {error && <div className="text-sm text-red-600">{error}</div>}
                        <div className="flex gap-2 pt-2">
                            <Button onClick={activate} disabled={submitting} className="flex-1">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                הפעל
                            </Button>
                            <Button variant="outline" onClick={() => setPicked(null)}>חזור</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
