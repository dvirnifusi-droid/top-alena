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
import AvailabilityForm from './pages/AvailabilityForm';
import AvailabilityFormSettings from './pages/AvailabilityFormSettings';
import AvailabilityRequests from './pages/AvailabilityRequests';
import BeecommIntegration from './pages/BeecommIntegration';
import BriefingManagement from './pages/BriefingManagement';
import Checklists from './pages/Checklists';
import CustomerClub from './pages/CustomerClub';
import CustomerDetails from './pages/CustomerDetails';
import CustomerSurvey from './pages/CustomerSurvey';
import CustomerSurveys from './pages/CustomerSurveys';
import Dashboard from './pages/Dashboard';
import EmployeeDetails from './pages/EmployeeDetails';
import EmployeeFeedback from './pages/EmployeeFeedback';
import EmployeeHome from './pages/EmployeeHome';
import EmployeeReports from './pages/EmployeeReports';
import Employees from './pages/Employees';
import Incidents from './pages/Incidents';
import InvoiceDetails from './pages/InvoiceDetails';
import Invoices from './pages/Invoices';
import Leaderboard from './pages/Leaderboard';
import LeaveRequests from './pages/LeaveRequests';
import MarketingAI from './pages/MarketingAI';
import MarketingDashboard from './pages/MarketingDashboard';
import MessageTemplates from './pages/MessageTemplates';
import MyPerformance from './pages/MyPerformance';
import PositionsManagement from './pages/PositionsManagement';
import PublicReservation from './pages/PublicReservation';
import PublicReservationSettings from './pages/PublicReservationSettings';
import Reports from './pages/Reports';
import RevenueForecasting from './pages/RevenueForecasting';
import SeatingSetup from './pages/SeatingSetup';
import ShiftEndReport from './pages/ShiftEndReport';
import ShiftEndReportDetails from './pages/ShiftEndReportDetails';
import SmartPrediction from './pages/SmartPrediction';
import SupplierDetails from './pages/SupplierDetails';
import Suppliers from './pages/Suppliers';
import SurveyQRCodes from './pages/SurveyQRCodes';
import TablesManagement from './pages/TablesManagement';
import TipReportDetails from './pages/TipReportDetails';
import Tips from './pages/Tips';
import Training from './pages/Training';
import UploadChecklists from './pages/UploadChecklists';
import WaiterTables from './pages/WaiterTables';
import WorkScheduling from './pages/WorkScheduling';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountantExportView": AccountantExportView,
    "AiDashboard": AiDashboard,
    "AvailabilityForm": AvailabilityForm,
    "AvailabilityFormSettings": AvailabilityFormSettings,
    "AvailabilityRequests": AvailabilityRequests,
    "BeecommIntegration": BeecommIntegration,
    "BriefingManagement": BriefingManagement,
    "Checklists": Checklists,
    "CustomerClub": CustomerClub,
    "CustomerDetails": CustomerDetails,
    "CustomerSurvey": CustomerSurvey,
    "CustomerSurveys": CustomerSurveys,
    "Dashboard": Dashboard,
    "EmployeeDetails": EmployeeDetails,
    "EmployeeFeedback": EmployeeFeedback,
    "EmployeeHome": EmployeeHome,
    "EmployeeReports": EmployeeReports,
    "Employees": Employees,
    "Incidents": Incidents,
    "InvoiceDetails": InvoiceDetails,
    "Invoices": Invoices,
    "Leaderboard": Leaderboard,
    "LeaveRequests": LeaveRequests,
    "MarketingAI": MarketingAI,
    "MarketingDashboard": MarketingDashboard,
    "MessageTemplates": MessageTemplates,
    "MyPerformance": MyPerformance,
    "PositionsManagement": PositionsManagement,
    "PublicReservation": PublicReservation,
    "PublicReservationSettings": PublicReservationSettings,
    "Reports": Reports,
    "RevenueForecasting": RevenueForecasting,
    "SeatingSetup": SeatingSetup,
    "ShiftEndReport": ShiftEndReport,
    "ShiftEndReportDetails": ShiftEndReportDetails,
    "SmartPrediction": SmartPrediction,
    "SupplierDetails": SupplierDetails,
    "Suppliers": Suppliers,
    "SurveyQRCodes": SurveyQRCodes,
    "TablesManagement": TablesManagement,
    "TipReportDetails": TipReportDetails,
    "Tips": Tips,
    "Training": Training,
    "UploadChecklists": UploadChecklists,
    "WaiterTables": WaiterTables,
    "WorkScheduling": WorkScheduling,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};