'use client';
import { registerPlugin } from '@capacitor/core';

export interface GeofenceLocation { id: string; name: string; lat: number; lng: number; radius: number; }
export interface GeofencePermissionStatus { location: string; notifications: string; }
// 忘れ物防止アラート（退出トリガー）。weekdaysは0=日〜6=土。timeStart/timeEndは"HH:mm"、空文字なら終日対象
export interface ForgetAlertGeofence { id: string; name: string; lat: number; lng: number; radius: number; weekdays: number[]; timeStart: string; timeEnd: string; items: string[]; }

interface GeofencePluginType {
  setGeofences(options: { locationsJson: string }): Promise<void>;
  setTaskLocationGeofences(options: { locationsJson: string }): Promise<void>;
  setForgetAlerts(options: { alertsJson: string }): Promise<void>;
  requestPermissions(): Promise<GeofencePermissionStatus>;
  checkPermissions(): Promise<GeofencePermissionStatus>;
  getPendingGeofenceAction(): Promise<{ shouldOpenShop: boolean; shouldOpenLater: boolean }>;
  getFiredTaskLocationIds(): Promise<{ ids: string[] }>;
  getCurrentLocation(): Promise<{ lat: number; lng: number }>;
  openAppSettings(): Promise<void>;
}

const GeofencePlugin = registerPlugin<GeofencePluginType>('GeofencePlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

export async function setShopGeofences(locations: GeofenceLocation[]): Promise<void> {
  if (!isNative()) return;
  try {
    await GeofencePlugin.setGeofences({ locationsJson: JSON.stringify(locations) });
  } catch {
    // ネイティブ側プラグイン未導入時はジオフェンス登録のみスキップ
  }
}

// 「あとでやる」タスクの場所通知（syncTaskAlerts等と同じ全解除→再登録方式）。
// name には通知に表示するタスク名をそのまま渡す（ShopLocationとは別の"task-loc-"prefixで管理される）
export async function setTaskLocationGeofences(locations: GeofenceLocation[]): Promise<void> {
  if (!isNative()) return;
  try {
    await GeofencePlugin.setTaskLocationGeofences({ locationsJson: JSON.stringify(locations) });
  } catch {
    // ネイティブ側プラグイン未導入時はジオフェンス登録のみスキップ
  }
}

// 忘れ物防止アラート。「あとでやる」とは独立した機能で、"forget-" prefixで別管理する。
// 到着(Enter)ではなく退出(Exit)をトリガーにする点が他の場所通知と異なる
export async function setForgetAlertGeofences(alerts: ForgetAlertGeofence[]): Promise<void> {
  if (!isNative()) return;
  try {
    await GeofencePlugin.setForgetAlerts({ alertsJson: JSON.stringify(alerts) });
  } catch {
    // ネイティブ側プラグイン未導入時はジオフェンス登録のみスキップ
  }
}

export async function checkGeofencePermissions(): Promise<GeofencePermissionStatus> {
  if (!isNative()) return { location: 'granted', notifications: 'granted' };
  try {
    return await GeofencePlugin.checkPermissions();
  } catch {
    return { location: 'denied', notifications: 'denied' };
  }
}

// 位置情報（常に許可）と通知の両方をリクエストし、両方許可されたか返す
export async function ensureGeofencePermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const res = await GeofencePlugin.requestPermissions();
    return res.location === 'granted' && res.notifications === 'granted';
  } catch {
    return false;
  }
}

export async function getPendingGeofenceAction(): Promise<{ shouldOpenShop: boolean; shouldOpenLater: boolean }> {
  if (!isNative()) return { shouldOpenShop: false, shouldOpenLater: false };
  try {
    const res = await GeofencePlugin.getPendingGeofenceAction();
    return { shouldOpenShop: !!res.shouldOpenShop, shouldOpenLater: !!res.shouldOpenLater };
  } catch {
    return { shouldOpenShop: false, shouldOpenLater: false };
  }
}

// バックグラウンド中に場所到着で発火済みになったタスクIDを取得する（読み取り後はネイティブ側でクリアされる）。
// 呼び出し元はこれを受けて該当タスクのlocationNotifyをfalseにし、時間通知とのOR条件の重複発火を防ぐ
export async function getFiredTaskLocationIds(): Promise<string[]> {
  if (!isNative()) return [];
  try {
    const res = await GeofencePlugin.getFiredTaskLocationIds();
    return res.ids ?? [];
  } catch {
    return [];
  }
}

// navigator.geolocation（WKWebView標準API）は権限が許可済みでもコールバックが
// 一切呼ばれずに固まることがある実際の不具合を確認したため、ネイティブでは
// CLLocationManager.requestLocation() を直接使うこちらを使う。Web/開発環境ではnullを返す
// （呼び出し元がnavigator.geolocationにフォールバックする）
// iOSは位置情報・通知の許可をアプリから直接ONにするAPIを提供していないため、
// 「設定アプリ > このアプリ」のページを直接開くところまでをワンタップで行う
export async function openAppSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await GeofencePlugin.openAppSettings();
  } catch {
    // ネイティブ側プラグイン未導入時はスキップ
  }
}

export async function getNativeCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (!isNative()) return null;
  try {
    return await GeofencePlugin.getCurrentLocation();
  } catch (e) {
    console.error('[getNativeCurrentLocation] failed', e); // デバッグ用（原因切り分け後に削除）
    return null;
  }
}
