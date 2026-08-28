import React from 'react';
import { ArrowLeft, Shield, Lock, Eye, FileText, Database, UserCheck, Mail } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface PrivacyPolicyPageProps {
  onNavigate: (path: string) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('/')}>
            <img src={logoImg} alt="Presently Logo" className="h-8 w-auto object-contain" />
            <span className="text-xl font-bold text-slate-900 tracking-tight">Presently</span>
          </div>
          <button
            onClick={() => onNavigate('/')}
            className="text-slate-600 hover:text-slate-900 font-medium text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={16} /> Back to App
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold mb-4">
              <Shield size={14} /> Production Legal Document
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
              Privacy Policy
            </h1>
            <p className="text-slate-500 text-sm">
              Effective Date: August 27, 2026 • Version 2.0 (Production Ready)
            </p>
          </div>

          {/* Table of Contents / Highlights */}
          <div className="bg-slate-50 rounded-xl p-6 mb-10 border border-slate-100 grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <Lock className="text-blue-600 mt-1 flex-shrink-0" size={20} />
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Data Security</h4>
                <p className="text-xs text-slate-500">Encrypted JWT tokens & secure MongoDB storage</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Eye className="text-purple-600 mt-1 flex-shrink-0" size={20} />
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Transparency</h4>
                <p className="text-xs text-slate-500">We never sell your screenshot or client data</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserCheck className="text-emerald-600 mt-1 flex-shrink-0" size={20} />
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Your Control</h4>
                <p className="text-xs text-slate-500">Full rights to delete projects, pins, and accounts</p>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-8 text-slate-700 leading-relaxed text-sm md:text-base">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                1. Overview & Information We Collect
              </h2>
              <p className="mb-3">
                Presently ("we", "our", or "us") provides web capture, live preview delivery, team group collaboration, and annotation tools. To deliver these services, we collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li><strong>Account Credentials:</strong> Name, email address, password hashes, and optional profile avatars.</li>
                <li><strong>Project Assets & Metadata:</strong> Web page URLs requested for automated Puppeteer screenshot capture, desktop/mobile page images, pins, issue thread text, and custom notes.</li>
                <li><strong>Group & Chat Data:</strong> Team structure, member roles, subgroup names, direct messages, and team-only communication threads.</li>
                <li><strong>Payment Information:</strong> Transaction identifiers and payment status via integrated processors (e.g. Razorpay). We do not store raw credit card numbers.</li>
                <li><strong>Technical Diagnostics:</strong> IP address, user-agent details, error logs, and session cookies.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                2. How We Use Your Information
              </h2>
              <p className="mb-3">We utilize collected data strictly for operational, security, and feature enhancement purposes:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>Generating website screenshots via our isolated rendering services.</li>
                <li>Facilitating client delivery links and collaborative working-mode issue tracking.</li>
                <li>Verifying user authorization and subscription tier permissions.</li>
                <li>Sending essential service communications (password resets, group invitations, billing receipts).</li>
                <li>Detecting and mitigating security risks, abuse, or unauthorized access.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                3. Third-Party Service Providers
              </h2>
              <p className="mb-3">We share data with trusted third-party cloud infrastructure providers under strict confidentiality agreements:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li><strong>Database & Hosting:</strong> Cloud MongoDB Atlas instances and Vercel/Cloudflare edge delivery networks.</li>
                <li><strong>AI Services:</strong> Optional text refinement features via Google Gemini API.</li>
                <li><strong>Email Dispatch:</strong> Nodemailer Gmail SMTP and Resend API for transactional message delivery.</li>
                <li><strong>Payments:</strong> Razorpay for subscription transactions.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                4. Data Protection & Security Controls
              </h2>
              <p>
                We enforce industry-standard security safeguards including TLS/SSL encryption in transit, bcrypt password hashing, HTTP-Only JWT refresh cookie persistence, and permission-isolated backend routing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">
                5. User Rights & Data Retention
              </h2>
              <p>
                You maintain full ownership of your project data. You may export, modify, or permanently delete your projects, pins, groups, and account at any time through the application interface or by contacting support.
              </p>
            </section>

            <section className="pt-6 border-t border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Mail className="text-blue-600" size={20} /> Contact Privacy Team
              </h2>
              <p className="text-slate-600">
                For privacy inquiries, GDPR data requests, or account deletion requests, email us at: {' '}
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
