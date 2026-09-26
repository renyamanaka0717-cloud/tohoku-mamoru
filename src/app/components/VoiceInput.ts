'use client';
import { registerPlugin } from '@capacitor/core';

export interface VoiceInputPermissionStatus { microphone: string; speechRecognition: string; }

interface VoiceInputPluginType {
  requestPermissions(): Promise<VoiceInputPermissionStatus>;
  checkPermissions(): Promise<VoiceInputPermissionStatus>;
  start(options: { locale: string }): Promise<void>;
  stop(): Promise<{ text: string }>;
}

const VoiceInputPlugin = registerPlugin<VoiceInputPluginType>('VoiceInputPlugin');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}

// アプリ内のLanguageコードをSFSpeechRecognizer/Web Speech APIのロケールIDに変換
const VOICE_LOCALE_MAP: Record<string,string> = {
  ja: 'ja-JP', en: 'en-US', ko: 'ko-KR', 'zh-TW': 'zh-TW', es: 'es-ES', pt: 'pt-BR', vi: 'vi-VN', th: 'th-TH', id: 'id-ID',
};

export function voiceLocaleFor(language: string): string {
  return VOICE_LOCALE_MAP[language] ?? 'ja-JP';
}

// ブラウザ/開発環境の動作確認用フォールバック（Web Speech API、Chromiumのみ対応）。
// 実機はネイティブのVoiceInputPlugin経由のみで、こちらは使われない
type WebSpeechRecognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: {results: {transcript: string}[][]}) => void) | null;
  onerror: (() => void) | null;
};
let webRecognition: WebSpeechRecognition | null = null;

export function voiceInputSupported(): boolean {
  if (isNative()) return true;
  return typeof window !== 'undefined' && !!(window as unknown as {webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown}).webkitSpeechRecognition;
}

export async function checkVoiceInputPermissions(): Promise<VoiceInputPermissionStatus> {
  if (!isNative()) return { microphone: 'granted', speechRecognition: 'granted' };
  try {
    return await VoiceInputPlugin.checkPermissions();
  } catch {
    return { microphone: 'denied', speechRecognition: 'denied' };
  }
}

export async function ensureVoiceInputPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const res = await VoiceInputPlugin.requestPermissions();
    return res.microphone === 'granted' && res.speechRecognition === 'granted';
  } catch {
    return false;
  }
}

export async function startVoiceInput(language: string): Promise<void> {
  const locale = voiceLocaleFor(language);
  if (isNative()) {
    await VoiceInputPlugin.start({ locale });
    return;
  }
  const w = window as unknown as {webkitSpeechRecognition?: new () => WebSpeechRecognition; SpeechRecognition?: new () => WebSpeechRecognition};
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) throw new Error('voice input unsupported');
  webRecognition = new Ctor();
  webRecognition.lang = locale;
  webRecognition.interimResults = false;
  webRecognition.continuous = true;
  webRecognition.start();
}

// 録音を止めて確定した認識結果をまとめて返す（ライブ部分認識の逐次反映は行わないシンプルな設計）
export async function stopVoiceInput(): Promise<string> {
  if (isNative()) {
    try {
      const res = await VoiceInputPlugin.stop();
      return res.text ?? '';
    } catch {
      return '';
    }
  }
  const rec = webRecognition;
  if (!rec) return '';
  return new Promise(resolve => {
    let done = false;
    rec.onresult = e => { done = true; resolve(e.results[0]?.[0]?.transcript ?? ''); };
    rec.onerror = () => { done = true; resolve(''); };
    rec.stop();
    setTimeout(() => { if (!done) resolve(''); }, 1500);
  });
}
