// Events Hub — consolidates the events admin pages under one tabbed view:
//   • לידים ופניות  (EventsPrivate — list of EventLeads from the AI agent)
//   • Sales Kit     (EventsSalesKit — menus, upsells, agent prompt)
//   • חוזים         (EventContracts — list + edit digital contracts)
//   • ראש מלצרים    (WaiterAdmin)
//
// The individual pages still exist as their own URLs; this hub embeds them
// in tabs so the owner has ONE place to manage everything events-related.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CalendarHeart, Utensils, FileText, Wine } from 'lucide-react';
import EventsPrivate from './EventsPrivate';
import EventsSalesKit from './EventsSalesKit';
import EventContracts from './EventContracts';
import WaiterAdmin from './WaiterAdmin';

export default function EventsHub() {
    const [tab, setTab] = useState(() => {
        // Persist the selected tab in URL hash so refresh keeps the user's place
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return ['leads', 'kit', 'contracts', 'waiter'].includes(h) ? h : 'leads';
    });

    const onTabChange = (v) => {
        setTab(v);
        if (typeof window !== 'undefined') window.location.hash = v;
    };

    return (
        <div className="p-4" dir="rtl">
            <div className="mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <CalendarHeart className="w-6 h-6 text-orange-600" />
                    אירועים פרטיים — מרכז ניהול
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                    לידים מהסוכן, תפריטים, חוזים דיגיטליים, וראש מלצרים — הכל במקום אחד.
                </p>
            </div>

            <Tabs value={tab} onValueChange={onTabChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-4 md:max-w-2xl">
                        <TabsTrigger value="leads" className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                            <CalendarHeart className="w-4 h-4 ml-1.5" />
                            לידים ופניות
                        </TabsTrigger>
                        <TabsTrigger value="kit" className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                            <Utensils className="w-4 h-4 ml-1.5" />
                            Sales Kit
                        </TabsTrigger>
                        <TabsTrigger value="contracts" className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                            <FileText className="w-4 h-4 ml-1.5" />
                            חוזים
                        </TabsTrigger>
                        <TabsTrigger value="waiter" className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                            <Wine className="w-4 h-4 ml-1.5" />
                            ראש מלצרים
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="leads" className="mt-0">
                    <EventsPrivate />
                </TabsContent>
                <TabsContent value="kit" className="mt-0">
                    <EventsSalesKit />
                </TabsContent>
                <TabsContent value="contracts" className="mt-0">
                    <EventContracts />
                </TabsContent>
                <TabsContent value="waiter" className="mt-0">
                    <WaiterAdmin />
                </TabsContent>
            </Tabs>
        </div>
    );
}
