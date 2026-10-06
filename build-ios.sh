#!/bin/bash
set -e

echo "📦 APIルートを一時的に退避..."
if [ -d src/app/_api ] && [ ! -d src/app/api ]; then
  echo "  (前回の退避済みファイルを再利用)"
elif [ -d src/app/api ]; then
  [ -d src/app/_api ] && rm -rf src/app/_api
  mv src/app/api src/app/_api
fi

echo "🔨 iOSビルド中..."
BUILD_TARGET=ios npm run build

echo "📦 APIルートを戻す..."
mv src/app/_api src/app/api

echo "🔄 Capacitorと同期中..."
./node_modules/.bin/cap sync ios

# native-ios/ のファイルは、Xcodeに既に追加済み（＝ios/App以下のどこかに同名ファイルが
# 既に存在する）ものだけを中身ごと上書きコピーする。ios/はgitignore対象でgit pullしても
# 自動更新されないため、ビルドのたびにここで同期する。新規ファイルの追加だけは
# Xcodeプロジェクトファイル（project.pbxproj）の書き換えが必要なため対象外（手動でXcodeに
# 追加すること。未追加のファイルは警告を出してスキップする）
if [ -d ios/App ]; then
  echo "🔁 ネイティブプラグインの内容を同期中..."
  for src in native-ios/*.swift native-ios/*.m native-ios/Widgets/*.swift native-ios/Widgets/*.xcstrings native-ios/Watch/*.swift; do
    [ -f "$src" ] || continue
    name=$(basename "$src")
    dest=$(find ios/App -type f -name "$name" 2>/dev/null | head -n1)
    if [ -n "$dest" ]; then
      cp "$src" "$dest"
    else
      echo "  ⚠️  $name は未追加のためスキップ（Xcodeで手動追加が必要）"
    fi
  done
fi

echo "✅ 完了！次のコマンドでXcodeを開いてください："
echo "   npx cap open ios"
