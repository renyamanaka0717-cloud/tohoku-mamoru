#!/bin/bash
set -e

echo "📦 APIルートを一時的に退避..."
if [ -d src/app/_api ] && [ ! -d src/app/api ]; then
  echo "  (前回の退避済みファイルを再利用)"
elif [ -d src/app/api ]; then
  [ -d src/app/_api ] && rm -rf src/app/_api
  mv src/app/api src/app/_api
fi

echo "🔨 Androidビルド中..."
# クローズドテスト用に購入フロー無しで全員PRO化したいビルドだけ、呼び出し時に
# NEXT_PUBLIC_FORCE_PREMIUM_ANDROID=true ./build-android.sh のように付ける（本番ビルドでは付けない）
BUILD_TARGET=android npm run build

echo "📦 APIルートを戻す..."
mv src/app/_api src/app/api

echo "🔄 Capacitorと同期中..."
./node_modules/.bin/cap sync android

# native-android/ のファイルは、android/app/src以下に既に同名ファイルが存在するものだけ
# 中身ごと上書きコピーする。android/はgitignore対象でgit pullしても自動更新されないため、
# ビルドのたびにここで同期する。*.snippet.xml（AndroidManifest.xml等へ手動で部分的に
# マージする断片）は対象外。新規ファイルの追加はAndroid Studioで手動で行うこと
# （未追加のファイルは警告を出してスキップする）
if [ -d android/app/src ]; then
  echo "🔁 ネイティブプラグインの内容を同期中..."
  for src in native-android/*.kt native-android/*.java native-android/res/*/*.xml; do
    [ -f "$src" ] || continue
    name=$(basename "$src")
    dest=$(find android/app/src -type f -name "$name" 2>/dev/null | head -n1)
    if [ -n "$dest" ]; then
      cp "$src" "$dest"
    else
      echo "  ⚠️  $name は未追加のためスキップ（Android Studioで手動追加が必要）"
    fi
  done
fi

echo "✅ 完了！次のコマンドでAndroid Studioを開いてください："
echo "   npx cap open android"
