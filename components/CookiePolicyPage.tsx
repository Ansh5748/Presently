import React from 'react';
import { ArrowLeft, Cookie, Info, Check, ShieldCheck } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface CookiePolicyPageProps {
  onNavigate: (path: string) => void;
}

export const CookiePolicyPage: React.FC<CookiePolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header Bar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 relative flex items-center justify-between">

          {/* Back to App */}
          <button
            onClick={() => onNavigate('/')}
            aria-label="Back to App"
            className="text-slate-600 hover:text-slate-900 font-medium text-sm flex items-center gap-2 px-0 sm:px-3 py-1.5 sm:bg-white sm:hover:bg-slate-100 sm:rounded-lg sm:border sm:border-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />

            <span className="hidden sm:inline">
              Back to App
            </span>
          </button>

          {/* Centered Presently branding */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 cursor-pointer"
            onClick={() => onNavigate('/')}
          >
            <img
              src={logoImg}
              alt="Presently Logo"
              className="h-8 w-auto object-contain"
            />

            <span className="text-xl font-bold text-slate-900 tracking-tight">
              Presently
            </span>
          </div>

          {/* Right-side balance */}
          <div className="w-8 sm:w-[120px]" />

        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold mb-4">
              <Cookie size={14} /> Cookie Preference & Policy
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
              Cookie Policy
            </h1>
            <p className="text-slate-500 text-sm">
              Effective Date: August 27, 2026 • Compliance Standard 2.0
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed text-sm md:text-base">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                1. What Are Cookies?
              </h2>
              <p>
                Cookies are small text files stored on your computer or mobile device when you visit our website. They enable us to recognize your session, secure your account login, remember UI preferences (such as dark mode or local compute state), and understand how our application is being used.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                2. Types of Cookies & Local Storage We Use
              </h2>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-600" /> Essential Cookies (Strictly Necessary)
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Required for basic site navigation, secure JWT authentication cookies (`refreshToken`), CSRF defense, and workspace state. Cannot be disabled.
                  </p>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
                    <Info size={18} className="text-blue-600" /> Preference & Functional Storage
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Remembers user settings such as custom workspace avatar preferences, issue filter defaults, and Local Compute state toggles.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Managing Cookie Preferences
              </h2>
              <p>
                You can manage your cookie preferences at any time using our interactive Cookie Banner or through your web browser settings. Please note that blocking strictly necessary cookies will prevent login and proper access to Presently's protected features.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
