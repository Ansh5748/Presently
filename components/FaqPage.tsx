import React, { useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  HelpCircle,
  Globe,
  MessageSquare,
  Users,
  CheckCircle2,
  Share2,
} from 'lucide-react';

import logoImg from '../src/assets/presently_logo.png';

interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
  keywords: string[];
}

interface FaqPageProps {
  onNavigate: (path: string) => void;
}

export const FaqPage: React.FC<FaqPageProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openAccordions, setOpenAccordions] = useState<
    Record<string, boolean>
  >({
    'what-is-presently': true,
  });

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const faqItems: FaqItem[] = [
    {
      id: 'what-is-presently',
      question: 'What is Presently?',
      keywords: [
        'presently',
        'website',
        'feedback',
        'collaboration',
        'clients',
      ],
      answer: (
        <Answer>
          <p>
            Presently is a visual workspace for reviewing and delivering website
            work.
          </p>

          <p>
            Instead of collecting feedback across screenshots, messages,
            meetings, and scattered notes, you can keep website feedback
            connected directly to the page being reviewed.
          </p>

          <p>
            Add your pages, leave visual feedback, collaborate with your team,
            track changes, and share the finished work with your client.
          </p>
        </Answer>
      ),
    },

    {
      id: 'who-is-it-for',
      question: 'Who is Presently for?',
      keywords: [
        'freelancer',
        'agency',
        'designer',
        'developer',
        'team',
        'client',
      ],
      answer: (
        <Answer>
          <p>
            Presently is designed for freelancers, agencies, designers,
            developers, project managers, and teams working on websites.
          </p>

          <p>
            It is especially useful when a project reaches the review stage and
            there are many small changes, questions, approvals, and revisions
            to manage.
          </p>
        </Answer>
      ),
    },

    {
      id: 'add-website',
      question: 'How do I add a website page?',
      keywords: ['add', 'website', 'page', 'url', 'project'],
      answer: (
        <Answer>
          <p>
            Add the website address you want to review and create a project
            around it.
          </p>

          <ul>
            <li>Add multiple pages to the same project.</li>
            <li>Give pages clear names for easier navigation.</li>
            <li>Review pages in desktop or mobile layouts.</li>
            <li>Add images when you want to review visual work separately.</li>
          </ul>
        </Answer>
      ),
    },

    {
      id: 'multiple-pages',
      question: 'Can one project contain multiple pages?',
      keywords: ['multiple', 'pages', 'project', 'website'],
      answer: (
        <Answer>
          <p>
            Yes. A project can contain multiple pages, allowing you to keep an
            entire website together rather than creating a separate workspace
            for every page.
          </p>

          <p>
            Each page can have its own visual feedback while remaining part of
            the same project.
          </p>
        </Answer>
      ),
    },

    {
      id: 'desktop-mobile',
      question: 'Can I review desktop and mobile versions?',
      keywords: [
        'desktop',
        'mobile',
        'responsive',
        'phone',
        'android',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Presently supports reviewing pages in both desktop and mobile
            layouts.
          </p>

          <p>
            This makes it easier to catch responsive issues involving spacing,
            navigation, content, sizing, and layout differences between screen
            sizes.
          </p>
        </Answer>
      ),
    },

    {
      id: 'long-pages',
      question: 'Can I review long webpages?',
      keywords: [
        'long',
        'page',
        'full',
        'height',
        'screenshot',
        'capture',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Presently is designed to capture and review the full length of
            a webpage, including content further down the page.
          </p>

          <p>
            This is particularly useful for landing pages, ecommerce pages,
            portfolio pages, and other long website layouts.
          </p>
        </Answer>
      ),
    },

    {
      id: 'give-feedback',
      question: 'How do I leave feedback on a page?',
      keywords: [
        'feedback',
        'comment',
        'annotation',
        'pin',
        'review',
      ],
      answer: (
        <Answer>
          <p>
            Click on the part of the page you want to discuss and add your
            feedback there.
          </p>

          <p>
            Your feedback remains connected to that visual location, making it
            much easier for everyone to understand exactly what needs attention.
          </p>
        </Answer>
      ),
    },

    {
      id: 'visual-feedback',
      question: 'Why is visual feedback better than sending screenshots?',
      keywords: [
        'visual',
        'feedback',
        'screenshots',
        'comments',
        'communication',
      ],
      answer: (
        <Answer>
          <p>
            A normal message might say “the button near the middle needs to be
            changed.” Visual feedback removes that ambiguity.
          </p>

          <p>
            You can place the feedback directly on the button, section, image,
            heading, or other part of the page being discussed.
          </p>

          <p>
            This keeps the conversation connected to the work instead of
            forcing everyone to search through separate screenshots and
            messages.
          </p>
        </Answer>
      ),
    },

    {
      id: 'comment-vs-issue',
      question: 'What is the difference between a comment and an issue?',
      keywords: [
        'comment',
        'issue',
        'task',
        'feedback',
        'status',
      ],
      answer: (
        <Answer>
          <p>
            A <strong>Comment</strong> is useful for simple feedback,
            questions, or discussion that does not need formal task tracking.
          </p>

          <p>
            An <strong>Issue</strong> is intended for work that needs to be
            assigned and tracked through completion.
          </p>

          <ul>
            <li>Use comments for lightweight discussions.</li>
            <li>Use issues for actionable work.</li>
            <li>Issues can have an owner and progress status.</li>
          </ul>
        </Answer>
      ),
    },

    {
      id: 'issue-status',
      question: 'What statuses can an issue have?',
      keywords: [
        'status',
        'active',
        'progress',
        'review',
        'resolved',
      ],
      answer: (
        <Answer>
          <p>
            Issues can move through four stages:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
            <StatusItem
              title="Active"
              text="The issue still needs attention."
            />

            <StatusItem
              title="In Progress"
              text="Someone is currently working on it."
            />

            <StatusItem
              title="In Review"
              text="The change is ready to be checked."
            />

            <StatusItem
              title="Resolved"
              text="The requested change has been completed."
            />
          </div>
        </Answer>
      ),
    },

    {
      id: 'assign-feedback',
      question: 'Can I assign feedback to a team member?',
      keywords: [
        'assign',
        'assignment',
        'team',
        'member',
        'issue',
        'task',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Trackable issues can be assigned to team members so everyone
            knows who is responsible for the requested change.
          </p>

          <p>
            The person working on an issue can also reassign it when another
            team member is better suited to handle the work.
          </p>
        </Answer>
      ),
    },

    {
      id: 'issue-discussion',
      question: 'Can people discuss an issue after it is assigned?',
      keywords: [
        'discussion',
        'issue',
        'comments',
        'conversation',
        'team',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Each tracked issue can have its own discussion.
          </p>

          <p>
            Questions, clarifications, progress updates, and other relevant
            conversation can stay attached to the issue instead of getting
            lost in a separate chat.
          </p>
        </Answer>
      ),
    },

    {
      id: 'labels',
      question: 'Can issues have labels?',
      keywords: ['labels', 'issue', 'organize', 'tasks', 'categories'],
      answer: (
        <Answer>
          <p>
            Yes. Issues can have labels to help your team organize different
            types of work and identify related feedback more easily.
          </p>
        </Answer>
      ),
    },

    {
      id: 'working-mode',
      question: 'What is Working mode?',
      keywords: [
        'working',
        'mode',
        'issues',
        'tasks',
        'project',
      ],
      answer: (
        <Answer>
          <p>
            Working mode is designed for the stage where feedback needs to
            become actionable work.
          </p>

          <p>
            In this mode, visual feedback can be managed as trackable issues
            with assignments, statuses, labels, and discussions.
          </p>
        </Answer>
      ),
    },

    {
      id: 'present-mode',
      question: 'What is Present mode?',
      keywords: [
        'present',
        'presentation',
        'review',
        'feedback',
      ],
      answer: (
        <Answer>
          <p>
            Present mode is focused on presenting website work and collecting
            straightforward visual feedback.
          </p>

          <p>
            It keeps the review experience simple when feedback does not need to
            become a tracked task.
          </p>
        </Answer>
      ),
    },

    {
      id: 'team-groups',
      question: 'Can I organize my team into groups?',
      keywords: [
        'groups',
        'team',
        'workspace',
        'members',
        'organization',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Teams can be organized into groups so project access and
            conversations can be managed more clearly.
          </p>

          <p>
            This is useful for agencies and teams working across multiple
            clients or projects.
          </p>
        </Answer>
      ),
    },

    {
      id: 'channels',
      question: 'Can groups have separate conversations?',
      keywords: [
        'channels',
        'groups',
        'conversations',
        'team',
        'chat',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Groups can have separate channels for focused conversations.
          </p>

          <p>
            For example, your team can keep design discussions, development
            discussions, and review conversations separate instead of combining
            everything into one long conversation.
          </p>
        </Answer>
      ),
    },

    {
      id: 'direct-messages',
      question: 'Can team members message each other privately?',
      keywords: [
        'direct',
        'message',
        'private',
        'chat',
        'team',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Team members can have direct one-to-one conversations in
            addition to group conversations.
          </p>
        </Answer>
      ),
    },

    {
      id: 'team-only',
      question: 'Can internal team conversations stay private?',
      keywords: [
        'internal',
        'private',
        'team',
        'client',
        'visibility',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Team conversations can remain separate from conversations
            intended for broader project visibility.
          </p>

          <p>
            This lets your team discuss internal matters without automatically
            exposing those conversations to clients.
          </p>
        </Answer>
      ),
    },

    {
      id: 'clients',
      question: 'Can I collaborate with clients in Presently?',
      keywords: [
        'client',
        'clients',
        'collaboration',
        'review',
        'feedback',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Clients can be included in the review process so website
            feedback can happen around the actual work.
          </p>

          <p>
            Internal team collaboration can remain separate while clients see
            the project information intended for them.
          </p>
        </Answer>
      ),
    },

    {
      id: 'draft-published',
      question: 'What is the difference between a draft and a published version?',
      keywords: [
        'draft',
        'published',
        'live',
        'version',
        'client',
      ],
      answer: (
        <Answer>
          <p>
            A <strong>Draft</strong> is the version you are still working on,
            reviewing, or changing.
          </p>

          <p>
            A <strong>Published</strong> version is the version you are ready
            to present as the finished result.
          </p>

          <p>
            This separation allows your team to continue working without
            changing the version currently being presented to a client.
          </p>
        </Answer>
      ),
    },

    {
      id: 'share-project',
      question: 'Can I share a project with a client?',
      keywords: [
        'share',
        'client',
        'link',
        'delivery',
        'project',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Presently provides a shareable project experience that lets
            clients review website work from a single link.
          </p>

          <p>
            The client-facing experience is focused on the website and the
            feedback intended for the client, rather than your internal
            workspace.
          </p>
        </Answer>
      ),
    },

    {
      id: 'multiple-pages-client',
      question: 'Can clients move between multiple pages?',
      keywords: [
        'client',
        'pages',
        'navigation',
        'delivery',
        'share',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Projects containing multiple pages can be presented with page
            navigation so clients can move through the website from one shared
            experience.
          </p>
        </Answer>
      ),
    },

    {
      id: 'image-upload',
      question: 'Can I review an image instead of a website page?',
      keywords: [
        'image',
        'upload',
        'design',
        'mockup',
        'review',
      ],
      answer: (
        <Answer>
          <p>
            Yes. You can add an image to a project when you want to review a
            design or visual that is not available as a website page.
          </p>

          <p>
            This lets you use the same visual feedback workflow for designs,
            mockups, and other page-related work.
          </p>
        </Answer>
      ),
    },

    {
      id: 'rename-pages',
      question: 'Can I rename pages?',
      keywords: ['rename', 'page', 'name', 'pages'],
      answer: (
        <Answer>
          <p>
            Yes. Pages can be given clear names so they are easier for your team
            and clients to identify.
          </p>

          <p>
            Changing a page name does not require rebuilding its visual preview
            when the website address itself has not changed.
          </p>
        </Answer>
      ),
    },

    {
      id: 'search-feedback',
      question: 'Can I find a specific issue quickly?',
      keywords: [
        'search',
        'find',
        'issue',
        'feedback',
        'assignee',
        'label',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Projects with tracked issues can be searched using information
            such as titles, descriptions, labels, assignees, and feedback
            numbers.
          </p>

          <p>
            This is especially useful when a project contains a large amount
            of feedback.
          </p>
        </Answer>
      ),
    },

    {
      id: 'remove-feedback',
      question: 'Can I remove feedback that is no longer needed?',
      keywords: [
        'delete',
        'remove',
        'feedback',
        'issue',
        'comment',
      ],
      answer: (
        <Answer>
          <p>
            Yes. Feedback can be removed when it is no longer relevant.
          </p>

          <p>
            Removing a tracked issue also removes the discussion associated with
            that issue so outdated work does not remain attached to the project.
          </p>
        </Answer>
      ),
    },

    {
      id: 'why-presently',
      question: 'Why use Presently instead of separate screenshots and messages?',
      keywords: [
        'why',
        'screenshots',
        'messages',
        'email',
        'slack',
        'feedback',
      ],
      answer: (
        <Answer>
          <p>
            Presently brings the website, visual feedback, task tracking,
            collaboration, and client delivery into one place.
          </p>

          <p>
            The goal is not to replace every communication tool your team uses.
            It is to keep website-specific communication connected to the
            website itself.
          </p>
        </Answer>
      ),
    },

    {
      id: 'organized-feedback',
      question: 'How does Presently keep feedback organized?',
      keywords: [
        'organized',
        'feedback',
        'project',
        'pages',
        'issues',
      ],
      answer: (
        <Answer>
          <p>
            Feedback stays connected to the project and the page where it was
            created.
          </p>

          <p>
            Trackable issues can additionally have an assignee, status, labels,
            and their own discussion.
          </p>

          <p>
            This gives your team a clear history of what needs to happen and
            where.
          </p>
        </Answer>
      ),
    },

    {
      id: 'client-approval',
      question: 'Can Presently be used for final client review?',
      keywords: [
        'approval',
        'client',
        'final',
        'review',
        'delivery',
      ],
      answer: (
        <Answer>
          <p>
            Yes. The published experience is designed to give clients a clear
            place to review the completed website work.
          </p>

          <p>
            Keeping the final presentation separate from work that is still in
            progress makes delivery cleaner and easier to understand.
          </p>
        </Answer>
      ),
    },

    {
      id: 'mobile-review',
      question: 'Why should I review mobile separately?',
      keywords: [
        'mobile',
        'responsive',
        'phone',
        'review',
        'website',
      ],
      answer: (
        <Answer>
          <p>
            A website can look correct on a large screen while still having
            spacing, navigation, sizing, or content problems on smaller screens.
          </p>

          <p>
            Reviewing both layouts helps catch those issues before the website
            is delivered.
          </p>
        </Answer>
      ),
    },

    {
      id: 'support',
      question: 'What should I do if I need help?',
      keywords: ['support', 'help', 'problem', 'contact'],
      answer: (
        <Answer>
          <p>
            If you need help with Presently, use the support area to contact the
            team and describe what you are experiencing.
          </p>

          <p>
            Including the project or feature you were working with and a short
            description of the problem will help the team assist you more
            quickly.
          </p>
        </Answer>
      ),
    },

    {
      id: 'plans',
      question: 'How do Presently plans work?',
      keywords: [
        'plans',
        'pricing',
        'subscription',
        'billing',
      ],
      answer: (
        <Answer>
          <p>
            Presently uses subscription plans to provide access to the workspace
            and its project features.
          </p>

          <p>
            The plans and billing options currently available to you are shown
            inside Presently.
          </p>
        </Answer>
      ),
    },

    {
      id: 'payment',
      question: 'How can I pay for a plan?',
      keywords: [
        'payment',
        'pay',
        'billing',
        'subscription',
      ],
      answer: (
        <Answer>
          <p>
            Presently supports online subscription payments as well as a manual
            payment option where applicable.
          </p>

          <p>
            Once payment has been confirmed, the relevant plan access is applied
            to the account.
          </p>
        </Answer>
      ),
    },
  ];

  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return faqItems;
    }

    return faqItems.filter(item => {
      const searchableText = [
        item.question,
        item.keywords.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 font-sans pb-20 relative overflow-hidden">

      {/* Subtle neutral background pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'radial-gradient(#171717 0.8px, transparent 0.8px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-[68px] flex items-center justify-between gap-4">

          <div className="flex items-center gap-3 min-w-0">

            <button
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ArrowLeft size={16} />

              <span className="hidden sm:inline">
                Back
              </span>
            </button>

            <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

            <div className="flex items-center gap-2.5 min-w-0">

              <img
                src={logoImg}
                alt="Presently"
                className="w-8 h-8 object-contain shrink-0"
              />

              <span className="font-semibold text-[15px] tracking-tight truncate">
                Presently
              </span>

            </div>
          </div>

          <button
            onClick={() => onNavigate('/support')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 text-sm font-medium transition-colors shrink-0"
          >
            <HelpCircle size={15} />

            <span className="hidden sm:inline">
              Support
            </span>
          </button>

        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 bg-white border-b border-neutral-200">

        <div className="max-w-4xl mx-auto px-5 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-medium mb-5">
            <BookOpen size={14} />
            Help & FAQs
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] text-neutral-950 leading-[1.08]">
            Everything you need to know
          </h1>

          <p className="mt-5 text-[15px] sm:text-base text-neutral-500 leading-7 max-w-2xl mx-auto">
            Learn how Presently helps you review website work,
            organize feedback, collaborate with your team,
            and deliver projects to clients.
          </p>

          {/* Search */}
          <div className="relative max-w-2xl mx-auto mt-8">

            <Search
              size={19}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            />

            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search your question..."
              className="w-full h-14 pl-11 pr-20 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 text-sm outline-none transition-all focus:bg-white focus:border-neutral-400 focus:ring-4 focus:ring-neutral-900/5"
            />

            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
              >
                Clear
              </button>
            )}

          </div>
        </div>
      </section>

      {/* Main */}
      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-6">

        {/* Feature overview */}
        <section className="py-12 sm:py-16">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            <FeatureCard
              icon={<Globe size={18} />}
              title="Review websites"
              text="Review complete pages in one visual workspace."
            />

            <FeatureCard
              icon={<MessageSquare size={18} />}
              title="Give feedback"
              text="Place feedback exactly where it belongs."
            />

            <FeatureCard
              icon={<Users size={18} />}
              title="Work together"
              text="Keep team and client conversations organized."
            />

            <FeatureCard
              icon={<Share2 size={18} />}
              title="Deliver clearly"
              text="Share a polished view of the finished work."
            />

          </div>
        </section>

        {/* FAQ */}
        <section className="pb-12 sm:pb-16">

          <div className="max-w-4xl mx-auto">

            <div className="flex items-end justify-between gap-4 mb-5 px-1">

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400 mb-1.5">
                  Frequently asked
                </p>

                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
                  Questions & answers
                </h2>
              </div>

              <span className="text-xs text-neutral-400 shrink-0">
                {searchQuery
                  ? `${filteredFaqs.length} result${
                      filteredFaqs.length === 1 ? '' : 's'
                    }`
                  : `${faqItems.length} questions`}
              </span>

            </div>

            {filteredFaqs.length === 0 ? (

              <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center">

                <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                  <HelpCircle
                    size={22}
                    className="text-neutral-500"
                  />
                </div>

                <h3 className="font-semibold text-neutral-900">
                  No questions found
                </h3>

                <p className="mt-1.5 text-sm text-neutral-500">
                  Try a different search or clear the search field.
                </p>

                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-5 px-4 py-2 rounded-lg bg-neutral-950 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
                >
                  Show all questions
                </button>

              </div>

            ) : (

              <div className="space-y-2.5">

                {filteredFaqs.map((item, index) => {

                  const isOpen = !!openAccordions[item.id];

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border bg-white overflow-hidden transition-all duration-200 ${
                        isOpen
                          ? 'border-neutral-300 shadow-[0_4px_18px_rgba(0,0,0,0.04)]'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >

                      <button
                        type="button"
                        onClick={() => toggleAccordion(item.id)}
                        aria-expanded={isOpen}
                        className="w-full px-4 sm:px-5 py-4 sm:py-[18px] flex items-center gap-4 text-left"
                      >

                        <span className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-500 flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {String(index + 1).padStart(2, '0')}
                        </span>

                        <span className="flex-1 text-[14px] sm:text-[15px] font-semibold text-neutral-900 leading-6">
                          {item.question}
                        </span>

                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isOpen
                              ? 'bg-neutral-950 text-white'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {isOpen ? (
                            <ChevronUp size={15} />
                          ) : (
                            <ChevronDown size={15} />
                          )}
                        </span>

                      </button>

                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-5">

                          <div className="ml-11 border-t border-neutral-100 pt-4">
                            {item.answer}
                          </div>

                        </div>
                      )}

                    </div>
                  );
                })}

              </div>
            )}

          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto pb-8">

          <div className="rounded-2xl bg-neutral-950 text-white px-6 sm:px-10 py-9 sm:py-11 text-center">

            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-4">
              <HelpCircle size={19} />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Still have a question?
            </h2>

            <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto leading-6">
              If you cannot find what you are looking for,
              our support team can help.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2.5">

              <button
                onClick={() => onNavigate('/support')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-neutral-900 hover:bg-neutral-100 text-sm font-semibold transition-colors"
              >
                Contact support
                <ArrowRight size={15} />
              </button>

              <button
                onClick={() => onNavigate('/')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white hover:bg-white/15 text-sm font-medium transition-colors"
              >
                Back to Presently
              </button>

            </div>
          </div>

        </section>

      </main>
    </div>
  );
};

/* ---------------------------------------------
   Reusable Components
--------------------------------------------- */

const Answer: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <div className="text-[13px] sm:text-sm text-neutral-600 leading-6 space-y-3">
      {children}
    </div>
  );
};

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  text: string;
}> = ({ icon, title, text }) => {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 transition-colors">

      <div className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center mb-3">
        {icon}
      </div>

      <h3 className="text-sm font-semibold text-neutral-900">
        {title}
      </h3>

      <p className="mt-1 text-xs leading-5 text-neutral-500">
        {text}
      </p>

    </div>
  );
};

const StatusItem: React.FC<{
  title: string;
  text: string;
}> = ({ title, text }) => {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">

      <div className="flex items-center gap-2">

        <CheckCircle2
          size={14}
          className="text-neutral-500 shrink-0"
        />

        <span className="text-xs font-semibold text-neutral-800">
          {title}
        </span>

      </div>

      <p className="mt-1 pl-[22px] text-xs text-neutral-500 leading-5">
        {text}
      </p>

    </div>
  );
};