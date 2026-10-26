'use client';

// Google/Apple ログイン ＋ Cloud Firestoreへのデータ移行・保存を担う窓口。
//
// 【スコープ】Phase A（ログイン＋初回クラウド移行）に加え、Phase B（継続的な
// リアルタイム同期）も全コレクション対応済み。id付き配列（tasks・shopItems・customTabs・
// shopNotifSettings・shopLocations・forgetAlerts・lifePatterns・moveHistory・bulkHistory）は
// pushIdCollectionDiff/subscribeIdCollectionを使う。idを持たずキー文字列がドキュメントIDに
// なるもの（tags・dayOverrides・patternOverrides）は、呼び出し側（page.tsx）でid:キーを
// 合成してから同じ2関数を呼ぶ「合成idパターン」を使う。settings（単一オブジェクト）だけは
// pushSettings/subscribeSettingsという専用の別実装（最後に書いた方が勝つ方式）を使う。
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

// Sign in with AppleはAppleが公式Android SDKを提供していないため、ネイティブ実装は
// 現状iOSのみ（AppleAuthPlugin）。Androidではこの判定でネイティブ分岐を避け、
// 他のisNative()判定と同じくファイルごとに判定ヘルパーを持つ既存の規約に倣う
function isAndroidNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android';
}

// ネイティブのGoogle/Apple認証情報（idToken等）を取得するだけの薄いCapacitorプラグイン。
// Firebase Authへのサインイン自体はこのファイルがsignInWithCredential()で行う
// （ネイティブ側で直接FirebaseAuthにサインインすると、このJS SDKのauthセッションとは
// 別の独立したセッションになり、Firestoreアクセス等このファイル以下のJS SDK依存コードが
// 認証済み扱いにならないため。他のCapacitorプラグインと同じ「ネイティブは最小限、
// ロジックはJS側」という設計方針をここでも踏襲する）
interface GoogleAuthPluginType {
  signIn(): Promise<{ idToken: string; accessToken?: string }>;
}
interface AppleAuthPluginType {
  signIn(options: { nonce: string }): Promise<{ idToken: string }>;
}
let googleAuthPluginPromise: Promise<GoogleAuthPluginType> | null = null;
async function getGoogleAuthPlugin(): Promise<GoogleAuthPluginType> {
  if (!googleAuthPluginPromise) {
    googleAuthPluginPromise = import('@capacitor/core').then(({ registerPlugin }) =>
      registerPlugin<GoogleAuthPluginType>('GoogleAuthPlugin'));
  }
  return googleAuthPluginPromise;
}
let appleAuthPluginPromise: Promise<AppleAuthPluginType> | null = null;
async function getAppleAuthPlugin(): Promise<AppleAuthPluginType> {
  if (!appleAuthPluginPromise) {
    appleAuthPluginPromise = import('@capacitor/core').then(({ registerPlugin }) =>
      registerPlugin<AppleAuthPluginType>('AppleAuthPlugin'));
  }
  return appleAuthPluginPromise;
}

