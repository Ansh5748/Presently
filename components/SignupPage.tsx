import React, { useState } from 'react';
import { AuthLayout } from './AuthLayout';
import { Loader2 } from 'lucide-react';

interface SignupPageProps {
  onNavigate: (path: string) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Signup failed');
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
          <h1 className="text-2xl font-bold text-green-600">Success!</h1>
          <p className="text-slate-600 mt-2">Your account has been created.</p>
          <button onClick={() => onNavigate('/login')} className="mt-6 w-full bg-slate-900 text-white px-5 py-3 rounded-lg font-medium">
            Proceed to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Create an Account</h1>
        <p className="text-slate-500 mt-2">Start managing your projects today.</p>
      </div>
      <form onSubmit={handleSignup} className="mt-8 space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <div className="space-y-4">
            <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>
        <div>
          <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50">
            {loading && <Loader2 size={18} className="animate-spin" />}
            Create Account
          </button>
        </div>
      </form>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button onClick={() => onNavigate('/login')} className="font-medium text-blue-600 hover:underline">
          Log in
        </button>
      </p>
    </AuthLayout>
  );
};
