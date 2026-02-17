import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ProjectEditor } from './components/ProjectEditor';
import { DeliveryView } from './components/DeliveryView';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { StorageService } from './services/storageService';

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
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (newPath: string) => {
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
    handleNavigate('/login');
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
      if (path === '/signup') {
        return <SignupPage onNavigate={handleNavigate} />;
      }
      if (path === '/forgot-password') {
        return <ForgotPasswordPage onNavigate={handleNavigate} />;
      }
      if (path === '/reset-password') {
        return <ResetPasswordPage onNavigate={handleNavigate} />;
      }
      return <LoginPage onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
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

    // Default route for logged-in users
    return <Dashboard onNavigate={handleNavigate} onLogout={handleLogout} />;
  };

  return <>{renderRoute()}</>;
};

export default App;
