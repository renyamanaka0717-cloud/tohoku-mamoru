'use client';
import { fetchAnnouncements, CloudAnnouncement } from './Cloud';

// 新機能・アップデート告知（お知らせ）。Firestoreの公開コレクション（Cloud.ts参照）から
// 取得するだけの薄いラッパー。既読管理（このファイル）とFirestore読み取り（Cloud.ts）の
// 役割を分けているのは、他の機能ファイル（Geofence.ts/LocalNotify.ts等）と同じ構成に揃えるため。

export type { CloudAnnouncement };

const SEEN_KEY = 'tl-announcement-seen-date-v1';

export async function loadAnnouncements(): Promise<CloudAnnouncement[]> {
  return fetchAnnouncements();
}

// 言語ごとの文言を取り出す。該当言語が無ければ英語→日本語→先頭の値の順にフォールバックする
// （投稿時点でまだ全言語ぶん翻訳されていないお知らせが混ざっても表示が空にならないようにするため）
export function pickAnnouncementText(map: Record<string, string> | undefined, language: string): string {
  if (!map) return '';
  return map[language] ?? map.en ?? map.ja ?? Object.values(map)[0] ?? '';
}

export function getLastSeenAnnouncementDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SEEN_KEY);
}

export function markAnnouncementsSeen(latestDate: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEEN_KEY, latestDate);
}

export function hasUnreadAnnouncements(list: CloudAnnouncement[]): boolean {
  if (list.length === 0) return false;
  const seen = getLastSeenAnnouncementDate();
  return !seen || list[0].date > seen;
}

// この端末がBrainBoxを既に使っていたか（タスク・設定のいずれかがlocalStorageに存在するか）。
// page.tsxのTASKS_KEY/SETTINGS_KEYと同じ値だが、page.tsxはdefault exportのみで値を
// import できないため、ここでは同じ文字列リテラルを直接持つ（他の機能ファイルと同じ前提）。
function hasExistingLocalData(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('tl-tasks-v2') || !!localStorage.getItem('tl-settings-v2');
}

// 「既読日時」が一度も記録されていない（＝このお知らせ機能を初めて迎えるタイミング）場合だけ
// 初期化する。新規インストール（この端末にアプリ利用履歴が無い）なら、今ある最新のお知らせまで
// 既読扱いにしてバッジを出さない。既存ユーザー（利用履歴あり）は何もしない＝未読のまま
// スタートし、今あるお知らせを一通り「初めて見るお知らせ」として表示する。
export function initAnnouncementsSeenIfFirstRun(latestDate: string): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEEN_KEY) !== null) return;
  if (!hasExistingLocalData()) markAnnouncementsSeen(latestDate);
}
