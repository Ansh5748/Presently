import React from 'react';
import { ArrowLeft, Home, HelpCircle, FileQuestion, Search } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface NotFoundPageProps {
  onNavigate: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-6 relative overflow-hidden font-sans">
      {/* Subtle Grid Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
          backgroundSize: `24px 24px`
        }}
      />

      {/* Studio Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-slate-200/80 z-10 relative">

        {/* Left: Back button */}
          <button
            onClick={() => onNavigate('/')}
            aria-label="Back to Dashboard"
            className="text-slate-600 hover:text-slate-900 transition-colors text-xs font-bold flex items-center gap-1.5 px-0 sm:px-3.5 py-2 sm:bg-white sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-2xs shrink-0"          >
           <ArrowLeft size={14} />

            <span className="hidden sm:inline">
              Back to Dashboard
            </span>
          </button>

          {/* Center: Existing Presently branding */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 cursor-pointer"
            onClick={() => onNavigate('/')}
          >
            <img
              src={logoImg}
              alt="Presently Logo"
              className="h-9 w-auto object-contain"
            />

            <span className="text-xl font-extrabold text-slate-900 tracking-tight">
              Presently
           </span>
          </div>

          {/* Right: Balance */}
          <div className="w-[44px] sm:w-[150px]" />
        </header>

      {/* Main Content Card */}
      <main className="max-w-xl mx-auto w-full text-center py-16 px-4 z-10 my-auto">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-10 backdrop-blur-xs relative overflow-hidden">
          
          {/* Status Badge */}
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 flex items-center justify-center mx-auto mb-6 shadow-xs font-mono font-extrabold text-xl">
            404
          </div>

          <h1 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-slate-600 text-sm mb-8 leading-relaxed max-w-md mx-auto">
            The link you followed may be broken, moved, or deleted. Check the web address or navigate back to your workspace.
          </p>

          {/* Call to Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => onNavigate('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto text-xs"
            >
              <Home size={15} /> Return to Dashboard
            </button>
            <button
              onClick={() => onNavigate('/support')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-3 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2 w-full sm:w-auto text-xs"
            >
              <HelpCircle size={15} /> Support Center
            </button>
          </div>
        </div>
      </main>

      {/* Studio Footer */}
      <footer className="max-w-6xl mx-auto w-full text-center py-6 border-t border-slate-200/80 text-xs text-slate-500 z-10 font-medium">
        © {new Date().getFullYear()} Presently. All rights reserved. • Platform Operations
      </footer>
    </div>
  );
};
