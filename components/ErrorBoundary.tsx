import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-slate-900 font-sans relative overflow-hidden">
          {/* Subtle Studio Dot Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
              backgroundSize: `24px 24px`
            }}
          />

          <div className="max-w-lg w-full bg-white border border-slate-200/90 rounded-3xl p-8 shadow-xl text-center relative z-10">
            <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-600 shadow-2xs">
              <ShieldAlert size={32} />
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 mb-2 tracking-tight">
              Application Error Encountered
            </h1>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed max-w-sm mx-auto">
              An unexpected UI runtime exception occurred. Your data and progress remain completely safe.
            </p>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left overflow-hidden">
                <p className="text-xs font-mono font-bold text-red-600 break-all leading-relaxed">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            {this.state.errorInfo && (
              <div className="bg-white/80 border border-slate-100 rounded-md p-3 mb-4 text-left text-[12px] text-slate-500 overflow-auto max-h-40">
                <pre className="whitespace-pre-wrap break-words">{this.state.errorInfo.componentStack}</pre>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-xs"
              >
                <RefreshCw size={15} /> Reload Application
              </button>
              <button
                onClick={this.handleReset}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2 text-xs"
              >
                <Home size={15} /> Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
