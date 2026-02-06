import React, { useState } from 'react';
import { StorageService } from '../services/storageService';
import { AuthLayout } from './AuthLayout';
import { Loader2 } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onNavigate: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Login failed');
      }

      const { accessToken, user } = await response.json();
      StorageService.saveUser({ ...user, accessToken });
      onLoginSuccess();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Welcome Back</h1>
        <p className="text-slate-500 mt-2">Log in to manage your projects.</p>
      </div>
      <form onSubmit={handleLogin} className="mt-8 space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <button
                type="button"
                onClick={() => onNavigate('/forgot-password')}
                className="text-xs text-blue-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>
        <div>
          <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50">
            {loading && <Loader2 size={18} className="animate-spin" />}
            Log In
          </button>
        </div>
      </form>
      <p className="text-center text-sm text-slate-500">
        Don't have an account?{' '}
        <button onClick={() => onNavigate('/signup')} className="font-medium text-blue-600 hover:underline">
          Sign up
        </button>
      </p>
    </AuthLayout>
  );
};
