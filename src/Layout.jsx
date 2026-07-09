import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import VoiceControl from "@/components/voice/VoiceControl";
import {
  Users, GraduationCap, AlertTriangle, CheckSquare, Building, BarChart3,
  LayoutGrid, Trophy, Menu, FileText, Utensils, Sparkles, Crown, Rocket, Map, Brain, Calendar, CalendarDays, CalendarHeart, Banknote, MessageSquare, Briefcase, QrCode, ClipboardCheck, Settings, TrendingUp, Zap, Megaphone, Bell, Package, Navigation, LogOut, Tablet, Download, ChefHat, Wallet, Shield, Lock
} from "lucide-react";
import {
  Sidebar, SidebarContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

import { useTenantBranding } from "./hooks/useTenantBranding";
import { useTenantModules } from "./hooks/useTenantModules";
import FeaturePaywall from "./components/platform/FeaturePaywall";
import AiChatWidget from "./components/ai-assistant/AiChatWidget";
import AppLanguagePicker from "./components/shared/AppLanguagePicker";
import DevicePreviewToggle from "./components/DevicePreviewToggle";
import EnableStaffPush from "./components/EnableStaffPush";
import PopupManager from "./components/PopupManager";
import AutoCloseNoticeBanner from "./components/shift/AutoCloseNoticeBanner";
import InstallAppBanner from "./components/sales/InstallAppBanner";
import { logActivity } from "./lib/activityLogger";

// Brand palette — verbatim from /PublicReservation:
//   #A04A2E cinnamon (primary), #44512C olive (secondary), #B89556 gold,
//   #D9BD83 wheat, #F4ECD8 cream, #FAF5E8 ivory, #1F1B17 espresso (text).
// Tailwind purges by content scan so arbitrary-value classes must appear
// literally in this file once — references via colorOf() still work.
const COLOR_CLASSES = {
  // Brand
  cinnamon: { cat: 'text-[#A04A2E]', bar: 'bg-[#A04A2E]', active: 'bg-[#F4ECD8] text-[#7A3722]', hover: 'hover:bg-[#FAF5E8]' },
  olive:    { cat: 'text-[#44512C]', bar: 'bg-[#44512C]', active: 'bg-[#E8D9B5] text-[#2E3819]', hover: 'hover:bg-[#FAF5E8]' },
  gold:     { cat: 'text-[#8A6E3A]', bar: 'bg-[#B89556]', active: 'bg-[#F4ECD8] text-[#5D4920]', hover: 'hover:bg-[#FAF5E8]' },
  espresso: { cat: 'text-[#1F1B17]', bar: 'bg-[#1F1B17]', active: 'bg-[#F4ECD8] text-[#1F1B17]', hover: 'hover:bg-[#FAF5E8]' },
  // Legacy Tailwind keys — kept so any straggling links still render
  amber:    { cat: 'text-amber-700',   bar: 'bg-amber-500',   active: 'bg-amber-100 text-amber-900',     hover: 'hover:bg-amber-50/60' },
  orange:   { cat: 'text-orange-700',  bar: 'bg-orange-500',  active: 'bg-orange-100 text-orange-900',   hover: 'hover:bg-orange-50/60' },
  emerald:  { cat: 'text-emerald-700', bar: 'bg-emerald-500', active: 'bg-emerald-100 text-emerald-900', hover: 'hover:bg-emerald-50/60' },
  stone:    { cat: 'text-stone-700',   bar: 'bg-stone-500',   active: 'bg-stone-100 text-stone-900',     hover: 'hover:bg-stone-50/60' },
  slate:    { cat: 'text-stone-700',   bar: 'bg-stone-500',   active: 'bg-stone-100 text-stone-900',     hover: 'hover:bg-stone-50/60' },
};
const colorOf = (key) => COLOR_CLASSES[key] || COLOR_CLASSES.slate;

// Admin menu — flat list (compatible with existing render) but reorganised
// into fewer, color-coded categories. Every sub item carries its category
// color so the active/hover styling matches.
// All sidebar colors aligned to the warm restaurant palette per
// /PublicReservation — amber / orange / emerald / stone. No more
// violet/cyan/pink/indigo/rose/blue — feels colder than the brand.
const adminLinks = [
  { title: "לוח בקרה", url: createPageUrl("Dashboard"), icon: LayoutGrid, color: "cinnamon" },

  { title: "🤖 כלי AI", url: createPageUrl("AIHub"), icon: Sparkles, color: "gold" },

  { title: "תפעול המסעדה", url: "#", icon: Utensils, isCategory: true, color: "cinnamon" },
  { title: "ניהול תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true, color: "cinnamon" },
  { title: "🍽 ניהול תפריט", url: createPageUrl("MenuManagement"), icon: Utensils, isSubItem: true, color: "cinnamon" },
  { title: "👨‍🍳 דף הכנות", url: createPageUrl("PrepSheet"), icon: ChefHat, isSubItem: true, color: "cinnamon" },
  { title: "📖 מדריך מנות", url: createPageUrl("DishGuide"), icon: Utensils, isSubItem: true, color: "cinnamon" },
  { title: "ניהול שולחנות", url: createPageUrl("TablesManagement"), icon: Utensils, isSubItem: true, color: "cinnamon" },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true, color: "cinnamon" },
  { title: "ניקיון שירותים 🚽", url: createPageUrl("RestroomCleaning"), icon: ClipboardCheck, isSubItem: true, color: "cinnamon" },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "cinnamon" },
  { title: "תקריות", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true, color: "cinnamon" },
  { title: "דוח סיום משמרת", url: createPageUrl("ShiftEndReport"), icon: ClipboardCheck, isSubItem: true, color: "cinnamon" },

  { title: "📞 תור והזמנות", url: createPageUrl("QueueHub"), icon: QrCode, color: "gold" },

  { title: "כספים ודוחות", url: "#", icon: TrendingUp, isCategory: true, color: "olive" },
  { title: "📥 WhatsApp Inbox", url: createPageUrl("AdminWhatsAppInbox"), icon: Zap, isSubItem: true, color: "olive" },
  { title: "📨 WhatsApp Templates", url: createPageUrl("AdminWhatsAppTemplates"), icon: Zap, isSubItem: true, color: "olive" },
  { title: "📊 קופה Live", url: createPageUrl("BeecommLive"), icon: Zap, isSubItem: true, color: "olive" },
  { title: "דוחות", url: createPageUrl("Reports"), icon: BarChart3, isSubItem: true, color: "olive" },
  { title: "💰 תזרים מזומנים", url: createPageUrl("CashFlow"), icon: Wallet, isSubItem: true, color: "olive" },
  { title: "👥 עלות שכר", url: createPageUrl("LaborCost"), icon: BarChart3, isSubItem: true, color: "olive" },
  { title: "🍽 מתכונים ופוד-קוסט", url: createPageUrl("Recipes"), icon: ChefHat, isSubItem: true, color: "olive" },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true, color: "olive" },
  { title: "חשבוניות", url: createPageUrl("Invoices"), icon: FileText, isSubItem: true, color: "olive" },
  { title: "ספקים", url: createPageUrl("Suppliers"), icon: Building, isSubItem: true, color: "olive" },

  { title: "👥 עובדים וסידור", url: createPageUrl("EmployeesHub"), icon: Users, color: "olive" },
  { title: "🎓 גיוס והכשרה", url: createPageUrl("RecruitmentHub"), icon: GraduationCap, color: "gold" },
  { title: "🌿 אירועים פרטיים", url: createPageUrl("EventsHub"), icon: CalendarHeart, color: "cinnamon" },
  { title: "🤝 ספקי אירועים", url: createPageUrl("EventVendors"), icon: Users, color: "cinnamon" },
  { title: "📦 משלוחים", url: createPageUrl("DeliveriesHub"), icon: Package, color: "gold" },
  { title: "📢 שיווק ולקוחות", url: createPageUrl("MarketingHub"), icon: Megaphone, color: "olive" },
  { title: "🏆 גמיפיקציה וסטוריז", url: createPageUrl("StoriesHub"), icon: Trophy, color: "cinnamon" },

  { title: "👑 Platform Admin", url: createPageUrl("PlatformAdmin"), icon: Shield, color: "espresso" },

  { title: "הגדרות ואינטגרציות ⚙️", url: "#", icon: Settings, isCategory: true, color: "espresso" },
  { title: "מרכז הגדרות וחיבורים", url: createPageUrl("AdminSettings"), icon: Settings, isSubItem: true, color: "espresso" },
  { title: "הגדרות פלטפורמה 🧩", url: createPageUrl("PlatformSettings"), icon: LayoutGrid, isSubItem: true, color: "espresso" },
  { title: "מיתוג המסעדה 🎨", url: createPageUrl("Branding"), icon: Sparkles, isSubItem: true, color: "espresso" },
  { title: "חיבורים חיצוניים 🔌", url: createPageUrl("Integrations"), icon: Zap, isSubItem: true, color: "espresso" },
  { title: "ייצוא דאטה", url: createPageUrl("DataExport"), icon: Download, isSubItem: true, color: "espresso" },
  { title: "שליחת Push ידני", url: createPageUrl("PushNotifications"), icon: Bell, isSubItem: true, color: "espresso" },
  { title: "פופ-אפים מתוזמנים 🔔", url: createPageUrl("Popups"), icon: Megaphone, isSubItem: true, color: "espresso" },
];

