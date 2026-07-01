// Catalog of every toggleable module.
// This is the SINGLE SOURCE OF TRUTH — the frontend consumes this via
// getMyTenantModules(). Do not duplicate module keys or page mappings elsewhere.
//
// Rules:
//  - `core: true` → cannot be disabled. Modules the app depends on structurally.
//  - `core: false` → optional, tenant can turn off in /PlatformSettings.
//  - `pages` → array of page names as they appear in src/pages.config.js.
//    A page not listed in any module is considered "core / always visible".

export type ModuleCategory = 'core' | 'operations' | 'customer' | 'ai' | 'advanced';

export interface ModuleDef {
  key: string;
  name_he: string;
  description_he: string;
  category: ModuleCategory;
  icon: string;         // lucide-react icon name
  core: boolean;
  pages: string[];
}

export const MODULE_CATALOG: ModuleDef[] = [
  // ── CORE (cannot be disabled) ─────────────────────────────────────────
  {
    key: 'dashboard',
    name_he: 'לוח בקרה',
    description_he: 'המסך הראשי של המסעדה — סיכום היום, הזמנות, הכנסות, התראות.',
    category: 'core',
    icon: 'LayoutDashboard',
    core: true,
    pages: ['Dashboard'],
  },
  {
    key: 'employees',
    name_he: 'ניהול עובדים',
    description_he: 'רשימת עובדים, פרטים אישיים, ביצועים, הרשאות.',
    category: 'core',
    icon: 'Users',
    core: true,
    pages: ['Employees', 'EmployeeDetails', 'EmployeesHub', 'EmployeeReports', 'EmployeeHome', 'EmployeeFeedback', 'MyPerformance'],
  },
  {
    key: 'work_scheduling',
    name_he: 'סידור עבודה',
    description_he: 'תכנון משמרות, שיבוץ עובדים, חילופי משמרות.',
    category: 'core',
    icon: 'Calendar',
    core: true,
    pages: ['WorkScheduling', 'MySchedule', 'AvailabilityForm', 'AvailabilityRequests', 'AvailabilityFormSettings', 'LeaveRequests', 'ShiftChat', 'ShiftEndReport', 'ShiftEndReportDetails'],
  },
  {
    key: 'suppliers',
    name_he: 'ספקים',
    description_he: 'ניהול ספקים, הזמנות, חוזים.',
    category: 'core',
    icon: 'Truck',
    core: true,
    pages: ['Suppliers', 'SupplierDetails'],
  },
  {
    key: 'invoices',
    name_he: 'חשבוניות',
    description_he: 'סריקת חשבוניות, ניהול הוצאות.',
    category: 'core',
    icon: 'FileText',
    core: true,
    pages: ['Invoices', 'InvoiceDetails'],
  },
  {
    key: 'inventory',
    name_he: 'מלאי',
    description_he: 'ניהול מלאי, התראות מלאי נמוך, מתכונים.',
    category: 'core',
    icon: 'Package',
    core: true,
    pages: ['Recipes'],
  },

  // ── OPERATIONS (optional) ─────────────────────────────────────────────
  {
    key: 'reservations',
    name_he: 'הזמנת מקומות',
    description_he: 'ניהול הזמנות שולחנות, ישיבה, טופס הזמנה ציבורי.',
    category: 'operations',
    icon: 'BookOpen',
    core: false,
    pages: ['ReservationView', 'PublicReservationSettings', 'SeatingSetup', 'TablesManagement', 'DepositSettings'],
  },
  {
    key: 'queue',
    name_he: 'תור וירטואלי',
    description_he: 'ניהול תור לקוחות בכניסה למסעדה, משחקי המתנה, ביקורות.',
    category: 'operations',
    icon: 'Users',
    core: false,
    pages: ['QueueHub', 'QueueDashboard', 'QueueAnalytics', 'QueueHistory', 'GamesAdmin', 'GameQuestionsAdmin'],
  },
  {
    key: 'delivery',
    name_he: 'משלוחים',
    description_he: 'ניהול משלוחים, נהגים, מעקב אחר משלוח.',
    category: 'operations',
    icon: 'Bike',
    core: false,
    pages: ['Deliveries', 'DeliveriesHub', 'Couriers', 'CourierDashboard', 'CourierTracking', 'DeliveryCustomerClub'],
  },
  {
    key: 'events',
    name_he: 'אירועים פרטיים',
    description_he: 'לידים לאירועים, חוזי אירועים, ניהול ספקים לאירועים, ערכת מכירה.',
    category: 'operations',
    icon: 'PartyPopper',
    core: false,
    pages: ['EventsHub', 'EventsInquiry', 'EventsPayment', 'EventsPrivate', 'EventsSalesKit', 'EventContracts', 'EventContractSign', 'EventVendorCampaign', 'EventVendorDetails'],
  },
  {
    key: 'restroom_cleaning',
    name_he: 'ניקיון שירותים',
    description_he: 'תזכורות ניקיון שעתיות לצוות עם תמונת אישור.',
    category: 'operations',
    icon: 'Sparkles',
    core: false,
    pages: ['RestroomCleaning'],
  },
  {
    key: 'checklists',
    name_he: 'צ׳ק-ליסטים',
    description_he: 'משימות פתיחה/סגירה יומיות, ביקורת ביצוע.',
    category: 'operations',
    icon: 'ListChecks',
    core: false,
    pages: ['Checklists', 'UploadChecklists'],
  },
  {
    key: 'waiter',
    name_he: 'אפליקציית מלצר',
    description_he: 'ממשק מלצר בטבלט, שולחנות, הזמנות.',
    category: 'operations',
    icon: 'ConciergeBell',
    core: false,
    pages: ['Waiter', 'WaiterAdmin', 'WaiterTables'],
  },
  {
    key: 'kitchen_screen',
    name_he: 'מסך מטבח',
    description_he: 'תצוגה למסך מטבח לצוות הכנת האוכל.',
    category: 'operations',
    icon: 'ChefHat',
    core: false,
    pages: ['KitchenScreen'],
  },

  // ── CUSTOMER (optional) ────────────────────────────────────────────────
  {
    key: 'customer_club',
    name_he: 'מועדון לקוחות',
    description_he: 'לקוחות רשומים, הטבות, גמיפיקציה, מסרים ממוקדים.',
    category: 'customer',
    icon: 'HeartHandshake',
    core: false,
    pages: ['CustomerClub', 'CustomerDetails', 'CustomerSurvey', 'CustomerSurveys', 'SurveyQRCodes', 'GamificationCenter', 'Leaderboard', 'DailyChallenge'],
  },
  {
    key: 'gamification',
    name_he: 'גמיפיקציה לעובדים',
    description_he: 'הישגים, מטבעות, טבלת מובילים, אתגרים לצוות.',
    category: 'customer',
    icon: 'Trophy',
    core: false,
    pages: ['GamificationAdmin'],
  },

  // ── AI (optional) ──────────────────────────────────────────────────────
  {
    key: 'ai_assistant',
    name_he: 'עוזר AI (סוכן הבעלים)',
    description_he: 'צ׳אט AI לבעלים, סריקת מסמכים, ידע פרטני של המסעדה.',
    category: 'ai',
    icon: 'Bot',
    core: false,
    pages: ['AIHub', 'AiDashboard'],
  },
  {
    key: 'ceo_agent',
    name_he: 'CEO Agent (23 סוכנים)',
    description_he: 'מערכת סוכנים אוטונומית — Marketing, Events, CFO וכו׳.',
    category: 'ai',
    icon: 'Brain',
    core: false,
    pages: ['AgentInbox', 'AgentPrompts'],
  },
  {
    key: 'marketing_advisor',
    name_he: 'יועץ שיווק AI',
    description_he: 'תוכנית שיווק חודשית מוגדרת AI, משימות שיווק, מעקב יעדים.',
    category: 'ai',
    icon: 'Megaphone',
    core: false,
    pages: ['MarketingAdvisor', 'MarketingHub', 'MarketingCampaigns', 'MarketingAgentsHub', 'MarketingDashboard'],
  },
  {
    key: 'stories',
    name_he: 'סטוריז אינסטגרם',
    description_he: 'סטודיו סטוריז, אנליטיקה, לוח מובילים.',
    category: 'ai',
    icon: 'Instagram',
    core: false,
    pages: ['StoriesHub', 'StoriesArchive', 'StoriesAnalytics', 'StoriesLeaderboard', 'StoriesNotifications', 'InstagramStudio'],
  },

  // ── ADVANCED (optional) ────────────────────────────────────────────────
  {
    key: 'recruitment',
    name_he: 'גיוס וראיונות',
    description_he: 'הגשת מועמדות, ראיונות, הכשרה, שלבי קליטה.',
    category: 'advanced',
    icon: 'UserPlus',
    core: false,
    pages: ['RecruitmentHub', 'RecruitmentInterviews', 'InterviewSettings', 'JobApplication', 'Training', 'TrainingVideos'],
  },
  {
    key: 'financial',
    name_he: 'פיננסי מתקדם',
    description_he: 'תזרים מזומנים, יעדי מכירה, תחזיות הכנסה, יעדים חודשיים.',
    category: 'advanced',
    icon: 'TrendingUp',
    core: false,
    pages: ['CashFlow', 'RevenueForecasting', 'SalesGoalTemplates', 'AccountantExportView', 'DataExport', 'SmartPrediction', 'Tips', 'TipReportDetails', 'Reports'],
  },
];

/**
 * Given a page name (e.g. "QueueDashboard"), return the module that owns it,
 * or null if the page is core (not attached to any toggleable module).
 */
export function getModuleForPage(pageName: string): ModuleDef | null {
  for (const m of MODULE_CATALOG) {
    if (m.pages.includes(pageName)) return m;
  }
  return null;
}
