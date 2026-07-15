import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tablet, CreditCard, Plus, Trash2, Wrench, CheckCircle, Clock, Camera, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { format } from 'date-fns';

const STATUS_LABELS = {
    available: { label: 'פנוי', color: 'bg-green-100 text-green-700 border-green-300' },
    in_use: { label: 'בשימוש', color: 'bg-[#F4ECD8] text-[#44512C] border-[#D9BD83]' },
    maintenance: { label: 'בתיקון', color: 'bg-red-100 text-red-700 border-red-300' },
};

export default function DevicesDashboard() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newDevice, setNewDevice] = useState({ device_type: 'ipad', device_number: '' });
    const [saving, setSaving] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState(null);

    useEffect(() => { loadDevices(); }, []);

    const loadDevices = async () => {
        setLoading(true);
        const all = await base44.entities.DeviceAsset.list('-created_date');
        setDevices(all);
        setLoading(false);
    };

    const addDevice = async () => {
        if (!newDevice.device_number) return;
        setSaving(true);
        await base44.entities.DeviceAsset.create({
            device_type: newDevice.device_type,
            device_number: parseInt(newDevice.device_number),
            status: 'available',
        });
        setShowAddDialog(false);
        setNewDevice({ device_type: 'ipad', device_number: '' });
        setSaving(false);
        loadDevices();
    };

    const setMaintenance = async (device) => {
        await base44.entities.DeviceAsset.update(device.id, {
            status: device.status === 'maintenance' ? 'available' : 'maintenance',
        });
        loadDevices();
    };

    const forceReturn = async (device) => {
        if (!confirm(`האם לשחרר בכוח את ${device.device_type === 'ipad' ? 'אייפד' : 'מסופון'} #${device.device_number}?`)) return;
        await base44.entities.DeviceAsset.update(device.id, {
            status: 'available',
            current_holder_id: '',
            current_holder_name: '',
        });
        loadDevices();
    };

    const deleteDevice = async (device) => {
        if (!confirm(`למחוק לצמיתות ${device.device_type === 'ipad' ? 'אייפד' : 'מסופון'} #${device.device_number}?`)) return;
        await base44.entities.DeviceAsset.delete(device.id);
        loadDevices();
    };

    const ipads = devices.filter(d => d.device_type === 'ipad').sort((a, b) => a.device_number - b.device_number);
    const terminals = devices.filter(d => d.device_type === 'terminal').sort((a, b) => a.device_number - b.device_number);
    const inUse = devices.filter(d => d.status === 'in_use');

    const DeviceCard = ({ device }) => {
        const st = STATUS_LABELS[device.status] || STATUS_LABELS.available;
        const isIpad = device.device_type === 'ipad';
        const Icon = isIpad ? Tablet : CreditCard;

        return (
            <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${isIpad ? 'text-[#44512C]' : 'text-[#A04A2E]'}`} />
                        <span className="font-bold text-slate-800">
                            {isIpad ? 'אייפד' : 'מסופון'} #{device.device_number}
                        </span>
                    </div>
                    <Badge className={`border text-xs ${st.color}`}>{st.label}</Badge>
                </div>

                {device.status === 'in_use' && (
                    <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg p-2 text-xs space-y-1">
                        <p className="text-[#2E3819] font-medium">👤 {device.current_holder_name}</p>
                        {device.checked_out_at && (
                            <p className="text-[#44512C] flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                נלקח: {format(new Date(device.checked_out_at), 'HH:mm dd/MM')}
                            </p>
                        )}
                    </div>
                )}

                {device.return_photo_url && (
                    <button
                        onClick={() => setSelectedPhoto(device.return_photo_url)}
                        className="flex items-center gap-1 text-xs text-[#A04A2E] hover:underline"
                    >
                        <Camera className="w-3 h-3" />
                        תמונת החזרה האחרונה
                    </button>
                )}

                <div className="flex gap-1 flex-wrap">
                    {device.status === 'in_use' && (
                        <Button size="sm" variant="outline" onClick={() => forceReturn(device)} className="text-xs h-7 border-orange-300 text-orange-600 hover:bg-orange-50">
                            שחרר בכוח
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setMaintenance(device)} className="text-xs h-7 border-slate-300 text-slate-600">
                        {device.status === 'maintenance' ? '✅ פנוי' : '🔧 תיקון'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteDevice(device)} className="text-xs h-7 border-red-200 text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 space-y-6" dir="rtl">
            <PageHeader
                title="ניהול ציוד מלצרים"
                icon={Tablet}
                action={(
                    <Button onClick={() => setShowAddDialog(true)} className="bg-[#44512C] hover:bg-[#44512C] text-white">
                        <Plus className="w-4 h-4 ml-1" />
                        הוסף מכשיר
                    </Button>
                )}
            />

            {/* סיכום מצב */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-green-700">{devices.filter(d => d.status === 'available').length}</p>
                        <p className="text-xs text-green-600 font-medium">פנויים</p>
                    </CardContent>
                </Card>
                <Card className="border-[#E8D9B5] bg-[#F4ECD8]">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-[#44512C]">{inUse.length}</p>
                        <p className="text-xs text-[#44512C] font-medium">בשימוש</p>
                    </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-red-700">{devices.filter(d => d.status === 'maintenance').length}</p>
                        <p className="text-xs text-red-600 font-medium">בתיקון</p>
                    </CardContent>
                </Card>
            </div>

            {/* מי מחזיק ציוד כרגע */}
            {inUse.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[#44512C]" />
                            מחזיקי ציוד פעילים
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {inUse.map(d => (
                                <div key={d.id} className="flex items-center justify-between bg-[#F4ECD8] rounded-lg p-3">
                                    <div className="flex items-center gap-2">
                                        {d.device_type === 'ipad' ? <Tablet className="w-4 h-4 text-[#44512C]" /> : <CreditCard className="w-4 h-4 text-[#A04A2E]" />}
                                        <span className="text-sm font-medium">
                                            {d.device_type === 'ipad' ? 'אייפד' : 'מסופון'} #{d.device_number}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">{d.current_holder_name}</p>
                                        {d.checked_out_at && (
                                            <p className="text-xs text-slate-500">
                                                מאז {format(new Date(d.checked_out_at), 'HH:mm')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
            ) : (
                <>
                    {/* אייפדים */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <Tablet className="w-5 h-5 text-[#44512C]" /> אייפדים
                        </h2>
                        {ipads.length === 0 ? (
                            <p className="text-slate-400 text-sm">אין אייפדים. לחץ "הוסף מכשיר".</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {ipads.map(d => <DeviceCard key={d.id} device={d} />)}
                            </div>
                        )}
                    </div>

                    {/* מסופונים */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-[#A04A2E]" /> מסופונים
                        </h2>
                        {terminals.length === 0 ? (
                            <p className="text-slate-400 text-sm">אין מסופונים. לחץ "הוסף מכשיר".</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {terminals.map(d => <DeviceCard key={d.id} device={d} />)}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* הוספת מכשיר */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent dir="rtl" className="max-w-xs">
                    <DialogHeader>
                        <DialogTitle>הוספת מכשיר חדש</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">סוג מכשיר</label>
                            <div className="flex gap-2">
                                {['ipad', 'terminal'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setNewDevice(p => ({ ...p, device_type: type }))}
                                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${newDevice.device_type === type ? 'border-[#44512C] bg-[#F4ECD8] text-[#44512C]' : 'border-slate-200 text-slate-600'}`}
                                    >
                                        {type === 'ipad' ? '📱 אייפד' : '💳 מסופון'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">מספר מכשיר</label>
                            <input
                                type="number"
                                min="1"
                                value={newDevice.device_number}
                                onChange={e => setNewDevice(p => ({ ...p, device_number: e.target.value }))}
                                placeholder="לדוגמה: 3"
                                className="w-full border rounded-lg px-3 py-2 text-center text-lg font-bold"
                            />
                        </div>
                        <Button
                            onClick={addDevice}
                            disabled={!newDevice.device_number || saving}
                            className="w-full bg-[#44512C] hover:bg-[#44512C] text-white"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Plus className="w-4 h-4 ml-1" />}
                            הוסף
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* תצוגת תמונת החזרה */}
            <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
                <DialogContent className="max-w-lg" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Camera className="w-4 h-4" /> תמונת החזרת ציוד
                        </DialogTitle>
                    </DialogHeader>
                    {selectedPhoto && (
                        <img src={selectedPhoto} alt="החזרת ציוד" className="w-full rounded-xl object-contain max-h-80" />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}