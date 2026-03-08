import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { Eye, User } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function DashboardViewersWidget() {
    const [viewers, setViewers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadViewers = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const views = await base44.entities.DashboardView.filter({ view_date: today });
                
                // Remove duplicates - keep only the latest view from each user
                const uniqueViewers = {};
                views.forEach(view => {
                    if (!uniqueViewers[view.user_email] || new Date(view.view_time) > new Date(uniqueViewers[view.user_email].view_time)) {
                        uniqueViewers[view.user_email] = view;
                    }
                });
                
                setViewers(Object.values(uniqueViewers).sort((a, b) => new Date(b.view_time) - new Date(a.view_time)));
            } catch (error) {
                console.error('Failed to load dashboard viewers:', error);
            } finally {
                setLoading(false);
            }
        };

        loadViewers();
        const interval = setInterval(loadViewers, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Eye className="w-5 h-5 text-blue-600" />
                        שקראו את לוח הבקרה
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-500 text-sm">טוען...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-blue-600" />
                    שקראו את לוח הבקרה היום ({viewers.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {viewers.length === 0 ? (
                    <p className="text-gray-500 text-sm">אף אחד עדיין לא קרא את הלוח היום</p>
                ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {viewers.map((view, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <User className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 truncate">{view.user_name}</p>
                                        <p className="text-xs text-gray-500">{view.user_email}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-medium text-gray-600">
                                        {format(new Date(view.view_time), 'HH:mm', { locale: he })}
                                    </p>
                                    <p className="text-xs text-gray-400 capitalize">
                                        {view.user_role === 'admin' ? 'מנהל' : 'עובד'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}