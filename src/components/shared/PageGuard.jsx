import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Lock, Settings, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLES = [
  { value: "employee", label: "עובד", color: "bg-blue-100 text-blue-800" },
  { value: "manager", label: "מנהל", color: "bg-green-100 text-green-800" },
  { value: "owner", label: "בעלים", color: "bg-purple-100 text-purple-800" },
];

// Map system roles to our custom roles
function mapUserRole(userRole) {
  if (!userRole) return "employee";
  if (userRole === "owner") return "owner";
  if (userRole === "admin") return "manager";
  return "employee";
}

export default function PageGuard({ pageName, pageTitle, children }) {
  const [user, setUser] = useState(null);
  const [permission, setPermission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadData();
  }, [pageName]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAdmin(currentUser?.role === "admin");

      const permissions = await base44.entities.PagePermission.filter({ page_name: pageName });
      if (permissions.length > 0) {
        setPermission(permissions[0]);
        setSelectedRoles(permissions[0].allowed_roles || []);
      } else {
        // Default: all roles allowed
        setPermission(null);
        setSelectedRoles(["employee", "manager", "owner"]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      if (permission?.id) {
        await base44.entities.PagePermission.update(permission.id, {
          page_name: pageName,
          allowed_roles: selectedRoles,
        });
      } else {
        await base44.entities.PagePermission.create({
          page_name: pageName,
          allowed_roles: selectedRoles,
        });
      }
      await loadData();
      setShowSettings(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const toggleRole = (role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  if (loading) return null;

  const allowedRoles = permission ? permission.allowed_roles : ["employee", "manager", "owner"];
  const userRole = mapUserRole(user?.role);
  const hasAccess = isAdmin || allowedRoles.includes(userRole);

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">אין גישה לדף זה</h1>
          <p className="text-gray-500 mb-6">
            הדף <span className="font-semibold">{pageTitle || pageName}</span> מוגבל לתפקידים הבאים:
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            {allowedRoles.map((role) => {
              const r = ROLES.find((x) => x.value === role);
              return r ? (
                <Badge key={role} className={`${r.color} text-sm px-3 py-1`}>
                  {r.label}
                </Badge>
              ) : null;
            })}
          </div>
          <p className="text-gray-400 text-sm mt-6">
            אם אתה חושב שמדובר בטעות, פנה למנהל המערכת.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* כפתור הרשאות - נראה רק למנהלים */}
      {isAdmin && (
        <div className="flex justify-end px-4 pt-3 pb-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-xs border-dashed border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400"
          >
            <Shield className="w-3.5 h-3.5" />
            הרשאות דף
            <div className="flex gap-1">
              {allowedRoles.map((role) => {
                const r = ROLES.find((x) => x.value === role);
                return r ? (
                  <Badge key={role} className={`${r.color} text-[10px] px-1.5 py-0`}>
                    {r.label}
                  </Badge>
                ) : null;
              })}
            </div>
          </Button>
        </div>
      )}

      {/* תוכן הדף */}
      {children}

      {/* דיאלוג עריכת הרשאות */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              הרשאות דף: {pageTitle || pageName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-500">בחר מי יכול לגשת לדף זה:</p>
            <div className="space-y-2">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  onClick={() => toggleRole(role.value)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                    selectedRoles.includes(role.value)
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <span className="font-medium">{role.label}</span>
                  {selectedRoles.includes(role.value) ? (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                  )}
                </button>
              ))}
            </div>
            {selectedRoles.length === 0 && (
              <p className="text-xs text-red-500">⚠️ חייב לבחור לפחות תפקיד אחד</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings(false)} className="flex-1">
              ביטול
            </Button>
            <Button
              onClick={savePermissions}
              disabled={saving || selectedRoles.length === 0}
              className="flex-1"
            >
              {saving ? "שומר..." : "שמור"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}