// Employee menu — full brand palette (cinnamon/olive/gold/espresso).
const employeeLinks = [
  { title: "בית", url: createPageUrl("EmployeeHome"), icon: LayoutGrid, color: "cinnamon" },

  { title: "כלי עבודה יומיים", url: "#", icon: Zap, isCategory: true, color: "cinnamon" },
  { title: "דאשבורד תור", url: createPageUrl("QueueDashboard"), icon: Users, isSubItem: true, color: "cinnamon" },
  { title: "השולחנות שלי", url: createPageUrl("WaiterTables"), icon: Utensils, isSubItem: true, color: "cinnamon" },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true, color: "cinnamon" },
  { title: "תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true, color: "cinnamon" },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "cinnamon" },
  { title: "ניקיון שירותים 🚽", url: createPageUrl("RestroomCleaning"), icon: ClipboardCheck, isSubItem: true, color: "cinnamon" },
  { title: "דיווח תקרית", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true, color: "cinnamon" },

  { title: "משלוחים", url: "#", icon: Package, isCategory: true, color: "gold" },
  { title: "משלוחים", url: createPageUrl("Deliveries"), icon: Package, isSubItem: true, color: "gold" },
  { title: "אפליקציית שליח", url: createPageUrl("CourierDashboard"), icon: Package, isSubItem: true, color: "gold" },
  { title: "מועדון לקוחות משלוחים", url: createPageUrl("DeliveryCustomerClub"), icon: Users, isSubItem: true, color: "gold" },

  { title: "מעקב אישי וזמינות", url: "#", icon: BarChart3, isCategory: true, color: "olive" },
  { title: "הביצועים שלי", url: createPageUrl("MyPerformance"), icon: BarChart3, isSubItem: true, color: "olive" },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true, color: "olive" },
  { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "olive" },
  { title: "הגשת זמינות", url: createPageUrl("AvailabilityForm"), icon: Calendar, isSubItem: true, color: "olive" },
  { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true, color: "olive" },
  { title: "צ'אט משמרת", url: createPageUrl("ShiftChat"), icon: MessageSquare, isSubItem: true, color: "olive" },

  { title: "פיתוח וגמיפיקציה", url: "#", icon: GraduationCap, isCategory: true, color: "gold" },
  { title: "הכשרות ואימונים", url: createPageUrl("Training"), icon: GraduationCap, isSubItem: true, color: "gold" },
  { title: "סרטוני הדרכה", url: createPageUrl("TrainingVideos"), icon: GraduationCap, isSubItem: true, color: "gold" },
  { title: "לוח המובילים", url: createPageUrl("Leaderboard"), icon: Trophy, isSubItem: true, color: "gold" },
  { title: "סלון דמויות", url: createPageUrl("CharacterLounge"), icon: Trophy, isSubItem: true, color: "gold" },
  { title: "🪙 המטבעות שלי", url: createPageUrl("GamificationCenter"), icon: Trophy, isSubItem: true, color: "gold" },
];

