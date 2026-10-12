import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile } from '../types';
import { liveflowService, AGENT_UNAUTHORIZED_EVENT } from '../lib/api';

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  needsSetup: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  setupAdmin: (payload: { full_name: string; username: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    async function initAuth() {
      try {
        const status = await liveflowService.getAuthStatus();
        setNeedsSetup(status.needsSetup);
        if (!status.needsSetup && liveflowService.hasAgentToken()) {
          setProfile(await liveflowService.getCurrentProfile());
        }
      } catch (err) {
        console.warn('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    }
    initAuth();

    const onUnauthorized = () => setProfile(null);
    window.addEventListener(AGENT_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AGENT_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setProfile(await liveflowService.login(username, password));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const setupAdmin = async (payload: { full_name: string; username: string; password: string }) => {
    try {
      setProfile(await liveflowService.setupAdmin(payload));
      setNeedsSetup(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Setup failed' };
    }
  };

  const logout = async () => {
    try {
      await liveflowService.logout();
    } catch {
      // Token is cleared locally either way
    }
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin';
  const isAgent = profile?.role === 'agent' || isAdmin;

  return (
    <AuthContext.Provider value={{ profile, loading, needsSetup, isAdmin, isAgent, login, setupAdmin, logout }}>
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
