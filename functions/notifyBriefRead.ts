import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        
        // זה נקרא כאשר DailyBrief מתעדכן
        // אנחנו פשוט מעדכנים את הממשק דרך ממשק ממשלתי
        // השינוי של read_by יגרום לממשק להתעדכן בעצמו דרך polling או subscriptions
        
        console.log('Brief read notification:', {
            briefId: payload.event?.entity_id,
            readBy: payload.data?.read_by
        });
        
        return Response.json({ success: true });
    } catch (error) {
        console.error('Error in notifyBriefRead:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});