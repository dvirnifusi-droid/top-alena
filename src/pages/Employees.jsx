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
          <Alert className="mt-2 bg-yellow-50 border-yellow-300">
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
            <Key className="w-5 h-5 text-purple-600" />
            קוד גישה - {employee?.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-purple-800">
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
            className="bg-purple-600 hover:bg-purple-700"
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

  const handleGrantAdmin = async () => {
    setLoading(true);
    setResult(null);
    try {
      await base44.auth.updateUser(employee.email, { role: 'admin' });
      setResult({ type: 'success', message: 'הרשאות Admin הוענקו בהצלחה!' });
      setTimeout(() => {
        onClose();
        onRefresh();
      }, 2000);
    } catch (error) {
      console.error('Error granting admin:', error);
      setResult({ 
        type: 'error', 
        message: 'לא ניתן לעדכן הרשאות דרך הקוד. יש לעדכן דרך Dashboard של Base44.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAdmin = async () => {
    setLoading(true);
    setResult(null);
    try {
      await base44.auth.updateUser(employee.email, { role: 'user' });
      setResult({ type: 'success', message: 'הרשאות Admin הוסרו בהצלחה!' });
      setTimeout(() => {
        onClose();
        onRefresh();
      }, 2000);
    } catch (error) {
      console.error('Error revoking admin:', error);
      setResult({ 
        type: 'error', 
        message: 'לא ניתן לעדכן הרשאות דרך הקוד. יש לעדכן דרך Dashboard של Base44.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            ניהול הרשאות - {employee?.full_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>מייל:</strong> {employee?.email}
            </p>
            <p className="text-sm text-blue-800 mt-1">
              <strong>תפקיד נוכחי:</strong> {employee?.role}
            </p>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            סגור
          </Button>
          <Button 
            onClick={handleRevokeAdmin}
            disabled={loading}
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            הסר הרשאות Admin
          </Button>
          <Button 
            onClick={handleGrantAdmin}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'מעדכן...' : 'הענק הרשאות Admin'}
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
   const [employees, setEmployees] = useState([]);
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

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await Employee.list('-created_date');
      setEmployees(data);
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
               <Users className="w-10 h-10 text-blue-600" />
               ניהול עובדים
             </h1>
             <p className="text-gray-600 mt-2">הוספה, עריכה וניהול של צוות המסעדה</p>
           </div>
           <div className="flex gap-2">
             <Button onClick={syncAllEmails} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
               🔄 סנכרן מיילים
             </Button>
             <Button onClick={openAddForm} className="bg-blue-600 hover:bg-blue-700">
               <Plus className="w-5 h-5 ml-2" />
               הוסף עובד חדש
             </Button>
           </div>
         </div>

        {loading ? (
          <p>טוען עובדים...</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם העובד</TableHead>
                    <TableHead>אימייל</TableHead>
                    <TableHead>תפקיד ראשי</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>שכר שעתי</TableHead>
                    <TableHead className="text-left">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link to={createPageUrl(`EmployeeDetails?id=${employee.id}`)} className="text-blue-600 hover:underline">
                          {employee.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-gray-600">{employee.email}</TableCell>
                      <TableCell>{employee.role}</TableCell>
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

        <AccessCodeDialog
           isOpen={isAccessCodeOpen}
           onClose={() => {
             setIsAccessCodeOpen(false);
             setAccessCodeEmployee(null);
           }}
           employee={accessCodeEmployee}
           onRefresh={loadEmployees}
         />

        <PushoverKeyDialog
           isOpen={isPushoverOpen}
           onClose={() => {
             setIsPushoverOpen(false);
             setPushoverEmployee(null);
           }}
           employee={pushoverEmployee}
           onRefresh={loadEmployees}
         />
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