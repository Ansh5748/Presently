import React, { useState } from 'react';
import { X, ArrowUpRight, Sparkles, Shield, Crown, Tag, Check, AlertCircle, Loader2 } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';

interface SubscriptionModalProps {
  onClose: () => void;
  onSuccess?: (isPending?: boolean) => void;
  userEmail?: string;
  currentPlan?: string;
  title?: string;
  message?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  onClose,
  onSuccess,
  userEmail,
  currentPlan = 'free',
  title,
  message
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [activePlanState, setActivePlanState] = useState<string | null>(null);

  const handleApplyCoupon = (codeToApply?: string) => {
    const code = (codeToApply || couponCodeInput).trim().toUpperCase();
    setCouponError(null);
    setCouponSuccess(null);

    if (!code) {
      setCouponError('Please enter a promo code.');
      return;
    }

    if (code === 'FREEDG100') {
      setAppliedCoupon('FREEDG100');
      setDiscountPercent(100);
      setCouponSuccess('🎉 FREEDG100 applied: 100% OFF discount!');
      setCouponCodeInput('FREEDG100');
    } else if (code === 'OFFERDG50') {
      setAppliedCoupon('OFFERDG50');
      setDiscountPercent(50);
      setCouponSuccess('🎉 OFFERDG50 applied: 50% OFF discount!');
      setCouponCodeInput('OFFERDG50');
    } else {
      setCouponError('Invalid promo code. Try OFFERDG50 or FREEDG100');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountPercent(0);
    setCouponCodeInput('');
    setCouponError(null);
    setCouponSuccess(null);
  };

  const getPaymentLink = (planId: string, cycle: 'monthly' | 'yearly'): string => {
    const planUpper = planId.toUpperCase();
    const cycleUpper = cycle.toUpperCase();

    if (appliedCoupon) {
      const couponUpper = appliedCoupon.toUpperCase();
      // 1. Check VITE_RAZORPAY_LINK_${PLAN}_${CYCLE}_${COUPON}
      const couponEnvKey = `VITE_RAZORPAY_LINK_${planUpper}_${cycleUpper}_${couponUpper}`;
      const couponLink = (import.meta.env as any)[couponEnvKey];
      if (couponLink) return couponLink;

      // 2. Check VITE_RAZORPAY_LINK_${PLAN}_${CYCLE}_${DISCOUNT}
      if (discountPercent > 0) {
        const discountEnvKey = `VITE_RAZORPAY_LINK_${planUpper}_${cycleUpper}_${discountPercent}`;
        const discountLink = (import.meta.env as any)[discountEnvKey];
        if (discountLink) return discountLink;
      }
    }

    // 3. Base ENV link
    const envKey = `VITE_RAZORPAY_LINK_${planUpper}_${cycleUpper}`;
    const link = (import.meta.env as any)[envKey];
    if (link) return link;

    if (appliedCoupon) {
      return `https://razorpay.me/@presently_${planId}_${cycle}_${appliedCoupon.toLowerCase()}`;
    }
    return `https://razorpay.me/@presently_${planId}_${cycle}`;
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return;

    // FOR 100% OFF DISCOUNT (FREEDG100 or 100% discount): BYPASS RAZORPAY & ACTIVATE DIRECTLY
    if (discountPercent === 100 || appliedCoupon === 'FREEDG100') {
      setLoadingPlanId(planId);
      setCouponError(null);
      try {
        const user = StorageService.getUser() as any;
        const token = user?.accessToken || user?.token;
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        const response = await fetch(`${apiUrl}/subscription/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            plan: planId,
            currency: 'INR',
            amount: 0,
            couponCode: appliedCoupon || 'FREEDG100'
          })
        });

        const data = await response.json();
        if (response.ok && (data.autoApproved || data.success)) {
          // Clear cached subscription status so fresh plan status is fetched immediately
          ApiService.invalidateSubscriptionCache();

          // Instantly update active plan state so FREE card vanishes and chosen plan displays ACTIVE PLAN
          setActivePlanState(planId);
          setCouponSuccess(`🎉 100% Discount Applied! ${planId.toUpperCase()} plan activated successfully.`);

          // Notify parent (Dashboard / ProjectEditor) to refresh state
          if (onSuccess) {
            onSuccess(false);
          }

          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setCouponError(data.error || 'Failed to activate 100% discount plan. Please try again.');
        }
      } catch (err) {
        setCouponError('Network error while activating free plan. Please try again.');
      } finally {
        setLoadingPlanId(null);
      }
      return;
    }

    // REGULAR PAID PLANS: OPEN RAZORPAY PAYMENT LINK
    const link = getPaymentLink(planId, billingCycle);
    window.open(link, '_blank');
    if (onSuccess) {
      onSuccess(false);
    }
  };

  const activePlanToUse = activePlanState || currentPlan || 'free';
  const normalizedCurrentPlan = (activePlanToUse || 'free').toLowerCase();

  const allPlans = [
    {
      id: 'free',
      name: 'FREE',
      tagline: 'For creators testing Presently.',
      monthlyPrice: 0,
      yearlyMonthlyPrice: 0,
      yearlyTotal: 0,
      popular: false,
      buttonText: 'FREE TIER',
      buttonVariant: 'secondary' as const,
      features: [
        '1 project creation limit',
        'Up to 3 pages per project'
      ]
    },
    {
      id: 'starter',
      name: 'STARTER',
      tagline: 'For creators & freelance designers.',
      monthlyPrice: 1000,
      yearlyMonthlyPrice: 900,
      yearlyTotal: 10800,
      popular: false,
      buttonText: 'UPGRADE VIA RAZORPAY',
      buttonVariant: 'primary' as const,
      features: [
        'Up to 5 projects limit',
        'Up to 10 pages per project limit'
      ]
    },
    {
      id: 'pro',
      name: 'PRO',
      tagline: 'For growing design teams & agencies.',
      monthlyPrice: 3000,
      yearlyMonthlyPrice: 2700,
      yearlyTotal: 32400,
      popular: true,
      buttonText: 'UPGRADE VIA RAZORPAY',
      buttonVariant: 'popular' as const,
      features: [
        'Up to 25 projects limit',
        'Up to 25 pages per project limit'
      ]
    },
    {
      id: 'studio',
      name: 'STUDIO',
      tagline: 'For high-volume studios & enterprises.',
      monthlyPrice: 5000,
      yearlyMonthlyPrice: 4500,
      yearlyTotal: 54000,
      popular: false,
      buttonText: 'UPGRADE VIA RAZORPAY',
      buttonVariant: 'primary' as const,
      features: [
        'Up to 50 projects limit',
        'Up to 50 pages per project limit'
      ]
    }
  ];

  // If user is on a paid plan, hide the FREE tier card
  const plans = normalizedCurrentPlan !== 'free'
    ? allPlans.filter(p => p.id !== 'free')
    : allPlans;

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start sm:items-center justify-center z-50 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-50 border-2 border-slate-900 rounded-xl sm:rounded-2xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] sm:shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] w-full max-w-5xl max-h-[94vh] sm:max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header */}
        <div className="bg-white border-b-2 border-slate-900 px-3.5 sm:px-6 py-2.5 sm:py-4 flex justify-between items-center shrink-0">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5">
              <Sparkles size={18} className="text-sky-500 shrink-0 sm:w-5 sm:h-5" />
              <h2 className="text-base sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                {title || 'Flexible Subscription Plans'}
              </h2>
            </div>
            <p className="text-[11px] sm:text-sm text-slate-600 font-medium line-clamp-2 sm:line-clamp-none">
              {message || 'Choose the right plan to power your freelance & agency delivery workflow.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-2 border-slate-900 rounded-xl transition-all font-bold shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0 cursor-pointer"
          >
            <X size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Centered Billing Switcher */}
        <div className="bg-slate-100/90 px-3 sm:px-6 py-2.5 sm:py-3 border-b-2 border-slate-900 flex justify-center items-center shrink-0">
          <div className="inline-flex bg-white p-1 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] sm:shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 sm:px-5 py-1 sm:py-1.5 rounded-lg font-extrabold text-[11px] sm:text-xs transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 sm:px-5 py-1 sm:py-1.5 rounded-lg font-extrabold text-[11px] sm:text-xs transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Yearly Billing</span>
              <span className="bg-sky-400 text-slate-900 text-[9px] sm:text-[10px] font-black px-1 sm:px-1.5 py-0.5 rounded border border-slate-900">
                10% OFF
              </span>
            </button>
          </div>
        </div>

        {/* Plans Container - Scrollable area with min-h-0 so flexbox doesn't squish child items */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6">
          <div className={`flex flex-col sm:grid sm:grid-cols-2 ${plans.length === 3 ? 'lg:grid-cols-3 max-w-4xl mx-auto' : 'lg:grid-cols-4'} gap-4 sm:gap-5 w-full`}>
            {plans.map((plan) => {
              const originalDisplayPrice = billingCycle === 'yearly' ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
              const displayPrice = discountPercent > 0 && originalDisplayPrice > 0
                ? Math.round(originalDisplayPrice * (1 - discountPercent / 100))
                : originalDisplayPrice;
              const isCurrent = normalizedCurrentPlan === plan.id;
              const isLoadingThis = loadingPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`w-full shrink-0 flex flex-col justify-between bg-white border-2 border-slate-900 rounded-xl overflow-hidden transition-all min-h-[280px] ${
                    isCurrent
                      ? 'ring-2 ring-sky-400 shadow-[4px_4px_0px_0px_rgba(56,189,248,1)] sm:shadow-[6px_6px_0px_0px_rgba(56,189,248,1)] bg-sky-50/10'
                      : plan.popular
                      ? 'shadow-[4px_4px_0px_0px_rgba(56,189,248,1)] sm:shadow-[6px_6px_0px_0px_rgba(56,189,248,1)] bg-sky-50/20'
                      : 'shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] sm:shadow-[5px_5px_0px_0px_rgba(15,23,42,1)]'
                  }`}
                >
                  {/* Popular / Active Badge */}
                  {plan.popular && !isCurrent && (
                    <div className="bg-sky-400 text-slate-900 font-black text-[10px] sm:text-[11px] tracking-wider uppercase text-center py-1.5 border-b-2 border-slate-900 flex items-center justify-center gap-1 shrink-0">
                      <Crown size={13} className="shrink-0" /> MOST POPULAR
                    </div>
                  )}
                  {isCurrent && (
                    <div className="bg-emerald-400 text-slate-900 font-black text-[10px] sm:text-[11px] tracking-wider uppercase text-center py-1.5 border-b-2 border-slate-900 flex items-center justify-center gap-1 shrink-0">
                      ✓ ACTIVE PLAN
                    </div>
                  )}

                  <div className="p-4 sm:p-5 flex-1 flex flex-col">
                    {/* Plan Name & Tagline */}
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h3 className="font-black text-lg sm:text-xl text-slate-900 tracking-tight">{plan.name}</h3>
                      {discountPercent > 0 && originalDisplayPrice > 0 && (
                        <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded border border-emerald-600 shrink-0">
                          -{discountPercent}% OFF
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-medium mb-3 leading-relaxed">
                      {plan.tagline}
                    </p>

                    {/* Price Block */}
                    <div className="py-3 border-y border-slate-200 mb-4">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {discountPercent > 0 && originalDisplayPrice > 0 ? (
                          <>
                            <span className="line-through text-slate-400 font-extrabold text-lg sm:text-xl">
                              ₹{originalDisplayPrice.toLocaleString('en-IN')}
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-emerald-600">
                              ₹{displayPrice.toLocaleString('en-IN')}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xl sm:text-3xl font-black text-slate-900">
                            ₹{displayPrice.toLocaleString('en-IN')}
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-500">/month</span>
                      </div>

                      {billingCycle === 'yearly' && plan.yearlyTotal > 0 && (
                        <p className="text-[10px] text-sky-700 font-bold mt-1">
                          {discountPercent > 0 ? (
                            <span>Discounted annual rate: ₹{Math.round(plan.yearlyTotal * (1 - discountPercent / 100)).toLocaleString('en-IN')}/yr</span>
                          ) : (
                            <span>Billed annually at ₹{plan.yearlyTotal.toLocaleString('en-IN')}/yr</span>
                          )}
                        </p>
                      )}
                      {billingCycle === 'monthly' && plan.monthlyPrice > 0 && (
                        <p className="text-[10px] text-slate-500 font-semibold mt-1">
                          Flexible monthly subscription
                        </p>
                      )}
                      {plan.monthlyPrice === 0 && (
                        <p className="text-[10px] text-emerald-600 font-bold mt-1">
                          Always 100% Free
                        </p>
                      )}
                    </div>

                    {/* Feature Checklist */}
                    <div className="space-y-2 mb-4 flex-1">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs font-semibold text-slate-800">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            ✓
                          </span>
                          <span className="leading-tight">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer Action Button */}
                  <div className="p-4 sm:p-5 pt-0 mt-auto shrink-0">
                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full py-2.5 bg-slate-100 text-slate-500 font-extrabold text-xs rounded-xl border-2 border-slate-300 cursor-not-allowed text-center uppercase"
                      >
                        CURRENT PLAN
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={isLoadingThis}
                        className={`w-full py-2.5 px-3 font-black text-xs rounded-xl border-2 border-slate-900 transition-all flex items-center justify-center gap-1.5 uppercase shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap cursor-pointer ${
                          discountPercent === 100
                            ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-900'
                            : plan.popular
                            ? 'bg-sky-400 hover:bg-sky-300 text-slate-900'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        {isLoadingThis ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>ACTIVATING...</span>
                          </>
                        ) : (
                          <>
                            <span>{discountPercent === 100 ? 'CLAIM 100% FREE' : plan.buttonText}</span>
                            <ArrowUpRight size={15} className="shrink-0" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Promo Code Input Bar Below Plans */}
        <div className="bg-slate-100/90 px-3.5 sm:px-6 py-2.5 sm:py-3 border-t-2 border-slate-900 flex flex-col sm:flex-row justify-center items-center gap-2 shrink-0">
          {appliedCoupon ? (
            <div className="flex items-center gap-2 bg-emerald-100 border-2 border-emerald-700 text-emerald-900 px-3 py-1.5 rounded-xl font-bold text-xs shadow-[2px_2px_0px_0px_rgba(4,120,87,1)] w-full sm:w-auto justify-between">
              <span className="flex items-center gap-1.5">
                <Tag size={14} className="text-emerald-700 shrink-0" />
                <span>Coupon <strong>{appliedCoupon}</strong> (-{discountPercent}% OFF)</span>
              </span>
              <button
                onClick={handleRemoveCoupon}
                className="ml-2 text-xs font-black text-emerald-900 hover:text-red-600 bg-white rounded-full w-5 h-5 flex items-center justify-center border border-emerald-700 cursor-pointer shrink-0"
                title="Remove coupon"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full max-w-md justify-center">
              <div className="relative flex-1">
                <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Promo code"
                  value={couponCodeInput}
                  onChange={(e) => {
                    setCouponCodeInput(e.target.value);
                    if (couponError) setCouponError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyCoupon();
                  }}
                  className="w-full pl-8 pr-2 py-1.5 text-xs font-bold bg-white border-2 border-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 placeholder:text-slate-400 placeholder:font-medium shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                />
              </div>
              <button
                onClick={() => handleApplyCoupon()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-1.5 rounded-xl border-2 border-slate-900 transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0 cursor-pointer"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Feedback Alert for Coupons */}
        {couponError && (
          <div className="bg-red-100 border-t border-b-2 border-slate-900 px-4 py-1.5 text-xs font-extrabold text-red-800 flex items-center gap-1.5 shrink-0 justify-center text-center">
            <AlertCircle size={14} className="shrink-0" />
            <span>{couponError}</span>
          </div>
        )}
        {couponSuccess && (
          <div className="bg-emerald-100 border-t border-b-2 border-slate-900 px-4 py-1.5 text-xs font-extrabold text-emerald-900 flex items-center gap-1.5 shrink-0 justify-center text-center">
            <Check size={14} className="shrink-0" />
            <span>{couponSuccess}</span>
          </div>
        )}

        {/* Footer */}
        <div className="bg-white border-t-2 border-slate-900 px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col md:flex-row justify-between items-center text-[10px] sm:text-[11px] text-slate-600 font-semibold gap-1.5 shrink-0 text-center md:text-left">
          <div className="flex items-center justify-center gap-1.5">
            <Shield size={14} className="text-emerald-600 shrink-0 sm:w-4 sm:h-4" />
            <span>🔒 Secure checkout powered by Razorpay. Official invoice provided.</span>
          </div>
          <p className="text-slate-500">Need custom enterprise plan? Email divyanshgupta4949@gmail.com</p>
        </div>

      </div>
    </div>
  );
};
