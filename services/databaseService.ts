/**
 * データベースサービス
 * Supabase を使用して解析結果の CRUD 操作と動画ファイルのストレージ管理を行う
 */

import { supabase } from './supabaseClient';
import { AnalysisResult } from '../types';

// DB のカラム名（スネークケース）とアプリの型（キャメルケース）のマッピング
interface DbAnalysisRow {
    id: string;
    user_id: string;
    timestamp: string;
    overall_score: number;
    metrics: object;
    observations: object[];
    foot_strike: string;
    summary: string;
    training_steps: string[];
    target_pace: string | null;
    runner_description: string | null;
    runner_level: string;
    video_path: string | null;
    created_at: string;
}

/**
 * DB行をアプリの AnalysisResult 型に変換する
 */
const rowToResult = (row: DbAnalysisRow): AnalysisResult => ({
    id: row.id,
    timestamp: row.timestamp,
    overallScore: row.overall_score,
    metrics: row.metrics as AnalysisResult['metrics'],
    observations: row.observations as AnalysisResult['observations'],
    footStrike: row.foot_strike as AnalysisResult['footStrike'],
    summary: row.summary,
    trainingSteps: row.training_steps,
    targetPace: row.target_pace || undefined,
    runnerDescription: row.runner_description || undefined,
    runnerLevel: row.runner_level as AnalysisResult['runnerLevel'],
    videoPath: row.video_path || undefined,
    userId: row.user_id,
});

/**
 * 動画ファイルを Supabase Storage にアップロードする
 * @param file - アップロードする動画ファイル
 * @param userId - ユーザーID（フォルダとして使用）
 * @returns Storage 内のファイルパス
 */
export const uploadVideo = async (file: File, userId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'mp4';
    const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
        .from('videos')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) {
        throw new Error(`動画のアップロードに失敗しました: ${error.message}`);
    }

    return fileName;
};

/**
 * 解析結果をデータベースに保存する
 * @param result - 保存する解析結果
 * @param userId - ユーザーID
 * @param videoPath - ストレージ内の動画パス（任意）
 */
export const saveAnalysisResult = async (
    result: AnalysisResult,
    userId: string,
    videoPath?: string
): Promise<void> => {
    const { error } = await supabase.from('analysis_results').insert({
        id: result.id,
        user_id: userId,
        timestamp: result.timestamp,
        overall_score: result.overallScore,
        metrics: result.metrics,
        observations: result.observations,
        foot_strike: result.footStrike,
        summary: result.summary,
        training_steps: result.trainingSteps,
        target_pace: result.targetPace || null,
        runner_description: result.runnerDescription || null,
        runner_level: result.runnerLevel,
        video_path: videoPath || null,
    });

    if (error) {
        throw new Error(`解析結果の保存に失敗しました: ${error.message}`);
    }
};

/**
 * ユーザーの解析履歴をデータベースから取得する
 * @param userId - ユーザーID
 * @returns 解析結果の配列（新しい順）
 */
export const fetchAnalysisHistory = async (userId: string): Promise<AnalysisResult[]> => {
    const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

    if (error) {
        throw new Error(`履歴の取得に失敗しました: ${error.message}`);
    }

    return (data || []).map(rowToResult);
};

/**
 * 解析結果と関連動画を削除する
 * @param id - 解析結果のID
 * @param userId - ユーザーID
 */
export const deleteAnalysisResult = async (id: string, userId: string): Promise<void> => {
    // まずレコードを取得して動画パスを確認
    const { data } = await supabase
        .from('analysis_results')
        .select('video_path')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    // 動画ファイルがあれば削除
    if (data?.video_path) {
        await supabase.storage.from('videos').remove([data.video_path]);
    }

    // DBレコードを削除
    const { error } = await supabase
        .from('analysis_results')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) {
        throw new Error(`解析結果の削除に失敗しました: ${error.message}`);
    }
};

/**
 * ストレージ上の動画の署名付き URL を生成する
 * @param videoPath - Storage 内のファイルパス
 * @returns 一時的にアクセス可能な URL（有効期限: 1時間）
 */
export const getVideoUrl = async (videoPath: string): Promise<string> => {
    const { data, error } = await supabase.storage
        .from('videos')
        .createSignedUrl(videoPath, 3600);

    if (error) {
        throw new Error(`動画URLの生成に失敗しました: ${error.message}`);
    }

    return data.signedUrl;
};
