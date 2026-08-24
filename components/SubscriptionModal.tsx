import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, CreditCard, Sparkles, Copy, Zap, Shield, Users, BarChart3, ArrowRight } from 'lucide-react';

interface SubscriptionModalProps {
  onClose: () => void;
  onSuccess: (isPending?: boolean) => void;
  userEmail: string;
  title?: string;
  message?: string;
}

// Load Razorpay script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSuccess, userEmail, title, message }) => {
  const [selectedPlan, setSelectedPlan] = useState<'1_month' | '6_month' | '12_month'>('1_month');
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualPaymentData, setManualPaymentData] = useState<{
    upiId?: string;
    paypalUsername?: string;
    amount: number;
    currency: string;
    orderId: string;
  } | null>(null);

  const plans = {
    USD: {
      '1_month': { price: 10, name: '1 Month' },
      '6_month': { price: 55, name: '6 Months' },
      '12_month': { price: 110, name: '12 Months' }
    },
    INR: {
      '1_month': { price: 900, name: '1 Month' },
      '6_month': { price: 4300, name: '6 Months' },
      '12_month': { price: 9800, name: '12 Months' }
    }
  };

  const originalPrice = plans[selectedCurrency][selectedPlan].price;
  const finalPrice = Math.round(originalPrice * (1 - discount / 100));

  const handleApplyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    if (code === 'FREEDG100' && selectedPlan === '1_month') {
      setDiscount(100);
      setAppliedCoupon(code);
      setError('');
    } else if (code === 'OFFERDG50') {
      setDiscount(50);
      setAppliedCoupon(code);
      setError('');
    } else if (code) {
      setError('Invalid coupon code');
      setDiscount(0);
      setAppliedCoupon(null);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');

    try {
      // Get user token
      const userData = localStorage.getItem('presently_user');
      if (!userData) {
        throw new Error('Please login first');
      }
      const { accessToken } = JSON.parse(userData);

      // Create order
      const orderResponse = await fetch(`${import.meta.env.VITE_API_URL}/subscription/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: selectedCurrency,
          amount: finalPrice,
          couponCode: appliedCoupon
        })
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData.error || 'Failed to create order');
      }

      // Check if auto-approved (for special email)
      if (orderData.autoApproved) {
        alert(orderData.message || 'Subscription activated!');
        onSuccess(false);
        return;
      }

      // Check if custom/manual payment
      if (orderData.customPayment) {
        setManualPaymentData({
          upiId: orderData.upiId,
          paypalUsername: orderData.paypalUsername,
          amount: orderData.amount,
          currency: orderData.currency,
          orderId: orderData.orderId
        });
        setLoading(false);
        return;
      }

      // Load Razorpay
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      // Open Razorpay checkout
      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.orderId,
        name: 'Presently',
        description: `${plans[selectedCurrency][selectedPlan].name} Subscription`,
        handler: async (response: any) => {
          try {
            // Verify payment
            const verifyResponse = await fetch(`${import.meta.env.VITE_API_URL}/subscription/verify-payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature
              })
            });

            if (!verifyResponse.ok) {
              throw new Error('Payment verification failed');
            }

            alert('Subscription activated successfully!');
            onSuccess(false);
          } catch (err: any) {
            setError(err.message);
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          }
        },
        theme: {
          color: '#2563eb'
        }
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualVerify = async () => {
    if (!manualPaymentData) return;
    setLoading(true);
    try {
      const userData = localStorage.getItem('presently_user');
      if (!userData) throw new Error('Please login first');
      const { accessToken } = JSON.parse(userData);

      const verifyResponse = await fetch(`${import.meta.env.VITE_API_URL}/subscription/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          orderId: manualPaymentData.orderId,
          paymentId: 'manual_verification_' + Date.now()
        })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Payment verification failed');
      }

      alert(verifyData.message || 'Subscription activated successfully!');
      onSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isManualPayment = !!manualPaymentData;

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
        {/* Header - Enhanced */}
        <div className="sticky top-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white p-6 md:p-8 rounded-t-3xl z-10">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  {isManualPayment ? <CreditCard size={22} /> : <Sparkles size={22} />}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold">
                  {isManualPayment ? 'Complete Payment' : (title || 'Unlock Unlimited Projects')}
                </h2>
              </div>
              <p className="text-blue-100 text-lg">
                {isManualPayment ? 'Please complete the transfer below' : (message || 'Choose a plan that works for you')}
              </p>
            </div>
            <button 
              onClick={onClose} 
              className="text-white hover:bg-white/20 p-2.5 rounded-xl transition-all duration-200 hover:scale-110"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content - Enhanced */}
        <div className="p-6 md:p-8 space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm flex items-start gap-3">
              <div className="w-5 h-5 mt-0.5 text-red-500 flex-shrink-0">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1">Error</p>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {isManualPayment ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-8 rounded-2xl border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <CreditCard size={24} className="text-blue-600" />
                  Payment Details
                </h3>
                
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-200">
                    <span className="text-slate-600 font-medium text-lg">Amount to Pay</span>
                    <span className="text-4xl font-black text-slate-900 mt-2 md:mt-0">
                      {manualPaymentData.currency === 'USD' ? '$' : '₹'}{manualPaymentData.amount}
                    </span>
                  </div>

                  {manualPaymentData.upiId && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">UPI ID</label>
                      <div className="flex items-center gap-3">
                        <code className="bg-slate-50 px-4 py-3 rounded-lg border border-slate-300 flex-1 font-mono text-lg text-slate-800">
                          {manualPaymentData.upiId}
                        </code>
                        <button 
                          onClick={() => navigator.clipboard.writeText(manualPaymentData.upiId!)}
                          className="p-3 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-all duration-200 hover:scale-105 shadow-md"
                          title="Copy UPI ID"
                        >
                          <Copy size={20} />
                        </button>
                      </div>
                    </div>
                  )}

                  {manualPaymentData.paypalUsername && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 block">PayPal</label>
                      <div className="text-slate-900 font-bold text-lg">
                        Send to: {manualPaymentData.paypalUsername}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl">
                <p className="text-slate-700 text-center leading-relaxed">
                  After completing the payment, click the button below to activate your subscription. 
                  We'll verify your payment shortly!
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Features Preview */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">What you get with Pro:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { icon: <Zap size={20} className="text-yellow-500" />, text: 'Unlimited Projects' },
                    { icon: <Shield size={20} className="text-green-500" />, text: 'Priority Support' },
                    { icon: <Users size={20} className="text-blue-500" />, text: 'Team Collaboration' },
                    { icon: <BarChart3 size={20} className="text-purple-500" />, text: 'Advanced Analytics' }
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                      {feature.icon}
                      <span className="text-slate-700 font-medium">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Currency Toggle - Styled */}
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl w-fit mx-auto shadow-inner">
                <button
                  onClick={() => setSelectedCurrency('USD')}
                  className={`px-8 py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                    selectedCurrency === 'USD' 
                      ? 'bg-white text-slate-900 shadow-lg scale-105' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  USD ($)
                </button>
                <button
                  onClick={() => setSelectedCurrency('INR')}
                  className={`px-8 py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                    selectedCurrency === 'INR' 
                      ? 'bg-white text-slate-900 shadow-lg scale-105' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  INR (₹)
                </button>
              </div>

              {/* Plans - Enhanced Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(plans[selectedCurrency]).map(([key, plan]) => {
                  const isSelected = selectedPlan === key;
                  const isBestValue = key === '12_month';
                  
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPlan(key as any)}
                      className={`relative p-8 rounded-2xl border-3 transition-all duration-300 ${
                        isSelected
                          ? 'border-blue-600 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-2xl scale-105'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-xl'
                      }`}
                    >
                      {isBestValue && (
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                          <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                            🔥 BEST VALUE
                          </span>
                        </div>
                      )}
                      <div className="text-center">
                        <h3 className="font-black text-xl text-slate-900">{(plan as { name: string }).name || 'Plan'}</h3>

                        <div className="mt-4">
                          <span className="text-5xl font-black text-slate-900">
                            {selectedCurrency === 'USD' ? '$' : '₹'}{(plan as { price: number })?.price || 0}
                          </span>
                          <span className="text-slate-500 text-lg ml-1">/plan</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-3 bg-white/60 px-3 py-1 rounded-full inline-block">
                          Unlimited projects
                        </p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-6 right-6">
                          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full p-2 shadow-lg">
                            <Check size={18} className="text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Coupon Code - Enhanced */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-6 rounded-2xl border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  ✨ Have a coupon code?
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 border-2 border-slate-300 rounded-xl px-5 py-3.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all bg-white"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    className="px-6 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl font-semibold hover:from-slate-800 hover:to-slate-700 transition-all shadow-lg hover:shadow-xl"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <div className="mt-4 text-base text-green-700 font-bold flex items-center gap-2 bg-green-50 p-3 rounded-lg border border-green-200">
                    <Check size={20} />
                    Coupon "{appliedCoupon}" applied - {discount}% off! 🎉
                  </div>
                )}
              </div>

              {/* Price Summary - Enhanced */}
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
                <h4 className="font-bold text-slate-900 mb-4 text-lg">Price Summary</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-base">Original Price</span>
                    <span className="text-xl font-semibold">{selectedCurrency === 'USD' ? '$' : '₹'}{originalPrice}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-green-600 bg-green-50 p-3 rounded-lg">
                      <span className="text-base font-semibold">Discount ({discount}%)</span>
                      <span className="text-xl font-bold">-{selectedCurrency === 'USD' ? '$' : '₹'}{originalPrice - finalPrice}</span>
                    </div>
                  )}
                  <div className="h-px bg-slate-200 my-2"></div>
                  <div className="flex justify-between items-center text-3xl font-black text-slate-900">
                    <span>Total</span>
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {selectedCurrency === 'USD' ? '$' : '₹'}{finalPrice}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Subscribe Button - Enhanced */}
          <button
            onClick={isManualPayment ? handleManualVerify : handleSubscribe}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white px-8 py-5 rounded-2xl font-black text-xl shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? (
              <>
                <Loader2 size={24} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {isManualPayment ? <Check size={24} /> : <CreditCard size={24} />}
                {isManualPayment ? 'I Have Made the Payment' : 'Subscribe Now'}
                {!isManualPayment && <ArrowRight size={24} />}
              </>
            )}
          </button>

          {!isManualPayment && <p className="text-center text-slate-500 text-sm pt-2">
            🔒 Secure payment powered by Razorpay. Cancel anytime.
          </p>}
        </div>
      </div>
    </div>
  );
};
