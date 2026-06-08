import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export async function POST(request: NextRequest) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const { keyword, target } = await request.json()

    if (!keyword || !target) {
      return NextResponse.json({ error: 'キーワードとターゲットは必須です' }, { status: 400 })
    }
    if (keyword.length > 100 || target.length > 100) {
      return NextResponse.json({ error: '入力が長すぎます' }, { status: 400 })
    }

    const prompt = `あなたはThreadsのSNSマーケティング専門家です。
「${keyword}」ジャンルで「${target}」向けにバズる投稿について分析・生成してください。

以下のJSONフォーマットのみで返してください。説明文は不要です。

{
  "patterns": [
    "このジャンルでバズる投稿の特徴・パターンを5個。例：「〇〇系の投稿は〜という特徴がある」という形式で"
  ],
  "examples": [
    "実際にバズりそうな投稿の例を5個。150文字前後の完成した投稿文で、いいねやコメントが集まりやすいもの"
  ],
  "posts": [
    "ターゲットに刺さるそのまま使える投稿文を10個。150文字前後で、Threadsに投稿できる完成した文章"
  ],
  "hooks": [
    "思わず読み進めたくなる冒頭の一文を5個。インパクトがあり、続きが気になる文章"
  ],
  "hashtags": [
    "#から始まるハッシュタグを10個"
  ]
}

必ずJSON形式のみで返してください。`

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
    })

    const text = completion.choices[0]?.message?.content || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AIの応答を解析できませんでした。もう一度お試しください。')

    const parsed = JSON.parse(match[0])
    for (const key of ['patterns', 'examples', 'posts', 'hooks', 'hashtags']) {
      if (!Array.isArray(parsed[key])) throw new Error('AIの応答形式が正しくありません。もう一度お試しください。')
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'サーバーエラーが発生しました。' },
      { status: 500 }
    )
  }
}
