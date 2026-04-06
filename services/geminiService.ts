import { AnalysisResult, RunnerLevel } from "../types";
import { supabase } from "./supabaseClient";

export const MAX_ANALYSIS_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_ANALYSIS_VIDEO_MB = Math.round(MAX_ANALYSIS_VIDEO_BYTES / (1024 * 1024));

interface InvokeAnalyzeParams {
  videoUrl: string;
  runnerDescription: string;
  targetPace: string;
  level: RunnerLevel;
  historyRecords: AnalysisResult[];
  accessToken: string;
}

interface ErrorContextLike {
  status?: number;
  clone?: () => ErrorContextLike;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

const getErrorContext = (error: unknown): ErrorContextLike | null => {
  if (typeof error !== "object" || error === null || !("context" in error)) {
    return null;
  }

  const context = (error as { context?: unknown }).context;
  if (typeof context !== "object" || context === null) {
    return null;
  }

  return context as ErrorContextLike;
};

const getHttpStatus = (error: unknown): number | null => {
  const context = getErrorContext(error);
  if (!context || typeof context.status !== "number") {
    return null;
  }

  return context.status;
};

const extractEdgeFunctionErrorDetail = async (error: unknown): Promise<string | null> => {
  const context = getErrorContext(error);
  if (!context) {
    return null;
  }

  const response = typeof context.clone === "function" ? context.clone() : context;

  try {
    if (typeof response.json === "function") {
      const payload = await response.json();
      if (typeof payload === "object" && payload !== null) {
        const detail =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "message" in payload && typeof payload.message === "string"
              ? payload.message
              : null;
        if (detail) {
          return detail;
        }
      }
    }
  } catch {
    // Ignore JSON parse failures and fall back to plain text.
  }

  try {
    if (typeof response.text === "function") {
      const detail = (await response.text()).trim();
      if (detail) {
        return detail;
      }
    }
  } catch {
    // Ignore text extraction failures.
  }

  return null;
};

const buildAnalyzeErrorMessage = async (error: unknown): Promise<string> => {
  const status = getHttpStatus(error);
  const detail = await extractEdgeFunctionErrorDetail(error);

  if (detail?.includes("GEMINI_API_KEY")) {
    return "Supabase Edge Function に `GEMINI_API_KEY` が設定されていません。Supabase Secrets を設定してください。";
  }

  if (status === 404) {
    return "Supabase Edge Function `analyze-running-form` が見つかりません。関数のデプロイ状態を確認してください。";
  }

  if (status === 413) {
    return `動画ファイルが大きすぎます。${MAX_ANALYSIS_VIDEO_MB}MB 以下の短い動画で再試行してください。`;
  }

  if (status === 546) {
    return `Edge Function の処理上限に達しました。動画サイズか処理量が大きすぎるため、${MAX_ANALYSIS_VIDEO_MB}MB 以下の短い動画にしてください。`;
  }

  if (detail) {
    return `AI解析エラー: ${detail}`;
  }

  if (error instanceof Error) {
    return `AI解析エラー: ${error.message}`;
  }

  return "AI解析エラー: Edge Function returned a non-2xx status code";
};

const invokeAnalyzeRunningForm = async ({
  videoUrl,
  runnerDescription,
  targetPace,
  level,
  historyRecords,
  accessToken,
}: InvokeAnalyzeParams): Promise<AnalysisResult> => {
  const { data, error } = await supabase.functions.invoke("analyze-running-form", {
    body: { videoUrl, runnerDescription, targetPace, level, historyRecords },
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
  videoUrl: string,
  runnerDescription: string,
  targetPace: string,
  level: RunnerLevel,
  historyRecords: AnalysisResult[] = []
): Promise<AnalysisResult> => {
  if (!videoUrl.trim()) {
    throw new Error("解析対象の動画URLを取得できませんでした。");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const initialToken = sessionData.session?.access_token;

  if (!initialToken) {
    throw new Error("ログインセッションが見つかりません。再ログインしてください。");
  }

  try {
    const data = await invokeAnalyzeRunningForm({
      videoUrl,
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
      throw new Error(await buildAnalyzeErrorMessage(error));
    }

    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshedData.session?.access_token;

    if (refreshError || !refreshedToken) {
      throw new Error("セッションが切れています。再ログインしてから再試行してください。");
    }

    try {
      const retriedData = await invokeAnalyzeRunningForm({
        videoUrl,
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

      throw new Error(await buildAnalyzeErrorMessage(retryError));
    }
  }
};
