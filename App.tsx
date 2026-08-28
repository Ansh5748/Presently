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
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage } from './components/NotFoundPage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TermsPage } from './components/TermsPage';
import { CookiePolicyPage } from './components/CookiePolicyPage';
import { CookieBanner } from './components/CookieBanner';
import { RefundPolicyPage } from './components/RefundPolicyPage';
import { MaintenanceSupportPage } from './components/MaintenanceSupportPage';
import { FaqPage } from './components/FaqPage';

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

  // Comprehensive Production Routing Logic
  const renderRoute = () => {
    // 1. Publicly accessible "live" route (no auth required)
    if (path.startsWith('/live/')) {
      const id = path.split('/live/')[1];
      return <DeliveryView projectId={id} isLiveView={true} onNavigate={handleNavigate} />;
    }

    // 2. Universal Public Legal & Support Pages (accessible logged-in or logged-out)
    if (path === '/privacy') {
      return <PrivacyPolicyPage onNavigate={handleNavigate} />;
    }
    if (path === '/terms') {
      return <TermsPage onNavigate={handleNavigate} />;
    }
    if (path === '/cookies' || path === '/cookie-policy') {
      return <CookiePolicyPage onNavigate={handleNavigate} />;
    }
    if (path === '/refund' || path === '/refund-policy') {
      return <RefundPolicyPage onNavigate={handleNavigate} />;
    }
    if (path === '/support' || path === '/maintenance' || path === '/status') {
      return <MaintenanceSupportPage onNavigate={handleNavigate} />;
    }
    if (path === '/faq' || path === '/help' || path === '/docs') {
      return <FaqPage onNavigate={handleNavigate} />;
    }
    if (path === '/404') {
      return <NotFoundPage onNavigate={handleNavigate} />;
    }

    // 3. Unauthenticated User Routes & Auth Checks
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
      if (path === '/') {
        return <LandingPage onNavigate={handleNavigate} />;
      }

      // If non-authenticated user tries to access /draft/ or /project/ or /chats, prompt login
      if (path.startsWith('/draft/') || path.startsWith('/project/') || path.startsWith('/chats') || path === '/groups') {
        return <LoginPage onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
      }

      // Unknown route for unauthenticated user -> 404
      return <NotFoundPage onNavigate={handleNavigate} />;
    }

    // 4. Authenticated User Routes (user is logged in)
    if (path === '/') {
      return <Dashboard onNavigate={handleNavigate} onLogout={handleLogout} />;
    }

    if (path.startsWith('/draft/')) {
      const id = path.split('/draft/')[1];
      return <DeliveryView projectId={id} onNavigate={handleNavigate} />;
    }

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

    // Fallback for unknown path when logged in -> 404 Not Found
    return <NotFoundPage onNavigate={handleNavigate} />;
  };

  return (
    <ErrorBoundary>
      {renderRoute()}
      <CookieBanner onNavigate={handleNavigate} />
    </ErrorBoundary>
  );
};

export default App;
