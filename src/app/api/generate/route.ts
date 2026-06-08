// route.ts: サーバー側でGemini APIを呼び出すコード
// ※ このファイルはブラウザには送られません。APIキーが外部に漏れないよう、サーバー専用です。

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Gemini APIクライアントの初期化
// APIキーは .env.local から自動で読み込まれます
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '')

// POSTリクエストを受け取る関数
export async function POST(request: NextRequest) {
  try {
    // リクエストボディからデータを取得
    const body = await request.json()
    const { keyword, target, purpose } = body

    // 入力値のチェック（空の場合はエラーを返す）
    if (!keyword || !target || !purpose) {
      return NextResponse.json(
        { error: 'キーワード、ターゲット、目的は必須です' },
        { status: 400 }
      )
    }

    // 安全のために入力値の長さを制限（長すぎる入力を弾く）
    if (keyword.length > 100 || target.length > 100 || purpose.length > 50) {
      return NextResponse.json(
        { error: '入力が長すぎます。短くしてお試しください。' },
        { status: 400 }
      )
    }

    // Gemini AIへ送るプロンプト（指示文）
    const prompt = `あなたはThreadsのSNSマーケティング専門家です。
以下の条件でThreads投稿用のコンテンツを日本語で生成してください。

【条件】
- キーワード：${keyword}
- ターゲット：${target}
- 投稿目的：${purpose}

以下の7つのカテゴリでコンテンツを生成し、必ずJSONフォーマットのみで返してください。
説明文や前置きは一切不要です。JSONのみを返してください。

{
  "ideas": ["投稿ネタを30個。「〇〇について」という形式で短く書く"],
  "angles": ["伸びやすい切り口を10個。「〜の視点から」「〜と比較すると」などの形式で"],
  "hooks": ["冒頭文フックを20個。読者が思わず続きを読みたくなる最初の1〜2文"],
  "posts": ["そのまま使える投稿文を20個。150文字前後で、Threadsで実際に投稿できる完成した文章"],
  "questions": ["コメントがつきやすい質問文を10個。フォロワーに問いかける形式で"],
  "profileTexts": ["プロフィール誘導文を10個。「プロフィールはこちら→」のように誘導する文"],
  "hashtags": ["ハッシュタグを20個。#から始まる形式で"]
}

重要：必ずこのJSON形式のみで返してください。各配列に指定した数のアイテムを入れてください。`

    // Gemini APIを呼び出す（無料で使えるモデル）
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // JSONを取り出す（余計な文字が含まれる場合に対応）
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AIの応答を解析できませんでした。もう一度お試しください。')
    }

    // JSONをパース（テキストをオブジェクトに変換）
    const parsed = JSON.parse(jsonMatch[0])

    // 必要なキーがすべて存在するか確認
    const requiredKeys = [
      'ideas',
      'angles',
      'hooks',
      'posts',
      'questions',
      'profileTexts',
      'hashtags',
    ]
    for (const key of requiredKeys) {
      if (!Array.isArray(parsed[key])) {
        throw new Error('AIの応答形式が正しくありません。もう一度お試しください。')
      }
    }

    // 正常なレスポンスを返す
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Generate API Error:', error)

    // エラーメッセージを返す
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'サーバーエラーが発生しました。もう一度お試しください。',
      },
      { status: 500 }
    )
  }
}
