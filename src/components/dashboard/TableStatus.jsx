import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, RefreshCw } from "lucide-react";

export default function TableStatus({ isLoading = false }) {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [entityAvailable, setEntityAvailable] = useState(true);

    useEffect(() => {
        loadTableData();
        const interval = setInterval(loadTableData, 30000); // רענון כל 30 שניות
        return () => clearInterval(interval);
    }, []);

    const loadTableData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Try to import and use TableSession
            let activeSessions = [];
            try {
                const { TableSession } = await import('@/entities/TableSession');
                activeSessions = await TableSession.filter({ status: 'active' }, '-session_start', 20);
                setEntityAvailable(true);
            } catch (entityError) {
                console.warn('TableSession entity not available:', entityError);
                setEntityAvailable(false);
                // Use empty array if entity doesn't exist
                activeSessions = [];
            }
            
            // הפיכה לפורמט שמתאים לקומפוננט
            const formattedTables = activeSessions.map(session => {
                const sessionStart = new Date(session.session_start);
                const now = new Date();
                const diffMinutes = Math.floor((now - sessionStart) / (1000 * 60));
                
                let duration;
                if (diffMinutes < 60) {
                    duration = `${diffMinutes} דק׳`;
                } else {
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;
                    duration = `${hours}:${minutes.toString().padStart(2, '0')}`;
                }

                return {
                    number: session.table_number,
                    status: "occupied",
                    party_size: session.party_size,
                    duration: duration,
                    waiter: session.waiter_name,
                    current_step: session.current_step,
                    progress: Math.round(((session.steps_completed?.length || 0) / 23) * 100)
                };
            });

            setTables(formattedTables);
        } catch (error) {
            console.error('Error loading table data:', error);
            setError('שגיאה בטעינת נתוני שולחנות');
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            occupied: { label: "תפוס", color: "bg-red-100 text-red-800" },
            available: { label: "פנוי", color: "bg-green-100 text-green-800" },
            reserved: { label: "שמור", color: "bg-[#F4ECD8] text-[#2E3819]" },
            cleaning: { label: "ניקוי", color: "bg-[#F4ECD8] text-yellow-800" }
        };
        return configs[status] || configs.occupied;
    };

    // Don't render if entity is not available
    if (!entityAvailable) {
        return null;
    }

    return (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-[#F4ECD8]/30">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#A04A2E] to-[#A04A2E] rounded-lg flex items-center justify-center">
                            <Users className="w-4 h-4 text-white" />
                        </div>
                        <CardTitle className="text-lg text-slate-800">סטטוס שולחנות פעילים</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={loadTableData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {error ? (
                    <div className="text-center py-4 text-gray-500">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{error}</p>
                        <Button variant="outline" size="sm" onClick={loadTableData} className="mt-2">
                            נסה שוב
                        </Button>
                    </div>
                ) : loading && !tables.length ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse"></div>
                    ))
                ) : tables.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>אין שולחנות פעילים כרגע</p>
                    </div>
                ) : (
                    tables.slice(0, 6).map((table) => {
                        const statusConfig = getStatusConfig(table.status);
                        
                        return (
                            <div key={table.number} className="flex items-center justify-between p-3 bg-[#FAF5E8]/70 rounded-lg hover:bg-slate-100/70 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center font-bold text-sm">
                                        {table.number}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge className={statusConfig.color}>
                                                {statusConfig.label}
                                            </Badge>
                                            <span className="text-xs text-slate-600">
                                                שלב {table.current_step} ({table.progress}%)
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <span>{table.party_size} אנשים</span>
                                            <span>•</span>
                                            <span>{table.waiter}</span>
                                        </div>
                                    </div>
                                </div>
                                {table.duration && (
                                    <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Clock className="w-3 h-3" />
                                        {table.duration}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
                
                {tables.length > 6 && (
                    <div className="text-center pt-2">
                        <span className="text-xs text-gray-500">+{tables.length - 6} שולחנות נוספים</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}