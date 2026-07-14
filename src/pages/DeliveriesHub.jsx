// Deliveries hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Users, Navigation } from 'lucide-react';
import Deliveries from './Deliveries';
import Couriers from './Couriers';
import CourierTracking from './CourierTracking';
import DeliveryCustomerClub from './DeliveryCustomerClub';
import PageHeader from '@/components/shared/PageHeader';

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
            <PageHeader title="משלוחים" icon={Package} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-4 md:max-w-3xl">
                        {TABS.map(t => (
                            <TabsTrigger key={t.id} value={t.id} className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                                <t.icon className="w-4 h-4 ml-1.5" />
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                {TABS.map(t => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
