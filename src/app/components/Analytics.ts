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
