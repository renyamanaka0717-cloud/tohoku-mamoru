'use client';
import { registerPlugin } from '@capacitor/core';

export interface VoiceInputPermissionStatus { microphone: string; speechRecognition: string; }

interface VoiceInputListenerHandle { remove: () => Promise<void>; }

interface VoiceInputPluginType {
  requestPermissions(): Promise<VoiceInputPermissionStatus>;
  checkPermissions(): Promise<VoiceInputPermissionStatus>;
  start(options: { locale: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: 'recognitionFinished', listenerFunc: (data: { text: string }) => void): Promise<VoiceInputListenerHandle>;
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
  onend: (() => void) | null;
};
let webRecognition: WebSpeechRecognition | null = null;
let webLastText = '';
let webFinishCallback: ((text: string) => void) | null = null;

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

// 無音を検知した自動終了・手動停止のどちらでも、認識が終わった瞬間に一度だけ呼ばれる。
// ネイティブ側はCapacitorのイベントリスナー、Web/開発環境はWeb Speech APIのonresult/onendに橋渡しする。
// 呼び出し元はコンポーネントのマウント中ずっと登録しておき、返り値の関数でアンマウント時に解除する
export function onVoiceInputFinished(callback: (text: string) => void): () => void {
  if (isNative()) {
    let handle: VoiceInputListenerHandle | null = null;
    let cancelled = false;
    VoiceInputPlugin.addListener('recognitionFinished', data => callback(data.text ?? '')).then(h => {
      if (cancelled) { h.remove(); } else { handle = h; }
    });
    return () => { cancelled = true; handle?.remove(); };
  }
  webFinishCallback = callback;
  return () => { webFinishCallback = null; };
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
  webLastText = '';
  webRecognition = new Ctor();
  webRecognition.lang = locale;
  webRecognition.interimResults = false;
  webRecognition.continuous = false; // ブラウザ標準の無音自動終了に任せる
  webRecognition.onresult = e => { webLastText = e.results[0]?.[0]?.transcript ?? ''; };
  webRecognition.onerror = () => webFinishCallback?.(webLastText);
  webRecognition.onend = () => webFinishCallback?.(webLastText);
  webRecognition.start();
}

// 無音になる前にユーザーが早めに切り上げたい場合の手動停止。テキスト自体はonVoiceInputFinishedの
// コールバック経由で届く（自動終了と同じ1つの経路に統一し、二重にテキストを受け取らないようにする）
export async function stopVoiceInput(): Promise<void> {
  if (isNative()) {
    try {
      await VoiceInputPlugin.stop();
    } catch {
      // 既に終了済みなら何もしない
    }
    return;
  }
  webRecognition?.stop();
}
