
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const API_KEY = process.env.API_KEY || "";

export const analyzeRunningForm = async (
  videoBase64: string, 
  runnerDescription: string, 
  targetPace: string
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const paceInstruction = targetPace 
    ? `設定ペースは ${targetPace} min/km です。このペースとピッチの関係からストライド幅の妥当性を評価してください。` 
    : "ペースが不明な場合は、映像から速度を推測してストライド幅を評価してください。";

  const personInstruction = runnerDescription 
    ? `動画内に複数の人がいる可能性があります。特に「${runnerDescription}」という特徴を持つ人物を重点的に分析してください。` 
    : "動画内で最も目立っているランナーを分析してください。複数人いる場合はその旨を指摘してください。";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `ランニングフォーム解析エキスパートとして振る舞ってください。
            
            指示:
            1. ${personInstruction}
            2. ${paceInstruction}
            3. バイオメカニクス（ピッチ、接地時間、上下動、滞空時間）を数値化してください。
            4. 着地パターン（ヒール/ミッド/フォア）を判定してください。
            5. 日本語で具体的な改善アドバイスとトレーニング方法を提案してください。
            
            出力形式は必ず日本語のJSONとし、提供されたスキーマを厳守してください。`
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
              flightTime: { type: Type.NUMBER, description: "ms" }
            },
            required: ["cadence", "strideLength", "groundContactTime", "verticalOscillation", "flightTime"]
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
          }
        },
        required: ["overallScore", "metrics", "observations", "footStrike", "summary", "trainingSteps"]
      }
    }
  });

  if (!response.text) {
    throw new Error("AIから分析結果を受け取れませんでした。");
  }

  const data = JSON.parse(response.text);
  return {
    ...data,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    targetPace,
    runnerDescription
  } as AnalysisResult;
};
