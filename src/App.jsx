import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import InstallPrompt from '@/components/InstallPrompt';
import { base44 } from '@/api/base44Client';
import React from 'react';
import TrainingVideos from './pages/TrainingVideos';
import JobApplication from './pages/JobApplication';
import EventsInquiry from './pages/EventsInquiry';
import EventsPayment from './pages/EventsPayment';
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
import PublicReservation from './pages/PublicReservation';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

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
  if (role === 'admin') return <Navigate to="/Dashboard" replace />;
  return <Navigate to="/EmployeeHome" replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
          <div className="text-center space-y-6 p-8 bg-white rounded-2xl shadow-lg max-w-sm w-full">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">🔐</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">TOP ALENA</h2>
              <p className="text-slate-500">יש להתחבר כדי להמשיך</p>
            </div>
            <button
              onClick={navigateToLogin}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              התחברות למערכת
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
      {Object.entries(Pages).map(([path, Page]) => (
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
          <Route path="/QueueJoin" element={<QueueJoin />} />
          <Route path="/QueueGame" element={<QueueGame />} />
          <Route path="/QueueFeedback" element={<QueueFeedback />} />
          <Route path="/PublicReservation" element={<PublicReservation />} />
          <Route path="/PrivacyAndAccessibility" element={<PrivacyAndAccessibility />} />
          <Route path="/JobApplication" element={<JobApplication />} />
          <Route path="/apply" element={<JobApplication />} />
          <Route path="/EventsInquiry" element={<EventsInquiry />} />
          <Route path="/events" element={<EventsInquiry />} />
          <Route path="/EventsPayment" element={<EventsPayment />} />

          {/* דורש התחברות */}
          <Route path="/MarketingCampaigns" element={<MarketingCampaigns />} />
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