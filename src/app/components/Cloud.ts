'use client';

// Google/Apple ログイン ＋ Cloud Firestoreへのデータ移行・保存を担う窓口。
//
// 【現在のスコープ（Phase A）】ログイン ＋ ローカルデータの初回クラウド移行まで。
// ログイン後にクラウド側の変更をリアルタイムで取り込む「複数端末同期」自体は次フェーズで
// 実装する（このファイルはその土台となるデータモデル・移行ロジックを提供する）。
//
// 【無料版は常にlocalStorage完結】ログインは任意の操作（設定画面からいつでも可能）で、
// 課金のゲートではない。Web版には元々課金の仕組みが無く常にisPremium=trueのため。
//
// 【移行の安全設計】
// - ローカルデータは移行後も一切削除しない（localStorageは常にそのまま残る）。
// - 「この端末はもう移行済みか」は端末ローカルのフラグ（CLOUD_MIGRATED_KEY）で判定する。
//   Firestore側に「移行済みフラグ」を置かない設計にしている——PCとスマホを別々に無料版として
//   使っていたユーザーが同じアカウントでログインした場合、両方の端末がそれぞれ自分のローカル
//   データをアップロードできる必要があるため（1台目が移行済みでも2台目の移行をブロックしない）。
// - タスク・買い物アイテム等、idを持つ配列は Firestore のサブコレクションに1件1ドキュメントで
//   書き込む。端末ごとに生成されるidは衝突がほぼ起こらないため、2台分を書き込むだけで
//   自然に「完全な集合（重複なしの統合）」になる（上書き・削除は一切発生しない）。
// - 設定（Settings）のような単一オブジェクトは配列と違って安全に「統合」できないため、
//   クラウド側にまだ設定が無い場合のみ書き込む（先に移行した端末の設定を優先し、
//   後から来た端末の設定で上書きしない）。

export interface CloudUser { uid: string; email: string | null; displayName: string | null; }

const CLOUD_MIGRATED_KEY = 'tl-cloud-migrated-v1';

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

// Firebase JS SDKの初期化は初回利用時まで遅延する。NEXT_PUBLIC_FIREBASE_*が揃っていない
// （ローカル開発でFirebase未設定）場合は一貫してnullを返し、呼び出し側は静かに諦める
let appPromise: Promise<import('firebase/app').FirebaseApp | null> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const cfg = firebaseConfig();
      if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
      const { initializeApp, getApps } = await import('firebase/app');
      return getApps().length ? getApps()[0] : initializeApp(cfg);
    })();
  }
  return appPromise;
}

async function getAuthInstance() {
  const app = await getApp();
  if (!app) return null;
  const { getAuth } = await import('firebase/auth');
  return getAuth(app);
}

async function getDb() {
  const app = await getApp();
  if (!app) return null;
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(app);
}

// ── 認証 ──────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<CloudUser | null> {
  const auth = await getAuthInstance();
  if (!auth) return null;
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  try {
    const cred = isNative() ? null : await signInWithPopup(auth, provider).catch(() => null);
    if (cred) return toCloudUser(cred.user);
    // ポップアップがブロックされた環境（一部モバイルブラウザ等）はリダイレクト方式にフォールバック
    await signInWithRedirect(auth, provider);
    return null;
  } catch (e) {
    console.error('Google sign-in failed:', e);
    return null;
  }
}

export async function signInWithApple(): Promise<CloudUser | null> {
  const auth = await getAuthInstance();
  if (!auth) return null;
  const { OAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  try {
    const cred = isNative() ? null : await signInWithPopup(auth, provider).catch(() => null);
    if (cred) return toCloudUser(cred.user);
    await signInWithRedirect(auth, provider);
    return null;
  } catch (e) {
    console.error('Apple sign-in failed:', e);
    return null;
  }
}

// signInWithRedirect経由でログインした場合、リダイレクト復帰後にこれを呼んで結果を受け取る
export async function consumeRedirectResult(): Promise<CloudUser | null> {
  const auth = await getAuthInstance();
  if (!auth) return null;
  try {
    const { getRedirectResult } = await import('firebase/auth');
    const result = await getRedirectResult(auth);
    return result ? toCloudUser(result.user) : null;
  } catch (e) {
    console.error('getRedirectResult failed:', e);
    return null;
  }
}

export async function signOutCloud(): Promise<void> {
  const auth = await getAuthInstance();
  if (!auth) return;
  const { signOut } = await import('firebase/auth');
  await signOut(auth).catch(() => {});
}

// アプリ起動時の自動ログイン復元に使う。呼び出し側は購読を解除する関数を保持すること
export async function onCloudAuthChange(cb: (user: CloudUser | null) => void): Promise<() => void> {
  const auth = await getAuthInstance();
  if (!auth) return () => {};
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(auth, (u) => cb(u ? toCloudUser(u) : null));
}

type FirebaseUserLike = { uid: string; email: string | null; displayName: string | null };
function toCloudUser(u: FirebaseUserLike): CloudUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName };
}

