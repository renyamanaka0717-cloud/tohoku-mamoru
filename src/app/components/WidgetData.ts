'use client';
import { registerPlugin } from '@capacitor/core';

interface WidgetTaskEntry { id: string; name: string; time: string; icon: string; }
interface WidgetShopEntry { id: string; name: string; }
interface WidgetLaterEntry { id: string; name: string; icon: string; }
interface WidgetPendingActions { completedTaskIds: string[]; purchasedShopItemIds: string[]; }

interface WidgetDataPluginType {
  updateWidgetData(options: { tasksJson: string; shopJson: string; laterJson: string; themeColor: string; language: string }): Promise<void>;
  getPendingWidgetActions(): Promise<{ completedTaskIds: string; purchasedShopItemIds: string }>;
}

const WidgetDataPlugin = registerPlugin<WidgetDataPluginType>('WidgetDataPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// languageはウィジェット自体の表示には使わない（ウィジェットはString Catalogでデバイス言語に
// 自動追従するため）が、GeofencePlugin（場所通知・忘れ物防止アラート）がバックグラウンドで
// 通知文を組み立てる際に、アプリの言語設定（自動判定 or 手動選択）と一致させるためApp Groupの
// UserDefaultsに書き込む。この関数は既にtasks/shopItems/themeColorの変更のたびに呼ばれているので、
// 新しい同期チャンネルを増やさずここに相乗りさせている
export async function updateWidgetData(tasks: WidgetTaskEntry[], shopItems: WidgetShopEntry[], laterItems: WidgetLaterEntry[], themeColor: string, language: string): Promise<void> {
  if (!isNative()) return;
  try {
    await WidgetDataPlugin.updateWidgetData({
      tasksJson: JSON.stringify(tasks),
      shopJson: JSON.stringify(shopItems),
      laterJson: JSON.stringify(laterItems),
      themeColor,
      language,
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
