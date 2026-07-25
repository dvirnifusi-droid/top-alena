import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMyPermissions } from "@/hooks/useMyPermissions";
import { Shield, Lock, Settings, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenantModules } from "@/hooks/useTenantModules";

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

  // D1 — module gate. If the current page's module is disabled for this tenant,
  // bounce to Dashboard. Dashboard/PlatformSettings are exempt (always reachable).
  const { pageEnabled, isLocked, unlockPlanFor, loading: modulesLoading } = useTenantModules();
  const { can: permCan, isOwner, allowedPages, loading: permsLoading } = useMyPermissions();
  const navigate = useNavigate();
  useEffect(() => {
    if (modulesLoading) return;
    if (!pageName) return;
    if (pageName === 'Dashboard' || pageName === 'PlatformSettings') return;
    // Locked (not in plan) → show the upsell below, don't bounce. Only bounce
    // pages the owner explicitly turned OFF (disabled and not locked).
    if (!pageEnabled(pageName) && !isLocked(pageName)) {
      navigate('/Dashboard', { replace: true, state: { moduleDisabled: pageName } });
    }
  }, [pageName, modulesLoading, pageEnabled, isLocked, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAdmin(currentUser?.role === "admin" || currentUser?.role === "owner");

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

  // Locked feature (not in the tenant's plan) → in-app upsell instead of content.
  if (!modulesLoading && pageName && isLocked(pageName)) {
    const plan = unlockPlanFor(pageName);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{pageTitle || pageName}</h1>
          <p className="text-gray-500 mb-6">
            {plan ? <>הפיצ'ר הזה זמין בחבילת <b className="text-amber-600">{plan}</b>.</> : "הפיצ'ר הזה לא כלול בחבילה הנוכחית שלך."}
          </p>
          <a
            href="https://wa.me/972532181900?text=%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A9%D7%93%D7%A8%D7%92%20%D7%90%D7%AA%20%D7%94%D7%97%D7%91%D7%99%D7%9C%D7%94"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 px-6 rounded-xl"
          >
            אני רוצה לשדרג
          </a>
        </div>
      </div>
    );
  }

  const allowedRoles = permission ? permission.allowed_roles : ["employee", "manager", "owner"];
  const userRole = mapUserRole(user?.role);
  // Department managers (e.g. kitchen manager) bypass the per-page allowlist for
  // pages they need to do their job (scheduling, availability, employees) — the
  // page itself handles scoping to their department.
  const isDepartmentManager = !!user?.managed_department;
  const isDeptManagedPage = ["WorkScheduling", "AvailabilityRequests", "Employees"].includes(pageName);
  // Self-service pages any authenticated staff may see — their OWN data only, so
  // they must never be locked out by a tier allowlist (the page/back-end scopes it).
  const isSelfServicePage = ["MyCard"].includes(pageName);

  // Access resolution, in priority order:
  //  1. Owner  → always in (can never lock yourself out).
  //  2. A configured PermissionTier allowlist → IT is the authority. This is what
  //     stops a manager stored as role='admin' from opening CashFlow/Marketing:
  //     the old `isAdmin ||` short-circuit let every admin through every page.
  //  3. No tier configured → legacy coarse role behaviour, unchanged.
  const hasAccess = permsLoading
    ? true
    : (isOwner || isSelfServicePage)
      ? true
      : allowedPages
        ? permCan(pageName)
        : (isAdmin || allowedRoles.includes(userRole) || (isDepartmentManager && isDeptManagedPage));

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