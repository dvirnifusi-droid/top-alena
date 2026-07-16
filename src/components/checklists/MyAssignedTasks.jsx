import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Camera, CheckCircle2, Clock } from 'lucide-react';

export default function MyAssignedTasks({ currentEmployee }) {
    const [assignedItems, setAssignedItems] = useState([]);
    const [completedMap, setCompletedMap] = useState({});
    const [photoMap, setPhotoMap] = useState({});
    const [uploading, setUploading] = useState({});
    const fileRefs = useRef({});

    useEffect(() => {
        if (!currentEmployee?.id) return;
        loadAssignedTasks();
    }, [currentEmployee?.id]);

    // SAME item key scheme as the shared daily run (wizard + live view) so a
    // mark here shows up there instantly, and vice versa.
    const itemKeyOf = (item, i) => String(item?.id || (item?.order != null ? `o${item.order}` : `i${i}`));

    const loadAssignedTasks = async () => {
        const checklists = await base44.entities.Checklist.filter({ status: 'active' });
        const items = [];
        for (const cl of checklists) {
            (cl.items || []).forEach((item, i) => {
                if (item.assigned_to_employee_id === currentEmployee.id) {
                    items.push({ ...item, checklist_id: cl.id, checklist_title: cl.title, item_key: itemKeyOf(item, i) });
                }
            });
        }
        setAssignedItems(items);

        // Read completion from today's SHARED runs (deterministic live_* ids).
        const ilToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
        const executions = await base44.entities.ChecklistExecution.list('-execution_date', 200).catch(() => []);
        const cm = {};
        const pm = {};
        for (const item of items) {
            const prefix = `live_${item.checklist_id}_${ilToday}`;
            const runs = executions.filter(e => String(e.id || '').startsWith(prefix));
            const run = runs.find(e => e.status === 'in_progress') || runs[0];
            const r = run?.results?.[item.item_key];
            if (!r) continue;
            const key = getKey(item);
            if (r.checked) cm[key] = true;
            if (r.photo_url) pm[key] = r.photo_url;
        }
        setCompletedMap(cm);
        setPhotoMap(pm);
    };

    const getKey = (item) => `${item.checklist_id}_${item.item_key}`;

    const handleToggle = async (item) => {
        const key = getKey(item);
        const newVal = !completedMap[key];
        setCompletedMap(prev => ({ ...prev, [key]: newVal }));
        await syncToExecution(item, { completed: newVal, photo_url: photoMap[key] || null });
    };

    const handlePhoto = async (item, file) => {
        if (!file) return;
        const key = getKey(item);
        setUploading(prev => ({ ...prev, [key]: true }));
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setPhotoMap(prev => ({ ...prev, [key]: file_url }));
        setUploading(prev => ({ ...prev, [key]: false }));
        await syncToExecution(item, { completed: completedMap[key] || false, photo_url: file_url });
    };

    // Write through the shared-run API (atomic per-item merge) — never a full
    // results replace, so parallel marks from other screens are never lost.
    const syncToExecution = async (item, { completed, photo_url }) => {
        try {
            const res = await base44.functions.openChecklistLiveRun({ checklist_id: item.checklist_id });
            const ex = (res?.data || res)?.execution;
            if (!ex?.id) return;
            await base44.functions.toggleChecklistLiveItem({
                execution_id: ex.id,
                item_key: item.item_key,
                checked: completed,
                patch: {
                    performed_by: currentEmployee.full_name,
                    ...(photo_url ? { photo_url, photo_urls: [photo_url] } : {}),
                },
            });
        } catch (e) { console.warn('sync assigned task', e); }
    };

    if (assignedItems.length === 0) return null;

    const doneCount = assignedItems.filter(i => completedMap[getKey(i)]).length;

    return (
        <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-3">
                <CheckSquare className="w-5 h-5 text-green-500" />
                המשימות שלי היום
                <Badge className={doneCount === assignedItems.length ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}>
                    {doneCount}/{assignedItems.length}
                </Badge>
            </h2>
            <div className="space-y-2">
                {assignedItems.map(item => {
                    const key = getKey(item);
                    const done = !!completedMap[key];
                    const photo = photoMap[key];
                    const isUploading = uploading[key];
                    return (
                        <Card key={key} className={`border-2 transition-all ${done ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-white'}`}>
                            <CardContent className="p-3 flex items-center gap-3">
                                <button
                                    onClick={() => handleToggle(item)}
                                    className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                        done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                                    }`}
                                >
                                    {done ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-4 h-4 text-gray-400" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold text-sm ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                        {item.area} - {item.task}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">{item.checklist_title}</p>
                                    {photo && (
                                        <img src={photo} alt="תמונה" className="w-12 h-12 rounded object-cover mt-1" />
                                    )}
                                </div>
                                <div className="flex-shrink-0">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        ref={el => fileRefs.current[key] = el}
                                        onChange={e => handlePhoto(item, e.target.files[0])}
                                    />
                                    <button
                                        onClick={() => fileRefs.current[key]?.click()}
                                        disabled={isUploading}
                                        className={`p-2 rounded-lg border transition-all ${photo ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500'}`}
                                    >
                                        <Camera className={`w-4 h-4 ${isUploading ? 'animate-pulse' : ''}`} />
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}