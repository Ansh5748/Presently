import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, HelpCircle, LifeBuoy, Mail, MessageSquare, Send, Server, Shield, Zap, Sparkles, Activity, Clock } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';

interface MaintenanceSupportPageProps {
  onNavigate: (path: string) => void;
}

export const MaintenanceSupportPage: React.FC<MaintenanceSupportPageProps> = ({ onNavigate }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail || !contactMessage) return;
    setFormSubmitted(true);
  };

  const faqs = [
    {
      q: 'How does website screenshot capturing work?',
      a: 'Presently uses an isolated rendering engine (Puppeteer) to capture full-length desktop and mobile viewports of any public web page URL. Screenshots are compressed automatically for instant loading.'
    },
    {
      q: 'Can clients view my designs without creating an account?',
      a: 'Yes! When you publish a project, Presently generates a shareable public live link (`/live/:projectId`) allowing clients and stakeholders to view pages and pins without requiring login credentials.'
    },
    {
      q: 'What is the difference between Present Mode and Working Mode?',
      a: 'Present Mode provides clean visual previews with title/description pins for client sign-offs. Working Mode converts pins into actionable issue tickets with assignees, status tracking, and team thread discussions.'
    },
    {
      q: 'How do I add team members to groups?',
      a: 'Navigate to Manage Groups from your Dashboard or Chat view. Owners and Admins can invite team members by email address, assign designations (e.g., QA, Developer, PM), and allocate specific projects.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAFBFD] text-slate-900 flex flex-col justify-between antialiased">
      {/* Navigation Header */}
      <nav className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 relative flex items-center justify-between">

          {/* Left: Back to Workspace */}
          <button
            onClick={() => onNavigate('/')}
            aria-label="Back to Workspace"
            className="text-slate-600 hover:text-slate-900 font-semibold text-xs flex items-center gap-1.5 px-0 sm:px-3 py-1.5 sm:bg-white sm:hover:bg-slate-50 sm:rounded-xl sm:border sm:border-slate-200/80 sm:shadow-2xs transition-colors shrink-0"
          >
            <ArrowLeft size={14} />

            <span className="hidden sm:inline">
              Back to Workspace
            </span>
          </button>


          {/* Center: Presently */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 sm:gap-3 cursor-pointer"
            onClick={() => onNavigate('/')}
          >
            <img
              src={logoImg}
              alt="Presently Logo"
              className="h-8 w-auto object-contain"
            />

            <span className="text-lg font-bold text-slate-900 tracking-tight">
              Presently
           </span>
          </div>
          {/* Right: Support Hub */}
          <div className="ml-auto flex items-center">
            <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 sm:px-2.5 py-1 rounded-md border border-slate-200 whitespace-nowrap">
              Support Hub
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16 flex-1 w-full">
        {/* Banner Hero Card */}
        <div className="bg-white rounded-2xl p-6 md:p-8 mb-8 border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold mb-3">
              <LifeBuoy size={13} className="text-blue-600" /> Platform Maintenance & Support
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              How can we help you today?
            </h1>
            <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
              Check real-time rendering status, browse frequently asked questions, or submit a support ticket to our developer team.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl text-center min-w-[200px] shadow-2xs">
            <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-sm mb-1">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" /> All Systems Online
            </div>
            <p className="text-[11px] text-slate-500 font-medium">99.98% Uptime Status</p>
          </div>
        </div>

        {/* Live Systems Operational Cards */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Server className="text-blue-600" size={20} /> System Performance Metrics
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Core API Gateway', status: 'Operational', latency: '24ms', color: 'emerald' },
              { name: 'Puppeteer Screenshot Engine', status: 'Operational', latency: '115ms', color: 'emerald' },
              { name: 'MongoDB Data Store', status: 'Operational', latency: '18ms', color: 'emerald' },
              { name: 'Real-Time Sync Engine', status: 'Operational', latency: '32ms', color: 'emerald' }
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 text-xs">{item.name}</span>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  </div>
                  <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-md border border-emerald-200">
                    {item.status}
                  </span>
                </div>
                <div className="mt-4 pt-2.5 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={12} /> Response</span>
                  <span className="font-mono text-slate-800 font-bold">{item.latency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs & Contact Grid */}
        <div className="grid lg:grid-cols-12 gap-8">
          {/* FAQ Section */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <HelpCircle className="text-indigo-600" size={20} /> Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200/80 rounded-xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                    className="w-full text-left p-3.5 font-semibold text-slate-900 bg-slate-50/50 hover:bg-slate-100/60 transition-colors flex justify-between items-center gap-3 text-xs md:text-sm"
                  >
                    <span>{faq.q}</span>
                    <span className="text-slate-400 font-mono text-base">{activeFaq === idx ? '−' : '+'}</span>
                  </button>
                  {activeFaq === idx && (
                    <div className="p-3.5 bg-white text-slate-600 text-xs leading-relaxed border-t border-slate-100">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Support Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <MessageSquare className="text-blue-600" size={20} /> Submit Support Ticket
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Direct response from our core dev team within 12-24 hours.
            </p>

            {formSubmitted ? (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 text-center text-emerald-900">
                <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-600" />
                <h3 className="font-bold text-sm mb-1">Ticket Received!</h3>
                <p className="text-xs text-emerald-700 leading-relaxed mb-4">
                  We've received your request. A developer will review your ticket and respond via email.
                </p>
                <button
                  onClick={() => setFormSubmitted(false)}
                  className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-all shadow-2xs"
                >
                  Submit Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-xs focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    placeholder="Issue description or question"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-xs focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Message Details</label>
                  <textarea
                    rows={4}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Provide details about your question..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-xs focus:outline-none transition-all resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-xs"
                >
                  <Send size={14} /> Send Support Ticket
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-6 px-4 text-slate-400 text-xs mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="font-medium text-slate-500">
            © {new Date().getFullYear()} Presently Inc. • Support Operations
          </div>
          <div className="flex items-center gap-4 font-medium text-slate-500">
            <button onClick={() => onNavigate('/privacy')} className="hover:text-slate-900 transition-colors">Privacy</button>
            <span>•</span>
            <button onClick={() => onNavigate('/terms')} className="hover:text-slate-900 transition-colors">Terms</button>
            <span>•</span>
            <button onClick={() => onNavigate('/cookies')} className="hover:text-slate-900 transition-colors">Cookies</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
