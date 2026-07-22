/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountantExportView from './pages/AccountantExportView';
import AiDashboard from './pages/AiDashboard';
import ApparelManagement from './pages/ApparelManagement';
import AvailabilityForm from './pages/AvailabilityForm';
import AvailabilityFormSettings from './pages/AvailabilityFormSettings';
import AvailabilityRequests from './pages/AvailabilityRequests';
import BeecommIntegration from './pages/BeecommIntegration';
import BriefingManagement from './pages/BriefingManagement';
import CharacterLounge from './pages/CharacterLounge';
import Checklists from './pages/Checklists';
import ClubRedeem from './pages/ClubRedeem';
import CourierDashboard from './pages/CourierDashboard';
import CourierTracking from './pages/CourierTracking';
import Couriers from './pages/Couriers';
import CustomerClub from './pages/CustomerClub';
import CustomerDetails from './pages/CustomerDetails';
import CustomerSurvey from './pages/CustomerSurvey';
import CustomerSurveys from './pages/CustomerSurveys';
import Dashboard from './pages/Dashboard';
import Deliveries from './pages/Deliveries';
import DeliveryCustomerClub from './pages/DeliveryCustomerClub';
import EmailInvoiceSettings from './pages/EmailInvoiceSettings';
import EmployeeDetails from './pages/EmployeeDetails';
import EmployeeFeedback from './pages/EmployeeFeedback';
import EmployeeHome from './pages/EmployeeHome';
import EmployeeReports from './pages/EmployeeReports';
import Employees from './pages/Employees';
import EventsPrivate from './pages/EventsPrivate';
import EventsSalesKit from './pages/EventsSalesKit';
import EventContracts from './pages/EventContracts';
import EventContractSign from './pages/EventContractSign';
import ReservationView from './pages/ReservationView';
import GamificationAdmin from './pages/GamificationAdmin';
import GamificationCenter from './pages/GamificationCenter';
import Incidents from './pages/Incidents';
import InterviewSettings from './pages/InterviewSettings';
import InvoiceDetails from './pages/InvoiceDetails';
import LaborCost from './pages/LaborCost';
import Invoices from './pages/Invoices';
import OnboardingQuestionnaire from './pages/OnboardingQuestionnaire';
import Leaderboard from './pages/Leaderboard';
import LeaveRequests from './pages/LeaveRequests';
import LocationSettings from './pages/LocationSettings';
import MarketingAdvisor from './pages/MarketingAdvisor';
import MarketingAI from './pages/MarketingAI';
import MarketingDashboard from './pages/MarketingDashboard';
import MarketingAgentsHub from './pages/MarketingAgentsHub';
import MessageTemplates from './pages/MessageTemplates';
import MyPerformance from './pages/MyPerformance';
import MySchedule from './pages/MySchedule';
import PositionsManagement from './pages/PositionsManagement';
import PublicReservation from './pages/PublicReservation';
import PublicReservationSettings from './pages/PublicReservationSettings';
import ReservationsAnalytics from './pages/ReservationsAnalytics';
import EventVendors from './pages/EventVendors';
import EventVendorDetails from './pages/EventVendorDetails';
import EventVendorCampaign from './pages/EventVendorCampaign';
import EventsDashboard from './pages/EventsDashboard';
import AdminWhatsAppTemplates from './pages/AdminWhatsAppTemplates';
import DepositSettings from './pages/DepositSettings';
import VoiceTest from './pages/VoiceTest';
import Popups from './pages/Popups';
import SpecialsAdmin from './pages/SpecialsAdmin';
import AgentInbox from './pages/AgentInbox';
import AgentPrompts from './pages/AgentPrompts';
import PushNotifications from './pages/PushNotifications';
import RecruitmentInterviews from './pages/RecruitmentInterviews';
import Reports from './pages/Reports';
import RestroomCleaning from './pages/RestroomCleaning';
import RevenueForecasting from './pages/RevenueForecasting';
import SeatingSetup from './pages/SeatingSetup';
import ShiftChat from './pages/ShiftChat';
import ShiftEndReport from './pages/ShiftEndReport';
import ShiftEndReportDetails from './pages/ShiftEndReportDetails';
import SmartPrediction from './pages/SmartPrediction';
import StoriesAnalytics from './pages/StoriesAnalytics';
import StoriesArchive from './pages/StoriesArchive';
import StoriesLeaderboard from './pages/StoriesLeaderboard';
import StoriesNotifications from './pages/StoriesNotifications';
import SupplierDetails from './pages/SupplierDetails';
import Suppliers from './pages/Suppliers';
import OrderList from './pages/OrderList';
import Scanner from './pages/Scanner';
import Setup from './pages/Setup';
import OperatingCosts from './pages/OperatingCosts';
import SurveyQRCodes from './pages/SurveyQRCodes';
import TablesManagement from './pages/TablesManagement';
import TipReportDetails from './pages/TipReportDetails';
import Tips from './pages/Tips';
import Training from './pages/Training';
import UploadChecklists from './pages/UploadChecklists';
import Waiter from './pages/Waiter';
import WaiterAdmin from './pages/WaiterAdmin';
import WaiterTables from './pages/WaiterTables';
import WorkScheduling from './pages/WorkScheduling';
import SalesGoalTemplates from './pages/SalesGoalTemplates';
import BeecommLive from './pages/BeecommLive';
import AdminReopenShifts from './pages/AdminReopenShifts';
import AdminGomileyCookies from './pages/AdminGomileyCookies';
import KitchenScreen from './pages/KitchenScreen';
import AdminAmbient from './pages/AdminAmbient';
import AdminWhatsApp from './pages/AdminWhatsApp';
import AdminWhatsAppInbox from './pages/AdminWhatsAppInbox';
import AdminSettings from './pages/AdminSettings';
import NotificationSettings from './pages/NotificationSettings';
import EventsHub from './pages/EventsHub';
import MarketingHub from './pages/MarketingHub';
import OperationsHub from './pages/OperationsHub';
import NetworkHQ from './pages/NetworkHQ';
import NetworkDashboard from './pages/NetworkDashboard';
import BranchNetworkTasks from './pages/BranchNetworkTasks';
import StoriesHub from './pages/StoriesHub';
import EmployeesHub from './pages/EmployeesHub';
import RecruitmentHub from './pages/RecruitmentHub';
import DeliveriesHub from './pages/DeliveriesHub';
import AIHub from './pages/AIHub';
import QueueHub from './pages/QueueHub';
import ColorPreview from './pages/ColorPreview';
import Recipes from './pages/Recipes';
import Commissary from './pages/Commissary';
import CommissaryOrders from './pages/CommissaryOrders';
import BranchCommissary from './pages/BranchCommissary';
import CashFlow from './pages/CashFlow';
import MenuManagement from './pages/MenuManagement';
import PrepSheet from './pages/PrepSheet';
import DishGuide from './pages/DishGuide';
import PlatformAdmin from './pages/PlatformAdmin';
import PlatformAdminPending from './pages/PlatformAdminPending';
import PlatformAdminTenants from './pages/PlatformAdminTenants';
import PlatformSettings from './pages/PlatformSettings';
import PlatformFeatures from './pages/PlatformFeatures';
import PlatformSubscriptions from './pages/PlatformSubscriptions';
import PlatformUsers from './pages/PlatformUsers';
import PlatformInvites from './pages/PlatformInvites';
import PlatformWhiteLabel from './pages/PlatformWhiteLabel';
import Branding from './pages/Branding';
import Integrations from './pages/Integrations';
import EmployeeComplete from './pages/EmployeeComplete';
import Signup from './pages/Signup';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountantExportView": AccountantExportView,
    "AiDashboard": AiDashboard,
    "ApparelManagement": ApparelManagement,
    "AvailabilityForm": AvailabilityForm,
    "AvailabilityFormSettings": AvailabilityFormSettings,
    "AvailabilityRequests": AvailabilityRequests,
    "BeecommIntegration": BeecommIntegration,
    "BriefingManagement": BriefingManagement,
    "CharacterLounge": CharacterLounge,
    "Checklists": Checklists,
    "ClubRedeem": ClubRedeem,
    "CourierDashboard": CourierDashboard,
    "CourierTracking": CourierTracking,
    "Couriers": Couriers,
    "CustomerClub": CustomerClub,
    "CustomerDetails": CustomerDetails,
    "CustomerSurvey": CustomerSurvey,
    "CustomerSurveys": CustomerSurveys,
    "Dashboard": Dashboard,
    "Deliveries": Deliveries,
    "DeliveryCustomerClub": DeliveryCustomerClub,
    "EmailInvoiceSettings": EmailInvoiceSettings,
    "EmployeeDetails": EmployeeDetails,
    "EmployeeFeedback": EmployeeFeedback,
    "EmployeeHome": EmployeeHome,
    "EmployeeReports": EmployeeReports,
    "Employees": Employees,
    "EventsPrivate": EventsPrivate,
    "EventsSalesKit": EventsSalesKit,
    "EventContracts": EventContracts,
    "EventContractSign": EventContractSign,
    "ReservationView": ReservationView,
    "GamificationAdmin": GamificationAdmin,
    "GamificationCenter": GamificationCenter,
    "Incidents": Incidents,
    "InterviewSettings": InterviewSettings,
    "InvoiceDetails": InvoiceDetails,
    "LaborCost": LaborCost,
    "Invoices": Invoices,
    "OnboardingQuestionnaire": OnboardingQuestionnaire,
    "Leaderboard": Leaderboard,
    "LeaveRequests": LeaveRequests,
    "LocationSettings": LocationSettings,
    "MarketingAdvisor": MarketingAdvisor,
    "MarketingAI": MarketingAI,
    "MarketingDashboard": MarketingDashboard,
    "MarketingAgentsHub": MarketingAgentsHub,
    "MessageTemplates": MessageTemplates,
    "MyPerformance": MyPerformance,
    "MySchedule": MySchedule,
    "PositionsManagement": PositionsManagement,
    "PublicReservation": PublicReservation,
    "PublicReservationSettings": PublicReservationSettings,
    "ReservationsAnalytics": ReservationsAnalytics,
    "EventVendors": EventVendors,
    "EventVendorDetails": EventVendorDetails,
    "EventVendorCampaign": EventVendorCampaign,
    "EventsDashboard": EventsDashboard,
    "AdminWhatsAppTemplates": AdminWhatsAppTemplates,
    "DepositSettings": DepositSettings,
    "VoiceTest": VoiceTest,
    "Popups": Popups,
    "SpecialsAdmin": SpecialsAdmin,
    "AgentInbox": AgentInbox,
    "AgentPrompts": AgentPrompts,
    "PushNotifications": PushNotifications,
    "RecruitmentInterviews": RecruitmentInterviews,
    "Reports": Reports,
    "RestroomCleaning": RestroomCleaning,
    "RevenueForecasting": RevenueForecasting,
    "SeatingSetup": SeatingSetup,
    "ShiftChat": ShiftChat,
    "ShiftEndReport": ShiftEndReport,
    "ShiftEndReportDetails": ShiftEndReportDetails,
    "SmartPrediction": SmartPrediction,
    "StoriesAnalytics": StoriesAnalytics,
    "StoriesArchive": StoriesArchive,
    "StoriesLeaderboard": StoriesLeaderboard,
    "StoriesNotifications": StoriesNotifications,
    "SupplierDetails": SupplierDetails,
    "Suppliers": Suppliers,
    "OrderList": OrderList,
    "Scanner": Scanner,
    "Setup": Setup,
    "OperatingCosts": OperatingCosts,
    "SurveyQRCodes": SurveyQRCodes,
    "TablesManagement": TablesManagement,
    "TipReportDetails": TipReportDetails,
    "Tips": Tips,
    "Training": Training,
    "UploadChecklists": UploadChecklists,
    "Waiter": Waiter,
    "WaiterAdmin": WaiterAdmin,
    "WaiterTables": WaiterTables,
    "WorkScheduling": WorkScheduling,
    "SalesGoalTemplates": SalesGoalTemplates,
    "BeecommLive": BeecommLive,
    "AdminReopenShifts": AdminReopenShifts,
    "AdminGomileyCookies": AdminGomileyCookies,
    "KitchenScreen": KitchenScreen,
    "AdminAmbient": AdminAmbient,
    "AdminWhatsApp": AdminWhatsApp,
    "AdminWhatsAppInbox": AdminWhatsAppInbox,
    "AdminSettings": AdminSettings,
    "NotificationSettings": NotificationSettings,
    "EventsHub": EventsHub,
    "MarketingHub": MarketingHub,
    "OperationsHub": OperationsHub,
    "NetworkHQ": NetworkHQ,
    "NetworkDashboard": NetworkDashboard,
    "BranchNetworkTasks": BranchNetworkTasks,
    "StoriesHub": StoriesHub,
    "EmployeesHub": EmployeesHub,
    "RecruitmentHub": RecruitmentHub,
    "DeliveriesHub": DeliveriesHub,
    "AIHub": AIHub,
    "QueueHub": QueueHub,
    "ColorPreview": ColorPreview,
    "Recipes": Recipes,
    "Commissary": Commissary,
    "CommissaryOrders": CommissaryOrders,
    "BranchCommissary": BranchCommissary,
    "CashFlow": CashFlow,
    "MenuManagement": MenuManagement,
    "PrepSheet": PrepSheet,
    "DishGuide": DishGuide,
    "PlatformAdmin": PlatformAdmin,
    "PlatformAdminPending": PlatformAdminPending,
    "PlatformAdminTenants": PlatformAdminTenants,
    "PlatformSettings": PlatformSettings,
    "PlatformFeatures": PlatformFeatures,
    "PlatformSubscriptions": PlatformSubscriptions,
    "PlatformUsers": PlatformUsers,
    "PlatformInvites": PlatformInvites,
    "PlatformWhiteLabel": PlatformWhiteLabel,
    "Branding": Branding,
    "Integrations": Integrations,
    "EmployeeComplete": EmployeeComplete,
    "Signup": Signup,
}

export const pagesConfig = {
    mainPage: "CharacterLounge",
    Pages: PAGES,
    Layout: __Layout,
};