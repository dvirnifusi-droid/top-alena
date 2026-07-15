import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

export default function CompactCoinWidget() {
    const [balance, setBalance] = useState(0);

    const load = async () => {
        try {
            const d = (await base44.functions.getActiveRewardsForMe({}))?.data || {};
            setBalance(d.balance || 0);
        } catch { /* swallow */ }
    };

    useEffect(() => { load(); }, []);

    return (
        <Card className="mb-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300">
            <CardContent className="p-3 flex items-center justify-between">
                <span className="font-bold">💰 יתרתך: {balance} 🪙</span>
                <Link to="/GamificationCenter" className="text-xs text-blue-700 underline">צפה בפרסים →</Link>
            </CardContent>
        </Card>
    );
}
