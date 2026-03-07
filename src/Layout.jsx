import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  Users, GraduationCap, AlertTriangle, CheckSquare, Building, BarChart3,
  LayoutGrid, Trophy, Menu, FileText, Utensils, Sparkles, Crown, Rocket, Map, Brain, Calendar, CalendarDays, Banknote, MessageSquare, Briefcase, QrCode, ClipboardCheck, Settings, TrendingUp, Zap, Megaphone
} from "lucide-react";
import {
  Sidebar, SidebarContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

import AiChatWidget from "./components/ai-assistant/AiChatWidget";

// תפריט למנהלים - מחולק לקטגוריות
const adminLinks = [
  // דף הבית
  { title: "לוח בקרה", url: createPageUrl("Dashboard"), icon: LayoutGrid },

  // כלי AI
  { title: "כלי AI", url: "#", icon: Sparkles, isCategory: true },
  { title: "מרכז בקרת AI", url: createPageUrl("AiDashboard"), icon: Sparkles, isSubItem: true },
  { title: "חיזוי עומסים AI", url: createPageUrl("SmartPrediction"), icon: Brain, isSubItem: true },
  { title: "יועץ שיווק AI", url: createPageUrl("MarketingAI"), icon: Rocket, isSubItem: true },

  // ניהול מסעדה
  { title: "ניהול מסעדה", url: "#", icon: Utensils, isCategory: true },
  { title: "ניהול תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true },
  { title: "ניהול שולחנות", url: createPageUrl("TablesManagement"), icon: Utensils, isSubItem: true },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true },
  { title: "הגדרות הזמנות", url: createPageUrl("PublicReservationSettings"), icon: Settings, isSubItem: true },

  // כספים ודוחות
  { title: "כספים ודוחות", url: "#", icon: TrendingUp, isCategory: true },
  { title: "דוחות", url: createPageUrl("Reports"), icon: BarChart3, isSubItem: true },
  { title: "תחזיות ותובנות AI", url: createPageUrl("RevenueForecasting"), icon: Brain, isSubItem: true },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true },
  { title: "דוח סיום משמרת", url: createPageUrl("ShiftEndReport"), icon: ClipboardCheck, isSubItem: true },
  { title: "חשבוניות", url: createPageUrl("Invoices"), icon: FileText, isSubItem: true },
  { title: "ספקים", url: createPageUrl("Suppliers"), icon: Building, isSubItem: true },

  // עובדים
  { title: "עובדים", url: "#", icon: Users, isCategory: true },
  { title: "רשימת עובדים", url: createPageUrl("Employees"), icon: Users, isSubItem: true },
  { title: "ניהול תפקידים", url: createPageUrl("PositionsManagement"), icon: Briefcase, isSubItem: true },
  { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true },
  { title: "בקשות זמינות", url: createPageUrl("AvailabilityRequests"), icon: Calendar, isSubItem: true },
  { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true },
  { title: "צ'אט משמרת", url: createPageUrl("ShiftChat"), icon: MessageSquare, isSubItem: true },
  { title: "הגדרות הגשת זמינות", url: createPageUrl("AvailabilityFormSettings"), icon: Settings, isSubItem: true },
  { title: "משוב עובדים", url: createPageUrl("EmployeeFeedback"), icon: MessageSquare, isSubItem: true },

  // הכשרות ואיכות
  { title: "הכשרות ואיכות", url: "#", icon: GraduationCap, isCategory: true },
  { title: "הכשרות ואימונים", url: createPageUrl("Training"), icon: GraduationCap, isSubItem: true },
  { title: "לוח המובילים", url: createPageUrl("Leaderboard"), icon: Trophy, isSubItem: true },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true },
  { title: "תקריות", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true },

  // לקוחות ושיווק
  { title: "לקוחות ושיווק", url: "#", icon: MessageSquare, isCategory: true },
  { title: "מועדון לקוחות", url: createPageUrl("CustomerClub"), icon: Users, isSubItem: true },
  { title: "דאשבורד שיווקי", url: createPageUrl("MarketingDashboard"), icon: TrendingUp, isSubItem: true },
  { title: "תבניות הודעה", url: createPageUrl("MessageTemplates"), icon: FileText, isSubItem: true },
  { title: "סקרי לקוחות", url: createPageUrl("CustomerSurveys"), icon: MessageSquare, isSubItem: true },
  { title: "ברקודי סקרים", url: createPageUrl("SurveyQRCodes"), icon: QrCode, isSubItem: true },
];

