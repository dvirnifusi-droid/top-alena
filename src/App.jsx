import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useParams } from 'react-router-dom';

// Short URL /c/<token> → /EventContractSign?token=<token>
function EventContractSignRedirect() {
  const { token } = useParams();
  return <Navigate to={`/EventContractSign?token=${encodeURIComponent(token || '')}`} replace />;
}
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import InstallPrompt from '@/components/InstallPrompt';
import { base44 } from '@/api/base44Client';
import React from 'react';
import TrainingVideos from './pages/TrainingVideos';
import JobApplication from './pages/JobApplication';
import EmployeeComplete from './pages/EmployeeComplete';
import JoinTeam from './pages/JoinTeam';
import EventsInquiry from './pages/EventsInquiry';
import EventsPayment from './pages/EventsPayment';
import EventContractSign from './pages/EventContractSign';
import ReservationView from './pages/ReservationView';
import EventInquiryThanks from './pages/EventInquiryThanks';
import Unsubscribe from './pages/Unsubscribe';
import MemberCard from './pages/MemberCard';
import ClubLeaderboard from './pages/ClubLeaderboard';
import Waiter from './pages/Waiter';
import QueueJoin from './pages/QueueJoin';
import QueueDashboard from './pages/QueueDashboard';
import QueueHistory from './pages/QueueHistory';
import QueueAnalytics from './pages/QueueAnalytics';
import QueueGame from './pages/QueueGame';
import GamesAdmin from './pages/GamesAdmin';
import GameQuestionsAdmin from './pages/GameQuestionsAdmin';
import QueueFeedback from './pages/QueueFeedback';
import MarketingCampaigns from './pages/MarketingCampaigns';
import PrivacyAndAccessibility from './pages/PrivacyAndAccessibility';
import DevicesDashboard from './pages/DevicesDashboard';
import DataExport from './pages/DataExport';
import UserGuide from './pages/UserGuide';
import InstagramStudio from './pages/InstagramStudio';
import Login from './pages/Login';
import GoogleHandoff from './pages/GoogleHandoff';
import PublicReservation from './pages/PublicReservation';
import Signup from './pages/Signup';
import ClubJoin from './pages/ClubJoin';
import ClubUpdate from './pages/ClubUpdate';
import ClubQR from './pages/ClubQR';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import PlatformLayout from '@/components/platform/PlatformLayout';

// Super-Admin pages render in their own standalone shell (top-nav + owner gate),
// NOT inside a tenant's sidebar. PlatformSettings stays tenant-level (it's the
// per-restaurant module toggles), so it is intentionally NOT in this set.
const PLATFORM_PAGES = new Set([
  'PlatformAdmin', 'PlatformAdminPending', 'PlatformAdminTenants',
  'PlatformFeatures', 'PlatformSubscriptions', 'PlatformUsers',
  'PlatformInvites', 'PlatformWhiteLabel',
]);

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}><ErrorBoundary key={currentPageName} label={currentPageName}>{children}</ErrorBoundary></Layout>
  : <ErrorBoundary key={currentPageName} label={currentPageName}>{children}</ErrorBoundary>;

