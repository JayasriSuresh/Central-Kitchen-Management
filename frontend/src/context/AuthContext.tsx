import React, { createContext, useContext, useState } from 'react';

interface AuthState {
  user: any | null;
  tenantId: string | null;
  accessToken: string | null;
  activePortal: string | null;
  workspaces?: any[];
  permissionCodes?: string[]; // cached from JWT payload
}

interface AuthContextType extends AuthState {
  setAuth: (data: Partial<AuthState>) => void;
  logout: () => void;
  /** Returns true if the user has the given permission code (e.g. 'INVENTORY_READ').
   *  Super-admins (permissionCodes includes '*') always return true. */
  hasPermission: (code: string) => boolean;
  /** Returns true if the current user is a super-admin (wildcard permissions). */
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const stored = localStorage.getItem('auth_state');
    return stored
      ? JSON.parse(stored)
      : { user: null, tenantId: null, accessToken: null, activePortal: null, workspaces: [], permissionCodes: [] };
  });

  const setAuth = (data: Partial<AuthState>) => {
    setAuthState((prev) => {
      const newState = { ...prev, ...data };
      localStorage.setItem('auth_state', JSON.stringify(newState));
      return newState;
    });
  };

  const logout = () => {
    localStorage.removeItem('auth_state');
    setAuthState({ user: null, tenantId: null, accessToken: null, activePortal: null, workspaces: [], permissionCodes: [] });
  };

  const isSuperAdmin = (authState.permissionCodes ?? []).includes('*');

  const hasPermission = (code: string): boolean => {
    const codes = authState.permissionCodes ?? [];
    if (codes.includes('*')) return true; // super-admin
    return codes.includes(code);
  };

  return (
    <AuthContext.Provider value={{ ...authState, setAuth, logout, hasPermission, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
