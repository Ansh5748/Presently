import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, CreditCard, Sparkles } from 'lucide-react';

interface SubscriptionModalProps {
  onClose: () => void;
  onSuccess: () => void;
  userEmail: string;
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

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSuccess, userEmail }) => {
  const [selectedPlan, setSelectedPlan] = useState<'1_month' | '6_month' | '12_month'>('1_month');
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        onSuccess();
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
            onSuccess();
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
          color: '#1e293b'
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

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles size={24} />
                Unlock Unlimited Projects
              </h2>
              <p className="text-blue-100 mt-1">Choose a plan that works for you</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Currency Toggle */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
            <button
              onClick={() => setSelectedCurrency('USD')}
              className={`px-6 py-2 rounded-md font-medium transition ${
                selectedCurrency === 'USD' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setSelectedCurrency('INR')}
              className={`px-6 py-2 rounded-md font-medium transition ${
                selectedCurrency === 'INR' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
              }`}
            >
              INR (₹)
            </button>
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(plans[selectedCurrency]).map(([key, plan]) => {
              const isSelected = selectedPlan === key;
              const isBestValue = key === '12_month';
              
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPlan(key as any)}
                  className={`relative p-6 rounded-xl border-2 transition ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-lg scale-105'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {isBestValue && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        BEST VALUE
                      </span>
                    </div>
                  )}
                  <div className="text-center">
                    <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                    <div className="mt-3">
                      <span className="text-3xl font-bold text-slate-900">
                        {selectedCurrency === 'USD' ? '$' : '₹'}{plan.price}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Unlimited projects</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-4 right-4">
                      <div className="bg-blue-600 rounded-full p-1">
                        <Check size={16} className="text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Coupon Code */}
          <div className="bg-slate-50 p-4 rounded-xl">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Have a coupon code?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                onClick={handleApplyCoupon}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
              >
                Apply
              </button>
            </div>
            {appliedCoupon && (
              <div className="mt-2 text-sm text-green-600 font-medium">
                ✓ Coupon "{appliedCoupon}" applied - {discount}% off!
              </div>
            )}
          </div>

          {/* Price Summary */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex justify-between text-slate-600 mb-2">
              <span>Original Price</span>
              <span>{selectedCurrency === 'USD' ? '$' : '₹'}{originalPrice}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600 mb-2">
                <span>Discount ({discount}%)</span>
                <span>-{selectedCurrency === 'USD' ? '$' : '₹'}{originalPrice - finalPrice}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold text-slate-900">
              <span>Total</span>
              <span>{selectedCurrency === 'USD' ? '$' : '₹'}{finalPrice}</span>
            </div>
          </div>

          {/* Subscribe Button */}
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard size={20} />
                Subscribe Now
              </>
            )}
          </button>

          <p className="text-xs text-center text-slate-500">
            Secure payment powered by Razorpay. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};
