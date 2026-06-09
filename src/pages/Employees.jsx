import React, { useState, useEffect } from 'react';
import { Employee, PendingInvitation } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';
import { User } from '@/entities/User';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users, Check, Copy, Shield, Bell } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Key } from "lucide-react";
import { base44 } from '@/api/base44Client';


function EmployeeForm({ employee, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    full_name: employee ? employee.full_name : '',
    email: employee ? employee.email : '',
    phone: employee ? (employee.phone || '') : '',
    role: employee ? employee.role : '',
    status: employee ? employee.status : 'active',
    base_hourly_wage: employee ? (employee.base_hourly_wage || '') : '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="full_name">שם מלא</Label>
        <Input
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          placeholder="שם מלא של העובד"
          required
        />
      </div>
      <div>
        <Label htmlFor="email">כתובת מייל</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="email@gmail.com"
          required
        />
        {employee ? (
          <Alert className="mt-2 bg-[#FAF5E8] border-[#D9BD83]">
            <AlertDescription className="text-xs text-yellow-800">
              ⚠️ שינוי המייל ישפיע על זיהוי העובד במערכת. ודא שזה המייל הנכון שבו העובד מתחבר.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            המייל שהעובד משתמש בו כדי להיכנס למערכת.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="phone">מספר טלפון (WhatsApp)</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+972501234567"
          dir="ltr"
        />
        <p className="text-xs text-gray-500 mt-1">לפתיחת WhatsApp ישירה בבקשות החלפת משמרת</p>
      </div>
      <div>
        <Label htmlFor="role">תפקיד</Label>
        <Input
          id="role"
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          placeholder="לדוגמה: מלצר, אחמ״ש"
          required
        />
      </div>
      <div>
        <Label htmlFor="base_hourly_wage">שכר שעתי בסיסי</Label>
        <Input
          id="base_hourly_wage"
          type="number"
          value={formData.base_hourly_wage}
          onChange={(e) => setFormData({ ...formData, base_hourly_wage: e.target.value })}
          placeholder="לדוגמה: 40"
          min="0"
          step="0.01"
        />
        <p className="text-xs text-gray-500 mt-1">
          השכר השעתי הבסיסי של העובד (ניתן להשאיר ריק אם לא רלוונטי).
        </p>
      </div>
      <div>
        <Label htmlFor="status">סטטוס</Label>
        <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="inactive">לא פעיל</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          ביטול
        </Button>
        <Button type="submit">{employee ? 'שמור שינויים' : 'הוסף עובד'}</Button>
      </div>
    </form>
  );
}

function InviteSuccessDialog({ isOpen, onClose, invitationDetails }) {
  const [copySuccess, setCopySuccess] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  if (!invitationDetails) return null;

  const roleText = invitationDetails.role === 'admin' ? 'מנהל מערכת' : 'עובד';
  const messageText = `שלום ${invitationDetails.full_name}!

הוזמנת להצטרף למערכת Alina Operations כ${roleText}.

כדי להצטרף:
1. היכנס לקישור: ${invitationDetails.invitationUrl}
2. התחבר עם חשבון הGoogle שלך: ${invitationDetails.email}
3. המערכת תכיר אותך ותיתן לך גישה

בברכה,
צוות Alina Operations`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-green-600">✅ עובד נוסף והוזמן בהצלחה!</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="font-semibold text-green-800 mb-2">
              {invitationDetails.full_name} נוסף למערכת
            </p>
            <p className="text-sm text-green-700">
              מייל: {invitationDetails.email} | תפקיד: {invitationDetails.role}
            </p>
          </div>

          <div>
            <Label className="font-semibold">הודעה מוכנה לשליחה (העתק ושלח בווטסאפ/SMS):</Label>
            <Textarea
              value={messageText}
              readOnly
              className="h-32 mt-2"
            />
            <Button 
              onClick={() => copyToClipboard(messageText)}
              className="mt-2 w-full"
              variant={copySuccess ? "default" : "outline"}
            >
              {copySuccess ? (
                <>
                  <Check className="w-4 h-4 ml-2" />
                  הועתק!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 ml-2" />
                  העתק הודעה
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={onClose}>סגור</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccessCodeDialog({ isOpen, onClose, employee, onRefresh }) {
  const [accessCode, setAccessCode] = useState(employee?.access_code || '');

  useEffect(() => {
    setAccessCode(employee?.access_code || '');
  }, [employee?.id]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateAccessCode = () => {
    return Math.random().toString().substring(2, 8);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await base44.entities.Employee.update(employee.id, { access_code: accessCode });
      setCopied(false);
      setTimeout(() => {
        onClose();
        onRefresh();
      }, 1500);
    } catch (error) {
      console.error('Error saving access code:', error);
      alert('שגיאה בשמירת קוד הגישה');
    }
    setLoading(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[#A04A2E]" />
            קוד גישה - {employee?.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-[#F4ECD8] p-4 rounded-lg">
            <p className="text-sm text-[#7A3722]">
              קוד זה נדרש לעובד כדי להגיש זמינות לדף עמוד הזמינות
            </p>
          </div>

          <div className="space-y-2">
            <Label>קוד גישה</Label>
            <div className="flex gap-2">
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                className="font-mono text-lg tracking-widest text-center"
                maxLength="6"
              />
              <Button 
                onClick={() => setAccessCode(generateAccessCode())}
                variant="outline"
                disabled={loading}
              >
                🎲 יצור אקראי
              </Button>
            </div>
            <Button 
              onClick={() => copyToClipboard(accessCode)}
              variant="outline"
              className="w-full"
              disabled={!accessCode}
            >
              {copied ? '✓ הועתק!' : 'העתק קוד'}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            סגור
          </Button>
          <Button 
            onClick={handleSave}
            disabled={loading || !accessCode}
            className="bg-[#A04A2E] hover:bg-[#7A3722]"
          >
            {loading ? 'שומר...' : 'שמור קוד'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ isOpen, onClose, employee, onRefresh }) {
   const [loading, setLoading] = useState(false);
   const [result, setResult] = useState(null);
   const [managedDept, setManagedDept] = useState('');
   // Local snapshot of the employee record — updated after each save so the
   // dialog reflects the new state without needing to close+reopen.
   const [localEmployee, setLocalEmployee] = useState(employee);

  // Pre-fill the dropdown with the employee's CURRENT managed_department.
  // Permissions are stored on the User record, joined into employee as
  // `_managed_dept` and `_admin_role` by loadEmployees.
  useEffect(() => {
    if (isOpen) {
      setManagedDept(employee?._managed_dept || employee?.managed_department || '');
      setLocalEmployee(employee);
      setResult(null);
    }
  }, [isOpen, employee?.id, employee?._managed_dept]);

  const callSetRole = async ({ role, managed_department }) => {
    setLoading(true);
    setResult(null);
    try {
      const payload = { email: localEmployee.email };
      if (role !== undefined) payload.role = role;
      if (managed_department !== undefined) payload.managed_department = managed_department;
      const res = await base44.functions.setUserRoleAndDepartment(payload);
      const ok = res?.status === 200 || res?.data;
      if (!ok) throw new Error(res?.data?.error || 'failed');
      // Update local snapshot so the "הרשאות פעילות" badges reflect the new
      // state immediately — owner can SEE the change before closing the dialog.
      // Updates the _admin_role + _managed_dept fields (joined from User).
      setLocalEmployee(prev => ({
        ...prev,
        _admin_role: role !== undefined ? role : prev._admin_role,
        _managed_dept: managed_department !== undefined ? managed_department : prev._managed_dept,
      }));
      const action =
        role === 'admin' ? 'הוענקו הרשאות Admin'
        : role === 'user' ? 'הוסרו הרשאות Admin'
        : managed_department === 'kitchen' ? 'הוגדר כמנהל מטבח'
        : managed_department === 'floor' ? 'הוגדר כמנהל פלור'
        : managed_department === null ? 'הוסר תפקיד מנהל מחלקה'
        : 'עודכנו הרשאות';
      setResult({ type: 'success', message: `✅ ${action} בהצלחה — השינוי שמור במערכת` });
      // Refresh parent list in background (no auto-close — let owner verify)
      onRefresh?.();
    } catch (error) {
      console.error('Error updating role:', error);
      setResult({ type: 'error', message: error?.message || 'שגיאה בעדכון ההרשאות' });
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAdmin = () => callSetRole({ role: 'admin' });
  const handleRevokeAdmin = () => callSetRole({ role: 'user', managed_department: null });
  const handleSetDeptManager = () => callSetRole({ managed_department: managedDept || null });

  // Helpers for the "current state" badges
  // _admin_role and _managed_dept come from the joined User record.
  const isAdmin = localEmployee?._admin_role === 'admin';
  const currentDept = localEmployee?._managed_dept;
  const deptLabel = currentDept === 'kitchen' ? 'מנהל מטבח'
    : currentDept === 'floor' ? 'מנהל פלור'
    : currentDept === 'bar' ? 'מנהל בר'
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#44512C]" />
            ניהול הרשאות - {employee?.full_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-[#F4ECD8] p-4 rounded-lg">
            <p className="text-sm text-[#2E3819]">
              <strong>מייל:</strong> {localEmployee?.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <strong className="text-sm text-[#2E3819]">הרשאות פעילות:</strong>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow">
                  🛡️ Admin מלא
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-300 text-gray-700 text-xs font-medium rounded-full">
                  👤 משתמש רגיל
                </span>
              )}
              {deptLabel && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full shadow">
                  👔 {deptLabel}
                </span>
              )}
              {localEmployee?.role && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                  💼 {localEmployee.role}
                </span>
              )}
            </div>
          </div>

          {result && (
            <div className={`p-3 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result.message}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-semibold">מה זה Admin?</h4>
            <ul className="text-sm space-y-1 text-gray-600">
              <li>✅ גישה לכל הדפים והכלים במערכת</li>
              <li>✅ יכולת לנהל עובדים וסידורי עבודה</li>
              <li>✅ גישה לדוחות ותחזיות AI</li>
              <li>✅ יכולת לערוך הגדרות מערכת</li>
            </ul>
          </div>

          {/* Department-manager assignment — partial admin scoped to one
              department (kitchen / floor). Suitable for shift managers. */}
          <div className="border-t pt-4 mt-4">
            <h4 className="font-semibold mb-2">👔 מנהל מחלקה (אופציונלי)</h4>
            <p className="text-xs text-gray-500 mb-2">
              העובד יקבל גישה ל"רשימת עובדים", "בקשות זמינות" ו"שיבוץ סידור עבודה" — אבל יראה רק את המחלקה שנבחרת כאן.
            </p>
            <div className="flex gap-2 items-center">
              <select
                value={managedDept}
                onChange={(e) => setManagedDept(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                disabled={loading}
              >
                <option value="">-- ללא ניהול מחלקה --</option>
                <option value="kitchen">מנהל מטבח</option>
                <option value="floor">מנהל פלור</option>
              </select>
              <Button
                onClick={handleSetDeptManager}
                disabled={loading || (managedDept || '') === (currentDept || '')}
                variant="outline"
                className={
                  (managedDept || '') === (currentDept || '')
                    ? 'border-gray-200 text-gray-400'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }
              >
                {(managedDept || '') === (currentDept || '') ? '✓ שמור' : 'שמור'}
              </Button>
            </div>
            {currentDept && (
              <p className="text-xs text-emerald-700 font-bold mt-2">
                ✅ כרגע פעיל: {deptLabel}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            סגור
          </Button>
          <Button
            onClick={handleRevokeAdmin}
            disabled={loading || !isAdmin}
            variant="outline"
            className={isAdmin
              ? 'border-orange-300 text-orange-700 hover:bg-orange-50'
              : 'border-gray-200 text-gray-400'}
          >
            הסר הרשאות Admin
          </Button>
          <Button
            onClick={handleGrantAdmin}
            disabled={loading || isAdmin}
            className={isAdmin
              ? 'bg-gray-300 hover:bg-gray-300 cursor-not-allowed'
              : 'bg-[#44512C] hover:bg-[#44512C]'}
          >
            {loading ? 'מעדכן...' : isAdmin ? '✓ כבר Admin' : 'הענק הרשאות Admin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PushoverKeyDialog({ isOpen, onClose, employee, onRefresh }) {
  const [userKey, setUserKey] = useState(employee?.pushover_user_key || '');

  useEffect(() => {
    setUserKey(employee?.pushover_user_key || '');
  }, [employee?.id]);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    await base44.entities.Employee.update(employee.id, { pushover_user_key: userKey.trim() });
    setLoading(false);
    onClose();
    onRefresh();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            Pushover - {employee?.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-orange-50 p-4 rounded-lg text-sm text-orange-800 space-y-1">
            <p>כדי לקבל התראות push, העובד צריך:</p>
            <p>1. להוריד את אפליקציית <strong>Pushover</strong></p>
            <p>2. להירשם ולהעתיק את <strong>User Key</strong> מהפרופיל שלו</p>
            <p>3. להעביר אותו למנהל להזנה כאן</p>
          </div>
          <div>
            <Label>Pushover User Key</Label>
            <Input
              value={userKey}
              onChange={e => setUserKey(e.target.value)}
              placeholder="uXXXXXXXXXXXXXXXXXXXXXX"
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>ביטול</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
            {loading ? 'שומר...' : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesInner() {
   const [allEmployees, setAllEmployees] = useState([]);
   const [loading, setLoading] = useState(true);
   const [editingEmployee, setEditingEmployee] = useState(null);
   const [isFormOpen, setIsFormOpen] = useState(false);
   const [invitationSuccess, setInvitationSuccess] = useState(null);
   const [permissionsEmployee, setPermissionsEmployee] = useState(null);
   const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
   const [accessCodeEmployee, setAccessCodeEmployee] = useState(null);
   const [isAccessCodeOpen, setIsAccessCodeOpen] = useState(false);
   const [pushoverEmployee, setPushoverEmployee] = useState(null);
   const [isPushoverOpen, setIsPushoverOpen] = useState(false);
   const [currentUser, setCurrentUser] = useState(null);

   // === Filter state ============================================================
   // - searchText: matches name OR email (case-insensitive, partial)
   // - permFilter: 'all' | 'owner' (admin) | 'manager' (dept manager) | 'employee'
   // - positionFilter: 'all' | exact position string ('טבח', 'מלצר', ...)
   // - statusFilter: 'all' | 'active' | 'inactive'
   const [searchText, setSearchText] = useState('');
   const [permFilter, setPermFilter] = useState('all');
   const [positionFilter, setPositionFilter] = useState('all');
   const [statusFilter, setStatusFilter] = useState('all');
   // Department filter — 'all' | 'floor' | 'bar' | 'kitchen' | 'managers'
   // ('managers' is a cross-cutting view of anyone with managed_department
   // or role=admin, regardless of their actual department.)
   const [deptFilter, setDeptFilter] = useState('all');

   // Department managers (e.g. kitchen manager) see only employees in their
   // department. Admin sees everyone.
   const managedDept = currentUser?.managed_department || null;
   const baseEmployees = managedDept
     ? allEmployees.filter(e => (e.department || '').toLowerCase() === managedDept.toLowerCase())
     : allEmployees;

   // Compute distinct positions for the dropdown
   const distinctPositions = React.useMemo(() => {
     const set = new Set();
     for (const e of baseEmployees) {
       if (e.employee_position) set.add(e.employee_position);
     }
     return [...set].sort();
   }, [baseEmployees]);

   // Permission category helper — reads from joined User data (_admin_role,
   // _managed_dept) NOT from Employee.role (which is the job title in Hebrew
   // like "מנהל מטבח", not the permission level).
   const permCategory = (e) => {
     if (e._admin_role === 'admin') return 'owner';
     if (e._managed_dept) return 'manager';
     return 'employee';
   };

   // Apply all filters to derive the visible list
   const employees = React.useMemo(() => {
     const q = searchText.trim().toLowerCase();
     return baseEmployees.filter(e => {
       if (q && !((e.full_name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q))) return false;
       if (permFilter !== 'all' && permCategory(e) !== permFilter) return false;
       if (positionFilter !== 'all' && e.employee_position !== positionFilter) return false;
       if (statusFilter === 'active' && e.status !== 'active') return false;
       if (statusFilter === 'inactive' && e.status === 'active') return false;
       return true;
     });
   }, [baseEmployees, searchText, permFilter, positionFilter, statusFilter]);

   // Counts per permission category (shown as badges in the filter chips)
   const counts = React.useMemo(() => {
     const c = { all: baseEmployees.length, owner: 0, manager: 0, employee: 0 };
     for (const e of baseEmployees) c[permCategory(e)]++;
     return c;
   }, [baseEmployees]);

  useEffect(() => {
    User.me().then(setCurrentUser).catch(() => setCurrentUser(null));
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      // Permissions (admin role + managed_department) live on User, not on
      // Employee. Load both, join by email, expose merged shape to the UI.
      const [empData, userData] = await Promise.all([
        Employee.list('-created_date'),
        User.list().catch(() => []),
      ]);
      const userByEmail = new Map();
      for (const u of (userData || [])) {
        if (u?.email) userByEmail.set(String(u.email).toLowerCase(), u);
      }
      const merged = (empData || []).map(e => {
        const u = userByEmail.get(String(e.email || '').toLowerCase());
        return {
          ...e,
          _admin_role: u?.role || null,                     // 'admin' | 'user' | ...
          _managed_dept: u?.managed_department || null,     // 'kitchen' | 'floor' | null
        };
      });
      setAllEmployees(merged);
    } catch (error) {
      console.error("שגיאה בטעינת עובדים:", error);
    }
    setLoading(false);
  };

  const generateInvitationCode = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const createInvitation = async (employeeData) => {
    try {
      const invitationCode = generateInvitationCode();
      const currentUser = await User.me();
      
      const invitation = await PendingInvitation.create({
        email: employeeData.email.toLowerCase(),
        full_name: employeeData.full_name,
        role: 'user',
        invitation_code: invitationCode,
        invited_by: currentUser.email
      });

      return {
        ...invitation,
        invitationUrl: `${window.location.origin}?invite=${invitationCode}`
      };
    } catch (error) {
      console.error('שגיאה ביצירת הזמנה:', error);
      return null;
    }
  };

  const handleSaveEmployee = async (employeeData) => {
    try {
      let savedEmployee;
      
      const normalizedEmployeeData = {
        ...employeeData,
        email: employeeData.email.toLowerCase(),
        base_hourly_wage: employeeData.base_hourly_wage !== '' ? parseFloat(employeeData.base_hourly_wage) : null,
      };

      // Department managers can only create/edit employees in their department.
      // Force-stamp the department so a kitchen manager can't accidentally
      // create a floor employee (and vice versa).
      if (managedDept) {
        normalizedEmployeeData.department = managedDept;
      }

      if (editingEmployee) {
        await Employee.update(editingEmployee.id, normalizedEmployeeData);
        savedEmployee = { ...editingEmployee, ...normalizedEmployeeData };
      } else {
        savedEmployee = await Employee.create(normalizedEmployeeData);

        const invitationDetails = await createInvitation(normalizedEmployeeData);
        if (invitationDetails) {
          setInvitationSuccess(invitationDetails);
        }
      }

      setEditingEmployee(null);
      setIsFormOpen(false);
      loadEmployees();
    } catch (error) {
      console.error("שגיאה בשמירת עובד:", error);
      alert("שגיאה בשמירת העובד. נסה שוב.");
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק את העובד?')) {
      try {
        await Employee.delete(employeeId);
        loadEmployees();
      } catch (error) {
        console.error("שגיאה במחיקת עובד:", error);
        alert("שגיאה במחיקת העובד. נסה שוב.");
      }
    }
  };

  const openAddForm = () => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  };

  const openEditForm = (employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const openPermissionsDialog = (employee) => {
    setPermissionsEmployee(employee);
    setIsPermissionsOpen(true);
  };

  const openAccessCodeDialog = (employee) => {
    setAccessCodeEmployee(employee);
    setIsAccessCodeOpen(true);
  };

  const openPushoverDialog = (employee) => {
    setPushoverEmployee(employee);
    setIsPushoverOpen(true);
  };

  const syncAllEmails = async () => {
    if (!window.confirm('האם אתה בטוח? זה יעדכן את המייל של כל העובדים לפי המשתמשים רשומים במערכת')) return;
    
    setLoading(true);
    try {
      const allUsers = await User.list();
      const updates = [];

      for (const employee of employees) {
        const matchingUser = allUsers.find(u => u.full_name && u.full_name.trim().toLowerCase() === employee.full_name.trim().toLowerCase());
        
        if (matchingUser && matchingUser.email !== employee.email) {
          await Employee.update(employee.id, { email: matchingUser.email });
          updates.push(`${employee.full_name}: ${employee.email} → ${matchingUser.email}`);
        }
      }

      alert(`סונכרנו ${updates.length} עובדים:\n\n${updates.join('\n')}`);
      loadEmployees();
    } catch (error) {
      console.error('Error syncing emails:', error);
      alert('שגיאה בסנכרון המיילים');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-gray-50 to-slate-100" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
           <div>
             <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
               <Users className="w-10 h-10 text-[#44512C]" />
               ניהול עובדים
             </h1>
             <p className="text-gray-600 mt-2">הוספה, עריכה וניהול של צוות המסעדה</p>
           </div>
           <div className="flex gap-2">
             <Button onClick={syncAllEmails} variant="outline" className="border-[#D9BD83] text-[#7A3722] hover:bg-[#F4ECD8]">
               🔄 סנכרן מיילים
             </Button>
             <Button onClick={openAddForm} className="bg-[#44512C] hover:bg-[#44512C]">
               <Plus className="w-5 h-5 ml-2" />
               הוסף עובד חדש
             </Button>
           </div>
         </div>

        {loading ? (
          <p>טוען עובדים...</p>
        ) : (
          <>
          {/* === Filters bar ============================================== */}
          <Card className="mb-4 p-4 bg-white">
            <div className="flex flex-col gap-3">
              {/* Search input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="🔎 חיפוש לפי שם או מייל..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#44512C]"
                />
                {(searchText || permFilter !== 'all' || positionFilter !== 'all' || statusFilter !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSearchText(''); setPermFilter('all'); setPositionFilter('all'); setStatusFilter('all'); }}
                    className="text-xs"
                  >
                    ✕ נקה
                  </Button>
                )}
              </div>

              {/* Permission filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-600">הרשאה:</span>
                {[
                  { key: 'all', label: 'הכל', emoji: '👥', color: 'gray' },
                  { key: 'owner', label: 'בעלים / Admin', emoji: '🛡️', color: 'emerald' },
                  { key: 'manager', label: 'מנהלי מחלקה', emoji: '👔', color: 'blue' },
                  { key: 'employee', label: 'עובדים', emoji: '👤', color: 'purple' },
                ].map(chip => {
                  const isActive = permFilter === chip.key;
                  const colors = {
                    gray: isActive ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    emerald: isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                    blue: isActive ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                    purple: isActive ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100',
                  };
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setPermFilter(chip.key)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${colors[chip.color]}`}
                    >
                      {chip.emoji} {chip.label} ({counts[chip.key]})
                    </button>
                  );
                })}
              </div>

              {/* Position + status dropdowns */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-600">תפקיד:</span>
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="border rounded-lg px-2 py-1 text-sm"
                  >
                    <option value="all">הכל</option>
                    {distinctPositions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-600">סטטוס:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border rounded-lg px-2 py-1 text-sm"
                  >
                    <option value="all">הכל</option>
                    <option value="active">פעיל</option>
                    <option value="inactive">לא פעיל</option>
                  </select>
                </div>
                <div className="text-xs text-gray-500 mr-auto">
                  מציג <strong>{employees.length}</strong> מתוך <strong>{baseEmployees.length}</strong> עובדים
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם העובד</TableHead>
                    <TableHead>אימייל</TableHead>
                    <TableHead>תפקיד ראשי</TableHead>
                    <TableHead>הרשאה</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>שכר שעתי</TableHead>
                    <TableHead className="text-left">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link to={createPageUrl(`EmployeeDetails?id=${employee.id}`)} className="text-[#44512C] hover:underline">
                          {employee.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-gray-600">{employee.email}</TableCell>
                      <TableCell>{employee.employee_position || employee.role}</TableCell>
                      <TableCell>
                        {permCategory(employee) === 'owner' && (
                          <Badge className="bg-emerald-600 text-white">🛡️ בעלים</Badge>
                        )}
                        {permCategory(employee) === 'manager' && (
                          <Badge className="bg-blue-600 text-white">
                            👔 {employee._managed_dept === 'kitchen' ? 'מנהל מטבח' : employee._managed_dept === 'floor' ? 'מנהל פלור' : employee._managed_dept === 'bar' ? 'מנהל בר' : 'מנהל'}
                          </Badge>
                        )}
                        {permCategory(employee) === 'employee' && (
                          <Badge className="bg-purple-100 text-purple-800">👤 עובד</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={employee.status === 'active' ? 'default' : 'secondary'}
                          className={employee.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                        >
                          {employee.status === 'active' ? 'פעיל' : 'לא פעיל'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        ₪{employee.base_hourly_wage?.toFixed(2) || 'לא הוגדר'}
                      </TableCell>
                      <TableCell className="text-left">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">פתח תפריט</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                               <Link to={createPageUrl(`EmployeeDetails?id=${employee.id}`)}>צפה בפרופיל</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditForm(employee)}>
                              ערוך פרטים
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAccessCodeDialog(employee)}>
                              <Key className="w-4 h-4 ml-2" />
                              קוד גישה
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPermissionsDialog(employee)}>
                             <Shield className="w-4 h-4 ml-2" />
                             ניהול הרשאות
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPushoverDialog(employee)}>
                             <Bell className="w-4 h-4 ml-2" />
                             🔔 Pushover {employee.pushover_user_key ? '✅' : ''}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              createInvitation(employee).then(inv => {
                                if (inv) setInvitationSuccess(inv);
                              });
                            }}>
                              📧 שלח הזמנה מחדש
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteEmployee(employee.id)}
                            >
                              מחק עובד
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingEmployee ? 'עריכת עובד' : 'הוספת עובד חדש'}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <EmployeeForm
                employee={editingEmployee}
                onSave={handleSaveEmployee}
                onCancel={() => setIsFormOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>

        <InviteSuccessDialog
          isOpen={!!invitationSuccess}
          onClose={() => setInvitationSuccess(null)}
          invitationDetails={invitationSuccess}
        />

        <PermissionsDialog
           isOpen={isPermissionsOpen}
           onClose={() => {
             setIsPermissionsOpen(false);
             setPermissionsEmployee(null);
           }}
           employee={permissionsEmployee}
           onRefresh={loadEmployees}
         />

        {isAccessCodeOpen && accessCodeEmployee && (
          <AccessCodeDialog
            isOpen={isAccessCodeOpen}
            onClose={() => {
              setIsAccessCodeOpen(false);
              setAccessCodeEmployee(null);
            }}
            employee={accessCodeEmployee}
            onRefresh={loadEmployees}
          />
        )}

        {isPushoverOpen && pushoverEmployee && (
          <PushoverKeyDialog
            isOpen={isPushoverOpen}
            onClose={() => {
              setIsPushoverOpen(false);
              setPushoverEmployee(null);
            }}
            employee={pushoverEmployee}
            onRefresh={loadEmployees}
          />
        )}
        </div>
        </div>
        );
        }

export default function EmployeesPage() {
  return (
    <PageGuard pageName="Employees" pageTitle="ניהול עובדים">
      <EmployeesInner />
    </PageGuard>
  );
}