'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RC_API_KEY = 'appl_zyfcgKyGHORBKcOppeougWslCRP';
const ENTITLEMENT_ID = 'BrainBox Pro';

interface PremiumContextValue {
  isPremium: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  purchase: () => Promise<void>;
  restore: () => Promise<boolean>;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  isLoading: true,
  isPurchasing: false,
  purchase: async () => {},
  restore: async () => false,
});

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

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
      setIsPremium(ENTITLEMENT_ID in customerInfo.entitlements.active);
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

  return (
    <PremiumContext.Provider value={{ isPremium, isLoading, isPurchasing, purchase, restore }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
