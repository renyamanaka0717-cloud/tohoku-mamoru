'use client';
import { App } from '@capacitor/app';

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// 実機ではXcodeプロジェクトの実際のCFBundleShortVersionStringを返す。Web/開発環境では表示しない
export async function getAppVersion(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const info = await App.getInfo();
    return info.version;
  } catch {
    return null;
  }
}
