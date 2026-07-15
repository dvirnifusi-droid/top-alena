import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

export default function ShiftLeaderboard({ myEmployeeId }) {
    const [board, setBoard] = useState([]);

    const load = async () => {
        try {
            const data = (await base44.functions.getShiftLeaderboard({}))?.data || {};
            setBoard(Array.isArray(data?.board) ? data.board : []);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        const interval = setInterval(load, 30000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            clearInterval(interval);
        };
    }, []);

    if (board.length === 0) return null;

    const myIdx = myEmployeeId ? board.findIndex(b => b.id === myEmployeeId) : -1;
    const showSelfRow = myIdx >= 5;
    const visible = board.slice(0, 5);

    return (
        <Card className="mb-4">
            <CardContent className="p-4">
                <h3 className="font-bold mb-3">🏆 לוח המשמרת</h3>
                <div className="space-y-2">
                    {visible.map((row, i) => {
                        const mine = row.id === myEmployeeId;
                        return (
                            <div
                                key={row.id}
                                className={`flex items-center justify-between p-2 rounded-lg ${mine ? 'bg-yellow-50 border-2 border-yellow-400' : 'bg-gray-50'}`}
                            >
                                <span className="font-bold">{MEDALS[i]} {row.name}{mine ? ' (אתה)' : ''}</span>
                                <span className="text-sm text-gray-700">{row.sales} מכירות · {row.coins} 🪙</span>
                            </div>
                        );
                    })}
                    {showSelfRow && board[myIdx] && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 border-2 border-yellow-400 mt-3">
                            <span className="font-bold">#{myIdx + 1} {board[myIdx].name} (אתה)</span>
                            <span className="text-sm text-gray-700">{board[myIdx].sales} מכירות · {board[myIdx].coins} 🪙</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
