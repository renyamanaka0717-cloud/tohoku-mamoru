import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export async function POST(request: NextRequest) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const { keyword, target, references } = await request.json()

    if (!keyword || !target) {
      return NextResponse.json({ error: 'キーワードとターゲットは必須です' }, { status: 400 })
    }
    if (keyword.length > 100 || target.length > 100 || (references && references.length > 2000)) {
      return NextResponse.json({ error: '入力が長すぎます' }, { status: 400 })
    }

    // 参考投稿がある場合とない場合でプロンプトを切り替える
    const referenceSection = references
      ? `
【参考にするバズ投稿】
${references}

上記の投稿を分析し、なぜバズっているのか（文体・構成・感情・言葉選びなど）を明らかにしてください。
その分析をもとに、同じようなバズを生む投稿文を生成してください。`
      : ''

    const prompt = `あなたはThreadsのSNSマーケティング専門家です。
「${keyword}」ジャンルで「${target}」向けの投稿を分析・生成してください。
${referenceSection}

以下のJSONフォーマットのみで返してください。説明文は不要です。

{
  "analysis": [
    ${references
      ? '"参考投稿を分析した結果を3〜5個。なぜバズったのか、どんな特徴があるか（文体・構成・感情訴求・言葉選びなど）を具体的に"'
      : ''}
  ],
  "patterns": [
    "このジャンルでバズる投稿の特徴・パターンを5個。具体的に「〇〇系の投稿は〜という特徴がある」という形式で"
  ],
  "posts": [
    "ターゲットに刺さるそのまま使える投稿文を10個。150文字前後で完成した文章。${references ? '参考投稿のバズった要素を取り入れること' : 'バズりやすい型を使うこと'}"
  ],
  "hooks": [
    "思わず続きを読みたくなる冒頭の一文を5個。インパクトがあり、スクロールを止める文章"
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
    for (const key of ['analysis', 'patterns', 'posts', 'hooks', 'hashtags']) {
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
