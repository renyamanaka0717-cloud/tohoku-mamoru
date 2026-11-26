#!/usr/bin/env node
// お知らせ（新機能・アップデート告知）を Firestore の announcements コレクションに1件追加する。
// アプリ本体からは書き込めない設計（セキュリティルールで write:false）なので、
// 新しいお知らせを出すときは必ずこのスクリプトを手元（あなたのMac）で実行すること。
//
// 使い方:
//   node scripts/push-announcement.js <announcement.jsonのパス> [--key サービスアカウント鍵のパス]
//
// announcement.json の形式（9言語すべて埋まっている必要がある）:
//   {
//     "date": "2026-11-24",
//     "title": { "ja": "...", "en": "...", "ko": "...", "zh-TW": "...", "es": "...", "pt": "...", "vi": "...", "th": "...", "id": "..." },
//     "body":  { 同上 }
//   }
//
// サービスアカウント鍵は Firebase Console → プロジェクトの設定 → サービスアカウント →
// 「新しい秘密鍵の生成」で取得する。デフォルトでは scripts/serviceAccountKey.json を探す
// （.gitignore 済みなので誤ってコミットされる心配はない）。

const fs = require('fs');
const path = require('path');

const LANGUAGES = ['ja', 'en', 'ko', 'zh-TW', 'es', 'pt', 'vi', 'th', 'id'];

function parseArgs(argv) {
  const args = argv.slice(2);
  const keyFlagIndex = args.indexOf('--key');
  const keyPath = keyFlagIndex >= 0 ? args[keyFlagIndex + 1] : null;
  const positional = args.filter((a, i) => a !== '--key' && (keyFlagIndex < 0 || i !== keyFlagIndex + 1));
  return { inputPath: positional[0], keyPath };
}

function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('JSONのルートはオブジェクトである必要があります');
  if (typeof data.date !== 'string' || !data.date) throw new Error('"date" が無いか不正です（例: "2026-11-24"）');
  for (const field of ['title', 'body']) {
    if (!data[field] || typeof data[field] !== 'object') throw new Error(`"${field}" が無いか不正です`);
    const missing = LANGUAGES.filter((lang) => !data[field][lang] || typeof data[field][lang] !== 'string');
    if (missing.length > 0) throw new Error(`"${field}" に未入力の言語があります: ${missing.join(', ')}`);
  }
}

async function main() {
  const { inputPath, keyPath } = parseArgs(process.argv);
  if (!inputPath) {
    console.error('使い方: node scripts/push-announcement.js <announcement.jsonのパス> [--key 鍵のパス]');
    process.exit(1);
  }

  const resolvedKeyPath = path.resolve(keyPath || path.join(__dirname, 'serviceAccountKey.json'));
  if (!fs.existsSync(resolvedKeyPath)) {
    console.error(`サービスアカウント鍵が見つかりません: ${resolvedKeyPath}`);
    console.error('Firebase Console → プロジェクトの設定 → サービスアカウント → 「新しい秘密鍵の生成」で取得してください。');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(inputPath), 'utf-8');
  const data = JSON.parse(raw);
  validate(data);

  // firebase-adminはこのスクリプト専用のdevDependency（アプリ本体のビルドには含まれない）
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(require(resolvedKeyPath)) });

  const ref = await admin.firestore().collection('announcements').add({
    date: data.date,
    title: data.title,
    body: data.body,
  });

  console.log(`お知らせを登録しました: announcements/${ref.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('登録に失敗しました:', e.message || e);
  process.exit(1);
});
