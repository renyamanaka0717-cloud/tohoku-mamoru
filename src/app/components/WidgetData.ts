'use client';
import { registerPlugin } from '@capacitor/core';

interface WidgetTaskEntry { id: string; name: string; time: string; }
interface WidgetShopEntry { id: string; name: string; }
interface WidgetPendingActions { completedTaskIds: string[]; purchasedShopItemIds: string[]; }

interface WidgetDataPluginType {
  updateWidgetData(options: { tasksJson: string; shopJson: string; themeColor: string }): Promise<void>;
  getPendingWidgetActions(): Promise<{ completedTaskIds: string; purchasedShopItemIds: string }>;
}

const WidgetDataPlugin = registerPlugin<WidgetDataPluginType>('WidgetDataPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export async function updateWidgetData(tasks: WidgetTaskEntry[], shopItems: WidgetShopEntry[], themeColor: string): Promise<void> {
  if (!isNative()) return;
  try {
    await WidgetDataPlugin.updateWidgetData({
      tasksJson: JSON.stringify(tasks),
      shopJson: JSON.stringify(shopItems),
      themeColor,
    });
  } catch {
    // ネイティブ側プラグイン未導入時はホーム画面ウィジェットの更新のみスキップ
  }
}

export async function getPendingWidgetActions(): Promise<WidgetPendingActions> {
  if (!isNative()) return { completedTaskIds: [], purchasedShopItemIds: [] };
  try {
    const res = await WidgetDataPlugin.getPendingWidgetActions();
    return {
      completedTaskIds: JSON.parse(res.completedTaskIds || '[]'),
      purchasedShopItemIds: JSON.parse(res.purchasedShopItemIds || '[]'),
    };
  } catch {
    return { completedTaskIds: [], purchasedShopItemIds: [] };
  }
}