// תפריט לעובדים רגילים - מחולק לקטגוריות
const employeeLinks = [
  { title: "בית", url: createPageUrl("EmployeeHome"), icon: LayoutGrid },

  // כלי עבודה יומיים
  { title: "כלי עבודה יומיים", url: "#", icon: Zap, isCategory: true },
  { title: "תדריכים", url: createPageUrl("BriefingManagement"), icon: Megaphone, isSubItem: true }, // Added for employees
  { title: "השולחנות שלי", url: createPageUrl("WaiterTables"), icon: Utensils, isSubItem: true },
  { title: "ניהול הושבה", url: createPageUrl("SeatingSetup"), icon: Map, isSubItem: true },
  { title: "צ'קליסטים", url: createPageUrl("Checklists"), icon: CheckSquare, isSubItem: true },
  { title: "דיווח תקרית", url: createPageUrl("Incidents"), icon: AlertTriangle, isSubItem: true },
  { title: "דוח סיום משמרת", url: createPageUrl("ShiftEndReport"), icon: ClipboardCheck, isSubItem: true },

  // מעקב אישי
  { title: "מעקב אישי", url: "#", icon: BarChart3, isCategory: true },
  { title: "הביצועים שלי", url: createPageUrl("MyPerformance"), icon: BarChart3, isSubItem: true },
  { title: "ניהול טיפים", url: createPageUrl("Tips"), icon: Banknote, isSubItem: true },
  { title: "סידור עבודה", url: createPageUrl("WorkScheduling"), icon: Calendar, isSubItem: true },
  { title: "הגשת זמינות", url: createPageUrl("AvailabilityForm"), icon: Calendar, isSubItem: true },
  { title: "בקשות חופשה", url: createPageUrl("LeaveRequests"), icon: CalendarDays, isSubItem: true },
  { title: "צ'אט משמרת", url: createPageUrl("ShiftChat"), icon: MessageSquare, isSubItem: true },

  // פיתוח מקצועי
  { title: "פיתוח מקצועי", url: "#", icon: GraduationCap, isCategory: true },
  { title: "הכשרות ואימונים", url: createPageUrl("Training"), icon: GraduationCap, isSubItem: true },
  { title: "לוח המובילים", url: createPageUrl("Leaderboard"), icon: Trophy, isSubItem: true },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [originalUserRole, setOriginalUserRole] = React.useState(null);
  const [hasUnreadChat, setHasUnreadChat] = React.useState(false);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setOriginalUserRole(currentUser?.role);
        
        // סנכרן שם מ-Employee אם קיים
        if (currentUser?.email) {
          const employees = await base44.entities.Employee.filter({ email: currentUser.email });
          const activeEmployee = employees.find(emp => emp.status === 'active' && emp.full_name);
          if (activeEmployee) {
            setUser(prev => prev ? { ...prev, full_name: activeEmployee.full_name } : null);
          }
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  React.useEffect(() => {
    // Setup global callback for chat unread status
    window.__setUnreadChat = setHasUnreadChat;
    return () => delete window.__setUnreadChat;
  }, []);

  const isCurrentViewAdmin = user?.role === 'admin';
  const isOriginalAdmin = originalUserRole === 'admin';

  const navigationItems = isCurrentViewAdmin ? adminLinks : employeeLinks;
  const userName = user?.full_name || user?.email?.split('@')[0] || 'משתמש';

  const commonSidebarProps = {
    user,
    userName,
    isCurrentViewAdmin,
    isOriginalAdmin,
    navigationItems,
    location,
    setUser,
    hasUnreadChat
  };

  return (
    <div className="relative h-screen bg-background text-foreground" dir="rtl">
      <GlobalMobileStyles />

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
          <main className="p-2 sm:p-4 lg:p-8">{children}</main>
        </div>
      </SidebarProvider>

      {/* AI Assistant - רק בדפי בית ולוח בקרה */}
      {(['EmployeeHome', 'Dashboard'].includes(currentPageName)) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:left-[calc(50%-10rem)]" style={{width: 'min(600px, calc(100vw - 2rem))'}}>
          <AiChatWidget />
        </div>
      )}
    </div>
  );
}

