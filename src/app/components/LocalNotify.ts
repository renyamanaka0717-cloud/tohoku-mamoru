'use client';
import { registerPlugin } from '@capacitor/core';

export interface ScheduledAlert { id: string; title: string; body: string; timestamp: number; openShop?: boolean; }

interface LocalNotifyPluginType {
  notify(options: { title: string; body: string }): Promise<void>;
  requestPermission(): Promise<void>;
  syncTaskAlerts(options: { alertsJson: string }): Promise<void>;
  syncFreeSlotAlerts(options: { alertsJson: string }): Promise<void>;
  syncShopNotifs(options: { alertsJson: string }): Promise<void>;
  syncLaterStaleAlerts(options: { alertsJson: string }): Promise<void>;
  syncWakeCheckins(options: { alertsJson: string }): Promise<void>;
  syncDeadlineAlerts(options: { alertsJson: string }): Promise<void>;
}

const LocalNotifyPlugin = registerPlugin<LocalNotifyPluginType>('LocalNotifyPlugin');

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// WKWebView は window.Notification（Web Notifications API）を実装していないため、
// new Notification(...) は実機では何も起きない。ネイティブでは必ずこのプラグイン経由で
// UNUserNotificationCenter に直接通知を出す。Web/開発環境では引き続き window.Notification を使う。
export function notify(title: string, body: string): void {
  if (isNative()) {
    LocalNotifyPlugin.notify({ title, body }).catch(() => {
      // ネイティブ側プラグイン未導入時は通知のみスキップ
    });
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

export function requestNotifyPermission(): void {
  if (isNative()) {
    LocalNotifyPlugin.requestPermission().catch(() => {
      // ネイティブ側プラグイン未導入時はリクエストのみスキップ
    });
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// タスクごとのアラート（開始時・何分前など）をネイティブに事前予約する。
// バックグラウンド/未起動でも発火させるため、JSのnowポーリングでの即時発火（notify）ではなく
// UNCalendarNotificationTriggerで日時指定予約する。Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncTaskAlerts(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncTaskAlerts({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}

// 空き時間ができたことの通知をネイティブに事前予約する（syncTaskAlertsと同じ方式）。
// Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncFreeSlotAlerts(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncFreeSlotAlerts({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}

// 買い物リストの時間指定通知をネイティブに事前予約する（syncTaskAlertsと同じ方式）。
// Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncShopNotifs(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncShopNotifs({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}

// 「あとでやる」放置タスクの通知をネイティブに事前予約する（syncTaskAlertsと同じ方式）。
// Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncLaterStaleAlerts(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncLaterStaleAlerts({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}

// 起床時チェックイン通知をネイティブに事前予約する（syncTaskAlertsと同じ方式）。
// Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncWakeCheckins(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncWakeCheckins({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}

// 締切管理（PRO機能）の通知をネイティブに事前予約する（syncTaskAlertsと同じ方式）。
// Web/開発環境では何もしない（ネイティブ専用機能）。
export function syncDeadlineAlerts(alerts: ScheduledAlert[]): void {
  if (!isNative()) return;
  LocalNotifyPlugin.syncDeadlineAlerts({ alertsJson: JSON.stringify(alerts) }).catch(() => {
    // ネイティブ側プラグイン未導入時はスキップ
  });
}
