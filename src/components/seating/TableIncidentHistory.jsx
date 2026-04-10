import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_LABELS = {
    reported: { label: 'דווח', color: 'bg-red-100 text-red-700' },
    investigating: { label: 'בחקירה', color: 'bg-orange-100 text-orange-700' },
    in_progress: { label: 'בטיפול', color: 'bg-yellow-100 text-yellow-700' },
    resolved: { label: 'טופל', color: 'bg-green-100 text-green-700' },
    closed: { label: 'סגור', color: 'bg-gray-100 text-gray-600' },
};

export default function TableIncidentHistory({ tableNumber }) {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [resolution, setResolution] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!tableNumber) return;
        loadIncidents();
    }, [tableNumber]);

    const loadIncidents = async () => {
        setLoading(true);
        const all = await base44.entities.Incident.list('-incident_date', 100);
        const filtered = all.filter(i => 
            i.title?.includes(`שולחן ${tableNumber}`) ||
            i.location === String(tableNumber)
        );
        setIncidents(filtered);
        setLoading(false);
    };

    const handleMarkResolved = async (incident) => {
        setSaving(true);
        await base44.entities.Incident.update(incident.id, {
            status: 'resolved',
            solution_provided: resolution || 'טופל',
            resolution_date: new Date().toISOString(),
        });
        setEditingId(null);
        setResolution('');
        await loadIncidents();
        setSaving(false);
    };

    if (loading) return <div className="text-sm text-gray-500 py-2">טוען היסטוריית תקריות...</div>;
    if (incidents.length === 0) return (
        <div className="text-sm text-gray-400 py-2 text-center">אין תקריות קודמות לשולחן זה</div>
    );

    const open = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed');
    const resolved = incidents.filter(i => i.status === 'resolved' || i.status === 'closed');

    return (
        <div className="space-y-2">
            {open.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> תקריות פתוחות ({open.length})
                    </p>
                    {open.map(incident => (
                        <IncidentRow
                            key={incident.id}
                            incident={incident}
                            editingId={editingId}
                            setEditingId={setEditingId}
                            resolution={resolution}
                            setResolution={setResolution}
                            handleMarkResolved={handleMarkResolved}
                            saving={saving}
                        />
                    ))}
                </div>
            )}

            {resolved.length > 0 && (
                <div>
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        תקריות שטופלו ({resolved.length})
                    </button>
                    {expanded && (
                        <div className="space-y-2 mt-2">
                            {resolved.map(incident => (
                                <IncidentRow key={incident.id} incident={incident} resolved />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function IncidentRow({ incident, resolved, editingId, setEditingId, resolution, setResolution, handleMarkResolved, saving }) {
    const statusInfo = STATUS_LABELS[incident.status] || STATUS_LABELS.reported;
    const date = incident.incident_date 
        ? new Date(incident.incident_date).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className={`rounded-lg border p-3 text-sm space-y-1 ${resolved ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                    <span className="font-semibold">{incident.title}</span>
                    {date && <span className="text-xs text-gray-400 mr-2">{date}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
            </div>

            {incident.description && (
                <div className="text-xs text-gray-600">{incident.description}</div>
            )}

            {incident.solution_provided && (
                <div className="text-xs text-green-700 flex items-center gap-1 mt-1">
                    <CheckCircle className="w-3 h-3" />
                    טיפול: {incident.solution_provided}
                </div>
            )}

            {!resolved && (
                <>
                    {editingId === incident.id ? (
                        <div className="space-y-2 pt-1">
                            <Textarea
                                value={resolution}
                                onChange={e => setResolution(e.target.value)}
                                placeholder="כיצד טופלה הבעיה?"
                                className="text-xs h-16 resize-none"
                            />
                            <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                    onClick={() => handleMarkResolved(incident)} disabled={saving}>
                                    ✅ סמן כטופל
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs"
                                    onClick={() => setEditingId(null)}>
                                    ביטול
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setEditingId(incident.id)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1 pt-1"
                        >
                            <Clock className="w-3 h-3" /> סמן כטופל
                        </button>
                    )}
                </>
            )}
        </div>
    );
}