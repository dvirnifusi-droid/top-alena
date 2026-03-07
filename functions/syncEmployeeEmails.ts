import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // קבל את כל העובדים
    const employees = await base44.asServiceRole.entities.Employee.list();
    
    // קבל את כל המשתמשים
    const allUsers = await base44.asServiceRole.entities.User.list();

    let syncedCount = 0;
    const results = [];

    for (const employee of employees) {
      // חפש משתמש עם אותו שם מלא
      const matchingUser = allUsers.find(u => u.full_name && u.full_name.trim().toLowerCase() === employee.full_name.trim().toLowerCase());
      
      if (matchingUser && matchingUser.email !== employee.email) {
        // עדכן את המייל של העובד למייל של המשתמש
        await base44.asServiceRole.entities.Employee.update(employee.id, {
          email: matchingUser.email
        });
        
        syncedCount++;
        results.push({
          employee: employee.full_name,
          oldEmail: employee.email,
          newEmail: matchingUser.email,
          status: 'synced'
        });
      }
    }

    return Response.json({
      success: true,
      syncedCount,
      details: results,
      message: `סונכרנו ${syncedCount} עובדים עם המייל הנכון שלהם`
    });
  } catch (error) {
    console.error('Error syncing emails:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});