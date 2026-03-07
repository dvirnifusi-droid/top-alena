import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import twilio from 'npm:twilio@5.3.4';

// Triggered by entity automation on LeaveRequest update
// Sends WhatsApp to employee when manager approves or rejects their leave request

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { event, data } = await req.json();

        if (event?.entity_name !== 'LeaveRequest' || event?.type !== 'update') {
            return Response.json({ skipped: 'not a LeaveRequest update' });
        }

        const leaveReq = data;
        if (!leaveReq || (leaveReq.status !== 'approved' && leaveReq.status !== 'rejected')) {
            return Response.json({ skipped: 'not a final status change' });
        }

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !fromNumber) {
            return Response.json({ error: 'Missing Twilio credentials' }, { status: 500 });
        }

        const employees = await base44.asServiceRole.entities.Employee.filter({ id: leaveReq.employee_id });
        const employee = employees[0];
        if (!employee?.phone) {
            return Response.json({ skipped: 'employee has no phone' });
        }

        const leaveTypeLabels = { vacation: 'חופשה', sick: 'מחלה', personal: 'אישי', military: 'מילואים', other: 'אחר' };
        const leaveLabel = leaveTypeLabels[leaveReq.leave_type] || 'היעדרות';

        let message;
        if (leaveReq.status === 'approved') {
            message = `✅ *בקשת ${leaveLabel} אושרה!*\n\nהמנהל אישר את הבקשה שלך:\n📅 ${leaveReq.start_date} - ${leaveReq.end_date}\n\nחופשה נעימה! 😊`;
        } else {
            message = `❌ *בקשת ${leaveLabel} נדחתה*\n\nלצערנו, הבקשה שלך נדחתה.\n📅 ${leaveReq.start_date} - ${leaveReq.end_date}${leaveReq.manager_notes ? `\n\n📝 הערת מנהל: ${leaveReq.manager_notes}` : ''}\n\nלפרטים נוספים פנה למנהל.`;
        }

        const client = twilio(accountSid, authToken);
        const phone = employee.phone.replace(/\D/g, '');
        await client.messages.create({
            from: `whatsapp:${fromNumber}`,
            to: `whatsapp:+${phone}`,
            body: message,
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});