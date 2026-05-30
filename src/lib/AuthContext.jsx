import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const refresh = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const me = await base44.auth.me();
      setUser(me);
      setIsAuthenticated(true);
    } catch (err) {
      setUser(null);
      setIsAuthenticated(false);
      if (err.status === 401) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({ type: 'unknown', message: err.message || 'Auth check failed' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const me = await base44.auth.login(email, password);
    setUser(me);
    setIsAuthenticated(true);
    setAuthError(null);
    return me;
  };

  const register = async (email, password) => {
    const me = await base44.auth.register(email, password);
    setUser(me);
    setIsAuthenticated(true);
    setAuthError(null);
    return me;
  };

  const logout = () => {
    base44.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    const from = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?from=${from}`;
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      // legacy fields kept for compatibility with existing pages
      isLoadingPublicSettings: false,
      appPublicSettings: null,
      authError,
      login,
      register,
      logout,
      navigateToLogin,
      checkAppState: refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
