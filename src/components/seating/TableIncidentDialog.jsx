import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { Loader2, AlertTriangle } from 'lucide-react';

const DEPT_CONFIG = {
    kitchen: {
        label: '🍳 מטבח',
        subOptions: ['לא יצאה המנה', 'תקלה במנה שכבר יצאה', 'אחר'],
        itemLabel: 'מנה',
        itemPlaceholder: 'שם המנה',
    },
    bar: {
        label: '🍸 בר',
        subOptions: ['לא יצאה השתייה', 'תקלה בשתייה שכבר יצאה', 'אחר'],
        itemLabel: 'שתייה',
        itemPlaceholder: 'שם השתייה',
    },
};

export default function TableIncidentDialog({ open, onClose, tableNumber }) {
    const [currentUserName, setCurrentUserName] = useState('');
    const [employees, setEmployees] = useState([]);
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [step, setStep] = useState('type'); // type | kitchen | bar | service | move | recipients | confirm
    const [dept, setDept] = useState(null); // kitchen | bar
    const [subOption, setSubOption] = useState(null);
    const [itemName, setItemName] = useState('');
    const [isEntered, setIsEntered] = useState('');
    const [elapsedTime, setElapsedTime] = useState('');
    const [issueDesc, setIssueDesc] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        base44.auth.me().then(u => setCurrentUserName(u?.full_name || u?.email || 'לא ידוע')).catch(() => {});
        base44.entities.Employee.list().then(emps => setEmployees(emps.filter(e => e.pushover_user_key))).catch(() => {});
    }, []);

    const reset = () => {
        setStep('type');
        setDept(null);
        setSubOption(null);
        setItemName('');
        setIsEntered('');
        setElapsedTime('');
        setIssueDesc('');
        setSelectedRecipients([]);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const buildDescription = () => {
        if (step === 'service') return `בעיית שירות: ${issueDesc}`;
        if (step === 'move') return `בקשת מעבר מקום לשולחן ${tableNumber}`;
        const cfg = DEPT_CONFIG[dept];
        if (subOption === cfg.subOptions[0]) {
            // לא יצאה
            return `${subOption}: ${cfg.itemLabel} - "${itemName}". הוקלד: ${isEntered}. זמן שעבר: ${elapsedTime}.`;
        }
        if (subOption === cfg.subOptions[1]) {
            // תקלה במנה קיימת
            return `${subOption}: ${cfg.itemLabel} - "${itemName}". תיאור: ${issueDesc}`;
        }
        // אחר
        return `אחר (${dept === 'kitchen' ? 'מטבח' : 'בר'}): ${issueDesc}`;
    };

    const handleSubmit = async () => {
        if (step !== 'service' && step !== 'move' && selectedRecipients.length === 0) {
            alert('⚠️ בחר לפחות מקבל אחד');
            return;
        }
        setIsSaving(true);
        const description = buildDescription();
        let category = 'operational';
        if (dept === 'kitchen') category = 'kitchen';
        else if (dept === 'bar') category = 'bar';
        else if (step === 'service') category = 'service';
        else if (step === 'move') category = 'table_move';

        try {
            await base44.entities.Incident.create({
                title: `שולחן ${tableNumber} - ${step === 'move' ? 'בקשת מעבר מקום' : subOption || 'בעיית שירות'}`,
                description,
                category,
                severity: 'medium',
                status: 'open',
                incident_date: new Date().toISOString(),
                reported_by: currentUserName,
            });

            alert('✅ התקרית נפתחה וההתראות נשלחו!');
            handleClose();
        } catch (err) {
            console.error(err);
            alert('שגיאה בפתיחת התקרית');
        } finally {
            setIsSaving(false);
        }
    };

    const renderStep = () => {
        // Step 1: סוג הבעיה
        if (step === 'type') return (
            <div className="space-y-3">
                <p className="text-center text-gray-600 text-sm">שולחן {tableNumber} — מה הבעיה?</p>
                {[
                    { label: '🍳 בעיה במטבח', action: () => { setDept('kitchen'); setStep('dept'); } },
                    { label: '🍸 בעיה בבר', action: () => { setDept('bar'); setStep('dept'); } },
                    { label: '🙋 בעיית שירות', action: () => setStep('service') },
                    { label: '🔄 מעבר מקום', action: () => setStep('move') },
                ].map(opt => (
                    <Button key={opt.label} className="w-full" variant="outline" onClick={opt.action}>
                        {opt.label}
                    </Button>
                ))}
            </div>
        );

        // Step 2: תת-קטגוריה (מטבח/בר)
        if (step === 'dept') {
            const cfg = DEPT_CONFIG[dept];
            return (
                <div className="space-y-3">
                    <p className="text-center text-gray-600 text-sm">{cfg.label} — מה הבעיה?</p>
                    {cfg.subOptions.map(opt => (
                        <Button key={opt} className="w-full" variant="outline"
                            onClick={() => { setSubOption(opt); setStep('details'); }}>
                            {opt}
                        </Button>
                    ))}
                    <Button variant="ghost" className="w-full" onClick={() => setStep('type')}>← חזור</Button>
                </div>
            );
        }

        // Step 3: פרטים
        if (step === 'details') {
            const cfg = DEPT_CONFIG[dept];
            const isNotOut = subOption === cfg.subOptions[0];
            const isFault = subOption === cfg.subOptions[1];
            const isOther = subOption === cfg.subOptions[2];
            return (
                <div className="space-y-4">
                    <p className="font-bold text-center">{subOption}</p>
                    <p className="text-xs text-gray-500 text-center">בחר למי לשלוח התראה</p>
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
                        {employees.map(emp => (
                            <label key={emp.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded cursor-pointer">
                                <input type="checkbox" checked={selectedRecipients.includes(emp.id)} onChange={e => {
                                    if (e.target.checked) setSelectedRecipients([...selectedRecipients, emp.id]);
                                    else setSelectedRecipients(selectedRecipients.filter(id => id !== emp.id));
                                }} />
                                <span className="text-xs">{emp.full_name}</span>
                            </label>
                        ))}
                    </div>
                    {isNotOut && (
                        <>
                            <div>
                                <Label>האם ה{cfg.itemLabel} הוקלד/ה?</Label>
                                <div className="flex gap-2 mt-1">
                                    {['כן', 'לא', 'לא בדקתי'].map(v => (
                                        <Button key={v} size="sm" variant={isEntered === v ? 'default' : 'outline'} onClick={() => setIsEntered(v)}>{v}</Button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label>כמה זמן עבר מההקלדה?</Label>
                                <Input value={elapsedTime} onChange={e => setElapsedTime(e.target.value)} placeholder="לדוגמה: 15 דקות" className="mt-1" />
                            </div>
                            <div>
                                <Label>איזה {cfg.itemLabel} לא יצא?</Label>
                                <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder={cfg.itemPlaceholder} className="mt-1" />
                            </div>
                        </>
                    )}
                    {isFault && (
                        <>
                            <div>
                                <Label>איזה {cfg.itemLabel}?</Label>
                                <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder={cfg.itemPlaceholder} className="mt-1" />
                            </div>
                            <div>
                                <Label>מה התקלה?</Label>
                                <Input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="תאר את הבעיה" className="mt-1" />
                            </div>
                        </>
                    )}
                    {isOther && (
                        <div>
                            <Label>מה הבעיה?</Label>
                            <Input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="תאר את הבעיה" className="mt-1" />
                        </div>
                    )}
                    <div className="flex gap-2 mt-4">
                        <Button variant="ghost" onClick={() => setStep('dept')}>← חזור</Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={isSaving || selectedRecipients.length === 0}>
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                            שלח תקרית {dept === 'kitchen' ? 'מטבח' : 'בר'}
                        </Button>
                    </div>
                </div>
            );
        }

        // שירות
        if (step === 'service') return (
            <div className="space-y-4">
                <p className="font-bold text-center">🙋 בעיית שירות — שולחן {tableNumber}</p>
                <div>
                    <Label>מה הבעיה?</Label>
                    <Input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="תאר את הבעיה" className="mt-1" />
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setStep('type')}>← חזור</Button>
                    <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                        שלח תקרית
                    </Button>
                </div>
            </div>
        );

        // מעבר מקום
        if (step === 'move') return (
            <div className="space-y-4">
                <p className="font-bold text-center">🔄 בקשת מעבר מקום — שולחן {tableNumber}</p>
                <p className="text-sm text-gray-600 text-center">בחר למי לשלוח התראה</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                            <input type="checkbox" checked={selectedRecipients.includes(emp.id)} onChange={e => {
                                if (e.target.checked) setSelectedRecipients([...selectedRecipients, emp.id]);
                                else setSelectedRecipients(selectedRecipients.filter(id => id !== emp.id));
                            }} />
                            <span className="text-sm">{emp.full_name}</span>
                        </label>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setStep('type')}>← חזור</Button>
                    <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                        שלח התראה
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent dir="rtl" className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        פתיחת תקרית — שולחן {tableNumber}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    {renderStep()}
                </div>
            </DialogContent>
        </Dialog>
    );
}