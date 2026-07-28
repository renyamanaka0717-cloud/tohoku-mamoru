'use client';
import { registerPlugin } from '@capacitor/core';

interface WidgetTaskEntry { name: string; time: string; }
interface WidgetShopEntry { name: string; }

interface WidgetDataPluginType {
  updateWidgetData(options: { tasksJson: string; shopJson: string }): Promise<void>;
}

const WidgetDataPlugin = registerPlugin<WidgetDataPluginType>('WidgetDataPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export async function updateWidgetData(tasks: WidgetTaskEntry[], shopItems: WidgetShopEntry[]): Promise<void> {
  if (!isNative()) return;
  try {
    await WidgetDataPlugin.updateWidgetData({
      tasksJson: JSON.stringify(tasks),
      shopJson: JSON.stringify(shopItems),
    });
  } catch {
    // ネイティブ側プラグイン未導入時はホーム画面ウィジェットの更新のみスキップ
  }
}
