#!/bin/bash
set -e

echo "📦 APIルートを一時的に退避..."
mv src/app/api src/app/_api

echo "🔨 iOSビルド中..."
BUILD_TARGET=ios npm run build

echo "📦 APIルートを戻す..."
mv src/app/_api src/app/api

echo "🔄 Capacitorと同期中..."
npx cap sync ios

echo "✅ 完了！次のコマンドでXcodeを開いてください："
echo "   npx cap open ios"
