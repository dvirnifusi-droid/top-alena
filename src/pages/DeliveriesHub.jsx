// Deliveries hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Users, Navigation } from 'lucide-react';
import Deliveries from './Deliveries';
import Couriers from './Couriers';
import CourierTracking from './CourierTracking';
import DeliveryCustomerClub from './DeliveryCustomerClub';

const TABS = [
    { id: 'orders', label: 'ניהול משלוחים', icon: Package, C: Deliveries },
    { id: 'couriers', label: 'שליחים', icon: Users, C: Couriers },
    { id: 'tracking', label: 'מעקב חי', icon: Navigation, C: CourierTracking },
    { id: 'club', label: 'מועדון לקוחות', icon: Users, C: DeliveryCustomerClub },
];

export default function DeliveriesHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'orders';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Package className="w-6 h-6 text-amber-600" />
                משלוחים
            </h1>
            <Tabs value={tab} onValueChange={onChange}>
                <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-4 max-w-3xl h-auto">
                    {TABS.map(t => (
                        <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm py-2">
                            <t.icon className="w-3.5 h-3.5 ml-1" />
                            {t.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {TABS.map(t => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
