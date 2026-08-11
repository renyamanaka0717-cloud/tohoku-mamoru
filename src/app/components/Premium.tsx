'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { logAnalyticsEvent } from './Analytics';
import { getDevPremiumOverride, DEV_PREMIUM_CHANGED_EVENT } from './DevMode';

const RC_API_KEY = 'appl_zyfcgKyGHORBKcOppeougWslCRP';
const ENTITLEMENT_ID = 'BrainBox Pro';

interface PremiumContextValue {
  isPremium: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  purchase: () => Promise<void>;
  restore: () => Promise<boolean>;
  // App Storeのストアフロントに応じてRevenueCatがローカライズ済みの価格文字列（例: "$1.99"）。
  // ネイティブでofferingsが取得できるまではnull（PRO画面側でフォールバック表示する）
  priceString: string | null;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  isLoading: true,
  isPurchasing: false,
  purchase: async () => {},
  restore: async () => false,
  priceString: null,
});

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [priceString, setPriceString] = useState<string | null>(null);
  // 開発者モードのプラン上書き。RevenueCatの実際の状態は変えず、表示だけを差し替える
  const [devOverride, setDevOverride] = useState<'free' | 'premium' | null>(null);

  useEffect(() => {
    setDevOverride(getDevPremiumOverride());
    const onChange = () => setDevOverride(getDevPremiumOverride());
    window.addEventListener(DEV_PREMIUM_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DEV_PREMIUM_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!isNative()) {
      // ブラウザ・開発環境では全機能解放
      setIsPremium(true);
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        // dynamic import（webpackIgnoreは付けない — 付けるとバンドルされず
        // 実機で「does not resolve to a valid URL」エラーになり購入が失敗する）
        const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({ apiKey: RC_API_KEY });
        const { customerInfo } = await Purchases.getCustomerInfo();
        setIsPremium(ENTITLEMENT_ID in customerInfo.entitlements.active);
        // ¥200固定表示だと地域によって実際の請求額と食い違うため、App Storeの
        // ストアフロントに応じてRevenueCatがローカライズした価格文字列を取得する
        try {
          const offerings = await Purchases.getOfferings();
          setPriceString(offerings.current?.monthly?.product.priceString ?? null);
        } catch {
          setPriceString(null);
        }
      } catch {
        setIsPremium(false);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const purchase = useCallback(async () => {
    if (!isNative()) return;
    setIsPurchasing(true);
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.monthly;
      if (!pkg) throw new Error('No monthly package found');
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      const active = ENTITLEMENT_ID in customerInfo.entitlements.active;
      setIsPremium(active);
      if (active) logAnalyticsEvent('subscription_started');
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean };
      if (!err.userCancelled) throw e;
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    if (!isNative()) return false;
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const { customerInfo } = await Purchases.restorePurchases();
      const active = ENTITLEMENT_ID in customerInfo.entitlements.active;
      setIsPremium(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  const effectiveIsPremium = devOverride ? devOverride === 'premium' : isPremium;

  return (
    <PremiumContext.Provider value={{ isPremium: effectiveIsPremium, isLoading, isPurchasing, purchase, restore, priceString }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
