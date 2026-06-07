// Centralized role gates so every sales-gamification component agrees on
// who sees what. Keep in sync with the backend SUPERVISOR_POSITIONS set.
const SUPERVISOR_POSITIONS = new Set(['אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת', 'אחמש']);
const WAITSTAFF_POSITIONS = new Set([
    'מלצר', 'מלצרית', 'ברמן', 'ברמנית', 'מארחת', 'מארח',
    'ראנר', 'אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת',
]);
const NON_SALES_POSITIONS = new Set([
    'טבח', 'טבחת', 'מנהל מטבח', 'שוטף כלים', 'שליח',
]);

function rolesOf(employee, user) {
    const roles = [];
    if (user?.role) roles.push(user.role);
    if (employee?.role) roles.push(employee.role);
    if (Array.isArray(employee?.positions)) roles.push(...employee.positions);
    return roles.map(r => String(r || '').trim()).filter(Boolean);
}

export function isShiftSupervisor(employee, user) {
    const roles = rolesOf(employee, user);
    if (roles.includes('admin') || roles.includes('manager') || roles.includes('owner')) return true;
    return roles.some(r => SUPERVISOR_POSITIONS.has(r));
}

export function isWaitstaff(employee, user) {
    const roles = rolesOf(employee, user);
    return roles.some(r => WAITSTAFF_POSITIONS.has(r));
}

export function isNonSalesRole(employee, user) {
    const roles = rolesOf(employee, user);
    if (roles.some(r => WAITSTAFF_POSITIONS.has(r))) return false;
    return roles.some(r => NON_SALES_POSITIONS.has(r));
}