// Sign in with Appleのnonce（リプレイ攻撃対策、Firebase側の要件）。生のnonceはFirebaseの
// credentialに渡し、そのSHA256ハッシュをApple側のネイティブリクエストに渡す
function randomNonce(length = 32): string {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join('');
}
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const { GoogleAuthProvider, signInWithCredential, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  try {
    if (isNative()) {
      const plugin = await getGoogleAuthPlugin();
      const { idToken, accessToken } = await plugin.signIn();
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const cred = await signInWithCredential(auth, credential);
      return toCloudUser(cred.user);
    }
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider).catch(() => null);
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
  const { OAuthProvider, signInWithCredential, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  try {
    if (isNative()) {
      // AndroidにはAppleの公式サインインSDKが存在しないため、ネイティブSign in with Appleは
      // 現状iOSのみ対応。Android側は呼び出し元（page.tsx）でisNative()&&!isAndroidで
      // ボタン自体を出し分ける想定で、ここでは安全側としてnullを返すだけに留める
      if (isAndroidNative()) {
        console.error('Apple sign-in is not yet supported on Android native');
        return null;
      }
      const rawNonce = randomNonce();
      const hashedNonce = await sha256Hex(rawNonce);
      const plugin = await getAppleAuthPlugin();
      const { idToken } = await plugin.signIn({ nonce: hashedNonce });
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken, rawNonce });
      const cred = await signInWithCredential(auth, credential);
      return toCloudUser(cred.user);
    }
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const cred = await signInWithPopup(auth, provider).catch(() => null);
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

// FirestoreのWriteBatch.set()はフィールド値にundefinedを許容せず例外を投げる
// （nullは可）。Task.customRec等の任意フィールドがJS側でundefinedのまま保持されている
// ケースがあるため、書き込み直前に再帰的にundefinedのキーを除去する
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

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
      batch.set(doc(collection(db, 'users', uid, name), item.id), stripUndefined(item) as Record<string, unknown>);
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
      batch.set(doc(collection(db, 'users', uid, name), k), stripUndefined((v && typeof v === 'object') ? v as Record<string, unknown> : { value: v }));
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
  for (const t of tags) batch.set(doc(collection(db, 'users', uid, 'tags'), t.name), stripUndefined(t));
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
  await setDoc(ref, { settings: stripUndefined(settings) }, { merge: true });
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

// ── 継続的なリアルタイム同期（Phase B、idを持つ配列コレクション向け） ──────────────
//
// 移行専用のwriteIdCollectionは常に全件setするだけで「ローカルで削除されたもの」を
// Firestore側から消す処理を持たない（初回移行は追加のみで安全なため、それで十分だった）。
// 継続同期ではローカルの削除も反映する必要があるため、前回push時点のid集合（prevIds）と
// 現在のid集合を比較し、無くなったものだけ個別にdeleteする。
//
// 呼び出し側（page.tsx）はprevIdsを呼び出しごとのrefに保持し、戻り値の新しいid集合を
// 次回呼び出し用に保存すること（タスクの編集・完了・削除のたびに全件差分計算し直すのではなく、
// 前回pushした時点の状態との比較だけで済ませるため）。
export async function pushIdCollectionDiff<T extends { id: string }>(
  uid: string, name: string, items: T[], prevIds: Set<string>
): Promise<Set<string> | null> {
  const db = await getDb();
  if (!db) return null;
  const { collection, doc, writeBatch } = await import('firebase/firestore');
  const col = collection(db, 'users', uid, name);
  const currentIds = new Set(items.map((i) => i.id));
  const removedIds = [...prevIds].filter((id) => !currentIds.has(id));
  type Op = { type: 'set'; id: string; data: T } | { type: 'delete'; id: string };
  const ops: Op[] = [
    ...items.map((item): Op => ({ type: 'set', id: item.id, data: item })),
    ...removedIds.map((id): Op => ({ type: 'delete', id })),
  ];
  // writeBatchは1回最大500件のためチャンクに分ける
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') batch.set(doc(col, op.id), stripUndefined(op.data) as Record<string, unknown>);
      else batch.delete(doc(col, op.id));
    }
    await batch.commit();
  }
  return currentIds;
}

// Firestoreのサブコレクションをリアルタイム購読し、ドキュメントの追加/更新/削除を
// コールバックへ渡す。呼び出し側はこれを使ってローカルstateへマージすること。
//
// hasPendingWritesがtrueの変更イベントは無視する——これは自分自身がpushIdCollectionDiffで
// 書き込んだ直後に、サーバー確定前の楽観的ローカルechoとして即座に発火するイベントで、
// ここで素通りさせるとローカルstateへの不要な再マージ→pushの再発火、という無限ループの
// 原因になる。サーバーから確定した変更（hasPendingWrites:false）だけを反映対象にする。
export async function subscribeIdCollection<T extends { id: string }>(
  uid: string, name: string,
  onChange: (added: T[], modified: T[], removedIds: string[]) => void
): Promise<() => void> {
  const db = await getDb();
  if (!db) return () => {};
  const { collection, onSnapshot } = await import('firebase/firestore');
  const col = collection(db, 'users', uid, name);
  return onSnapshot(col, (snap) => {
    const added: T[] = [];
    const modified: T[] = [];
    const removedIds: string[] = [];
    snap.docChanges().forEach((change) => {
      if (change.doc.metadata.hasPendingWrites) return;
      if (change.type === 'removed') { removedIds.push(change.doc.id); return; }
      const data = { ...(change.doc.data() as T), id: change.doc.id };
      (change.type === 'added' ? added : modified).push(data);
    });
    if (added.length || modified.length || removedIds.length) onChange(added, modified, removedIds);
  });
}

// 設定（Settings）は単一オブジェクトのため、id付き配列向けのpushIdCollectionDiff/
// subscribeIdCollectionは使えない。Phase A（writeSettingsIfAbsent）は「クラウドにまだ
// 設定が無ければ書く」という初回移行専用の安全策だったが、継続同期（Phase B）はログイン中の
// 端末がその後も設定を変更するケースを想定するため、変更のたびに素直に上書き（最後に
// 書いた方が勝つ）する設計にする。複数端末を同時に設定変更するケースは稀なため、
// id付き配列のような「安全な統合」の仕組みは不要と判断した。
export async function pushSettings(uid: string, settings: object): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', uid), { settings: stripUndefined(settings) }, { merge: true });
}

// users/{uid}ドキュメントのsettingsフィールドをリアルタイム購読する。hasPendingWritesの
// チェックはsubscribeIdCollectionと同じ理由（自分自身のpushSettingsによる楽観的echoを
// 無視し、サーバーから確定した変更だけを反映対象にする）。
export async function subscribeSettings<T>(
  uid: string, onChange: (settings: T) => void
): Promise<() => void> {
  const db = await getDb();
  if (!db) return () => {};
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.metadata.hasPendingWrites) return;
    const data = snap.data();
    if (data && data.settings) onChange(data.settings as T);
  });
}
