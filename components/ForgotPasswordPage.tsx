import React, { useState } from 'react';
import { AuthLayout } from './AuthLayout';
import { Loader2, Mail, CheckCircle } from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (path: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reset email');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-center mb-4">
            <CheckCircle size={64} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check Your Email</h1>
          <p className="text-slate-600 mb-6">
            If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Please check your inbox and spam folder.
          </p>
          <button
            onClick={() => onNavigate('/login')}
            className="w-full bg-slate-900 text-white px-5 py-3 rounded-lg font-medium hover:bg-slate-800"
          >
            Back to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Mail size={48} className="text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Forgot Password?</h1>
        <p className="text-slate-500 mt-2">
          No worries! Enter your email and we'll send you reset instructions.
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50"
        >
          {loading && <Loader2 size={18} className="animate-spin" />}
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Remember your password?{' '}
        <button
          onClick={() => onNavigate('/login')}
          className="font-medium text-blue-600 hover:underline"
        >
          Back to Login
        </button>
      </p>
    </AuthLayout>
  );
};
