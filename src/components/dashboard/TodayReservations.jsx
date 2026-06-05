import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Clock } from "lucide-react";
import ReservationSourceBadge from '@/components/shared/ReservationSourceBadge';

const mockReservations = [
    { id: 1, time: "18:00", name: "משפחת כהן", party_size: 6, status: "confirmed" },
    { id: 2, time: "18:30", name: "יוסי לוי", party_size: 2, status: "confirmed" },
    { id: 3, time: "19:00", name: "דנה מור", party_size: 4, status: "pending" },
    { id: 4, time: "20:00", name: "חברת טק", party_size: 12, status: "confirmed" },
    { id: 5, time: "20:30", name: "רונן ושרה", party_size: 2, status: "confirmed" }
];

const statusConfig = {
    confirmed: { label: "אושר", color: "bg-green-100 text-green-800" },
    pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-800" },
    seated: { label: "הושב", color: "bg-blue-100 text-blue-800" }
};

export default function TodayReservations({ reservations = [], isLoading = false }) {
    const [entityAvailable, setEntityAvailable] = useState(true);
    const [realReservations, setRealReservations] = useState([]);

    useEffect(() => {
        loadReservations();
    }, []);

    const loadReservations = async () => {
        try {
            const { Reservation } = await import('@/entities/Reservation');
            const today = new Date().toISOString().split('T')[0];
            const todayReservations = await Reservation.filter({ 
                date: today,
                status: { $in: ['confirmed', 'pending', 'seated'] }
            }, 'time');
            setRealReservations(todayReservations);
            setEntityAvailable(true);
        } catch (error) {
            console.warn('Reservation entity not available:', error);
            setEntityAvailable(false);
            setRealReservations([]);
        }
    };

    // If entity is not available, don't render
    if (!entityAvailable) {
        return null;
    }

    const displayReservations = realReservations.length > 0 ? realReservations : (reservations && reservations.length > 0 ? reservations : mockReservations);

    return (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-orange-50/30">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-white" />
                    </div>
                    <CardTitle className="text-lg text-slate-800">הזמנות היום</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse"></div>
                    ))
                ) : displayReservations.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>אין הזמנות להיום</p>
                    </div>
                ) : (
                    displayReservations.map((reservation) => (
                        <div key={reservation.id} className="p-3 bg-slate-50/70 rounded-lg hover:bg-slate-100/70 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-500" />
                                    <span className="font-semibold text-slate-800">{reservation.time}</span>
                                </div>
                                <Badge className={statusConfig[reservation.status]?.color}>
                                    {statusConfig[reservation.status]?.label}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700 flex items-center gap-1.5">
                                    {reservation.customer_name || reservation.name}
                                    <ReservationSourceBadge source={reservation.source} campaign={reservation.campaign} compact />
                                </span>
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Users className="w-3 h-3" />
                                    {reservation.party_size}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}