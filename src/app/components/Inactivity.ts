'use client';
import { registerPlugin } from '@capacitor/core';

interface InactivityPluginType {
  scheduleReminder(options: { hoursList: number[] }): Promise<void>;
  cancelReminder(): Promise<void>;
}

const InactivityPlugin = registerPlugin<InactivityPluginType>('InactivityPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// アプリをバックグラウンドに送るたびに呼ぶ。hoursList（時間後の配列）ぶんの通知を予約する
// （最初の通知＋アプリが開かれなければ繰り返す再通知ぶん）
export async function scheduleInactivityReminder(hoursList: number[]): Promise<void> {
  if (!isNative()) return;
  try {
    await InactivityPlugin.scheduleReminder({ hoursList });
  } catch {
    // ネイティブ側プラグイン未導入時はリマインダー予約のみスキップ
  }
}

// アプリを開いた（フォアグラウンドに戻した）たびに呼ぶ。予約中のリマインダーを全て取り消す
export async function cancelInactivityReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    await InactivityPlugin.cancelReminder();
  } catch {
    // ネイティブ側プラグイン未導入時は取り消しのみスキップ
  }
}
