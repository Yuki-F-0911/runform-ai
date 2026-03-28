import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

enum RunnerLevel {
  BEGINNER = "初心者",
  INTERMEDIATE = "中級者",
  ELITE = "上級者"
}

Deno.serve(async (req) => {
  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment variables are not set");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const accessToken = authorization.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { videoBase64, runnerDescription, targetPace, level, historyRecords } = await req.json();

    // 環境変数からAPIキーを取得
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }

    const ai = new GoogleGenAI({ apiKey });

    const paceInstruction = targetPace
      ? `設定ペースは ${targetPace} min/km です。このペースとピッチの関係からストライド幅の妥当性を評価してください。`
      : "ペースが不明な場合は、映像から速度を推測してストライド幅を評価してください。";

    const personInstruction = runnerDescription
      ? `動画内に複数の人がいる可能性があります。特に「${runnerDescription}」という特徴を持つ人物を重点的に分析してください。`
      : "動画内で最も目立っているランナーを分析してください。複数人いる場合はその旨を指摘してください。";

    const historyInstruction = historyRecords && historyRecords.length > 0
      ? `
      # 過去の履歴データ（比較対象）
      過去に分析された同一ランナーのデータが以下の通り存在します。現在の動画（設定ペース: ${targetPace || '不明'}）と過去データを比較し、以下の「パーソナル分析（定数と変数の特定）」を行ってください。
      ${JSON.stringify(historyRecords.slice(0, 3).map((r: any) => ({
        pace: r.targetPace,
        score: r.overallScore,
        metrics: r.metrics,
        performanceMetrics: r.performanceMetrics,
      })), null, 2)}
      
      ## パーソナル分析指示
      1. **定数（personalConstants）の抽出**: ペースに関わらず共通して見られる、根本的な癖や改善点、もしくは長所を抽出してください。
      2. **変数（paceVariables）の抽出**: ペースの変化（例えばジョグペースからレースペースへの移行時）によって生じるフォームの変化や崩れを特定してください。
      3. **苦手なペース帯（weakPaceZone）**: データから推測される、フォームが最も崩れやすい・非効率になるペース帯を指摘してください。
      4. **総合的フィードバック（historicalFeedback）**: 過去からの改善傾向や、ペース変動に伴う全体像を踏まえたアドバイスを行ってください。
      `
      : "今回は過去の履歴データが提供されていません。現在の動画のみから最大限の分析を行ってください。";

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `
              あなたは、バイオメカニクスと運動生理学を専門とする「世界トップクラスのランニングフォーム解析エキスパート」です。
              
              # タスクの流れ
              1. **客観的計測フェーズ**: 提供された動画をバイオメカニクスの観点で客観的に分析し、定量的な指標（ピッチ、ストライド、接地時間など）を算出してください。この「数値」は対象ランナーのレベルに関わらず、物理的な事実として同一の基準で計測してください。
              2. **推定フェーズ**: 動画から直接取得できない値（速度、距離、ステップ幅、脚剛性など）は、映像情報・既知のランニング知見・設定ペースから合理的に推定してください。推定値は現実的な範囲に収め、confidence を必ず併記してください。
              3. **コーチングフェーズ**: 算出された事実に基づき、以下の「対象ランナーレベル」に合わせたアドバイスを日本語で生成してください。
              
              # 対象ランナーレベルとコーチングの方針
              現在の対象レベル: **${level}**
              ${level === RunnerLevel.BEGINNER
                  ? '- 方針: 「楽しむこと」「怪我の予防」「基本姿勢」を最優先。\n- トーン: 親しみやすく、励ますようなトーン。\n- 言葉遣い: 専門用語（GCT、回内など）は使わず、「着地のリズム」「足の裏全体で」のように噛み砕いて説明してください。'
                  : level === RunnerLevel.INTERMEDIATE
                    ? '- 方針: 「効率性向上」「自己ベスト更新」「基礎的なバイオメカニクスの改善」。\n- トーン: 信頼できるコーチの視点。\n- 言葉遣い: 適度に専門用語を交えつつ、その意味と改善効果を論理的に説明してください。'
                    : '- 方針: 「限界的利益の追求」「理想的なフォームの完成」。ランナーのレベルが高くても、課題点は妥協なく厳しく指摘してください。\n- トーン: 厳密で妥協のない専門家の視点。\n- 言葉遣い: 解剖学・物理学的な用語を用い、微細な動きの修正を求めてください。'
                }

              # 解析指示
              1. ${personInstruction}
              2. ${paceInstruction}
              3. 以下の「評価基準テーブル」を確認用データとして使用し、各項目を評価してください。
              4. 以下の履歴データを基にパーソナルな洞察（定数・変数等）を分析してください。
              ${historyInstruction}

              # 評価基準データ (Reference Data)
              | カテゴリ | 評価項目 | 理想・適正（Elite） | 修正・NG（Bad） | 定量的指標の目安 |
              | :--- | :--- | :--- | :--- | :--- |
              | 全体直進性 | 重心（COM）の軌跡 | 上下動・左右動が少なく滑らか | 左右の蛇行、過度な沈み込み | 上下動幅：4〜8cm |
              | 時間的因子 | 接地時間（GCT） | 短く、弾むような接地 | ベタつき、間延びした接地 | 0.150s〜0.180s |
              | 時間的因子 | 滞空時間（FT） | 十分な滞空。ストライドの確保 | ピッチ過多、チョコチョコ走り | 0.120s以上（GCTと同等以上） |
              | 姿勢 | 体幹の傾き | 軽度前傾（2〜5度）、一直線の軸 | 腰が落ちる、後傾、「く」の字 | 骨盤の適度な前傾保持 |
              | 腕振り | 接地時の腕の位置 | 接地時に同側の肘が後方へ | 腕が前方にある、肩が上がる | 脚との完全な位相同調 |
              | 支持脚接地 | 接地位置 | 重心のほぼ直下（わずかに前方） | 重心より遥か前方（ブレーキ） | COM前方距離：20-30cm以内 |
              | 支持脚接地 | 接地パターン | ミッドフット〜フォアフット | 明らかな踵接地（ヒールストライク） | 6.0m/s以上でフォア優位 |
              | 支持脚剛性 | 膝関節角度変化 | 接地初期の屈曲が最小限 | 膝が深く曲がり、潰れる | Leg Stiffness：屈曲変化が小 |
              | 離地動作 | 足関節の底屈 | 股関節主導での離地 | 足首だけで押し切る（キック過多） | 膝・足首の完全伸展は不要 |
              | 下腿角度 | 接地瞬間の傾斜 | 垂直に近い、または身体側へ傾斜 | 足先が膝より前（Positive Shank） | Negative Shank Angle推奨 |
              | リカバリー | 離地後の足部軌跡 | 踵が素早く坐骨方向へ引き上がる | 足が後ろに流れる（低軌道） | 慣性モーメントの低減 |
              | シザース | 接地時の大腿位置 | 接地時に遊脚が支持脚を追い越す | 遊脚が後ろに残ったまま接地 | 素早い切り返し能力の指標 |
              | 接地準備 | リトラクション | 接地直前に足を後ろへ引き戻す | 膝を伸ばしたまま遠くへ着地 | Active Landing：対地速度ゼロ |

              # 出力要件（JSON）
              提供されたJSONスキーマに厳密に従ってください。
              **重要: 全てのテキストフィールド（summary, finding, advice, trainingStepsなど）は必ず日本語で出力してください。**
              
              - **metrics**: オブジェクトとして、客観的または合理的推定の数値を入力（レベルによる補正なし）。
              - **runnerProfile**: その人の特徴量抽出。走速度、推定走行距離、走タイプ、強み、制限因子をまとめてください。
              - **performanceMetrics**: スプリントやランニングにおける重要定量値。stepFrequency, stepsPerMeter, cadenceReserve, projected100mTime, projected5kTime, accelerationIndex, sprintMechanicalScore, runningEconomyScore, fatigueResistanceScore, dataConfidence を返してください。
              - **challengeProposals**: 速度・距離・フォーム課題から逆算した具体的な改善課題を 3 件以上返してください。
              - **observations**: 各関節・部位ごとの評価。findingは客観的事実、adviceは上記コーチング方針に基づいたアドバイス。
              - **summary**: コーチング方針に基づいた総合的なフィードバック。
              - **trainingSteps**: コーチング方針に基づいた具体的なトレーニング提案。
              - **overallScore**: 100点満点でのスコア。
              - **advancedInsights**: （履歴データがある場合特に重要）定数と変数などのパーソナルな洞察。
              
              `
            },
            {
              inlineData: {
                mimeType: "video/mp4",
                data: videoBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER },
            metrics: {
              type: Type.OBJECT,
              properties: {
                cadence: { type: Type.NUMBER, description: "spm" },
                strideLength: { type: Type.NUMBER, description: "meters" },
                groundContactTime: { type: Type.NUMBER, description: "ms" },
                verticalOscillation: { type: Type.NUMBER, description: "cm" },
                flightTime: { type: Type.NUMBER, description: "ms" },
                stepTime: { type: Type.NUMBER, description: "ms" },
                dutyFactor: { type: Type.NUMBER, description: "%" },
                stepWidth: { type: Type.NUMBER, description: "cm" },
                strideAngle: { type: Type.NUMBER, description: "degrees" },
                legStiffness: { type: Type.NUMBER, description: "kN/m" },
                symmetryScore: { type: Type.NUMBER, description: "0-100" },
                brakingIndex: { type: Type.NUMBER, description: "0-100" }
              },
              required: [
                "cadence",
                "strideLength",
                "groundContactTime",
                "verticalOscillation",
                "flightTime",
                "stepTime",
                "dutyFactor",
                "stepWidth",
                "strideAngle",
                "legStiffness",
                "symmetryScore",
                "brakingIndex"
              ]
            },
            runnerProfile: {
              type: Type.OBJECT,
              properties: {
                runningType: { type: Type.STRING },
                estimatedSpeedKmh: { type: Type.NUMBER },
                estimatedDistanceM: { type: Type.NUMBER },
                speedBand: { type: Type.STRING },
                dominantStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                limiterFactors: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: [
                "runningType",
                "estimatedSpeedKmh",
                "estimatedDistanceM",
                "speedBand",
                "dominantStrengths",
                "limiterFactors"
              ]
            },
            performanceMetrics: {
              type: Type.OBJECT,
              properties: {
                strideFrequencyHz: { type: Type.NUMBER },
                stepsPerMeter: { type: Type.NUMBER },
                cadenceReserve: { type: Type.NUMBER },
                projected100mTime: { type: Type.NUMBER },
                projected5kTime: { type: Type.STRING },
                accelerationIndex: { type: Type.NUMBER },
                sprintMechanicalScore: { type: Type.NUMBER },
                runningEconomyScore: { type: Type.NUMBER },
                fatigueResistanceScore: { type: Type.NUMBER },
                dataConfidence: { type: Type.NUMBER, description: "0-100" }
              },
              required: [
                "strideFrequencyHz",
                "stepsPerMeter",
                "cadenceReserve",
                "projected100mTime",
                "projected5kTime",
                "accelerationIndex",
                "sprintMechanicalScore",
                "runningEconomyScore",
                "fatigueResistanceScore",
                "dataConfidence"
              ]
            },
            observations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  joint: { type: Type.STRING },
                  finding: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  advice: { type: Type.STRING }
                }
              }
            },
            footStrike: { type: Type.STRING, enum: ["Heel", "Midfoot", "Forefoot"] },
            summary: { type: Type.STRING },
            trainingSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            challengeProposals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  targetMetric: { type: Type.STRING },
                  currentValue: { type: Type.STRING },
                  targetValue: { type: Type.STRING },
                  timeframe: { type: Type.STRING }
                },
                required: ["title", "reason", "targetMetric", "currentValue", "targetValue", "timeframe"]
              }
            },
            advancedInsights: {
              type: Type.OBJECT,
              properties: {
                personalConstants: { type: Type.ARRAY, items: { type: Type.STRING }, description: "ペースに関わらず共通する癖や長所" },
                paceVariables: { type: Type.ARRAY, items: { type: Type.STRING }, description: "ペースによって変化・崩れる要素" },
                weakPaceZone: { type: Type.STRING, description: "フォームが崩れやすいペース帯（例: 4:30〜5:00 min/km）" },
                historicalFeedback: { type: Type.STRING, description: "履歴を踏まえた総合的なフィードバック" }
              },
              required: ["personalConstants", "paceVariables", "historicalFeedback"]
            }
          },
          required: [
            "overallScore",
            "metrics",
            "runnerProfile",
            "performanceMetrics",
            "observations",
            "footStrike",
            "summary",
            "trainingSteps",
            "challengeProposals"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("AIから分析結果を受け取れませんでした。");
    }

    const data = JSON.parse(response.text);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error analyzing running form:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
