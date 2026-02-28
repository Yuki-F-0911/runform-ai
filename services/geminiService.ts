
import { AnalysisResult, RunnerLevel } from "../types";
import { supabase } from "./supabaseClient";

export const analyzeRunningForm = async (
  videoBase64: string,
  runnerDescription: string,
  targetPace: string,
  level: RunnerLevel,
  historyRecords: AnalysisResult[] = []
): Promise<AnalysisResult> => {
  const { data, error } = await supabase.functions.invoke('analyze-running-form', {
    body: { videoBase64, runnerDescription, targetPace, level, historyRecords }
  });

  if (error) {
    throw new Error(`AI解析エラー: ${error.message}`);
  }

  if (!data) {
    throw new Error("AIから分析結果を受け取れませんでした。");
  }

  return {
    ...data,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    targetPace,
    runnerDescription,
    runnerLevel: level
  } as AnalysisResult;
};
