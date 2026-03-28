
import { AnalysisResult, RunnerLevel } from "../types";
import { supabase } from "./supabaseClient";

interface InvokeAnalyzeParams {
  videoBase64: string;
  runnerDescription: string;
  targetPace: string;
  level: RunnerLevel;
  historyRecords: AnalysisResult[];
  accessToken: string;
}

const getHttpStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("context" in error)) {
    return null;
  }

  const context = (error as { context?: unknown }).context;
  if (typeof context !== "object" || context === null || !("status" in context)) {
    return null;
  }

  const status = (context as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
};

const invokeAnalyzeRunningForm = async ({
  videoBase64,
  runnerDescription,
  targetPace,
  level,
  historyRecords,
  accessToken,
}: InvokeAnalyzeParams): Promise<AnalysisResult> => {
  const { data, error } = await supabase.functions.invoke("analyze-running-form", {
    body: { videoBase64, runnerDescription, targetPace, level, historyRecords },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("AIから分析結果を受け取れませんでした。");
  }

  return data as AnalysisResult;
};

export const analyzeRunningForm = async (
  videoBase64: string,
  runnerDescription: string,
  targetPace: string,
  level: RunnerLevel,
  historyRecords: AnalysisResult[] = []
): Promise<AnalysisResult> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const initialToken = sessionData.session?.access_token;

  if (!initialToken) {
    throw new Error("ログインセッションが見つかりません。再ログインしてください。");
  }

  try {
    const data = await invokeAnalyzeRunningForm({
      videoBase64,
      runnerDescription,
      targetPace,
      level,
      historyRecords,
      accessToken: initialToken,
    });

    return {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      targetPace,
      runnerDescription,
      runnerLevel: level
    } as AnalysisResult;
  } catch (error) {
    const status = getHttpStatus(error);
    if (status !== 401) {
      if (error instanceof Error) {
        throw new Error(`AI解析エラー: ${error.message}`);
      }
      throw new Error("AI解析エラー: Edge Function returned a non-2xx status code");
    }

    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshedData.session?.access_token;

    if (refreshError || !refreshedToken) {
      throw new Error("セッションが切れています。再ログインしてから再試行してください。");
    }

    try {
      const retriedData = await invokeAnalyzeRunningForm({
        videoBase64,
        runnerDescription,
        targetPace,
        level,
        historyRecords,
        accessToken: refreshedToken,
      });

      return {
        ...retriedData,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        targetPace,
        runnerDescription,
        runnerLevel: level
      } as AnalysisResult;
    } catch (retryError) {
      const retryStatus = getHttpStatus(retryError);
      if (retryStatus === 401) {
        throw new Error("セッションが切れています。再ログインしてから再試行してください。");
      }

      if (retryError instanceof Error) {
        throw new Error(`AI解析エラー: ${retryError.message}`);
      }
      throw new Error("AI解析エラー: Edge Function returned a non-2xx status code");
    }
  }
};
