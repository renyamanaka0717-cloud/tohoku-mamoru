'use client';
import { registerPlugin } from '@capacitor/core';

// Apple Watch版BrainBox（native-ios/Watch/）が WatchConnectivity 経由で送ってくる
// 「あとでやる」タスクのテキストを取得する窓口。ネイティブ側（WatchBridgePlugin.swift）は
// 受け取ったテキストをUserDefaultsのキューに貯めるだけで、実際の反映はここでの
// ポーリング（アプリ起動時・visibilitychange時）で行う。他の「保留アクション」系
// （getPendingWidgetActions・getPendingGeofenceAction）と同じ設計

interface WatchBridgePluginType {
  getPendingWatchTasks(): Promise<{ texts: string[] }>;
  updateThemeColor(options: { hex: string }): Promise<void>;
}

const WatchBridgePlugin = registerPlugin<WatchBridgePluginType>('WatchBridgePlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export async function getPendingWatchTasks(): Promise<string[]> {
  if (!isNative()) return [];
  try {
    const res = await WatchBridgePlugin.getPendingWatchTasks();
    return res.texts ?? [];
  } catch {
    return [];
  }
}

// 設定 → 表示設定 → テーマカラーの現在の色をWatch版に伝える（Watch版のマイクアイコンの
// 色を追従させるため）。「あとでやる」取得とは逆方向の通信
export async function updateWatchThemeColor(hex: string): Promise<void> {
  if (!isNative()) return;
  try {
    await WatchBridgePlugin.updateThemeColor({ hex });
  } catch {
    // ネイティブ側未導入時は静かにスキップ
  }
}
