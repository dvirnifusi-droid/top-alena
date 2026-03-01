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
import Dashboard from './pages/Dashboard';
import Training from './pages/Training';
import Employees from './pages/Employees';
import Checklists from './pages/Checklists';
import Incidents from './pages/Incidents';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import UploadChecklists from './pages/UploadChecklists';
import AiDashboard from './pages/AiDashboard';
import Leaderboard from './pages/Leaderboard';
import MyPerformance from './pages/MyPerformance';
import BeecommIntegration from './pages/BeecommIntegration';
import EmployeeDetails from './pages/EmployeeDetails';
import SupplierDetails from './pages/SupplierDetails';
import Invoices from './pages/Invoices';
import InvoiceDetails from './pages/InvoiceDetails';
import WaiterTables from './pages/WaiterTables';
import TablesManagement from './pages/TablesManagement';
import CustomerSurvey from './pages/CustomerSurvey';
import AccountantExportView from './pages/AccountantExportView';
import MarketingAI from './pages/MarketingAI';
import SeatingSetup from './pages/SeatingSetup';
import PublicReservation from './pages/PublicReservation';
import PublicReservationSettings from './pages/PublicReservationSettings';
import CustomerClub from './pages/CustomerClub';
import SmartPrediction from './pages/SmartPrediction';
import WorkScheduling from './pages/WorkScheduling';
import Tips from './pages/Tips';
import EmployeeFeedback from './pages/EmployeeFeedback';
import PositionsManagement from './pages/PositionsManagement';
import SurveyQRCodes from './pages/SurveyQRCodes';
import ShiftEndReport from './pages/ShiftEndReport';
import CustomerSurveys from './pages/CustomerSurveys';
import TipReportDetails from './pages/TipReportDetails';
import ShiftEndReportDetails from './pages/ShiftEndReportDetails';
import CustomerDetails from './pages/CustomerDetails';
import RevenueForecasting from './pages/RevenueForecasting';
import BriefingManagement from './pages/BriefingManagement';
import EmployeeHome from './pages/EmployeeHome';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Training": Training,
    "Employees": Employees,
    "Checklists": Checklists,
    "Incidents": Incidents,
    "Suppliers": Suppliers,
    "Reports": Reports,
    "UploadChecklists": UploadChecklists,
    "AiDashboard": AiDashboard,
    "Leaderboard": Leaderboard,
    "MyPerformance": MyPerformance,
    "BeecommIntegration": BeecommIntegration,
    "EmployeeDetails": EmployeeDetails,
    "SupplierDetails": SupplierDetails,
    "Invoices": Invoices,
    "InvoiceDetails": InvoiceDetails,
    "WaiterTables": WaiterTables,
    "TablesManagement": TablesManagement,
    "CustomerSurvey": CustomerSurvey,
    "AccountantExportView": AccountantExportView,
    "MarketingAI": MarketingAI,
    "SeatingSetup": SeatingSetup,
    "PublicReservation": PublicReservation,
    "PublicReservationSettings": PublicReservationSettings,
    "CustomerClub": CustomerClub,
    "SmartPrediction": SmartPrediction,
    "WorkScheduling": WorkScheduling,
    "Tips": Tips,
    "EmployeeFeedback": EmployeeFeedback,
    "PositionsManagement": PositionsManagement,
    "SurveyQRCodes": SurveyQRCodes,
    "ShiftEndReport": ShiftEndReport,
    "CustomerSurveys": CustomerSurveys,
    "TipReportDetails": TipReportDetails,
    "ShiftEndReportDetails": ShiftEndReportDetails,
    "CustomerDetails": CustomerDetails,
    "RevenueForecasting": RevenueForecasting,
    "BriefingManagement": BriefingManagement,
    "EmployeeHome": EmployeeHome,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};