// --- Sub-components for cleaner structure ---

const DesktopSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat }) => (
  <div className="fixed top-0 bottom-0 right-0 w-80 bg-card border-l border-border z-40">
    <div className="border-b border-border p-8">
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-xl">
          <Crown className="w-8 h-8 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-black text-2xl text-foreground">TOP ALENA</h2>
          <p className="text-base text-muted-foreground font-semibold">{isCurrentViewAdmin ? 'מערכת ניהול' : 'אזור אישי'}</p>
        </div>
      </div>
    </div>

    <div className="p-6 overflow-y-auto h-[calc(100%-14rem-14rem)] pb-24">
      <div className="space-y-3">
        {navigationItems.map((item) => (
          item.isCategory ? (
            <div key={item.title} className="pt-4">
              <div className="flex items-center gap-4 px-6 py-2 text-primary font-bold text-sm">
                <item.icon className="w-5 h-5" />
                <span>{item.title}</span>
              </div>
            </div>
          ) : (
            <Link
              key={item.title}
              to={item.url}
              className={`group hover:bg-muted transition-all duration-200 rounded-xl h-14 flex items-center gap-4 px-6 py-4 w-full ${
                item.isSubItem ? 'mr-4' : ''
              } ${location.pathname === item.url ? 'bg-muted text-primary font-bold shadow-md' : 'text-foreground/70 hover:text-foreground'}`}
            >
              <item.icon className="w-6 h-6 flex-shrink-0" />
              <span className="text-base font-semibold">{item.title}</span>
              {item.title === 'צ\'אט משמרת' && hasUnreadChat && (
                <div className="absolute right-6 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              )}
            </Link>
          )
        ))}
      </div>
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
    </div>
  </div>
);

const MobileSidebar = ({ userName, isCurrentViewAdmin, isOriginalAdmin, navigationItems, location, user, setUser, hasUnreadChat }) => (
  <Sidebar className="bg-card z-50">
    <SidebarHeader className="border-b border-border p-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-lg">
          <Crown className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-base text-foreground truncate">TOP ALENA</h2>
          <p className="text-xs text-muted-foreground truncate">{isCurrentViewAdmin ? 'מערכת ניהול' : 'אזור אישי'}</p>
        </div>
      </div>
    </SidebarHeader>

    <SidebarContent className="p-2">
      <SidebarMenu className="space-y-1">
        {navigationItems.map((item) => (
          item.isCategory ? (
            <div key={item.title} className="pt-2">
              <div className="flex items-center gap-3 px-3 py-2 text-primary font-bold text-xs">
                <item.icon className="w-4 h-4" />
                <span className="truncate">{item.title}</span>
              </div>
            </div>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className={`group hover:bg-muted transition-colors rounded-lg ${
                  item.isSubItem ? 'mr-3' : ''
                } ${location.pathname === item.url ? 'bg-muted text-primary font-semibold' : 'text-foreground/70 hover:text-foreground'}`}
              >
                <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5 w-full min-w-0 relative">
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{item.title}</span>
                  {item.title === 'צ\'אט משמרת' && hasUnreadChat && (
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse absolute left-1" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        ))}
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
    </SidebarFooter>
  </Sidebar>
);

const MobileHeader = ({ isCurrentViewAdmin }) => (
  <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-3 lg:hidden min-w-0">
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