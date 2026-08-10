'use client';
import { registerPlugin } from '@capacitor/core';

// Firebase Analytics連携。iOSネイティブはCapacitorカスタムプラグイン(AnalyticsPlugin)経由で
// FirebaseAnalytics(iOS SDK)を呼び、Web/開発環境はFirebase JS SDK(gtag経由のGA4計測)を使う。
//
// 個人情報・プライバシーに関わる値は絶対にparamsに含めないこと:
// タスク名・メモ・買い物リストの中身・住所や施設名・緯度経度・メールアドレス・ユーザー名など。
// 場所に関するイベントは「スーパー」「薬局」等の一般的なカテゴリ、または半径(100/300/500)のような
// 非識別の数値のみ許可する。

interface AnalyticsPluginType {
  logEvent(options: { name: string; params?: string }): Promise<void>;
  setUserProperty(options: { name: string; value: string }): Promise<void>;
}

const AnalyticsPlugin = registerPlugin<AnalyticsPluginType>('AnalyticsPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export type AnalyticsParams = Record<string, string | number | boolean>;

// Firebase JS SDKの初期化は初回イベント送信時まで遅延する（未設定でもアプリが壊れないように）。
// NEXT_PUBLIC_FIREBASE_* が揃っていない場合は静かに何もしない
type WebAnalytics = import('firebase/analytics').Analytics;
let webAnalyticsPromise: Promise<WebAnalytics | null> | null = null;

async function getWebAnalytics(): Promise<WebAnalytics | null> {
  if (!webAnalyticsPromise) {
    webAnalyticsPromise = (async () => {
      const cfg = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
      };
      if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
      try {
        const { initializeApp, getApps } = await import('firebase/app');
        const { getAnalytics, isSupported } = await import('firebase/analytics');
        if (!(await isSupported())) return null;
        const app = getApps().length ? getApps()[0] : initializeApp(cfg);
        return getAnalytics(app);
      } catch {
        return null;
      }
    })();
  }
  return webAnalyticsPromise;
}

export async function logAnalyticsEvent(name: string, params?: AnalyticsParams): Promise<void> {
  try {
    if (isNative()) {
      await AnalyticsPlugin.logEvent({ name, params: params ? JSON.stringify(params) : undefined });
    } else {
      const analytics = await getWebAnalytics();
      if (!analytics) return;
      const { logEvent } = await import('firebase/analytics');
      logEvent(analytics, name, params);
    }
  } catch {
    // Analytics送信の失敗はアプリの動作に影響させない
  }
}

// Firebase Analyticsのユーザープロパティを設定する（イベントではなくユーザー単位の属性）。
// 言語別の機能利用率・プロダクトツアー完了率などをGA4/BigQuery側でセグメント比較できるようにする用途。
// nameはFirebase側の制約（英数字とアンダースコアのみ、先頭は文字）を満たす値を呼び出し側で渡すこと
export async function setAnalyticsUserProperty(name: string, value: string): Promise<void> {
  try {
    if (isNative()) {
      await AnalyticsPlugin.setUserProperty({ name, value });
    } else {
      const analytics = await getWebAnalytics();
      if (!analytics) return;
      const { setUserProperties } = await import('firebase/analytics');
      setUserProperties(analytics, { [name]: value });
    }
  } catch {
    // Analytics送信の失敗はアプリの動作に影響させない
  }
}

// OS権限（通知・位置情報）の許可確認はensureGeofencePermission()/requestNotifyPermission()経由で
// 機能を使うたびに何度も呼ばれるため、許可済みだったことを都度計測すると許可率の指標として
// 意味を持たない（1人が何度も加算されてしまう）。インストールごとに1回だけ計測する
const PERMISSION_GRANTED_ONCE_KEY = 'tl-analytics-permission-granted-v1';
export function logPermissionGrantedOnce(kind: 'notification' | 'location', params?: AnalyticsParams): void {
  if (typeof window === 'undefined') return;
  let log: Record<string, boolean> = {};
  try { log = JSON.parse(localStorage.getItem(PERMISSION_GRANTED_ONCE_KEY) ?? '{}'); } catch { /* 破損時は空扱い */ }
  if (log[kind]) return;
  log[kind] = true;
  localStorage.setItem(PERMISSION_GRANTED_ONCE_KEY, JSON.stringify(log));
  logAnalyticsEvent(kind === 'notification' ? 'notification_permission_granted' : 'location_permission_granted', params);
}
