import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';
import React from 'react';
import TrainingVideos from './pages/TrainingVideos';
import QueueJoin from './pages/QueueJoin';
import QueueDashboard from './pages/QueueDashboard';
import QueueAnalytics from './pages/QueueAnalytics';
import QueueGame from './pages/QueueGame';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

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
      // Redirect to login automatically
      navigateToLogin();
      return null;
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
      <Route path="/QueueJoin" element={<QueueJoin />} />
      <Route path="/QueueDashboard" element={<LayoutWrapper currentPageName="QueueDashboard"><QueueDashboard /></LayoutWrapper>} />
      <Route path="/QueueAnalytics" element={<LayoutWrapper currentPageName="QueueAnalytics"><QueueAnalytics /></LayoutWrapper>} />
      <Route path="/QueueGame" element={<QueueGame />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App