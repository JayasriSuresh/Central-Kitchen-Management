import React, { createContext, useContext, useState } from 'react';

interface AuthState {
  user: any | null;
  tenantId: string | null;
  accessToken: string | null;
  activePortal: string | null;
  workspaces?: any[];
}

interface AuthContextType extends AuthState {
  setAuth: (data: Partial<AuthState>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const stored = localStorage.getItem('auth_state');
    return stored ? JSON.parse(stored) : { user: null, tenantId: null, accessToken: null, activePortal: null, workspaces: [] };
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
    setAuthState({ user: null, tenantId: null, accessToken: null, activePortal: null, workspaces: [] });
  };

  return (
    <AuthContext.Provider value={{ ...authState, setAuth, logout }}>
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
