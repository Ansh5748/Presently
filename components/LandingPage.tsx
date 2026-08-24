import React, { useState } from 'react';
import { ArrowRight, CheckCircle, Zap, Code, MessageSquare, Share2, Monitor, Layers, Shield, Users, FileText, Mail, Info, Gift, ExternalLink, Trash2, SlidersHorizontal, UserCheck, History, UserCircle } from 'lucide-react';
import logoImg from '../src/assets/presently_logo.png';
import adminImg from '../src/assets/admin.png';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [showFooterModal, setShowFooterModal] = useState<'about' | 'terms' | null>(null);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Presently Logo" className="h-10 w-auto object-contain" />
            <span className="text-xl font-bold text-slate-900">Presently</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/login')}
              className="text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => onNavigate('/signup')}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-medium mb-6">
              For Freelancers, Agencies & SaaS Builders
            </span>
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              Deliver Website Work <br />
              <span className="text-blue-600">Without the Meetings</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Capture full-page screenshots, add interactive annotations, track real-time issue assignments, and share live previews with clients.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onNavigate('/signup')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                Get Started Free <ArrowRight size={20} />
              </button>
              <button
                onClick={() => onNavigate('/login')}
                className="bg-white hover:bg-slate-50 text-slate-700 px-8 py-4 rounded-xl font-semibold text-lg border border-slate-200 transition-all"
              >
                Try Demo
              </button>
            </div>
          </div>

          {/* Hero Illustration / Mockup */}
          <div className="mt-16 bg-slate-100 rounded-2xl p-2 border border-slate-200">
            <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
              <div className="bg-slate-900 px-4 py-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="bg-white rounded-xl p-6 shadow-md border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Monitor size={24} className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">E-Commerce Redesign</h3>
                      <p className="text-sm text-slate-500">3 pages annotated • Published 2 days ago</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-slate-100 rounded-lg h-24 flex items-center justify-center">
                        <span className="text-slate-400 text-sm">Page {i}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Everything You Need in One Place</h2>
            <p className="text-xl text-slate-600">Powerful collaboration & issue tracking tools for modern web teams</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Zap className="text-yellow-500" />,
                title: "One-Click Screenshots",
                description: "Capture full-page, desktop, and mobile views with a single click. No manual stitching required."
              },
              {
                icon: <MessageSquare className="text-blue-500" />,
                title: "Interactive Annotations",
                description: "Click anywhere to add pins with comments. Keep feedback organized and actionable."
              },
              {
                icon: <SlidersHorizontal className="text-indigo-500" />,
                title: "Issue Search & Filter Drawer",
                description: "Instant search and multi-criteria filtering by name, status, label, and creation time with auto-scroll."
              },
              {
                icon: <UserCheck className="text-emerald-500" />,
                title: "Granular Role Permissions",
                description: "Strict role-based access for Owners, Admins, PMs, QA, Testers, Creators, and Assignees."
              },
              {
                icon: <History className="text-purple-500" />,
                title: "Assignment History Visualizer",
                description: "Track issue reassignment chains with deduplication, designation badges, and maximizer modal."
              },
              {
                icon: <UserCircle className="text-pink-500" />,
                title: "Instant Profile & Avatar Sync",
                description: "Personalized user avatars and status text synced seamlessly across workspace views on reload."
              }
            ].map((feature, idx) => (
              <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Who is Presently For?</h2>
            <p className="text-xl text-slate-600">Perfect for anyone working with web projects</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: "For Creative & Tech Teams",
                color: "blue",
                points: [
                  "Freelancers: Share live previews and get sign-off without meetings",
                  "Agencies: Manage 50+ client projects and streamline QA",
                  "SaaS Builders: Collect visual bug reports from beta testers",
                  "Developers: Test responsiveness across mobile/desktop views",
                  "QA Engineers: Log visual defects with exact coordinates",
                  "Product Managers: Visualize roadmap changes on existing pages"
                ]
              },
              {
                title: "For Business & Marketing",
                color: "purple",
                points: [
                  "Marketers: Audit landing pages and ad placements",
                  "SEO Specialists: Highlight on-page optimization opportunities",
                  "Copywriters: Review text in context of the final design",
                  "Sales Teams: Annotate prospect websites for personalized demos",
                  "Recruiters: Review and annotate candidate portfolios"
                ]
              }
            ].map((useCase, idx) => (
              <div key={idx} className={`p-8 rounded-2xl border border-slate-200 ${useCase.color === 'blue' ? 'bg-blue-50/50' : 'bg-purple-50/50'}`}>
                <h3 className={`text-2xl font-bold mb-6 ${useCase.color === 'blue' ? 'text-blue-600' : 'text-purple-600'}`}>
                  {useCase.title}
                </h3>
                <ul className="space-y-3">
                  {useCase.points.map((point, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-3">
                      <CheckCircle size={20} className={useCase.color === 'blue' ? 'text-blue-500 mt-0.5 flex-shrink-0' : 'text-purple-500 mt-0.5 flex-shrink-0'} />
                      <span className="text-slate-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-slate-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Transform Your Workflow?</h2>
          <p className="text-xl text-slate-300 mb-10">Join thousands of professionals who deliver better work faster.</p>
          <button
            onClick={() => onNavigate('/signup')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl inline-flex items-center gap-2"
          >
            Start Free Today <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 pt-12 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
                <Info size={18} /> About Us
              </h3>
              <button onClick={() => setShowFooterModal('about')} className="text-slate-600 hover:text-blue-600 text-sm">
                Our Mission & Team
              </button>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
                <FileText size={18} /> Legal
              </h3>
              <button onClick={() => setShowFooterModal('terms')} className="text-slate-600 hover:text-blue-600 text-sm">
                Terms & Conditions
              </button>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
                <Mail size={18} /> Contact
              </h3>
              <a href="mailto:dishlook.contact@gmail.com" className="text-slate-600 hover:text-blue-600 text-sm">
                Contact Support
              </a>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-200 text-center">
            <p className="text-slate-500 text-sm">© 2024 Presently. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Footer Modals */}
      {showFooterModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95">
            <button 
              onClick={() => setShowFooterModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <Trash2 size={20} className="rotate-45" />
            </button>

            {showFooterModal === 'about' && (
              <div className="text-center">
                <img src={adminImg} alt="Divyansh Gupta" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-slate-100" />
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Divyansh Gupta</h2>
                <p className="text-blue-600 font-medium mb-4">Founder & CEO</p>
                <p className="text-slate-600 leading-relaxed text-sm">
                  Presently is the ultimate collaboration tool designed for freelancers, agencies, and SaaS companies.
                </p>
                
                <div className="text-left mt-6 space-y-4 text-sm text-slate-600 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  <h3 className="font-bold text-slate-900 border-b pb-2">Who uses Presently?</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-blue-600 mb-1">For Creative & Tech Teams</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Freelancers:</strong> Share live previews and get sign-off without meetings.</li>
                        <li><strong>Agencies:</strong> Manage 50+ client projects and streamline QA.</li>
                        <li><strong>SaaS Builders:</strong> Collect visual bug reports from beta testers.</li>
                        <li><strong>Developers:</strong> Test responsiveness across mobile/desktop views.</li>
                        <li><strong>QA Engineers:</strong> Log visual defects with exact coordinates.</li>
                        <li><strong>Product Managers:</strong> Visualize roadmap changes on existing pages.</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-purple-600 mb-1">For Business & Marketing</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Marketers:</strong> Audit landing pages and ad placements.</li>
                        <li><strong>SEO Specialists:</strong> Highlight on-page optimization opportunities.</li>
                        <li><strong>Copywriters:</strong> Review text in context of the final design.</li>
                        <li><strong>Sales Teams:</strong> Annotate prospect websites for personalized demos.</li>
                        <li><strong>Recruiters:</strong> Review and annotate candidate portfolios.</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-amber-600 mb-1">For Specialized Sectors</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>E-commerce:</strong> Audit checkout flows and product displays.</li>
                        <li><strong>Legal/Compliance:</strong> Archive and verify ToS/Privacy pages.</li>
                        <li><strong>Education:</strong> Grade web design assignments visually.</li>
                        <li><strong>Real Estate:</strong> Annotate property listings for updates.</li>
                        <li><strong>Non-Profits:</strong> Optimize donor journeys and campaign pages.</li>
                        <li><strong>Healthcare:</strong> Review patient portal usability and compliance.</li>
                        <li><strong>Finance:</strong> Audit banking dashboards for clarity.</li>
                        <li><strong>Travel:</strong> Verify booking engines and itinerary displays.</li>
                        <li><strong>Startups:</strong> Share visual progress updates with investors.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showFooterModal === 'terms' && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Terms & Conditions</h2>
                <div className="space-y-4 text-slate-600 text-sm max-h-[60vh] overflow-y-auto pr-2">
                  <p><strong>1. Services:</strong> Presently provides screenshot and annotation tools for web projects.</p>
                  <p><strong>2. No Refunds:</strong> All payments are final. We do not offer refunds for subscription plans once activated. Please verify your needs before subscribing.</p>
                  <p><strong>3. Usage:</strong> You agree to use the platform for lawful purposes only. We reserve the right to terminate accounts engaging in malicious activity.</p>
                  <p><strong>4. Availability:</strong> While we strive for 99.9% uptime, services are provided "as is" without warranties of any kind.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
