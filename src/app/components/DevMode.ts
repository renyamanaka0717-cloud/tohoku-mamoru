'use client';

// 開発者モード（設定画面のアプリバージョン行を7回タップで解放）。
// RevenueCatや実際のOS権限を変更するのではなく、UI上の判定結果だけを一時的に上書きする。
export const DEV_MODE_UNLOCKED_KEY = 'tl-dev-mode-unlocked-v1';
export const DEV_PREMIUM_OVERRIDE_KEY = 'tl-dev-premium-override-v1'; // ''|'free'|'premium'
export const DEV_LOCATION_DENIED_KEY = 'tl-dev-location-denied-v1';
export const DEV_NOTIF_DENIED_KEY = 'tl-dev-notif-denied-v1';

// Premium.tsxのProviderにdevOverrideの変更を即時反映させるためのイベント名
export const DEV_PREMIUM_CHANGED_EVENT = 'dev-premium-override-changed';

export function isDevModeUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEV_MODE_UNLOCKED_KEY) === '1';
}

export function getDevPremiumOverride(): 'free' | 'premium' | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(DEV_PREMIUM_OVERRIDE_KEY);
  return v === 'free' || v === 'premium' ? v : null;
}

export function setDevPremiumOverride(value: 'free' | 'premium' | null): void {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(DEV_PREMIUM_OVERRIDE_KEY, value);
  else localStorage.removeItem(DEV_PREMIUM_OVERRIDE_KEY);
  window.dispatchEvent(new Event(DEV_PREMIUM_CHANGED_EVENT));
}

export function isDevDenied(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(key) === '1';
}
