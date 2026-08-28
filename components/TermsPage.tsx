import React from 'react';
import { ArrowLeft, FileCheck, ShieldAlert, Scale, CheckCircle2 } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface TermsPageProps {
  onNavigate: (path: string) => void;
}

export const TermsPage: React.FC<TermsPageProps> = ({ onNavigate }) => {
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

          {/* Right side balance */}
          <div className="w-8 sm:w-[120px]" />

        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-semibold mb-4">
              <FileCheck size={14} className="text-blue-600" /> Terms of Service
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
              Terms & Conditions
            </h1>
            <p className="text-slate-500 text-sm">
              Last Updated: August 27, 2026 • Effective Version 2.0
            </p>
          </div>

          {/* Quick Summary Box */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 mb-8 text-sm text-blue-900 leading-relaxed">
            <h4 className="font-bold mb-2 flex items-center gap-2">
              <Scale size={18} className="text-blue-600" /> Key Terms Summary
            </h4>
            <p>
              By accessing or using Presently, you agree to comply with these terms. Presently provides web page capturing, annotation, issue tracking, and client preview delivery tools. You retain ownership of your original content, and accept responsibility for URLs and screenshots captured via your account.
            </p>
          </div>

          {/* Detailed Terms Sections */}
          <div className="space-y-8 text-slate-700 leading-relaxed text-sm md:text-base">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                1. Acceptance of Terms & Eligibility
              </h2>
              <p>
                By registering an account or accessing our web services, you affirm that you are at least 18 years old (or have authorized corporate capability) and agree to be legally bound by these Terms and Conditions and our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                2. User Account & Security
              </h2>
              <p className="mb-2">
                You are responsible for maintaining the confidentiality of your login credentials and for all activities conducted under your account. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-slate-600">
                <li>Provide accurate, current, and complete registration information.</li>
                <li>Immediately notify us of any unauthorized use or security breach.</li>
                <li>Ensure proper sign-out from shared workspaces.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Acceptable Use & Content Guidelines
              </h2>
              <p className="mb-3">
                Presently includes automated Puppeteer website capturing features. You explicitly agree NOT to use the platform to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>Capture, store, or transmit illegal, defamatory, harmful, or copyright-infringing content.</li>
                <li>Attempt to bypass authentication, rate limits, or access controls.</li>
                <li>Conduct automated scraping, denial of service attacks, or unauthorized penetration testing.</li>
                <li>Share malcontent, malicious scripts, or phishing material via annotation pins or client delivery links.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                4. Intellectual Property Rights
              </h2>
              <p>
                You retain all rights, title, and ownership in the original content, designs, and notes you create or upload. Presently retains all ownership, patents, trademarks, and trade secrets related to the software, platform design, and screenshot rendering engines.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                5. Subscription & Payment Terms
              </h2>
              <p>
                Certain features require an active subscription tier. Pricing, billing intervals, and features are specified during checkout. Subscriptions are billed in advance. All fees are exclusive of applicable taxes unless stated otherwise.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                6. Service Modifications & Uptime Disclaimer
              </h2>
              <p>
                While we strive for high service availability (99.9% uptime goal), the service is provided on an "AS IS" and "AS AVAILABLE" basis. We reserve the right to perform scheduled maintenance, update features, or suspend services for urgent security patches.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                7. Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by applicable law, Presently and its affiliates shall not be liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits or revenue arising out of your use of the platform.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
