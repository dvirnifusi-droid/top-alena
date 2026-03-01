import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockHourlyData = [
    { hour: '12:00', sales: 450, orders: 8 },
    { hour: '13:00', sales: 780, orders: 15 },
    { hour: '14:00', sales: 1200, orders: 22 },
    { hour: '15:00', sales: 600, orders: 12 },
    { hour: '16:00', sales: 300, orders: 6 },
    { hour: '17:00', sales: 420, orders: 9 },
    { hour: '18:00', sales: 1400, orders: 28 },
    { hour: '19:00', sales: 1800, orders: 35 },
    { hour: '20:00', sales: 2200, orders: 42 },
    { hour: '21:00', sales: 1600, orders: 30 },
    { hour: '22:00', sales: 800, orders: 15 }
];

export default function SalesChart({ salesData, isLoading }) {
    if (isLoading) {
        return (
            <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-blue-50/30">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <CardTitle className="text-xl text-slate-800">מכירות היום</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-80 bg-slate-100 rounded-lg animate-pulse"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-xl border-0 bg-gradient-to-br from-white to-green-50/30">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <CardTitle className="text-xl text-slate-800">מכירות היום</CardTitle>
                    </div>
                    <div className="text-left">
                        <div className="text-2xl font-bold text-green-600">
                            ₪{mockHourlyData.reduce((sum, item) => sum + item.sales, 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-600">
                            {mockHourlyData.reduce((sum, item) => sum + item.orders, 0)} הזמנות
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={mockHourlyData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis 
                            dataKey="hour" 
                            tick={{ fontSize: 12 }}
                            tickLine={{ stroke: '#64748b' }}
                        />
                        <YAxis 
                            tick={{ fontSize: 12 }}
                            tickLine={{ stroke: '#64748b' }}
                        />
                        <Tooltip 
                            contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                        />
                        <Bar 
                            dataKey="sales" 
                            fill="url(#salesGradient)"
                            radius={[4, 4, 0, 0]}
                        />
                        <defs>
                            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" />
                                <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                        </defs>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}