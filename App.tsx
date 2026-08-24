import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { DeliveryView } from './components/DeliveryView';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { LandingPage } from './components/LandingPage';
import { GroupsChatView } from './components/GroupsChatView';
import { StorageService } from './services/storageService';
import { AUTH_EVENT } from './services/apiService';

type User = {
  id: string;
  email: string;
  accessToken: string;
} | null;

export const App: React.FC = () => {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    // Check for user on initial load
    const loggedInUser = StorageService.getUser();
    if (loggedInUser) {
      setUser(loggedInUser);
    }

    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    const handleAuthError = (e: any) => {
      // Clear session already done in apiService handler; navigate to landing
      setUser(null);
      const target = (e && e.detail && e.detail.target) || '/';
      window.history.pushState({}, '', target);
      setPath(target);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener(AUTH_EVENT, handleAuthError as any);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener(AUTH_EVENT, handleAuthError as any);
    };
  }, []);

  const handleNavigate = (newPath: string) => {
    const storedUser = StorageService.getUser();
    if (!storedUser) {
      setUser(null);
    }

    window.history.pushState({}, '', newPath);
    // Manually trigger a path update since pushState doesn't fire popstate
    setPath(newPath);
  };

  const handleLoginSuccess = () => {
    const loggedInUser = StorageService.getUser();
    setUser(loggedInUser);
    handleNavigate('/');
  };

  const handleLogout = async () => {
    StorageService.clearUser();
    setUser(null);
    handleNavigate('/');
  };

  // Basic Routing Logic
  const renderRoute = () => {
    // Publicly accessible "live" route
    if (path.startsWith('/live/')) {
      const id = path.split('/live/')[1];
      return <DeliveryView projectId={id} isLiveView={true} onNavigate={handleNavigate} />;
    }
    // Draft preview route (will be protected)
    if (path.startsWith('/draft/')) {
      const id = path.split('/draft/')[1];
      return <DeliveryView projectId={id} onNavigate={handleNavigate} />;
    }

    // Auth routes
    if (!user) {
      if (path === '/login') {
        return <LoginPage onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
      }
      if (path === '/signup') {
        return <SignupPage onNavigate={handleNavigate} />;
      }
      if (path === '/forgot-password') {
        return <ForgotPasswordPage onNavigate={handleNavigate} />;
      }
      if (path === '/reset-password') {
        return <ResetPasswordPage onNavigate={handleNavigate} />;
      }
      // Default route for non-logged-in users: Landing Page
      return <LandingPage onNavigate={handleNavigate} />;
    }

    // If a non-logged-in user tries to access a draft, redirect to login
    if (path.startsWith('/draft/')) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
    }

    // Protected routes
    if (path.startsWith('/project/')) {
      const id = path.split('/project/')[1];
      return <ProjectEditor projectId={id} onNavigate={handleNavigate} />;
    }

    if (path === '/groups' || path === '/chat') {
      return (
        <div className="w-screen h-screen overflow-hidden">
          <GroupsChatView onNavigate={handleNavigate} path="/chats" />
        </div>
      );
    }

    if (path === '/chats' || path.startsWith('/chats/')) {
      return (
        <div className="w-screen h-screen overflow-hidden">
          <GroupsChatView onNavigate={handleNavigate} path={path} />
        </div>
      );
    }

    // Default route for logged-in users
    return <Dashboard onNavigate={handleNavigate} onLogout={handleLogout} />;
  };

  return <>{renderRoute()}</>;
};

export default App;
