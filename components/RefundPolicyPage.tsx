import React from 'react';
import { ArrowLeft, RefreshCw, CreditCard, AlertCircle, HelpCircle, Mail } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface RefundPolicyPageProps {
  onNavigate: (path: string) => void;
}

export const RefundPolicyPage: React.FC<RefundPolicyPageProps> = ({ onNavigate }) => {
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
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold mb-4">
              <CreditCard size={14} /> Subscription & Billing Policy
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
              Refund & Cancellation Policy
            </h1>
            <p className="text-slate-500 text-sm">
              Effective Date: August 27, 2026 • Policy Version 2.0
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed text-sm md:text-base">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                1. Subscription Cancellation
              </h2>
              <p>
                You may cancel your active subscription plan at any time through the Account & Billing section or by contacting support. Upon cancellation, your subscription benefits will remain active until the end of your current paid billing cycle.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                2. Refund Policy Standard
              </h2>
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-4">
                <p className="font-semibold text-slate-900 mb-2">Non-Refundable Subscription Fees:</p>
                <p className="text-slate-600 text-xs md:text-sm">
                  Because Presently provides instant full-page screenshot capturing, client preview link generation, and group collaboration tools immediately upon account activation, paid subscription fees are generally final and non-refundable once activated.
                </p>
              </div>
              <p className="mb-2"><strong>Exceptions & Special Refunds:</strong> Refunds may be granted at sole company discretion under the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-1.5 text-slate-600">
                <li>Duplicate billing caused by automated payment gateway errors.</li>
                <li>System outages exceeding 48 consecutive hours during your active term.</li>
                <li>Manual payments submitted but rejected by admin verification.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Manual Payment Verification
              </h2>
              <p>
                For users who complete manual UPI/bank transfer payments, admin verification occurs within 24 hours. If your payment is not verified or rejected by our billing administration team, any held funds will be fully refunded to the originating account.
              </p>
            </section>

            <section className="pt-6 border-t border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Mail className="text-blue-600" size={20} /> Billing Support & Dispute Resolution
              </h2>
              <p className="text-slate-600">
                Have questions about your invoice or billing statement? Email our billing support team at:{' '}
                <a href="mailto:dishlook.contact@gmail.com" className="text-blue-600 font-semibold hover:underline">
                  dishlook.contact@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
