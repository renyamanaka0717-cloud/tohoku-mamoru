'use client';
import { registerPlugin } from '@capacitor/core';

export interface GeofenceLocation { id: string; name: string; lat: number; lng: number; radius: number; }
export interface GeofencePermissionStatus { location: string; notifications: string; }

interface GeofencePluginType {
  setGeofences(options: { locationsJson: string }): Promise<void>;
  requestPermissions(): Promise<GeofencePermissionStatus>;
  checkPermissions(): Promise<GeofencePermissionStatus>;
  getPendingGeofenceAction(): Promise<{ shouldOpenShop: boolean }>;
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

export async function getPendingGeofenceAction(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const res = await GeofencePlugin.getPendingGeofenceAction();
    return !!res.shouldOpenShop;
  } catch {
    return false;
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
