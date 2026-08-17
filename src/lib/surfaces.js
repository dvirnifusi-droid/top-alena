// The eight surfaces the app is organised into.
//
// Generated from the audited map: every one of the 148 registered screens is
// assigned exactly once — verified in the build script, not by eye. This
// structure removes nothing; a surface is a way in, and each group lists
// screens that already exist.
//
// `page` is the route name as registered in pages.config.js, so permissions and
// deep links keep working unchanged. Strings are JSON-encoded rather than
// hand-quoted — a label like "צ'קליסטים" carries an apostrophe that breaks a
// single-quoted literal.
export const SURFACES = [
  {
    "key": "home",
    "title": "בית",
    "subtitle": "מה קורה עכשיו",
    "icon": "Home",
    "groups": [
      {
        "label": "עכשיו",
        "pages": [
          {
            "page": "Dashboard",
            "label": "לוח בקרה"
          },
          {
            "page": "OperationsHub",
            "label": "🎛 מטה תפעול"
          },
          {
            "page": "EmployeeHome",
            "label": "בית"
          },
          {
            "page": "MyCard",
            "label": "🪪 הכרטיס שלי"
          },
          {
            "page": "Setup",
            "label": "נזין את המסעדה פעם אחת — סרוק מסמך או הזן ידנית. מרגע שזה כאן, DVIR AI כבר יודע הכל."
          },
          {
            "page": "AdminAmbient",
            "label": "🌅 Ambient Operations"
          },
          {
            "page": "KitchenScreen",
            "label": "KitchenScreen"
          },
          {
            "page": "ColorPreview",
            "label": "🎨 הדמיית עיצובים — בחר אופציה"
          },
          {
            "page": "VoiceTest",
            "label": "🎤 בדיקת פקודות קוליות"
          },
          {
            "page": "MyPerformance",
            "label": "הביצועים שלי"
          }
        ]
      }
    ]
  },
  {
    "key": "shift",
    "title": "משמרת",
    "subtitle": "הרצפה בזמן אמת",
    "icon": "Clock",
    "groups": [
      {
        "label": "שולחנות ואורחים",
        "pages": [
          {
            "page": "SeatingSetup",
            "label": "ניהול הושבה"
          },
          {
            "page": "TablesManagement",
            "label": "ניהול שולחנות"
          },
          {
            "page": "WaiterTables",
            "label": "השולחנות שלי"
          },
          {
            "page": "Waiter",
            "label": "Waiter"
          },
          {
            "page": "WaiterAdmin",
            "label": "תפריט, ספיישלים, חסר היום, מידע כללי ופרומפט. שינויים נכנסים מיידית לסוכן."
          }
        ]
      },
      {
        "label": "משימות המשמרת",
        "pages": [
          {
            "page": "Checklists",
            "label": "צ'קליסטים"
          },
          {
            "page": "RestroomCleaning",
            "label": "ניקיון שירותים 🚽"
          },
          {
            "page": "Incidents",
            "label": "דיווח תקרית"
          },
          {
            "page": "BriefingManagement",
            "label": "תדריכים"
          },
          {
            "page": "ShiftChat",
            "label": "צ'אט משמרת"
          },
          {
            "page": "UploadChecklists",
            "label": "UploadChecklists"
          }
        ]
      },
      {
        "label": "סגירת משמרת",
        "pages": [
          {
            "page": "ShiftEndReport",
            "label": "דוח סיום משמרת"
          },
          {
            "page": "ShiftEndReportDetails",
            "label": "ShiftEndReportDetails"
          }
        ]
      }
    ]
  },
  {
    "key": "team",
    "title": "צוות",
    "subtitle": "אנשים, סידור ומסמכים",
    "icon": "Users",
    "groups": [
      {
        "label": "אנשים",
        "pages": [
          {
            "page": "Employees",
            "label": "רשימת עובדים"
          },
          {
            "page": "EmployeeDetails",
            "label": "EmployeeDetails"
          },
          {
            "page": "EmployeesHub",
            "label": "👥 עובדים וסידור"
          },
          {
            "page": "PositionsManagement",
            "label": "הגדרת תפקידים, תיאורים ונהלי גיוס"
          },
          {
            "page": "EmployeeFeedback",
            "label": "EmployeeFeedback"
          },
          {
            "page": "EmployeeComplete",
            "label": "הצטרפו לצוות"
          }
        ]
      },
      {
        "label": "סידור וזמינות",
        "pages": [
          {
            "page": "WorkScheduling",
            "label": "שיבוץ סידור עבודה"
          },
          {
            "page": "AvailabilityForm",
            "label": "הגשת זמינות"
          },
          {
            "page": "AvailabilityRequests",
            "label": "בקשות זמינות"
          },
          {
            "page": "AvailabilityFormSettings",
            "label": "ערוך את הגדרות דף הגשת הזמינות של העובדים"
          },
          {
            "page": "LeaveRequests",
            "label": "בקשות חופשה"
          },
          {
            "page": "MySchedule",
            "label": "הפגישות והמשימות שהזנת דרך העוזר ב-WhatsApp."
          },
          {
            "page": "AdminReopenShifts",
            "label": "מחפש משמרות שנסגרו אוטומטית ב-36 השעות האחרונות (geofence / 4h / 16h) ומחזיר אותן למצב פתוח כדי שתוכל לסגור אותן ידנית עם השעה הנכונה."
          }
        ]
      },
      {
        "label": "מסמכים וחתימות",
        "pages": [
          {
            "page": "Form101",
            "label": "טופס 101"
          },
          {
            "page": "Form101Admin",
            "label": "טופס 101 — שנת המס"
          },
          {
            "page": "MyAgreement",
            "label": "הסכם העבודה שלי"
          },
          {
            "page": "AgreementAdmin",
            "label": "הסכם עבודה"
          }
        ]
      },
      {
        "label": "גיוס והכשרה",
        "pages": [
          {
            "page": "RecruitmentHub",
            "label": "🎓 גיוס והכשרה"
          },
          {
            "page": "RecruitmentInterviews",
            "label": "ראיונות קרובים, ציר התלמדות, מי מחכה לחזרה"
          },
          {
            "page": "InterviewSettings",
            "label": "המועדים שמועמדים עם ציון 80+ יוכלו לבחור מתוכם"
          },
          {
            "page": "Training",
            "label": "הכשרות ואימונים"
          },
          {
            "page": "OnboardingQuestionnaire",
            "label": "שאלון הצטרפות לעסק חדש"
          }
        ]
      },
      {
        "label": "מוטיבציה",
        "pages": [
          {
            "page": "GamificationCenter",
            "label": "🪙 המטבעות שלי"
          },
          {
            "page": "GamificationAdmin",
            "label": "ניהול פדיונות, אתגרים, בונוסים ופרסים"
          },
          {
            "page": "Leaderboard",
            "label": "לוח המובילים"
          },
          {
            "page": "CharacterLounge",
            "label": "סלון דמויות"
          },
          {
            "page": "ApparelManagement",
            "label": "הוספה וניהול של פריטי לבוש בחנות"
          },
          {
            "page": "StoriesHub",
            "label": "🏆 גמיפיקציה וסטוריז"
          },
          {
            "page": "StoriesArchive",
            "label": "כל הסטוריז שנפרסמו, כולל אלה שפגו"
          },
          {
            "page": "StoriesAnalytics",
            "label": "סטטיסטיקות מפורטות של כל הסטוריז"
          },
          {
            "page": "StoriesLeaderboard",
            "label": "🏆 לוח דירוג סטוריז"
          },
          {
            "page": "StoriesNotifications",
            "label": "כל הפעילות בסטוריז שלך"
          }
        ]
      }
    ]
  },
  {
    "key": "money",
    "title": "כסף",
    "subtitle": "תזרים, חשבוניות ושכר",
    "icon": "Wallet",
    "groups": [
      {
        "label": "תזרים והוצאות",
        "pages": [
          {
            "page": "CashFlow",
            "label": "💰 תזרים מזומנים"
          },
          {
            "page": "Invoices",
            "label": "🧾 חשבוניות"
          },
          {
            "page": "InvoiceDetails",
            "label": "InvoiceDetails"
          },
          {
            "page": "EmailInvoiceSettings",
            "label": "תיבות מייל לחשבוניות"
          },
          {
            "page": "OperatingCosts",
            "label": "עלויות תפעול"
          }
        ]
      },
      {
        "label": "שכר וטיפים",
        "pages": [
          {
            "page": "Tips",
            "label": "ניהול טיפים"
          },
          {
            "page": "TipReportDetails",
            "label": "פירוט דוח טיפים"
          },
          {
            "page": "LaborCost",
            "label": "👥 עלות שכר"
          },
          {
            "page": "EmployeeReports",
            "label": "📊 דוחות עובדים"
          },
          {
            "page": "Reports",
            "label": "דוחות"
          },
          {
            "page": "SalesGoalTemplates",
            "label": "תבניות יעדי מכירה"
          }
        ]
      },
      {
        "label": "דוחות",
        "pages": [
          {
            "page": "AccountantExportView",
            "label": "AccountantExportView"
          },
          {
            "page": "BeecommLive",
            "label": "📊 קופה Live"
          },
          {
            "page": "RevenueForecasting",
            "label": "RevenueForecasting"
          },
          {
            "page": "SmartPrediction",
            "label": "מערכת ביקוש חכם AI"
          }
        ]
      }
    ]
  },
  {
    "key": "kitchen",
    "title": "מטבח",
    "subtitle": "תפריט, עלויות וספקים",
    "icon": "ChefHat",
    "groups": [
      {
        "label": "תפריט ועלות",
        "pages": [
          {
            "page": "MenuManagement",
            "label": "🍽 ניהול תפריט"
          },
          {
            "page": "Recipes",
            "label": "🌳 עץ מוצר / מתכונים"
          },
          {
            "page": "DishGuide",
            "label": "📖 מדריך מנות"
          }
        ]
      },
      {
        "label": "הכנות והזמנות",
        "pages": [
          {
            "page": "PrepSheet",
            "label": "👨‍🍳 דף הכנות"
          },
          {
            "page": "OrderList",
            "label": "🛒 רשימת הזמנה"
          }
        ]
      },
      {
        "label": "ספקים",
        "pages": [
          {
            "page": "Suppliers",
            "label": "🚚 ספקים"
          },
          {
            "page": "SupplierDetails",
            "label": "SupplierDetails"
          },
          {
            "page": "GoodsControl",
            "label": "GoodsControl"
          }
        ]
      },
      {
        "label": "בית הכנות ורשת",
        "pages": [
          {
            "page": "Commissary",
            "label": "🏭 בית הכנות (רשת)"
          },
          {
            "page": "CommissaryOrders",
            "label": "📦 הזמנות והפצה"
          },
          {
            "page": "BranchCommissary",
            "label": "🏭 הזמנה לבית הכנות"
          },
          {
            "page": "NetworkHQ",
            "label": "🏢 מטה הרשת שלי"
          },
          {
            "page": "NetworkDashboard",
            "label": "🏢 מטה הרשת"
          },
          {
            "page": "NetworkCommissary",
            "label": "NetworkCommissary"
          },
          {
            "page": "NetworkTasksPage",
            "label": "NetworkTasksPage"
          },
          {
            "page": "BranchNetworkTasks",
            "label": "🔗 משימות רשת"
          }
        ]
      }
    ]
  },
  {
    "key": "guests",
    "title": "אורחים",
    "subtitle": "הזמנות, מועדון ומשלוחים",
    "icon": "Smile",
    "groups": [
      {
        "label": "הזמנות ותור",
        "pages": [
          {
            "page": "QueueHub",
            "label": "📞 תור והזמנות"
          },
          {
            "page": "ReservationsAnalytics",
            "label": "📊 דאשבורד הזמנות"
          },
          {
            "page": "DayEvents",
            "label": "ערבים מיוחדים"
          },
          {
            "page": "PublicReservationSettings",
            "label": "הגדרות עמוד ההזמנות"
          },
          {
            "page": "DepositSettings",
            "label": "ימי פיקדון, סכומים, חלון ביטול וחיבור סליקה"
          },
          {
            "page": "SpecialsAdmin",
            "label": "הוסף/ערוך פופאפים שמופיעים על דף ההזמנות. נתונים ל-30 הימים האחרונים."
          }
        ]
      },
      {
        "label": "מועדון ומשוב",
        "pages": [
          {
            "page": "CustomerClub",
            "label": "CustomerClub"
          },
          {
            "page": "CustomerDetails",
            "label": "CustomerDetails"
          },
          {
            "page": "CustomerSurveys",
            "label": "כל המשובים מהלקוחות שלך במקום אחד."
          },
          {
            "page": "SurveyQRCodes",
            "label": "ברקודים לסקרי לקוחות"
          },
          {
            "page": "ClubRedeem",
            "label": "🎁 מימוש הטבת מועדון"
          }
        ]
      },
      {
        "label": "משלוחים",
        "pages": [
          {
            "page": "DeliveriesHub",
            "label": "📦 משלוחים"
          },
          {
            "page": "Deliveries",
            "label": "משלוחים"
          },
          {
            "page": "Couriers",
            "label": "שליחים"
          },
          {
            "page": "CourierTracking",
            "label": "🗺️ מעקב שליחים חי"
          },
          {
            "page": "CourierDashboard",
            "label": "אפליקציית שליח"
          },
          {
            "page": "DeliveryCustomerClub",
            "label": "מועדון לקוחות משלוחים"
          },
          {
            "page": "AdminGomileyCookies",
            "label": "🛵 הגדרת חיבור Gomiley"
          }
        ]
      }
    ]
  },
  {
    "key": "growth",
    "title": "צמיחה",
    "subtitle": "שיווק, אירועים ובינה",
    "icon": "TrendingUp",
    "groups": [
      {
        "label": "שיווק",
        "pages": [
          {
            "page": "MarketingHub",
            "label": "📢 שיווק ולקוחות"
          },
          {
            "page": "MarketingAI",
            "label": "המערכת שתכפיל את המכירות שלך תוך 6 חודשים"
          },
          {
            "page": "MarketingAdvisor",
            "label": "שואל אותך, מבין את העסק, ומכין לך תכנית 6 חודשים עם משימות יומיות"
          },
          {
            "page": "MarketingAgentsHub",
            "label": "צוות שיווק אוטונומי תחת סגן השיווק. סוכנים מבוססי-LLM פעילים מיד; סוכני מדיה ועיצוב חזותי דורשים מפתחות API."
          },
          {
            "page": "MarketingDashboard",
            "label": "קמפיינים שנשלחו בפועל — אוטומטיים וידניים"
          },
          {
            "page": "MessageTemplates",
            "label": "תבניות הודעה"
          },
          {
            "page": "Popups",
            "label": "הודעות מתוזמנות לעובדים ולמשתמשים"
          }
        ]
      },
      {
        "label": "אירועים פרטיים",
        "pages": [
          {
            "page": "EventsHub",
            "label": "🌿 אירועים פרטיים"
          },
          {
            "page": "EventsPrivate",
            "label": "EventsPrivate"
          },
          {
            "page": "EventsDashboard",
            "label": "EventsDashboard"
          },
          {
            "page": "EventsSalesKit",
            "label": "תפריטים, אפסיילים, תנאים ופרומפט הסוכן. השינויים נכנסים מיידית."
          },
          {
            "page": "EventContracts",
            "label": "חוזה דיגיטלי עם חתימה אונליין — לכל אירוע ננעל"
          },
          {
            "page": "EventVendors",
            "label": "🤝 ספקי אירועים"
          },
          {
            "page": "EventVendorDetails",
            "label": "EventVendorDetails"
          },
          {
            "page": "EventVendorCampaign",
            "label": "EventVendorCampaign"
          }
        ]
      },
      {
        "label": "בינה מלאכותית",
        "pages": [
          {
            "page": "AIHub",
            "label": "🤖 כלי AI"
          },
          {
            "page": "AiDashboard",
            "label": "ניהול בסיס הידע של המערכת החכמה"
          },
          {
            "page": "AgentInbox",
            "label": "תיבת הסוכן של אלינא"
          },
          {
            "page": "AgentPrompts",
            "label": "כתוב לכל סוכן מי הוא, מה תפקידו ואיך לענות. בלי פרומפט — הסוכן לא יודע מה לעשות."
          },
          {
            "page": "Scanner",
            "label": "🔍 סורק חכם"
          }
        ]
      }
    ]
  },
  {
    "key": "settings",
    "title": "הגדרות",
    "subtitle": "חיבורים, הרשאות ומיתוג",
    "icon": "Settings",
    "groups": [
      {
        "label": "המערכת שלי",
        "pages": [
          {
            "page": "AdminSettings",
            "label": "מרכז הגדרות וחיבורים"
          },
          {
            "page": "AppBuilder",
            "label": "AppBuilder"
          },
          {
            "page": "Branding",
            "label": "מיתוג המסעדה 🎨"
          },
          {
            "page": "NotificationSettings",
            "label": "התראות וואטסאפ 🔔"
          },
          {
            "page": "LocationSettings",
            "label": "📍 הגדרות מיקום העסק"
          },
          {
            "page": "PushNotifications",
            "label": "שלח הודעת Push לעובדים או קבוצות"
          }
        ]
      },
      {
        "label": "חיבורים",
        "pages": [
          {
            "page": "Integrations",
            "label": "חבר את החשבונות שלך — Instagram, Google, Telegram, POS. הטוקנים נשמרים בסכימה שלך בלבד."
          },
          {
            "page": "BeecommIntegration",
            "label": "BeecommIntegration"
          },
          {
            "page": "AdminWhatsApp",
            "label": "סטטוס החיבור, שליחת בדיקה, ושליחות שיווקיות (broadcast) ללקוחות. הקוד מחבר אוטומטית כל קונפירמציית הזמנה — הדף הזה מאפשר לך לוודא שזה עובד ולשלוח באופן יזום."
          },
          {
            "page": "AdminWhatsAppInbox",
            "label": "הודעות נכנסות מ-WhatsApp מופיעות כאן בזמן אמת (אחרי שתגדיר webhook ב-Twilio). לחץ על שיחה כדי לראות את ההיסטוריה ולהגיב."
          },
          {
            "page": "AdminWhatsAppTemplates",
            "label": "📨 WhatsApp Templates"
          }
        ]
      }
    ]
  }
];

export const surfaceOf = (page) =>
  SURFACES.find((s) => s.groups.some((g) => g.pages.some((p) => p.page === page)))?.key || null;
