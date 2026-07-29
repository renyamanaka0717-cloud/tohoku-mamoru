'use client';
import { registerPlugin } from '@capacitor/core';

interface InactivityPluginType {
  scheduleReminder(options: { hours: number }): Promise<void>;
  cancelReminder(): Promise<void>;
}

const InactivityPlugin = registerPlugin<InactivityPluginType>('InactivityPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// アプリをバックグラウンドに送るたびに呼ぶ。hours時間後に「しばらく開いていません」通知を予約する
export async function scheduleInactivityReminder(hours: number): Promise<void> {
  if (!isNative()) return;
  try {
    await InactivityPlugin.scheduleReminder({ hours });
  } catch {
    // ネイティブ側プラグイン未導入時はリマインダー予約のみスキップ
  }
}

// アプリを開いた（フォアグラウンドに戻した）たびに呼ぶ。予約中のリマインダーを取り消す
export async function cancelInactivityReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    await InactivityPlugin.cancelReminder();
  } catch {
    // ネイティブ側プラグイン未導入時は取り消しのみスキップ
  }
}