const RoleBasedHome = () => {
  const [role, setRole] = React.useState(null);
  React.useEffect(() => {
    base44.auth.me().then(u => setRole(u?.role || 'user')).catch(() => setRole('user'));
  }, []);
  if (role === null) return null;
  if (role === 'admin' || role === 'owner') return <Navigate to="/Dashboard" replace />;
  return <Navigate to="/EmployeeHome" replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, refresh } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Skip the intermediate "please log in" card — go straight to the login page.
      return <Navigate to="/login" replace />;
    } else {
      // Non-401 auth failure (type 'unknown' or anything else) — show a simple
      // retry card instead of rendering the app with a null user.
      return (
        <div className="fixed inset-0 flex items-center justify-center p-4" dir="rtl">
          <div className="text-center max-w-sm bg-white rounded-2xl shadow-lg p-8">
            <h1 className="text-xl font-bold text-slate-900 mb-4">שגיאה בטעינת המשתמש</h1>
            <button
              onClick={() => refresh()}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl"
            >
              נסה שוב
            </button>
          </div>
        </div>
      );
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<RoleBasedHome />} />
      {Object.entries(Pages).filter(([path]) => !PLATFORM_PAGES.has(path)).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      {Object.entries(Pages).filter(([path]) => PLATFORM_PAGES.has(path)).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <PlatformLayout currentPageName={path}>
              <ErrorBoundary key={path} label={path}><Page /></ErrorBoundary>
            </PlatformLayout>
          }
        />
      ))}
      <Route path="/TrainingVideos" element={<LayoutWrapper currentPageName="TrainingVideos"><TrainingVideos /></LayoutWrapper>} />
      <Route path="/QueueDashboard" element={<LayoutWrapper currentPageName="QueueDashboard"><QueueDashboard /></LayoutWrapper>} />
      <Route path="/QueueHistory" element={<LayoutWrapper currentPageName="QueueHistory"><QueueHistory /></LayoutWrapper>} />
      <Route path="/QueueAnalytics" element={<LayoutWrapper currentPageName="QueueAnalytics"><QueueAnalytics /></LayoutWrapper>} />
      <Route path="/GamesAdmin" element={<LayoutWrapper currentPageName="GamesAdmin"><GamesAdmin /></LayoutWrapper>} />
      <Route path="/GameQuestionsAdmin" element={<LayoutWrapper currentPageName="GameQuestionsAdmin"><GameQuestionsAdmin /></LayoutWrapper>} />
      <Route path="/DevicesDashboard" element={<LayoutWrapper currentPageName="DevicesDashboard"><DevicesDashboard /></LayoutWrapper>} />
      <Route path="/DataExport" element={<LayoutWrapper currentPageName="DataExport"><DataExport /></LayoutWrapper>} />
      <Route path="/UserGuide" element={<LayoutWrapper currentPageName="UserGuide"><UserGuide /></LayoutWrapper>} />
      <Route path="/InstagramStudio" element={<LayoutWrapper currentPageName="InstagramStudio"><InstagramStudio /></LayoutWrapper>} />
      {/* Short URL aliases — for QR codes, ads, and easy sharing.
          /r → reservation, /j → job, /e → events, /q → queue. */}
      <Route path="/r" element={<Navigate to="/PublicReservation" replace />} />
      <Route path="/j" element={<Navigate to="/apply" replace />} />
      <Route path="/e" element={<Navigate to="/EventsInquiry" replace />} />
      <Route path="/q" element={<Navigate to="/QueueJoin" replace />} />
      <Route path="/c/:token" element={<EventContractSignRedirect />} />
      {/* Pretty URLs from the WhatsApp notification, redirect to the actual routes */}
      <Route path="/PlatformAdmin/PendingApproval" element={<Navigate to="/PlatformAdminPending" replace />} />
      <Route path="/PlatformAdmin/Tenants" element={<Navigate to="/PlatformAdminTenants" replace />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          {/* ציבורי - ללא התחברות */}
          <Route path="/login" element={<Login />} />
          <Route path="/GoogleHandoff" element={<GoogleHandoff />} />
          <Route path="/QueueJoin" element={<QueueJoin />} />
          <Route path="/QueueGame" element={<QueueGame />} />
          <Route path="/QueueFeedback" element={<QueueFeedback />} />
          <Route path="/PublicReservation" element={<PublicReservation />} />
          <Route path="/EventInquiryThanks" element={<EventInquiryThanks />} />
          <Route path="/Unsubscribe" element={<Unsubscribe />} />
          <Route path="/Signup" element={<Signup />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/ClubJoin" element={<ClubJoin />} />
          <Route path="/club" element={<ClubJoin />} />
          <Route path="/ClubUpdate" element={<ClubUpdate />} />
          <Route path="/MemberCard" element={<MemberCard />} />
          <Route path="/ClubLeaderboard" element={<ClubLeaderboard />} />
          <Route path="/ClubQR" element={<ClubQR />} />
          <Route path="/PrivacyAndAccessibility" element={<PrivacyAndAccessibility />} />
          <Route path="/JobApplication" element={<JobApplication />} />
          <Route path="/apply" element={<JobApplication />} />
          <Route path="/EmployeeComplete" element={<EmployeeComplete />} />
          <Route path="/JoinTeam" element={<JoinTeam />} />
          <Route path="/join" element={<JoinTeam />} />
          <Route path="/EventsInquiry" element={<EventsInquiry />} />
          <Route path="/events" element={<EventsInquiry />} />
          <Route path="/EventsPayment" element={<EventsPayment />} />
          <Route path="/EventContractSign" element={<EventContractSign />} />
          <Route path="/ReservationView" element={<ReservationView />} />
          <Route path="/Waiter" element={<Waiter />} />
          <Route path="/menu" element={<Waiter />} />

          {/* דורש התחברות */}
          <Route path="/*" element={
            <AuthProvider>
              <AuthenticatedApp />
            </AuthProvider>
          } />
        </Routes>
        <Toaster />
        <InstallPrompt />
      </Router>
    </QueryClientProvider>
  )
}

export default App