// ── 移行（ローカル→クラウド、安全な統合書き込み） ──────────────────────

// id付き配列をサブコレクションへ1件1ドキュメントで書き込む。端末ごとに生成されるidは
// 衝突がほぼ起こらないため、複数端末分を同じサブコレクションへ書き込むだけで自然に
// 重複なしの統合（union）になる。上書き・削除は行わない
async function writeIdCollection<T extends { id: string }>(uid: string, name: string, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const { collection, doc, writeBatch } = await import('firebase/firestore');
  // writeBatchは1回最大500件のためチャンクに分ける
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + 400)) {
      batch.set(doc(collection(db, 'users', uid, name), item.id), item as Record<string, unknown>);
    }
    await batch.commit();
  }
}

// name等の文字列をキーに持つレコード（TagDef・dayOverrides・patternOverrides等）を
// サブコレクションへ1キー1ドキュメントで書き込む。呼び出し側のdayOverrides/patternOverrides等は
// 具体的なインターフェース型（index signatureを持たない）のことが多いため、引数はobjectで
// 緩く受け、内部でのみRecord<string,unknown>として扱う
async function writeKeyedRecord(uid: string, name: string, record: object): Promise<void> {
  const rec = record as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const { collection, doc, writeBatch } = await import('firebase/firestore');
  for (let i = 0; i < keys.length; i += 400) {
    const batch = writeBatch(db);
    for (const k of keys.slice(i, i + 400)) {
      const v = rec[k];
      batch.set(doc(collection(db, 'users', uid, name), k), (v && typeof v === 'object') ? v as Record<string, unknown> : { value: v });
    }
    await batch.commit();
  }
}

async function writeTagDefs(uid: string, tags: { name: string; color: string }[]): Promise<void> {
  if (tags.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const { collection, doc, writeBatch } = await import('firebase/firestore');
  const batch = writeBatch(db);
  for (const t of tags) batch.set(doc(collection(db, 'users', uid, 'tags'), t.name), t);
  await batch.commit();
}

// 設定は配列と違って安全に「統合」できない単一オブジェクトのため、クラウド側にまだ
// 設定が無い場合だけ書き込む（先に移行した端末の設定を優先し、上書きしない）
async function writeSettingsIfAbsent(uid: string, settings: object): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.settings) return;
  await setDoc(ref, { settings }, { merge: true });
}

export interface LocalDataForMigration {
  tasks: { id: string }[];
  shopItems: { id: string }[];
  globalTags: { name: string; color: string }[];
  customTabs: { id: string }[];
  moveHistory: { id: string }[];
  bulkHistory: { id: string }[];
  shopNotifSettings: { id: string }[];
  shopLocations: { id: string }[];
  forgetAlerts: { id: string }[];
  lifePatterns: { id: string }[];
  dayOverrides: object;
  patternOverrides: object;
  settings: object;
}

export function hasMigratedThisDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CLOUD_MIGRATED_KEY) === '1';
}

// この端末のローカルデータをすべてクラウドへ安全にアップロードする。途中で失敗した場合は
// 「移行済み」フラグを立てない（ローカルデータは元々削除しないので失敗時も既存データは無傷）。
// 成功時のみCLOUD_MIGRATED_KEYを立て、この端末での再実行（毎回のログインのたびの
// 再アップロード）を防ぐ
export async function migrateLocalDataToCloud(uid: string, data: LocalDataForMigration): Promise<boolean> {
  try {
    await Promise.all([
      writeIdCollection(uid, 'tasks', data.tasks),
      writeIdCollection(uid, 'shopItems', data.shopItems),
      writeIdCollection(uid, 'customTabs', data.customTabs),
      writeIdCollection(uid, 'moveHistory', data.moveHistory),
      writeIdCollection(uid, 'bulkHistory', data.bulkHistory),
      writeIdCollection(uid, 'shopNotifSettings', data.shopNotifSettings),
      writeIdCollection(uid, 'shopLocations', data.shopLocations),
      writeIdCollection(uid, 'forgetAlerts', data.forgetAlerts),
      writeIdCollection(uid, 'lifePatterns', data.lifePatterns),
      writeTagDefs(uid, data.globalTags),
      writeKeyedRecord(uid, 'dayOverrides', data.dayOverrides),
      writeKeyedRecord(uid, 'patternOverrides', data.patternOverrides),
      writeSettingsIfAbsent(uid, data.settings),
    ]);
    localStorage.setItem(CLOUD_MIGRATED_KEY, '1');
    return true;
  } catch (e) {
    console.error('Cloud migration failed, local data is untouched:', e);
    return false;
  }
}
