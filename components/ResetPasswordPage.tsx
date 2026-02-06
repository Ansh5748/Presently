import React, { useState, useEffect } from 'react';
import { AuthLayout } from './AuthLayout';
import { Loader2, CheckCircle, Lock } from 'lucide-react';

interface ResetPasswordPageProps {
  onNavigate: (path: string) => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onNavigate }) => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
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
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Password Reset Successful!</h1>
          <p className="text-slate-600 mb-6">
            Your password has been reset successfully. You can now login with your new password.
          </p>
          <button
            onClick={() => onNavigate('/login')}
            className="w-full bg-slate-900 text-white px-5 py-3 rounded-lg font-medium hover:bg-slate-800"
          >
            Go to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="text-center bg-red-50 p-8 rounded-xl border border-red-200">
          <h1 className="text-2xl font-bold text-red-700 mb-2">Invalid Reset Link</h1>
          <p className="text-red-600 mb-6">
            This password reset link is invalid or has expired.
          </p>
          <button
            onClick={() => onNavigate('/forgot-password')}
            className="w-full bg-red-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-red-700"
          >
            Request New Reset Link
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Lock size={48} className="text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Reset Your Password</h1>
        <p className="text-slate-500 mt-2">Enter your new password below.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            New Password
          </label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="At least 6 characters"
            minLength={6}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Re-enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50"
        >
          {loading && <Loader2 size={18} className="animate-spin" />}
          {loading ? 'Resetting...' : 'Reset Password'}
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
