import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tablet, CreditCard, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function GearUpDialog({ open, onClose, shiftTrackingId, employeeId, employeeName }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedIpad, setSelectedIpad] = useState(null);
    const [selectedTerminal, setSelectedTerminal] = useState(null);
    const [conditionOk, setConditionOk] = useState(false);

    useEffect(() => {
        if (open) loadDevices();
    }, [open]);

    const loadDevices = async () => {
        setLoading(true);
        const all = await base44.entities.DeviceAsset.list();
        setDevices(all);
        setLoading(false);
    };

    const ipads = devices.filter(d => d.device_type === 'ipad').sort((a, b) => a.device_number - b.device_number);
    const terminals = devices.filter(d => d.device_type === 'terminal').sort((a, b) => a.device_number - b.device_number);

    const isAvailable = (device) => device.status === 'available';

    const handleConfirm = async () => {
        if (!conditionOk) return;
        setSaving(true);
        const now = new Date().toISOString();
        const updates = [];

        if (selectedIpad) {
            updates.push(base44.entities.DeviceAsset.update(selectedIpad.id, {
                status: 'in_use',
                current_holder_id: employeeId,
                current_holder_name: employeeName,
                checked_out_at: now,
                shift_tracking_id: shiftTrackingId,
                condition_ok: true,
                return_photo_url: '',
                return_notes: '',
                returned_at: null,
            }));
        }
        if (selectedTerminal) {
            updates.push(base44.entities.DeviceAsset.update(selectedTerminal.id, {
                status: 'in_use',
                current_holder_id: employeeId,
                current_holder_name: employeeName,
                checked_out_at: now,
                shift_tracking_id: shiftTrackingId,
                condition_ok: true,
                return_photo_url: '',
                return_notes: '',
                returned_at: null,
            }));
        }

        await Promise.all(updates);
        setSaving(false);
        onClose({ ipad: selectedIpad, terminal: selectedTerminal });
    };

    const DeviceButton = ({ device, selected, onSelect, icon: Icon, label }) => {
        const available = isAvailable(device);
        return (
            <button
                onClick={() => available && onSelect(selected?.id === device.id ? null : device)}
                disabled={!available}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all text-sm font-bold
                    ${selected?.id === device.id
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : available
                            ? 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-slate-700'
                            : 'border-red-200 bg-red-50 text-red-400 opacity-60 cursor-not-allowed'
                    }`}
            >
                <Icon className="w-6 h-6 mb-1" />
                <span>{label} #{device.device_number}</span>
                {!available && <span className="text-xs font-normal mt-1">({device.current_holder_name?.split(' ')[0] || 'תפוס'})</span>}
                {selected?.id === device.id && <CheckCircle className="w-4 h-4 mt-1 text-green-500" />}
            </button>
        );
    };

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent dir="rtl" className="max-w-sm w-[95vw]" onInteractOutside={e => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        🎽 Gear Up – קבלת ציוד למשמרת
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
                ) : (
                    <div className="space-y-5">
                        {/* אייפדים */}
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                <Tablet className="w-4 h-4 text-blue-500" /> בחר אייפד
                            </p>
                            {ipads.length === 0 ? (
                                <p className="text-xs text-slate-400">אין אייפדים במערכת</p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {ipads.map(d => (
                                        <DeviceButton key={d.id} device={d} selected={selectedIpad} onSelect={setSelectedIpad} icon={Tablet} label="אייפד" />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* מסופונים */}
                        <div>
                            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-purple-500" /> בחר מסופון
                            </p>
                            {terminals.length === 0 ? (
                                <p className="text-xs text-slate-400">אין מסופונים במערכת</p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {terminals.map(d => (
                                        <DeviceButton key={d.id} device={d} selected={selectedTerminal} onSelect={setSelectedTerminal} icon={CreditCard} label="מסופון" />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* אישור תקינות */}
                        <div
                            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${conditionOk ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50'}`}
                            onClick={() => setConditionOk(!conditionOk)}
                        >
                            <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${conditionOk ? 'border-green-500 bg-green-500' : 'border-slate-400'}`}>
                                {conditionOk && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            <p className="text-sm text-slate-700 font-medium">
                                אני מאשר/ת שהציוד שקיבלתי <strong>תקין וטעון</strong>
                            </p>
                        </div>

                        {!conditionOk && (
                            <div className="flex items-center gap-2 text-amber-600 text-xs">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>יש לאשר תקינות הציוד לפני המשך</span>
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            <Button
                                onClick={() => onClose(null)}
                                variant="outline"
                                className="flex-1 text-sm"
                            >
                                דלג
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={!conditionOk || saving || (!selectedIpad && !selectedTerminal)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle className="w-4 h-4 ml-1" />}
                                אשר וצא למשמרת
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}