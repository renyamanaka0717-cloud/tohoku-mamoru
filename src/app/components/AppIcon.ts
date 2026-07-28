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
  } catch {
    // ネイティブ側プラグイン未導入・切り替え失敗時はWeb側の選択状態のみ残す
  }
}
