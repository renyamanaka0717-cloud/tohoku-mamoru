'use client';
import { registerPlugin } from '@capacitor/core';

interface AppIconPluginType {
  setAppIcon(options: { name: string }): Promise<void>;
}

const AppIconPlugin = registerPlugin<AppIconPluginType>('AppIconPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export async function setNativeAppIcon(name: string): Promise<void> {
  if (!isNative()) return;
  try {
    await AppIconPlugin.setAppIcon({ name });
  } catch (e) {
    // デバッグ用一時ログ（原因特定後に削除）
    alert('iconerr:' + JSON.stringify(e, Object.getOwnPropertyNames(e as object)));
  }
}
