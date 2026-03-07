import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import twilio from 'npm:twilio@5.3.4';

// Called by automations OR directly. Sends WhatsApp to employee about shift events.
// payload: { type: 'swap_approved' | 'swap_rejected' | 'new_shift', ...data }

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const { type, event, data } = payload;

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !fromNumber) {
            return Response.json({ error: 'Missing Twilio credentials' }, { status: 500 });
        }

        const client = twilio(accountSid, authToken);

        // --- Handle ShiftSwapRequest status change ---
        if (event?.entity_name === 'ShiftSwapRequest' && event?.type === 'update') {
            const req_data = data;
            if (!req_data) return Response.json({ skipped: 'no data' });

            const newStatus = req_data.status;
            if (newStatus !== 'approved_by_manager' && newStatus !== 'rejected_by_manager') {
                return Response.json({ skipped: 'not a final status' });
            }

            // Find requester employee to get phone
            const employees = await base44.asServiceRole.entities.Employee.filter({ id: req_data.requester_employee_id });
            const employee = employees[0];
            if (!employee?.phone) {
                return Response.json({ skipped: 'employee has no phone' });
            }

            const shiftTypeHe = req_data.shift_type === 'lunch' ? 'צהריים' : 'ערב';
            const dateStr = req_data.shift_date || '';

            let message;
            if (newStatus === 'approved_by_manager') {
                message = `✅ *בקשת ההחלפה אושרה!*\n\nהמנהל אישר את החלפת המשמרת שלך עם ${req_data.target_name}.\n📅 משמרת: ${dateStr} - ${shiftTypeHe}\n💼 תפקיד: ${req_data.position || ''}\n\nהסידור עודכן בהתאם 🎉`;
            } else {
                message = `❌ *בקשת ההחלפה נדחתה*\n\nלצערנו, המנהל דחה את בקשת ההחלפה שלך עם ${req_data.target_name}.\n📅 משמרת: ${dateStr} - ${shiftTypeHe}\n\nאם יש שאלות, פנה למנהל ישירות.`;
            }

            const phone = employee.phone.replace(/\D/g, '');
            await client.messages.create({
                from: `whatsapp:${fromNumber}`,
                to: `whatsapp:+${phone}`,
                body: message,
            });

            return Response.json({ success: true, sent_to: employee.phone });
        }

        // --- Handle new WorkShift assignment ---
        if (event?.entity_name === 'WorkShift' && (event?.type === 'create' || event?.type === 'update')) {
            const shift = data;
            if (!shift?.assigned_staff?.length) return Response.json({ skipped: 'no staff assigned' });

            // Only notify on create, or if we can detect new assignments (we notify all on create)
            if (event.type !== 'create') return Response.json({ skipped: 'only notify on new shift creation' });

            const shiftTypeHe = shift.shift_type === 'lunch' ? 'צהריים' : 'ערב';
            const results = [];

            for (const staffMember of shift.assigned_staff) {
                if (!staffMember.employee_id) continue;
                const emps = await base44.asServiceRole.entities.Employee.filter({ id: staffMember.employee_id });
                const emp = emps[0];
                if (!emp?.phone) continue;

                const message = `📅 *משמרת חדשה נוספה לסידור שלך!*\n\n${shift.date} - ${shiftTypeHe}\n⏰ שעות: ${staffMember.start_time || shift.start_time} - ${staffMember.end_time || shift.end_time}\n💼 תפקיד: ${staffMember.position || ''}\n\nבהצלחה! 💪`;

                const phone = emp.phone.replace(/\D/g, '');
                await client.messages.create({
                    from: `whatsapp:${fromNumber}`,
                    to: `whatsapp:+${phone}`,
                    body: message,
                });
                results.push(emp.phone);
            }

            return Response.json({ success: true, notified: results });
        }

        return Response.json({ skipped: 'unhandled event' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});