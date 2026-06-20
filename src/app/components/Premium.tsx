'use client';
import React, { createContext, useContext } from 'react';

interface PremiumContextValue {
  isPremium: boolean;
}

const PremiumContext = createContext<PremiumContextValue>({ isPremium: true });

// Currently: all users get full access.
// To add real gating, replace `isPremium = true` here with StoreKit / subscription logic.
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const isPremium = true;
  return (
    <PremiumContext.Provider value={{ isPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}

// Renders children while isPremium is true.
// Swap the `null` for a paywall/upgrade prompt when real gating is needed.
export function PremiumFeatureGate({ children }: { children: React.ReactNode }) {
  const { isPremium } = usePremium();
  if (!isPremium) return null;
  return <>{children}</>;
}