// D1 — Module filter. Runs BEFORE filterNav. Drops sidebar entries whose
// owning module is disabled for this tenant. Category headers with no
// surviving children are hidden. `pageEnabled` comes from useTenantModules.
// URLs come from createPageUrl(pageName), so url.slice(1) is the page name.
function filterByModules(items, pageEnabled, isLocked) {
  // Keep an item if its module is enabled OR locked (locked = show with 🔒 +
  // upsell). Only owner-disabled (in-plan, off) items are dropped.
  const keep = (pn) => !pn || pageEnabled(pn) || (isLocked && isLocked(pn));
  const out = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.isCategory) {
      const kept = [];
      let j = i + 1;
      while (j < items.length && items[j].isSubItem) {
        if (keep((items[j].url || '').replace(/^\//, ''))) kept.push(items[j]);
        j++;
      }
      if (kept.length) { out.push(item); out.push(...kept); }
      i = j;
    } else if (!item.isSubItem) {
      if (keep((item.url || '').replace(/^\//, ''))) out.push(item);
      i++;
    } else {
      i++;
    }
  }
  return out;
}

// Real-time search filter. If empty, returns the list as-is. Otherwise hides
// categories whose children don't match the query, and keeps only matching
// children inside the ones that do.
function filterNav(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  const out = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.isCategory) {
      const matches = [];
      let j = i + 1;
      while (j < items.length && items[j].isSubItem) {
        if (items[j].title.toLowerCase().includes(q)) matches.push(items[j]);
        j++;
      }
      if (matches.length) { out.push(item); out.push(...matches); }
      i = j;
    } else if (!item.isSubItem) {
      if (item.title.toLowerCase().includes(q)) out.push(item);
      i++;
    } else { i++; }
  }
  return out;
}

// CSS Variables per theme - applied globally
const THEME_VARS = {
  light:  '',
  purple: `--background:270 60% 97%;--foreground:270 30% 20%;--card:0 0% 100%;--card-foreground:270 30% 20%;--muted:270 40% 93%;--muted-foreground:270 15% 50%;--border:270 30% 85%;--input:270 30% 85%;--primary:270 65% 55%;--primary-foreground:0 0% 100%;--accent:270 65% 55%;--ring:270 65% 55%;`,
  green:  `--background:145 50% 96%;--foreground:145 30% 18%;--card:0 0% 100%;--card-foreground:145 30% 18%;--muted:145 35% 91%;--muted-foreground:145 15% 48%;--border:145 25% 83%;--input:145 25% 83%;--primary:152 55% 38%;--primary-foreground:0 0% 100%;--accent:152 55% 38%;--ring:152 55% 38%;`,
  pink:   `--background:340 60% 97%;--foreground:340 30% 20%;--card:0 0% 100%;--card-foreground:340 30% 20%;--muted:340 40% 93%;--muted-foreground:340 15% 50%;--border:340 30% 85%;--input:340 30% 85%;--primary:340 70% 55%;--primary-foreground:0 0% 100%;--accent:340 70% 55%;--ring:340 70% 55%;`,
  blue:   `--background:215 60% 97%;--foreground:215 30% 18%;--card:0 0% 100%;--card-foreground:215 30% 18%;--muted:215 40% 92%;--muted-foreground:215 15% 48%;--border:215 30% 84%;--input:215 30% 84%;--primary:215 70% 50%;--primary-foreground:0 0% 100%;--accent:215 70% 50%;--ring:215 70% 50%;`,
};

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [originalUserRole, setOriginalUserRole] = React.useState(null);
  const [isPlatformOwner, setIsPlatformOwner] = React.useState(false);
  const [hasUnreadChat, setHasUnreadChat] = React.useState(false);
  const [appTheme, setAppTheme] = React.useState(() => localStorage.getItem('gc_theme') || 'light');
  const branding = useTenantBranding();
  const brandName = branding?.name || 'TOP APOLLO';
  const { pageEnabled, isLocked, unlockPlanFor } = useTenantModules();
  const [paywall, setPaywall] = React.useState(null); // {title, plan} when a locked feature is clicked
  const lockedOf = (item) => {
    const pn = (item.url || '').replace(/^\//, '');
    return pn && isLocked(pn) ? { title: item.title, plan: unlockPlanFor(pn) } : null;
  };

  // D2 — inject tenant brand into CSS vars + document.title + PWA manifest.
  // Runs whenever branding changes. Skips when branding is default so we don't
  // wipe the Tailwind palette with `undefined`s.
  React.useEffect(() => {
    const root = document.documentElement;
    const colors = branding?.brand_colors || {};
    if (colors.primary)   root.style.setProperty('--brand-primary',   colors.primary);
    if (colors.secondary) root.style.setProperty('--brand-secondary', colors.secondary);
    if (colors.accent)    root.style.setProperty('--brand-accent',    colors.accent);
    if (branding?.brand_font) {
      root.style.setProperty('--brand-font-family', `"${branding.brand_font}", system-ui, sans-serif`);
    }
    if (brandName) {
      document.title = brandName;
    }
    // Point manifest link at the per-tenant dynamic manifest (server-side).
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.setAttribute('href', '/api/public/fn/getManifest');
  }, [branding, brandName]);

  // Auto-Tracker: log every page nav so the daily analyzer can spot patterns
  // (e.g. "Dvir opened SeatingSetup 20× tonight → propose a dashboard widget").
  React.useEffect(() => {
    logActivity({
      action_type: 'nav',
      page: location.pathname,
      label: currentPageName || '',
    });
  }, [location.pathname, currentPageName]);

  // Listen for theme changes from GamificationCenter
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'gc_theme') setAppTheme(e.newValue || 'light');
    };
    window.addEventListener('storage', onStorage);
    // Also poll for same-tab changes
    const interval = setInterval(() => {
      const t = localStorage.getItem('gc_theme') || 'light';
      setAppTheme(prev => prev !== t ? t : prev);
    }, 500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval); };
  }, []);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setOriginalUserRole(currentUser?.role);

        // Ask the server whether this user is a platform_owner. This is
        // a DIFFERENT concept from tenant-owner: only the app owner
        // (Dvir) is a platform_owner, and it's the ONLY thing that
        // unlocks the Platform Admin dashboard. Regular restaurant
        // owners get role='owner' inside their own tenant but never
        // see cross-tenant tools.
        try {
          const platformInfo = await base44.functions.getMyPlatformInfo({});
          const data = platformInfo?.data || platformInfo;
          setIsPlatformOwner(!!data?.is_platform_owner);
        } catch (e) {
          setIsPlatformOwner(false);
        }

        // Pull Employee record by email so we can read both full_name AND
        // the job title (used to filter the sidebar to role-relevant pages).
        // Note: in this schema Employee.role holds the JOB TITLE (e.g. "טבח",
        // "מנהל מטבח"), not the system role — that's on User.role.
        if (currentUser?.email) {
          try {
            const employees = await base44.entities.Employee.filter({ email: currentUser.email });
            const activeEmployee = employees.find(emp => emp.full_name) || employees[0];
            if (activeEmployee) {
              setUser(prev => prev ? {
                ...prev,
                full_name: activeEmployee.full_name || prev.full_name,
                employee_position: activeEmployee.role || null,
                employee_department: activeEmployee.department || null,
              } : null);
            }
          } catch (err) {
            console.error("Failed to fetch employee:", err);
          }
        }
      } catch (error) {
        console.log("User not authenticated, continuing without user data");
      }
    };
    loadUser();
  }, []);

  const [storiesOpen, setStoriesOpen] = React.useState(false);

  React.useEffect(() => {
    // Setup global callback for chat unread status
    window.__setUnreadChat = setHasUnreadChat;
    window.__setStoriesOpen = setStoriesOpen;
    return () => { delete window.__setUnreadChat; delete window.__setStoriesOpen; };
  }, []);

  const isCurrentViewAdmin = user?.role === 'admin' || user?.role === 'owner';
  // Owners are admin-equivalent — they get the "view as role" preview dropdown
  // and device-preview too (multi-tenant owners have role='owner', not 'admin').
  const isOriginalAdmin = originalUserRole === 'admin' || originalUserRole === 'owner';

  // Department managers (e.g. kitchen manager) see the employee sidebar plus
  // a small admin-style section scoped to their managed department.
  const managedDept = user?.managed_department;
  const departmentLabel = managedDept === 'kitchen' ? 'מטבח' : managedDept === 'floor' ? 'פלור' : null;
  const departmentManagerExtras = (managedDept && !isCurrentViewAdmin)
    ? [
        { title: `ניהול ${departmentLabel || 'מחלקה'}`, url: "#", icon: Settings, isCategory: true, color: "emerald" },
        { title: "רשימת עובדים", url: createPageUrl("Employees"), icon: Users, isSubItem: true, color: "emerald" },
        { title: "בקשות זמינות", url: createPageUrl("AvailabilityRequests"), icon: Calendar, isSubItem: true, color: "emerald" },
        { title: "שיבוץ סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "emerald" },
      ]
    : [];

  // ── Position-based sidebar overrides ───────────────────────────────────────
  // For specific job positions we hand-pick exactly which sidebar items show.
  // Anything not listed here falls through to the default employeeLinks.
  // Add a new position by creating a links array and registering it below.
  const cookLinks = [
    { title: "בית", url: createPageUrl("EmployeeHome"), icon: LayoutGrid, color: "slate" },
    { title: "כלי עבודה יומיים", url: "#", icon: Zap, isCategory: true, color: "cyan" },
    { title: "📖 מדריך מנות", url: createPageUrl("DishGuide"), icon: Utensils, isSubItem: true, color: "cyan" },
    { title: "👨‍🍳 דף הכנות", url: createPageUrl("PrepSheet"), icon: ChefHat, isSubItem: true, color: "cyan" },
    { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "cyan" },
    { title: "ניקיון שירותים 🚽", url: createPageUrl("RestroomCleaning"), icon: ClipboardCheck, isSubItem: true, color: "cyan" },
    { title: "דיווח תקרית", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true, color: "cyan" },
    { title: "ספקים", url: createPageUrl("Suppliers"), icon: Building, isSubItem: true, color: "cyan" },
    { title: "סידור וזמינות", url: "#", icon: Calendar, isCategory: true, color: "blue" },
    { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "blue" },
    { title: "הגשת זמינות", url: createPageUrl("AvailabilityForm"), icon: Calendar, isSubItem: true, color: "blue" },
    { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true, color: "blue" },
    { title: "הדרכה", url: "#", icon: GraduationCap, isCategory: true, color: "rose" },
    { title: "סרטוני הדרכה", url: createPageUrl("TrainingVideos"), icon: GraduationCap, isSubItem: true, color: "rose" },
  ];

  const kitchenManagerLinks = [
    ...cookLinks,
    { title: "ניהול מטבח", url: "#", icon: Settings, isCategory: true, color: "emerald" },
    { title: "רשימת עובדים", url: createPageUrl("Employees"), icon: Users, isSubItem: true, color: "emerald" },
    { title: "בקשות זמינות", url: createPageUrl("AvailabilityRequests"), icon: Calendar, isSubItem: true, color: "emerald" },
    { title: "שיבוץ סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "emerald" },
  ];

  const POSITION_SIDEBAR = {
    'טבח': cookLinks,
    'מנהל מטבח': kitchenManagerLinks,
    // 'מלצר', 'ברמן' etc. — add when the owner asks.
  };

  const employeePosition = user?.employee_position;
  const positionSidebar = employeePosition ? POSITION_SIDEBAR[employeePosition] : null;

  // Sidebar selection order:
  //   1. Admin → full adminLinks
  //   2. Recognized position → its hand-picked list
  //   3. Has managed_department (legacy fallback) → employeeLinks + extras
  //   4. Default → employeeLinks
  const [navFilter, setNavFilter] = React.useState('');
  // Platform Admin nav item is app-owner-only. Strip it for anyone else
  // so a restaurant owner logging in doesn't see a link they'd hit a 403
  // on (and — more importantly — doesn't discover the god-mode dashboard
  // exists at all).
  const adminLinksFiltered = React.useMemo(
    () => isPlatformOwner ? adminLinks : adminLinks.filter(l => !String(l.url || '').includes('PlatformAdmin')),
    [isPlatformOwner],
  );
  // Per-tenant permission levels. A "manager" sees everything except owner-only
  // settings/platform; a "shift lead" sees only day-to-day operations. Empty
  // category headers are dropped so the sidebar stays clean.
  const urlKey = (u) => String(u || '').replace(/^\//, '');
  const dropEmptyCategories = (links) => links.filter((l, i) => {
    if (!l.isCategory) return true;
    const next = links[i + 1];
    return next && next.isSubItem;
  });
  const MANAGER_EXCLUDE = new Set(['AdminSettings', 'PlatformSettings', 'Branding', 'Integrations', 'DataExport', 'PushNotifications', 'Popups', 'PlatformAdmin']);
  const SHIFT_LEAD_URLS = new Set(['Dashboard', 'BriefingManagement', 'MenuManagement', 'PrepSheet', 'DishGuide', 'TablesManagement', 'SeatingSetup', 'RestroomCleaning', 'Checklists', 'Incidents', 'ShiftEndReport', 'QueueHub', 'EmployeesHub']);
  const managerLinks = React.useMemo(() => dropEmptyCategories(adminLinksFiltered.filter((l) => l.isCategory || !MANAGER_EXCLUDE.has(urlKey(l.url)))), [adminLinksFiltered]);
  const shiftLeadLinks = React.useMemo(() => dropEmptyCategories(adminLinksFiltered.filter((l) => l.isCategory || SHIFT_LEAD_URLS.has(urlKey(l.url)))), [adminLinksFiltered]);

  const viewLevel = user?._viewLevel; // set only while previewing a permission tier
  const baseLinks = viewLevel === 'admin' ? adminLinksFiltered
    : viewLevel === 'manager' ? managerLinks
    : viewLevel === 'shift_lead' ? shiftLeadLinks
    : viewLevel === 'employee' ? [...employeeLinks, ...departmentManagerExtras]
    : isCurrentViewAdmin ? adminLinksFiltered
    : positionSidebar ? positionSidebar
    : [...employeeLinks, ...departmentManagerExtras];
  const moduleFilteredLinks = filterByModules(baseLinks, pageEnabled, isLocked);
  const navigationItems = filterNav(moduleFilteredLinks, navFilter);
  const userName = user?.full_name || user?.email?.split('@')[0] || 'משתמש';

  const commonSidebarProps = {
    user,
    userName,
    isCurrentViewAdmin,
    isOriginalAdmin,
    navigationItems,
    location,
    setUser,
    hasUnreadChat,
    navFilter,
    setNavFilter,
    lockedOf,
    setPaywall,
    brandName,
    logoUrl: branding?.logo_url || null,
  };

  const themeVars = THEME_VARS[appTheme] || '';

  // Kitchen TV display — no sidebar, no chrome, fullscreen content only
  if (currentPageName === 'KitchenScreen') {
    return <div dir="rtl">{children}</div>;
  }

  return (
    <div className="relative h-screen bg-background text-foreground" dir="rtl">
      {themeVars && <style>{`:root, [dir="rtl"] { ${themeVars.split(';').filter(Boolean).map(v => v.trim()).join('; ')} }`}</style>}
      <GlobalMobileStyles />

      {/* Global voice control — mic button available on every page */}
      <VoiceControl />

      {/* תפריט דסקטופ - fixed */}
      <div className="hidden lg:block">
        <DesktopSidebar {...commonSidebarProps} />
      </div>

      {/* תפריט מובייל וראש דף נייד */}
      <SidebarProvider>
        <div className="lg:hidden">
          <MobileSidebar {...commonSidebarProps} />
        </div>

        {/* תוכן ראשי - עם padding מהצד הימני במחשב */}
        <div className="h-screen overflow-y-auto lg:pr-80">
          <MobileHeader isCurrentViewAdmin={isCurrentViewAdmin} brandName={brandName} logoUrl={branding?.logo_url || null} />
          <main className="p-2 sm:p-4 lg:p-8">
            {/* "Enable free notifications" prompt for the logged-in user */}
            {user && <EnableStaffPush />}
            {user && <PopupManager user={user} />}
            {user && <AutoCloseNoticeBanner />}
            <InstallAppBanner />
            {children}
          </main>
        </div>
      </SidebarProvider>

      {/* AI Assistant - רק בדפי בית ולוח בקרה */}
      {(['EmployeeHome', 'Dashboard'].includes(currentPageName)) && !storiesOpen && (
        <div className="ai-chat-widget fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:left-[calc(50%-10rem)]" style={{width: 'min(600px, calc(100vw - 2rem))'}}>
          <AiChatWidget />
        </div>
      )}

      {/* Owner-only device preview — hidden inside the iframe itself via the
          ?devpreview=1 marker so it doesn't recurse. */}
      {isOriginalAdmin && typeof window !== 'undefined' &&
        !new URLSearchParams(window.location.search).has('devpreview') && (
          <DevicePreviewToggle />
      )}

      <FeaturePaywall info={paywall} onClose={() => setPaywall(null)} />
    </div>
  );
}

// --- Sub-components for cleaner structure ---

// ── Role impersonation dropdown — admin-only ──────────────────────────────
// Lets an admin temporarily switch their VIEW to see what each role sees.
// Affects only local React state (setUser) — doesn't touch the server, doesn't
// persist between sessions. Critical for permission-design — owner wants to
// know what menus/pages each role sees before granting permissions.
//
// Four impersonation modes:
//   admin          → full adminLinks (default for admins)
//   employee       → default employeeLinks (waiter/runner/host etc.)
//   cook           → cookLinks (kitchen-focused)
//   kitchen_manager→ kitchenManagerLinks (cook + manage)
// The 4 base access levels a permission tier can map to.
const LEVEL_OPTIONS = [['admin', 'ניהול מלא'], ['manager', 'מנהל'], ['shift_lead', 'אחראי משמרת'], ['employee', 'עובד']];

// Data-driven "view as" dropdown: reflects THIS tenant's permission tiers
// (auto-seeded from its WorkPositions, editable by the owner) instead of Alena's
// fixed roles. Picking a tier previews the app at that tier's base access level.
const RoleImpersonationDropdown = ({ user, setUser, compact = false }) => {
  const [tiers, setTiers] = React.useState([]);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState([]);
  const [saving, setSaving] = React.useState(false);

  const loadTiers = React.useCallback(() => {
    base44.functions.getPermissionTiers({})
      .then((r) => setTiers(((r?.data || r) || {}).tiers || []))
      .catch(() => setTiers([]));
  }, []);
  React.useEffect(() => { loadTiers(); }, [loadTiers]);

  const currentLevel = user?._viewLevel || (user?.role === 'admin' || user?.role === 'owner' ? 'admin' : 'employee');

  const applyLevel = (level) => {
    setUser((prev) => ({
      ...prev,
      _viewLevel: level,
      // admin/manager/shift_lead keep the admin chrome (nav differs via _viewLevel);
      // employee switches to the full employee experience.
      role: level === 'employee' ? 'temp_employee' : 'admin',
      employee_position: null,
      _original_position: prev._original_position !== undefined ? prev._original_position : (prev.employee_position || null),
    }));
  };

  const startEdit = () => { setDraft((tiers.length ? tiers : [{ label: 'מנהל / בעלים', base_level: 'admin' }]).map((t) => ({ label: t.label, base_level: t.base_level }))); setEditing(true); };
  const saveEdit = async () => {
    setSaving(true);
    try { await base44.functions.savePermissionTiers({ tiers: draft.filter((t) => t.label && t.label.trim()) }); setEditing(false); loadTiers(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };

  const shownTiers = tiers.length ? tiers : [{ label: 'מנהל (ניהול מלא)', base_level: 'admin' }, { label: 'עובד', base_level: 'employee' }];

  return (
    <div className={`w-full ${compact ? 'mb-1' : 'mb-2'}`}>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] text-blue-700 font-bold">👁️ צפה כ:</label>
        <button onClick={startEdit} className="text-[10px] text-blue-500 hover:text-blue-700 font-bold">⚙️ ערוך רמות</button>
      </div>
      <select
        value={currentLevel}
        onChange={(e) => applyLevel(e.target.value)}
        className={`w-full rounded-md border border-blue-300 bg-blue-50 text-blue-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2'}`}
      >
        {shownTiers.map((t, i) => <option key={i} value={t.base_level}>{t.label}</option>)}
      </select>
      {currentLevel !== 'admin' && (
        <p className="text-[9px] text-orange-700 font-bold mt-0.5 text-center">🔄 מצב צפייה — חזור לרמה הבכירה לעבודה רגילה</p>
      )}
      {editing && (
        <div className="mt-2 p-2 bg-white rounded-lg border border-blue-200 space-y-1.5" dir="rtl">
          <p className="text-[10px] text-gray-500">שם הרמה של העסק + מה היא רואה באפליקציה.</p>
          {draft.map((t, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={t.label} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="שם הרמה" className="flex-1 min-w-0 text-xs border rounded px-1 py-1" />
              <select value={t.base_level} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, base_level: e.target.value } : x)))} className="text-xs border rounded px-1 py-1">
                {LEVEL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="text-red-400 text-sm px-1">✕</button>
            </div>
          ))}
          <button onClick={() => setDraft((d) => [...d, { label: '', base_level: 'employee' }])} className="text-[11px] text-blue-600 font-bold">+ הוסף רמה</button>
          <div className="flex justify-end gap-1 pt-1 border-t">
            <button onClick={() => setEditing(false)} className="text-[11px] text-gray-500 px-2 py-1">ביטול</button>
            <button onClick={saveEdit} disabled={saving} className="text-[11px] bg-blue-600 text-white rounded px-3 py-1 font-bold">{saving ? '...' : 'שמור'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

const DesktopSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat, navFilter, setNavFilter, lockedOf = () => null, setPaywall = () => {}, brandName = "TOP APOLLO", logoUrl = null }) => (
  <div className="fixed top-0 bottom-0 right-0 w-80 bg-card border-l border-border z-40">
    <div className="border-b border-border p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 bg-gradient-to-br from-[#A04A2E] to-[#B89556] rounded-xl flex items-center justify-center shadow-xl overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="w-full h-full object-cover" />
          ) : (
            <Crown className="w-7 h-7 text-white" />
          )}
        </div>
        <div>
          <h2 className="font-black text-xl text-foreground">{brandName}</h2>
          <p className="text-sm text-muted-foreground font-semibold">{isCurrentViewAdmin ? 'מערכת ניהול' : 'אזור אישי'}</p>
        </div>
      </div>
      {/* Inline menu search */}
      <input
        type="text"
        value={navFilter}
        onChange={(e) => setNavFilter(e.target.value)}
        placeholder="🔎 חפש בתפריט..."
        className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>

    <div className="p-4 overflow-y-auto h-[calc(100%-14rem-14rem)] pb-24">
      {navigationItems.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">לא נמצאו התאמות לחיפוש</p>
      ) : (
      <div className="space-y-1.5">
        {navigationItems.map((item) => {
          const c = colorOf(item.color);
          return item.isCategory ? (
            <div key={item.title} className="pt-4 first:pt-0">
              <div className={`flex items-center gap-3 px-4 py-1.5 font-bold text-xs uppercase tracking-wider ${c.cat}`}>
                <span className={`w-1 h-4 rounded-full ${c.bar}`} />
                <item.icon className="w-4 h-4" />
                <span>{item.title}</span>
              </div>
            </div>
          ) : lockedOf(item) ? (
            <button
              key={item.url + item.title}
              onClick={() => setPaywall(lockedOf(item))}
              className={`group relative transition-all duration-150 rounded-xl flex items-center gap-3 px-4 py-2.5 w-full text-right ${
                item.isSubItem ? 'mr-2' : ''
              } ${c.hover} text-foreground/40 hover:text-foreground/60`}
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0 opacity-50" />
              <span className="text-sm font-semibold flex-1 truncate">{item.title}</span>
              <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
            </button>
          ) : (
            <Link
              key={item.url + item.title}
              to={item.url}
              className={`group relative transition-all duration-150 rounded-xl flex items-center gap-3 px-4 py-2.5 w-full ${
                item.isSubItem ? 'mr-2' : ''
              } ${location.pathname === item.url
                  ? `${c.active} font-bold shadow-sm`
                  : `${c.hover} text-foreground/80 hover:text-foreground`
              }`}
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
              <span className="text-sm font-semibold">{item.title}</span>
              {item.title === 'צ\'אט משמרת' && hasUnreadChat && (
                <div className="absolute right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}
      </div>
      )}
    </div>

    <div className="absolute bottom-0 left-0 right-0 border-t border-border p-6 bg-card">
      <div className="flex items-center gap-4 px-4 py-4 rounded-xl border-2 bg-muted/30 mb-4">
        <div className="w-14 h-14 bg-gradient-to-br from-[#A04A2E] to-[#B89556] rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
          <span className="text-lg font-black text-white">{userName.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-foreground">{userName}</p>
          <p className="text-sm text-muted-foreground font-medium">{isCurrentViewAdmin ? (user?.role === 'owner' ? 'בעלים' : 'מנהל') : 'עובד'}</p>
        </div>
      </div>

      {isOriginalAdmin && (
        <RoleImpersonationDropdown user={user} setUser={setUser} />
      )}
      <div className="mt-2"><AppLanguagePicker /></div>
      <Button
        onClick={() => base44.auth.logout()}
        variant="outline"
        size="sm"
        className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
      >
        <LogOut className="w-4 h-4 ml-1" />
        התנתקות
      </Button>
    </div>
  </div>
);

const MobileSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat, navFilter, setNavFilter, lockedOf = () => null, setPaywall = () => {}, brandName = "TOP APOLLO", logoUrl = null }) => (
  <Sidebar className="bg-card z-50">
    <SidebarHeader className="border-b border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-gradient-to-br from-[#A04A2E] to-[#B89556] rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="w-full h-full object-cover" />
          ) : (
            <Crown className="w-4 h-4 text-white" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-base text-foreground truncate">{brandName}</h2>
          <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? 'מערכת ניהול' : 'אזור אישי'}</p>
        </div>
      </div>
      <input
        type="text"
        value={navFilter}
        onChange={(e) => setNavFilter(e.target.value)}
        placeholder="🔎 חפש בתפריט..."
        className="w-full rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </SidebarHeader>

    <SidebarContent className="p-2">
      <SidebarMenu className="space-y-0.5">
        {navigationItems.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">אין התאמות</p>
        ) : navigationItems.map((item) => {
          const c = colorOf(item.color);
          return item.isCategory ? (
            <div key={item.title} className="pt-3 first:pt-0">
              <div className={`flex items-center gap-2 px-2.5 py-1.5 font-bold text-[11px] uppercase tracking-wider ${c.cat}`}>
                <span className={`w-1 h-3 rounded-full ${c.bar}`} />
                <item.icon className="w-3.5 h-3.5" />
                <span className="truncate">{item.title}</span>
              </div>
            </div>
          ) : lockedOf(item) ? (
            <SidebarMenuItem key={item.url + item.title}>
              <SidebarMenuButton asChild className={`group rounded-lg ${item.isSubItem ? 'mr-2' : ''} ${c.hover} text-foreground/40`}>
                <button onClick={() => setPaywall(lockedOf(item))} className="flex items-center gap-3 px-3 py-2 w-full min-w-0 text-right">
                  <item.icon className="w-4 h-4 flex-shrink-0 opacity-50" />
                  <span className="text-sm font-medium truncate flex-1">{item.title}</span>
                  <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem key={item.url + item.title}>
              <SidebarMenuButton
                asChild
                className={`group transition-colors rounded-lg ${
                  item.isSubItem ? 'mr-2' : ''
                } ${location.pathname === item.url
                    ? `${c.active} font-semibold`
                    : `${c.hover} text-foreground/80 hover:text-foreground`
                }`}
              >
                <Link to={item.url} className="flex items-center gap-3 px-3 py-2 w-full min-w-0 relative">
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{item.title}</span>
                  {item.title === 'צ\'אט משמרת' && hasUnreadChat && (
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse absolute left-1" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarContent>

    <SidebarFooter className="border-t border-border p-2">
      <div className="flex items-center gap-2 p-2 rounded-lg border min-w-0 mb-2">
        <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-foreground">{userName.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{userName}</p>
          <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? (user?.role === 'owner' ? 'בעלים' : 'מנהל') : 'עובד'}</p>
        </div>
      </div>

      {isOriginalAdmin && (
        <RoleImpersonationDropdown user={user} setUser={setUser} compact />
      )}
      <div className="mt-1"><AppLanguagePicker compact /></div>
      <Button
        onClick={() => base44.auth.logout()}
        variant="outline"
        size="sm"
        className="w-full mt-1 text-xs border-red-200 text-red-600 hover:bg-red-50"
      >
        <LogOut className="w-3 h-3 ml-1" />
        התנתקות
      </Button>
    </SidebarFooter>
  </Sidebar>
);

const MobileHeader = ({ isCurrentViewAdmin, brandName = "TOP APOLLO", logoUrl = null }) => (
  <header
    className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-3 lg:hidden min-w-0"
    style={{
      // Push the bar below the iPhone notch / status bar so the hamburger is tappable.
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
      paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
      minHeight: 'calc(4rem + env(safe-area-inset-top))',
    }}>
    <SidebarTrigger className="p-3 rounded-xl bg-primary/10 hover:bg-primary/20 active:bg-primary/30 min-w-[56px] min-h-[56px] flex items-center justify-center" style={{minWidth:'56px',minHeight:'56px'}}>
      <Menu style={{width:'44px',height:'44px',color:'var(--primary)',flexShrink:0}} />
    </SidebarTrigger>
    <div className="flex items-center gap-3 min-w-0">
      <div className="min-w-0 text-right">
        <h1 className="text-base font-bold text-foreground truncate">{brandName}</h1>
        <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? 'ניהול' : 'אזור אישי'}</p>
      </div>
      <div className="w-9 h-9 bg-gradient-to-br from-[#A04A2E] to-[#B89556] rounded-lg flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="w-full h-full object-cover" />
        ) : (
          <Crown className="w-5 h-5 text-white" />
        )}
      </div>
    </div>
  </header>
);

const GlobalMobileStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&family=Rubik:wght@700&display=swap');

    :root {
      --font-family-primary: 'Heebo', sans-serif;
      --font-family-heading: 'Rubik', sans-serif;

      --background: 220 10% 98%;
      --foreground: 222 47% 11%;
      --card: 0 0% 100%;
      --card-foreground: 222 47% 11%;
      --popover: 0 0% 100%;
      --popover-foreground: 222 47% 11%;
      --primary: 152 53% 25%;
      --primary-foreground: 0 0% 100%;
      --secondary: 226 70% 40%;
      --secondary-foreground: 0 0% 100%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 33 95% 44%;
      --accent-foreground: 222 47% 11%;
      --destructive: 351 44% 31%;
      --destructive-foreground: 0 0% 100%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 152 53% 25%;
      --radius: 0.75rem;
    }

    * {
      font-family: var(--font-family-primary);
      box-sizing: border-box;
    }

    html, body {
      overflow-x: hidden;
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100vw;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-family-heading);
      font-weight: 700;
    }

    /* מובייל בלבד - טאבלט וטלפון */
    @media (max-width: 1024px) {
      /* כל הרכיבים לא יעברו את רוחב המסך */
      * {
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      /* טבלאות responsive */
      table {
        display: block;
        overflow-x: auto;
        white-space: nowrap;
        max-width: 100%;
      }
    }

    /* טאבלט - שינויים בינוניים */
    @media (max-width: 768px) {
      h1 { font-size: 2rem !important; line-height: 1.3; }
      h2 { font-size: 1.75rem !important; line-height: 1.4; }
      h3 { font-size: 1.5rem !important; line-height: 1.4; }

      /* כרטיסיות */
      [class*="grid"]:not([class*="grid-cols-1"]):not([class*="grid-cols-2"]) {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
        gap: 1rem !important;
      }
    }

    /* מובייל - טלפון בלבד */
    @media (max-width: 640px) {
      h1 { font-size: 1.5rem !important; line-height: 1.2; }
      h2 { font-size: 1.25rem !important; line-height: 1.3; }
      h3 { font-size: 1.125rem !important; line-height: 1.4; }

      /* כרטיסיות - עמודה אחת בטלפון */
      [class*="grid"] {
        grid-template-columns: 1fr !important;
        gap: 0.75rem !important;
      }

      /* כפתורים קטנים יותר */
      button {
        font-size: 0.875rem !important;
        padding: 0.5rem 0.75rem !important;
      }

      /* שדות טקסט */
      input, textarea, select {
        font-size: 16px !important; /* מונע זום באייפון */
        width: 100% !important;
        box-sizing: border-box !important;
      }

      /* כרטיסיות */
      [class*="Card"] {
        margin: 0.25rem !important;
        padding: 0.75rem !important;
        border-radius: 0.5rem !important;
      }

      /* ריווחים קטנים יותר */
      [class*="space-y-8"] > * + * { margin-top: 1rem !important; }
      [class*="space-y-6"] > * + * { margin-top: 0.75rem !important; }
      [class*="space-y-4"] > * + * { margin-top: 0.5rem !important; }

      [class*="space-x-8"] > * + * { margin-right: 1rem !important; }
      [class*="space-x-6"] > * + * { margin-right: 0.75rem !important; }
      [class*="space-x-4"] > * + * { margin-right: 0.5rem !important; }

      /* פאדינג קטן יותר */
      [class*="p-8"] { padding: 1rem !important; }
      [class*="p-6"] { padding: 0.75rem !important; }
      [class*="p-4"] { padding: 0.5rem !important; }

      [class*="px-8"] { padding-left: 1rem !important; padding-right: 1rem !important; }
      [class*="px-6"] { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
      [class*="px-4"] { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }

      [class*="py-8"] { padding-top: 1rem !important; padding-bottom: 1rem !important; }
      [class*="py-6"] { padding-top: 0.75rem !important; padding-bottom: 0.75rem !important; }
      [class*="py-4"] { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }

      /* מרווח קטן יותר */
      [class*="m-8"] { margin: 1rem !important; }
      [class*="m-6"] { margin: 0.75rem !important; }
      [class*="m-4"] { margin: 0.5rem !important; }

      [class*="gap-8"] { gap: 1rem !important; }
      [class*="gap-6"] { gap: 0.75rem !important; }
      [class*="gap-4"] { gap: 0.5rem !important; }
    }

    /* אייפון קטן ספציפי */
    @media (max-width: 414px) {
      html {
        font-size: 14px;
      }

      h1 { font-size: 1.25rem !important; }
      h2 { font-size: 1.125rem !important; }
      h3 { font-size: 1rem !important; }

      /* כפתורים עוד יותר קטנים */
      button {
        font-size: 0.75rem !important;
        padding: 0.375rem 0.5rem !important;
      }

      /* פאדינג מינימלי */
      [class*="p-8"], [class*="p-6"], [class*="p-4"] {
        padding: 0.5rem !important;
      }
    }
  `}</style>
);