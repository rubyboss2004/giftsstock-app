import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInAnonymously, signOut, User } from 'firebase/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  role: 'admin' | 'staff' | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedAuth = localStorage.getItem('app_auth');
    const savedRole = localStorage.getItem('app_role') as 'admin' | 'staff' | null;
    if (savedAuth === 'true' && savedRole) {
      // If previously logged in, ensure we have an anonymous session for Firestore
      signInAnonymously(auth).then(() => {
        setIsAuthenticated(true);
        setRole(savedRole);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (password: string) => {
    let userRole: 'admin' | 'staff' | null = null;
    if (password === '0012') {
      userRole = 'admin';
    } else if (password === '0000') {
      userRole = 'staff';
    }

    if (userRole) {
      try {
        await signInAnonymously(auth);
        localStorage.setItem('app_auth', 'true');
        localStorage.setItem('app_role', userRole);
        setIsAuthenticated(true);
        setRole(userRole);
        return true;
      } catch (error) {
        console.error("Auth error:", error);
        return false;
      }
    }
    return false;
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('app_auth');
    localStorage.removeItem('app_role');
    setIsAuthenticated(false);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, role, login, logout }}>
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
