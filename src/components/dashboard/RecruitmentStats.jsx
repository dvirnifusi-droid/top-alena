import React, { useEffect, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle, Clock, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RecruitmentStats() {
    const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, rejected: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        base44.entities.JobCandidate.list().then(candidates => {
            setStats({
                total: candidates.length,
                completed: candidates.filter(c => c.status === 'approved' || c.score >= 60).length,
                pending: candidates.filter(c => c.status === 'pending').length,
                rejected: candidates.filter(c => c.status === 'rejected').length,
            });
        }).finally(() => setLoading(false));
    }, []);

    const items = [
        { label: 'סה״כ פנו', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'סיימו בהצלחה', value: stats.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'ממתינים', value: stats.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
        { label: 'נדחו', value: stats.rejected, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
    ];

    return (
        <Card>
            <CardContent className="p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                    📋 סטטיסטיקות גיוס – בוט וואטסאפ
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {items.map(({ label, value, icon: Icon, color, bg }) => (
                        <div key={label} className={`rounded-xl p-3 ${bg} flex flex-col items-center gap-1`}>
                            <Icon className={`w-5 h-5 ${color}`} />
                            <span className={`text-2xl font-black ${color}`}>
                                {loading ? '...' : value}
                            </span>
                            <span className="text-xs text-slate-600 text-center">{label}</span>
                        </div>
                    ))}
                </div>
                {!loading && stats.total > 0 && (
                    <div className="mt-4 bg-slate-50 rounded-lg p-3">
                        <div className="flex justify-between text-sm text-slate-600 mb-1">
                            <span>אחוז השלמה</span>
                            <span className="font-bold text-slate-800">
                                {Math.round((stats.completed / stats.total) * 100)}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${Math.round((stats.completed / stats.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}