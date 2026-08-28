import React, { useState, useEffect } from 'react';
import { Cookie, X, Check, Settings, ShieldCheck } from 'lucide-react';

interface CookieBannerProps {
  onNavigate?: (path: string) => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(true);

  useEffect(() => {
    const savedConsent = localStorage.getItem('presently_cookie_preferences');
    if (!savedConsent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(
      'presently_cookie_preferences',
      JSON.stringify({ necessary: true, analytics: true, timestamp: new Date().toISOString() })
    );
    setIsVisible(false);
    setShowModal(false);
  };

  const handleRejectNonEssential = () => {
    localStorage.setItem(
      'presently_cookie_preferences',
      JSON.stringify({ necessary: true, analytics: false, timestamp: new Date().toISOString() })
    );
    setIsVisible(false);
    setShowModal(false);
  };

  const handleSaveCustom = () => {
    localStorage.setItem(
      'presently_cookie_preferences',
      JSON.stringify({ necessary: true, analytics: analyticsAllowed, timestamp: new Date().toISOString() })
    );
    setIsVisible(false);
    setShowModal(false);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Bottom Sticky Banner */}
      <div className="fixed bottom-4 left-4 right-4 md:left-8 md:right-auto md:max-w-xl z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-2xl text-slate-100 animate-in slide-in-from-bottom-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <Cookie size={20} /> We Value Your Privacy
          </div>
          <button
            onClick={handleRejectNonEssential}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          We use essential cookies and local storage to keep your session secure, save workspace settings, and improve platform performance.{' '}
          {onNavigate && (
            <button
              onClick={() => onNavigate('/cookies')}
              className="text-blue-400 underline hover:text-blue-300 font-medium"
            >
              Read Cookie Policy
            </button>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAcceptAll}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-2 rounded-xl transition-all shadow-md"
          >
            Accept All
          </button>
          <button
            onClick={handleRejectNonEssential}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs px-4 py-2 rounded-xl transition-all border border-slate-700"
          >
            Necessary Only
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="text-slate-400 hover:text-slate-200 text-xs px-3 py-2 flex items-center gap-1 font-medium ml-auto"
          >
            <Settings size={14} /> Customize
          </button>
        </div>
      </div>

      {/* Preferences Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Cookie className="text-amber-400" size={20} /> Customize Preferences
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-1.5 mb-1">
                    <ShieldCheck size={16} className="text-emerald-400" /> Essential Cookies
                  </h4>
                  <p className="text-xs text-slate-400">Required for login tokens, routing, and workspace state.</p>
                </div>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded font-medium">Always Active</span>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-sm text-white mb-1">Functional & Analytics</h4>
                  <p className="text-xs text-slate-400">Stores issue filter preferences and performance telemetry.</p>
                </div>
                <input
                  type="checkbox"
                  checked={analyticsAllowed}
                  onChange={(e) => setAnalyticsAllowed(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-600 bg-slate-700"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustom}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
              >
                <Check size={14} /> Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
