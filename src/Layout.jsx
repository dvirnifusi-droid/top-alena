import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import VoiceControl from "@/components/voice/VoiceControl";
import {
  Users, GraduationCap, AlertTriangle, CheckSquare, Building, BarChart3,
  LayoutGrid, Trophy, Menu, FileText, Utensils, Sparkles, Crown, Rocket, Map, Brain, Calendar, CalendarDays, CalendarHeart, Banknote, MessageSquare, Briefcase, QrCode, ClipboardCheck, Settings, TrendingUp, Zap, Megaphone, Bell, Package, Navigation, LogOut, Tablet, Download
} from "lucide-react";
import {
  Sidebar, SidebarContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

import AiChatWidget from "./components/ai-assistant/AiChatWidget";
import DevicePreviewToggle from "./components/DevicePreviewToggle";
import EnableStaffPush from "./components/EnableStaffPush";
import PopupManager from "./components/PopupManager";
import AutoCloseNoticeBanner from "./components/shift/AutoCloseNoticeBanner";
import InstallAppBanner from "./components/sales/InstallAppBanner";
import { logActivity } from "./lib/activityLogger";

// Color presets for the per-category accent. Tailwind purges by content scan
// so the full class names must appear literally in the file.
const COLOR_CLASSES = {
  violet:  { cat: 'text-violet-700',  bar: 'bg-violet-500',  active: 'bg-violet-100 text-violet-900',   hover: 'hover:bg-violet-50/60' },
  orange:  { cat: 'text-orange-700',  bar: 'bg-orange-500',  active: 'bg-orange-100 text-orange-900',   hover: 'hover:bg-orange-50/60' },
  cyan:    { cat: 'text-cyan-700',    bar: 'bg-cyan-500',    active: 'bg-cyan-100 text-cyan-900',       hover: 'hover:bg-cyan-50/60' },
  emerald: { cat: 'text-emerald-700', bar: 'bg-emerald-500', active: 'bg-emerald-100 text-emerald-900', hover: 'hover:bg-emerald-50/60' },
  blue:    { cat: 'text-blue-700',    bar: 'bg-blue-500',    active: 'bg-blue-100 text-blue-900',       hover: 'hover:bg-blue-50/60' },
  indigo:  { cat: 'text-indigo-700',  bar: 'bg-indigo-500',  active: 'bg-indigo-100 text-indigo-900',   hover: 'hover:bg-indigo-50/60' },
  amber:   { cat: 'text-amber-700',   bar: 'bg-amber-500',   active: 'bg-amber-100 text-amber-900',     hover: 'hover:bg-amber-50/60' },
  pink:    { cat: 'text-pink-700',    bar: 'bg-pink-500',    active: 'bg-pink-100 text-pink-900',       hover: 'hover:bg-pink-50/60' },
  rose:    { cat: 'text-rose-700',    bar: 'bg-rose-500',    active: 'bg-rose-100 text-rose-900',       hover: 'hover:bg-rose-50/60' },
  slate:   { cat: 'text-slate-700',   bar: 'bg-slate-500',   active: 'bg-slate-100 text-slate-900',     hover: 'hover:bg-slate-50/60' },
};
const colorOf = (key) => COLOR_CLASSES[key] || COLOR_CLASSES.slate;

// Admin menu — flat list (compatible with existing render) but reorganised
// into fewer, color-coded categories. Every sub item carries its category
// color so the active/hover styling matches.
const adminLinks = [
  { title: "לוח בקרה", url: createPageUrl("Dashboard"), icon: LayoutGrid, color: "slate" },

  { title: "כלי AI", url: "#", icon: Sparkles, isCategory: true, color: "violet" },
  { title: "תיבת הסוכן 🧠", url: createPageUrl("AgentInbox"), icon: Brain, isSubItem: true, color: "violet" },
  { title: "מרכז בקרת AI", url: createPageUrl("AiDashboard"), icon: Sparkles, isSubItem: true, color: "violet" },
  { title: "חיזוי עומסים AI", url: createPageUrl("SmartPrediction"), icon: Brain, isSubItem: true, color: "violet" },
  { title: "יועץ שיווק AI 🚀", url: createPageUrl("MarketingAdvisor"), icon: Rocket, isSubItem: true, color: "violet" },
  { title: "סוכני שיווק (11)", url: createPageUrl("MarketingAgentsHub"), icon: Megaphone, isSubItem: true, color: "violet" },
  { title: "פרומפטים של סוכנים 🤖", url: createPageUrl("AgentPrompts"), icon: Brain, isSubItem: true, color: "violet" },
  { title: "תחזיות ותובנות AI", url: createPageUrl("RevenueForecasting"), icon: Brain, isSubItem: true, color: "violet" },
  { title: "בדיקת פקודות קוליות 🎤", url: createPageUrl("VoiceTest"), icon: Sparkles, isSubItem: true, color: "violet" },

  { title: "תפעול המסעדה", url: "#", icon: Utensils, isCategory: true, color: "orange" },
  { title: "ניהול תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true, color: "orange" },
  { title: "ניהול שולחנות", url: createPageUrl("TablesManagement"), icon: Utensils, isSubItem: true, color: "orange" },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true, color: "orange" },
  { title: "ניקיון שירותים 🚽", url: createPageUrl("RestroomCleaning"), icon: ClipboardCheck, isSubItem: true, color: "orange" },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "orange" },
  { title: "תקריות", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true, color: "orange" },
  { title: "דוח סיום משמרת", url: createPageUrl("ShiftEndReport"), icon: ClipboardCheck, isSubItem: true, color: "orange" },

  { title: "תור והזמנות", url: "#", icon: QrCode, isCategory: true, color: "cyan" },
  { title: "דאשבורד מארחת", url: createPageUrl("QueueDashboard"), icon: Users, isSubItem: true, color: "cyan" },
  { title: "היסטוריית תור", url: createPageUrl("QueueHistory"), icon: Users, isSubItem: true, color: "cyan" },
  { title: "ניתוח תור", url: createPageUrl("QueueAnalytics"), icon: BarChart3, isSubItem: true, color: "cyan" },
  { title: "ניהול משחקי ממתינים", url: createPageUrl("GamesAdmin"), icon: Trophy, isSubItem: true, color: "cyan" },
  { title: "שאלות משחקים", url: createPageUrl("GameQuestionsAdmin"), icon: FileText, isSubItem: true, color: "cyan" },
  { title: "הגדרות הזמנות", url: createPageUrl("PublicReservationSettings"), icon: Settings, isSubItem: true, color: "cyan" },
  { title: "הגדרות פיקדון 💳", url: createPageUrl("DepositSettings"), icon: Settings, isSubItem: true, color: "cyan" },

  { title: "כספים ודוחות", url: "#", icon: TrendingUp, isCategory: true, color: "emerald" },
  { title: "📊 קופה Live", url: createPageUrl("BeecommLive"), icon: Zap, isSubItem: true, color: "emerald" },
  { title: "דוחות", url: createPageUrl("Reports"), icon: BarChart3, isSubItem: true, color: "emerald" },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true, color: "emerald" },
  { title: "חשבוניות", url: createPageUrl("Invoices"), icon: FileText, isSubItem: true, color: "emerald" },
  { title: "ספקים", url: createPageUrl("Suppliers"), icon: Building, isSubItem: true, color: "emerald" },

  { title: "עובדים וסידור", url: "#", icon: Users, isCategory: true, color: "blue" },
  { title: "רשימת עובדים", url: createPageUrl("Employees"), icon: Users, isSubItem: true, color: "blue" },
  { title: "ניהול תפקידים", url: createPageUrl("PositionsManagement"), icon: Briefcase, isSubItem: true, color: "blue" },
  { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "blue" },
  { title: "בקשות זמינות", url: createPageUrl("AvailabilityRequests"), icon: Calendar, isSubItem: true, color: "blue" },
  { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true, color: "blue" },
  { title: "צ'אט משמרת", url: createPageUrl("ShiftChat"), icon: MessageSquare, isSubItem: true, color: "blue" },
  { title: "משוב עובדים", url: createPageUrl("EmployeeFeedback"), icon: MessageSquare, isSubItem: true, color: "blue" },
  { title: "הגדרות הגשת זמינות", url: createPageUrl("AvailabilityFormSettings"), icon: Settings, isSubItem: true, color: "blue" },
  { title: "מיקום העסק וגיאופנס", url: createPageUrl("LocationSettings"), icon: Navigation, isSubItem: true, color: "blue" },

  { title: "גיוס והכשרה", url: "#", icon: GraduationCap, isCategory: true, color: "indigo" },
  { title: "ראיונות וגיוס 🎯", url: createPageUrl("RecruitmentInterviews"), icon: Users, isSubItem: true, color: "indigo" },
  { title: "סלוטים לראיונות", url: createPageUrl("InterviewSettings"), icon: Calendar, isSubItem: true, color: "indigo" },
  { title: "הכשרות ואימונים", url: createPageUrl("Training"), icon: GraduationCap, isSubItem: true, color: "indigo" },
  { title: "סרטוני הדרכה", url: createPageUrl("TrainingVideos"), icon: GraduationCap, isSubItem: true, color: "indigo" },
  { title: "אירועים פרטיים 🌿", url: createPageUrl("EventsPrivate"), icon: CalendarHeart, isSubItem: true, color: "indigo" },
  { title: "Sales Kit לאירועים", url: createPageUrl("EventsSalesKit"), icon: Utensils, isSubItem: true, color: "indigo" },
  { title: "חוזי אירועים דיגיטליים 📄", url: createPageUrl("EventContracts"), icon: FileText, isSubItem: true, color: "indigo" },
  { title: "ראש מלצרים דיגיטלי 🍷", url: createPageUrl("WaiterAdmin"), icon: Utensils, isSubItem: true, color: "indigo" },

  { title: "משלוחים", url: "#", icon: Package, isCategory: true, color: "amber" },
  { title: "ניהול משלוחים", url: createPageUrl("Deliveries"), icon: Package, isSubItem: true, color: "amber" },
  { title: "ניהול שליחים", url: createPageUrl("Couriers"), icon: Package, isSubItem: true, color: "amber" },
  { title: "מעקב שליחים חי 🗺️", url: createPageUrl("CourierTracking"), icon: Navigation, isSubItem: true, color: "amber" },
  { title: "מועדון לקוחות משלוחים", url: createPageUrl("DeliveryCustomerClub"), icon: Users, isSubItem: true, color: "amber" },
  { title: "ניהול ציוד (אייפדים/מסופונים)", url: createPageUrl("DevicesDashboard"), icon: Tablet, isSubItem: true, color: "amber" },

  { title: "שיווק ולקוחות", url: "#", icon: Megaphone, isCategory: true, color: "pink" },
  { title: "מועדון לקוחות", url: createPageUrl("CustomerClub"), icon: Users, isSubItem: true, color: "pink" },
  { title: "דאשבורד שיווקי", url: createPageUrl("MarketingDashboard"), icon: TrendingUp, isSubItem: true, color: "pink" },
  { title: "קמפיינים", url: "/MarketingCampaigns", icon: Megaphone, isSubItem: true, color: "pink" },
  { title: "Instagram Studio 📸", url: "/InstagramStudio", icon: Megaphone, isSubItem: true, color: "pink" },
  { title: "תבניות הודעה", url: createPageUrl("MessageTemplates"), icon: FileText, isSubItem: true, color: "pink" },
  { title: "סקרי לקוחות", url: createPageUrl("CustomerSurveys"), icon: MessageSquare, isSubItem: true, color: "pink" },
  { title: "ברקודי סקרים", url: createPageUrl("SurveyQRCodes"), icon: QrCode, isSubItem: true, color: "pink" },

  { title: "גמיפיקציה וסטוריז", url: "#", icon: Trophy, isCategory: true, color: "rose" },
  { title: "לוח המובילים", url: createPageUrl("Leaderboard"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "מרכז גמיפיקציה", url: createPageUrl("GamificationAdmin"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "ניהול חנות בגדים", url: createPageUrl("ApparelManagement"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "סלון דמויות", url: createPageUrl("CharacterLounge"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "ארכיון סטוריז", url: createPageUrl("StoriesArchive"), icon: FileText, isSubItem: true, color: "rose" },
  { title: "לוח דירוג סטוריז", url: createPageUrl("StoriesLeaderboard"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "ניתוח סטוריז", url: createPageUrl("StoriesAnalytics"), icon: BarChart3, isSubItem: true, color: "rose" },
  { title: "הודעות סטוריז", url: createPageUrl("StoriesNotifications"), icon: Bell, isSubItem: true, color: "rose" },

  { title: "כלים נוספים", url: "#", icon: Settings, isCategory: true, color: "slate" },
  { title: "ייצוא דאטה", url: createPageUrl("DataExport"), icon: Download, isSubItem: true, color: "slate" },
  { title: "שליחת Push ידני", url: createPageUrl("PushNotifications"), icon: Bell, isSubItem: true, color: "slate" },
  { title: "פופ-אפים מתוזמנים 🔔", url: createPageUrl("Popups"), icon: Megaphone, isSubItem: true, color: "slate" },
  { title: "חיבור קופה Beecomm 🐝", url: createPageUrl("BeecommIntegration"), icon: Package, isSubItem: true, color: "slate" },
];

// Employee menu — same flat format, reorganised and color-coded.
const employeeLinks = [
  { title: "בית", url: createPageUrl("EmployeeHome"), icon: LayoutGrid, color: "slate" },

  { title: "כלי עבודה יומיים", url: "#", icon: Zap, isCategory: true, color: "cyan" },
  { title: "דאשבורד תור", url: createPageUrl("QueueDashboard"), icon: Users, isSubItem: true, color: "cyan" },
  { title: "השולחנות שלי", url: createPageUrl("WaiterTables"), icon: Utensils, isSubItem: true, color: "cyan" },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true, color: "cyan" },
  { title: "תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true, color: "cyan" },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "cyan" },
  { title: "דיווח תקרית", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true, color: "cyan" },
  { title: "דוח סיום משמרת", url: createPageUrl("ShiftEndReport"), icon: ClipboardCheck, isSubItem: true, color: "cyan" },

  { title: "משלוחים", url: "#", icon: Package, isCategory: true, color: "amber" },
  { title: "משלוחים", url: createPageUrl("Deliveries"), icon: Package, isSubItem: true, color: "amber" },
  { title: "אפליקציית שליח", url: createPageUrl("CourierDashboard"), icon: Package, isSubItem: true, color: "amber" },
  { title: "מועדון לקוחות משלוחים", url: createPageUrl("DeliveryCustomerClub"), icon: Users, isSubItem: true, color: "amber" },

  { title: "מעקב אישי וזמינות", url: "#", icon: BarChart3, isCategory: true, color: "blue" },
  { title: "הביצועים שלי", url: createPageUrl("MyPerformance"), icon: BarChart3, isSubItem: true, color: "blue" },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true, color: "blue" },
  { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true, color: "blue" },
  { title: "הגשת זמינות", url: createPageUrl("AvailabilityForm"), icon: Calendar, isSubItem: true, color: "blue" },
  { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true, color: "blue" },
  { title: "צ'אט משמרת", url: createPageUrl("ShiftChat"), icon: MessageSquare, isSubItem: true, color: "blue" },

  { title: "פיתוח וגמיפיקציה", url: "#", icon: GraduationCap, isCategory: true, color: "rose" },
  { title: "הכשרות ואימונים", url: createPageUrl("Training"), icon: GraduationCap, isSubItem: true, color: "rose" },
  { title: "סרטוני הדרכה", url: createPageUrl("TrainingVideos"), icon: GraduationCap, isSubItem: true, color: "rose" },
  { title: "לוח המובילים", url: createPageUrl("Leaderboard"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "סלון דמויות", url: createPageUrl("CharacterLounge"), icon: Trophy, isSubItem: true, color: "rose" },
  { title: "🪙 המטבעות שלי", url: createPageUrl("GamificationCenter"), icon: Trophy, isSubItem: true, color: "rose" },
];

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
  const [hasUnreadChat, setHasUnreadChat] = React.useState(false);
  const [appTheme, setAppTheme] = React.useState(() => localStorage.getItem('gc_theme') || 'light');

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

  const isCurrentViewAdmin = user?.role === 'admin';
  const isOriginalAdmin = originalUserRole === 'admin';

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
    { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true, color: "cyan" },
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
  const baseLinks = isCurrentViewAdmin
    ? adminLinks
    : positionSidebar
      ? positionSidebar
      : [...employeeLinks, ...departmentManagerExtras];
  const navigationItems = filterNav(baseLinks, navFilter);
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
  };

  const themeVars = THEME_VARS[appTheme] || '';

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
          <MobileHeader isCurrentViewAdmin={isCurrentViewAdmin} />
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
    </div>
  );
}

// --- Sub-components for cleaner structure ---

const DesktopSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat, navFilter, setNavFilter }) => (
  <div className="fixed top-0 bottom-0 right-0 w-80 bg-card border-l border-border z-40">
    <div className="border-b border-border p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-xl">
          <Crown className="w-7 h-7 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-black text-xl text-foreground">TOP ALENA</h2>
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
        <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
          <span className="text-lg font-black text-primary-foreground">{userName.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-foreground">{userName}</p>
          <p className="text-sm text-muted-foreground font-medium">{isCurrentViewAdmin ? 'מנהל' : 'עובד'}</p>
        </div>
      </div>

      {isOriginalAdmin && (
        <Button
          onClick={() => {
            setUser(prevUser => ({
              ...prevUser,
              role: prevUser.role === 'admin' ? 'temp_employee' : 'admin'
            }));
          }}
          variant="outline"
          size="sm"
          className="w-full bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
        >
          {user?.role === 'admin' ? '👁️ צפה כעובד' : '⚙️ חזור לניהול'}
        </Button>
      )}
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

const MobileSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat, navFilter, setNavFilter }) => (
  <Sidebar className="bg-card z-50">
    <SidebarHeader className="border-b border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-lg">
          <Crown className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-base text-foreground truncate">TOP ALENA</h2>
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
          <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? 'מנהל' : 'עובד'}</p>
        </div>
      </div>

      {isOriginalAdmin && (
        <Button
          onClick={() => {
            setUser(prevUser => ({
              ...prevUser,
              role: prevUser.role === 'admin' ? 'temp_employee' : 'admin'
            }));
          }}
          variant="outline"
          size="sm"
          className="w-full text-xs bg-blue-50 hover:bg-blue-100"
        >
          {user?.role === 'admin' ? '👁️ צפה כעובד' : '⚙️ חזור'}
        </Button>
      )}
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

const MobileHeader = ({ isCurrentViewAdmin }) => (
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
        <h1 className="text-base font-bold text-foreground truncate">TOP ALENA</h1>
        <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? 'ניהול' : 'אזור אישי'}</p>
      </div>
      <div className="w-9 h-9 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
        <Crown className="w-5 h-5 text-primary-foreground" />
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