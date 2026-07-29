'use client';
import { registerPlugin } from '@capacitor/core';

export interface GeofenceLocation { id: string; name: string; lat: number; lng: number; radius: number; }
export interface GeofencePermissionStatus { location: string; notifications: string; }

interface GeofencePluginType {
  setGeofences(options: { locationsJson: string }): Promise<void>;
  requestPermissions(): Promise<GeofencePermissionStatus>;
  checkPermissions(): Promise<GeofencePermissionStatus>;
  getPendingGeofenceAction(): Promise<{ shouldOpenShop: boolean }>;
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
