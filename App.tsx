
import React, { useState, useRef, useEffect } from 'react';
import { AnalysisStatus, AnalysisResult, RunnerLevel } from './types';
import { analyzeRunningForm } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import {
  uploadVideo,
  saveAnalysisResult,
  fetchAnalysisHistory,
  deleteAnalysisResult,
  getVideoUrl,
} from './services/databaseService';
import MetricsChart from './components/MetricsChart';
import AuthForm from './components/AuthForm';
import type { User } from '@supabase/supabase-js';

const App: React.FC = () => {
  // 認証ステート
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 解析ステート
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 解析設定
  const [targetPace, setTargetPace] = useState<string>('');
  const [runnerDesc, setRunnerDesc] = useState<string>('');
  const [runnerLevel, setRunnerLevel] = useState<RunnerLevel>(RunnerLevel.INTERMEDIATE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 保存状態の表示
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 認証状態の監視
  useEffect(() => {
    // 初期セッション確認
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // 認証状態の変更をリッスン
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ユーザーがログインしたら履歴を読み込み
  useEffect(() => {
    if (user) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [user]);

  /** Supabase DB から解析履歴を取得する */
  const loadHistory = async () => {
    if (!user) return;
    try {
      const data = await fetchAnalysisHistory(user.id);
      setHistory(data);
    } catch (e) {
      console.error('履歴の読み込みに失敗:', e);
      // フォールバック: ローカルストレージ
      const saved = localStorage.getItem('runform_history');
      if (saved) {
        try { setHistory(JSON.parse(saved)); } catch { /* 無視 */ }
      }
    }
  };

  const footStrikeMap: Record<string, string> = {
    'Heel': 'ヒール',
    'Midfoot': 'ミッドフット',
    'Forefoot': 'フォアフット'
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setStatus(AnalysisStatus.PREPARING);
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile || !user) return;

    setStatus(AnalysisStatus.ANALYZING);
    setError(null);
    setSaveStatus(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          // AI解析を実行
          const analysisResult = await analyzeRunningForm(base64String, runnerDesc, targetPace, runnerLevel);

          // 並行して動画をStorageにアップロード
          setSaveStatus('動画をアップロード中...');
          let videoPath: string | undefined;
          try {
            videoPath = await uploadVideo(selectedFile, user.id);
          } catch (uploadErr) {
            console.warn('動画のアップロードに失敗（解析結果は保存されます）:', uploadErr);
          }

          // 解析結果にvideoPathを追加
          const enrichedResult: AnalysisResult = {
            ...analysisResult,
            videoPath,
            userId: user.id,
          };

          // DBに保存
          setSaveStatus('解析結果を保存中...');
          try {
            await saveAnalysisResult(enrichedResult, user.id, videoPath);
          } catch (saveErr) {
            console.warn('DB保存に失敗（ローカルに保持します）:', saveErr);
          }

          // ローカルストレージにもバックアップ保存
          const updatedHistory = [enrichedResult, ...history];
          localStorage.setItem('runform_history', JSON.stringify(updatedHistory));

          setResult(enrichedResult);
          setHistory(updatedHistory);
          setStatus(AnalysisStatus.COMPLETED);
          setSaveStatus(null);
        } catch (err) {
          console.error(err);
          setError("AI分析中にエラーが発生しました。");
          setStatus(AnalysisStatus.ERROR);
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setError("ファイルの読み込みに失敗しました。");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    try {
      await deleteAnalysisResult(id, user.id);
    } catch (err) {
      console.warn('DB削除に失敗:', err);
    }

    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem('runform_history', JSON.stringify(updated));
      return updated;
    });

    if (result?.id === id) {
      setResult(null);
      setStatus(AnalysisStatus.IDLE);
    }
  };

  /** 履歴アイテムクリック時に動画URLを取得して結果を表示する */
  const handleSelectHistoryItem = async (item: AnalysisResult) => {
    setResult(item);
    setStatus(AnalysisStatus.COMPLETED);

    // 動画パスがある場合は署名付きURLを取得
    if (item.videoPath) {
      try {
        const url = await getVideoUrl(item.videoPath);
        setVideoPreview(url);
      } catch (err) {
        console.warn('動画URLの取得に失敗:', err);
        setVideoPreview(null);
      }
    } else {
      setVideoPreview(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setHistory([]);
    setResult(null);
    setStatus(AnalysisStatus.IDLE);
    setVideoPreview(null);
  };

  const reset = () => {
    setStatus(AnalysisStatus.IDLE);
    setResult(null);
    setVideoPreview(null);
    setError(null);
    setSelectedFile(null);
    setSaveStatus(null);
  };

  // 認証ローディング中
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-800 border-t-green-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未認証: 認証フォームを表示
  if (!user) {
    return <AuthForm />;
  }

  // 認証済み: メインアプリ
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col md:flex-row relative overflow-hidden font-sans text-text-primary">
      {/* 背景装飾 */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] bg-accent-secondary/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* サイドバー: 履歴 */}
      <aside className="w-full md:w-80 bg-bg-secondary/60 backdrop-blur-xl border-r border-white/5 p-6 overflow-y-auto max-h-screen relative z-10 custom-scrollbar">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-bg-tertiary flex items-center justify-center">
            <i className="fas fa-history text-text-secondary text-sm"></i>
          </div>
          <h2 className="font-bold text-white tracking-wide">Analysis History</h2>
        </div>

        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-12 px-4 neo-card bg-bg-primary/30 border-dashed border-white/10">
              <i className="fas fa-inbox text-3xl text-text-muted mb-3 block"></i>
              <p className="text-text-muted text-sm tracking-wide">履歴はありません</p>
            </div>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                onClick={() => handleSelectHistoryItem(item)}
                className={`neo-card p-4 transition-all cursor-pointer group relative overflow-hidden ${result?.id === item.id ? 'border-accent-primary/50 shadow-[0_4px_20px_rgba(34,197,94,0.15)] bg-accent-primary/5' : 'border-white/5 hover:border-white/10 hover:bg-white/5'}`}
              >
                {result?.id === item.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-gradient shadow-[0_0_10px_var(--accent-glow)]"></div>
                )}
                <div className="flex justify-between items-start mb-2 pl-1">
                  <span className="text-xs font-mono text-text-muted tracking-wide">{new Date(item.timestamp).toLocaleDateString()}</span>
                  <button onClick={(e) => handleDeleteHistoryItem(item.id, e)} className="w-6 h-6 rounded-md flex items-center justify-center bg-bg-tertiary text-text-muted hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                    <i className="fas fa-trash-alt text-[10px]"></i>
                  </button>
                </div>
                <div className="text-sm font-bold text-white mb-3 pl-1 leading-snug truncate">
                  {item.runnerDescription || 'Runner Analysis'}
                </div>
                <div className="flex justify-between items-center pl-1">
                  <div className="flex items-center gap-1.5 align-middle">
                    <span className="inline-flex items-center justify-center min-w-8 h-5 px-1.5 bg-bg-tertiary rounded text-xs font-bold text-white border border-white/5">
                      <span className="text-[9px] text-text-muted mr-1 uppercase">Score</span>
                      {item.overallScore}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.videoPath && <i className="fas fa-video text-[10px] text-accent-primary opacity-80" title="動画あり"></i>}
                    <span className="text-[10px] text-text-muted font-mono bg-bg-primary/50 px-1.5 py-0.5 rounded">{item.targetPace || '--'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-10">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 animate-fade-in-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent-gradient rounded-xl flex items-center justify-center shadow-lg shadow-accent-primary/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/20"></div>
                <i className="fas fa-running text-2xl text-white relative z-10"></i>
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                RunForm <span className="gradient-text">AI</span>
              </h1>
            </div>

            <div className="flex items-center gap-5 bg-bg-secondary/40 backdrop-blur-md border border-white/5 rounded-full px-5 py-2.5">
              {status !== AnalysisStatus.IDLE && (
                <>
                  <button onClick={reset} className="text-sm font-bold text-text-secondary hover:text-white transition-colors flex items-center gap-2">
                    <i className="fas fa-plus-circle text-accent-primary"></i> 新規解析
                  </button>
                  <div className="w-px h-4 bg-white/10"></div>
                </>
              )}
              {/* ユーザー情報 & ログアウト */}
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <i className="fas fa-user text-[10px] text-text-muted"></i>
                </div>
                <span className="text-xs font-medium text-text-secondary hidden md:block truncate max-w-[140px]" title={user.email || ''}>
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-white hover:bg-white/5 transition-all"
                  title="ログアウト"
                >
                  <i className="fas fa-sign-out-alt text-sm"></i>
                </button>
              </div>
            </div>
          </header>

          <main>
            {status === AnalysisStatus.IDLE && (
              <div className="animate-fade-in-up delay-100 flex flex-col items-center justify-center py-28 px-4 glass-card border-dashed border-2 border-white/10 hover:border-accent-primary/30 transition-colors group">
                <div className="w-20 h-20 bg-bg-tertiary rounded-2xl flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <i className="fas fa-cloud-upload-alt text-3xl text-text-muted group-hover:text-accent-primary transition-colors"></i>
                </div>
                <h2 className="text-2xl font-bold mb-3 tracking-tight text-white">ランニング動画を分析</h2>
                <p className="text-text-secondary text-sm mb-8 text-center max-w-md leading-relaxed">
                  動画をアップロードして、高度なAIバイオメカニクス解析を実行します。<br />データはセキュアなクラウド環境に保存されます。
                </p>
                <input type="file" accept="video/*" className="hidden" ref={fileInputRef} onChange={onFileSelect} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-primary"
                >
                  <i className="fas fa-video mr-1"></i> ファイルを選択する
                </button>
              </div>
            )}

            {status === AnalysisStatus.PREPARING && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up">
                <div className="glass-card p-8 order-2 lg:order-1">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><i className="fas fa-sliders-h text-text-muted text-sm"></i> 分析設定</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">ターゲット（任意）</label>
                      <input
                        type="text"
                        placeholder="例: 赤いシャツ、右側の走者"
                        className="w-full input-premium py-3 px-4"
                        value={runnerDesc}
                        onChange={(e) => setRunnerDesc(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">走行ペース（任意）</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          placeholder="4:00"
                          className="w-32 input-premium py-3 px-4 font-mono text-center"
                          value={targetPace}
                          onChange={(e) => setTargetPace(e.target.value)}
                        />
                        <span className="text-text-muted text-sm font-bold">min / km</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-3">ランナーレベル</label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { val: RunnerLevel.BEGINNER, label: 'Beginner', icon: 'fa-seedling' },
                          { val: RunnerLevel.INTERMEDIATE, label: 'Intermediate', icon: 'fa-shoe-prints' },
                          { val: RunnerLevel.ELITE, label: 'Elite', icon: 'fa-medal' }
                        ].map((level) => (
                          <button
                            key={level.val}
                            onClick={() => setRunnerLevel(level.val)}
                            className={`p-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-2 border 
                              ${runnerLevel === level.val
                                ? 'bg-accent-primary/10 text-accent-primary border-accent-primary/30 shadow-[0_0_15px_var(--accent-glow)]'
                                : 'bg-bg-tertiary/50 text-text-muted border-transparent hover:bg-bg-tertiary hover:text-white'}`}
                          >
                            <i className={`fas ${level.icon} text-lg mb-1`}></i>
                            {level.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                      <button
                        onClick={handleStartAnalysis}
                        className="w-full btn-primary h-14"
                      >
                        <i className="fas fa-robot text-sm"></i>
                        AI解析を開始する
                      </button>
                    </div>
                  </div>
                </div>

                <div className="neo-card overflow-hidden bg-black/50 order-1 lg:order-2 flex flex-col">
                  <div className="px-4 py-3 border-b border-white/5 bg-bg-secondary/80 flex items-center justify-between">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Preview</span>
                    <span className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-primary)] animate-pulse"></span>
                  </div>
                  <div className="relative flex-1 min-h-[300px] flex items-center justify-center bg-black">
                    <video src={videoPreview || ""} className="absolute inset-0 w-full h-full object-contain" muted autoPlay loop playsInline />
                  </div>
                </div>
              </div>
            )}

            {status === AnalysisStatus.ANALYZING && (
              <div className="flex flex-col items-center justify-center py-32 glass-card animate-fade-in-up">
                <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-bg-tertiary"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-accent-primary border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <i className="fas fa-microchip text-2xl text-accent-primary animate-pulse"></i>
                  </div>
                </div>
                <h2 className="text-2xl font-black mb-2 text-white">Analyzing...</h2>
                <div className="bg-bg-tertiary/50 px-5 py-2 rounded-full border border-white/5 mt-2">
                  <p className="text-text-secondary text-sm font-medium tracking-wide">
                    {saveStatus || '関節とステップ変数を抽出中...'}
                  </p>
                </div>
              </div>
            )}

            {status === AnalysisStatus.ERROR && error && (
              <div className="flex flex-col items-center justify-center py-24 neo-card border-red-500/20 bg-red-500/5 animate-fade-in-up">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <i className="fas fa-exclamation-triangle text-3xl text-red-400"></i>
                </div>
                <h2 className="text-2xl font-black mb-3 text-white tracking-tight">Analysis Failed</h2>
                <p className="text-text-secondary text-sm mb-8 text-center max-w-sm">{error}</p>
                <button onClick={reset} className="px-8 py-3 bg-bg-tertiary hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10">
                  <i className="fas fa-redo-alt mr-2 text-text-muted"></i>もう一度試す
                </button>
              </div>
            )}

            {status === AnalysisStatus.COMPLETED && result && (
              <div className="space-y-8 animate-fade-in-up">
                {/* ヒーローリザルトカード */}
                <div className="glass-card p-8 flex flex-col md:flex-row gap-8 items-center md:items-stretch overflow-hidden relative">
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent-primary/10 rounded-full blur-[80px] pointer-events-none"></div>

                  {/* スコア表示 */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    <svg className="w-40 h-40 transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                      <circle cx="80" cy="80" r="70" stroke="var(--bg-tertiary)" strokeWidth="10" fill="transparent" />
                      <circle
                        cx="80" cy="80" r="70"
                        stroke="url(#score-gradient)"
                        strokeWidth="10" strokeLinecap="round" fill="transparent"
                        strokeDasharray={439.8} strokeDashoffset={439.8 - (439.8 * result.overallScore) / 100}
                        className="transition-all duration-1000 ease-out"
                      />
                      <defs>
                        <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="var(--accent-primary)" />
                          <stop offset="100%" stopColor="var(--accent-secondary)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-black text-white tracking-tighter">{result.overallScore}</span>
                      <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">Score</span>
                    </div>
                  </div>

                  {/* 概要情報 */}
                  <div className="flex-1 flex flex-col justify-center text-center md:text-left relative z-10">
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                      <span className="px-3 py-1 bg-accent-primary/10 text-accent-primary text-xs font-bold rounded-full border border-accent-primary/20 flex items-center gap-1.5">
                        <i className="fas fa-shoe-prints text-[10px]"></i> {footStrikeMap[result.footStrike] || result.footStrike}
                      </span>
                      {result.targetPace && (
                        <span className="px-3 py-1 bg-white/5 text-text-secondary text-xs font-bold rounded-full border border-white/10 font-mono flex items-center gap-1.5">
                          <i className="fas fa-stopwatch text-[10px]"></i> {result.targetPace}
                        </span>
                      )}
                      {result.videoPath && (
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-500/20 flex items-center gap-1.5">
                          <i className="fas fa-cloud-check text-[10px]"></i> 保存済
                        </span>
                      )}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">
                      {result.runnerDescription ? `${result.runnerDescription}` : 'Analysis Report'}
                    </h2>
                    <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-2xl">{result.summary}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* 左カラム: 動画とメトリクス */}
                  <div className="lg:col-span-7 space-y-8">
                    {/* 動画再生 */}
                    {videoPreview && (
                      <div className="neo-card overflow-hidden group">
                        <div className="px-5 py-3 border-b border-white/5 bg-bg-secondary flex items-center gap-2">
                          <i className="fas fa-play-circle text-accent-primary text-sm"></i>
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Video Playback</span>
                        </div>
                        <div className="relative bg-black">
                          <video src={videoPreview} className="w-full max-h-[360px] object-contain" controls playsInline />
                        </div>
                      </div>
                    )}

                    {/* メトリクス数表グリッド */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <MetricCard label="Cadence" value={`${result.metrics.cadence}`} unit="spm" icon="fa-bolt" color="text-yellow-400" bg="bg-yellow-400/10" />
                      <MetricCard label="Stride" value={`${result.metrics.strideLength.toFixed(2)}`} unit="m" icon="fa-ruler-horizontal" color="text-blue-400" bg="bg-blue-400/10" />
                      <MetricCard label="GCT" value={`${result.metrics.groundContactTime}`} unit="ms" icon="fa-shoe-prints" tooltip="接地時間" color="text-purple-400" bg="bg-purple-400/10" />
                      <MetricCard label="Vertical" value={`${result.metrics.verticalOscillation.toFixed(1)}`} unit="cm" icon="fa-arrows-alt-v" tooltip="上下動" color="text-pink-400" bg="bg-pink-400/10" />
                    </div>

                    {/* 推奨トレーニング */}
                    <div className="neo-card p-6 border-white/5 bg-gradient-to-br from-bg-secondary to-bg-primary">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                          <i className="fas fa-dumbbell text-accent-primary"></i>
                        </div>
                        <h3 className="font-bold text-white tracking-wide">Action Plan</h3>
                      </div>
                      <div className="space-y-3">
                        {result.trainingSteps.map((step, idx) => (
                          <div key={idx} className="flex gap-4 p-4 rounded-xl bg-bg-tertiary/30 border border-white/5 hover:bg-bg-tertiary/50 transition-colors">
                            <div className="w-6 h-6 shrink-0 rounded-full bg-accent-primary/20 text-accent-primary font-bold text-xs flex items-center justify-center border border-accent-primary/30">
                              {idx + 1}
                            </div>
                            <p className="text-sm text-text-primary leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 右カラム: チャートと詳細観察 */}
                  <div className="lg:col-span-5 space-y-8 flex flex-col">
                    {/* レーダーチャート */}
                    <div className="neo-card p-6 flex flex-col h-[320px]">
                      <h3 className="font-bold mb-1 flex items-center gap-2 text-white">
                        <i className="fas fa-chart-pie text-accent-primary"></i> Biomechanics Profile
                      </h3>
                      <p className="text-xs text-text-muted mb-4">バランス・効率の指標化</p>
                      <div className="flex-1 -mx-4">
                        <MetricsChart metrics={result.metrics} />
                      </div>
                    </div>

                    {/* 部位別詳細観察 */}
                    <div className="neo-card p-6 flex-1 flex flex-col">
                      <h3 className="font-bold mb-1 flex items-center gap-2 text-white">
                        <i className="fas fa-list-check text-accent-primary"></i> Joint Observations
                      </h3>
                      <p className="text-xs text-text-muted mb-5">部位別の詳細評価とアドバイス</p>

                      <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {result.observations.map((obs, idx) => (
                          <div key={idx} className="bg-bg-tertiary/40 p-5 rounded-xl border border-white/5 hover:border-white/10 transition-colors group">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-black text-accent-primary uppercase tracking-widest">{obs.joint}</span>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-16 bg-bg-primary rounded-full overflow-hidden">
                                  <div className="h-full bg-accent-gradient" style={{ width: `${obs.score}%` }}></div>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-text-secondary w-5 text-right">{obs.score}</span>
                              </div>
                            </div>
                            <div className="text-sm font-bold text-white mb-2 leading-snug">{obs.finding}</div>
                            <div className="text-xs text-text-secondary leading-relaxed bg-black/20 p-3 rounded-lg border border-black/20">
                              <span className="text-accent-primary font-bold mr-1">💡</span> {obs.advice}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; unit: string; icon: string; tooltip?: string; color?: string; bg?: string }> = ({ label, value, unit, icon, tooltip, color = "text-text-muted", bg = "bg-bg-tertiary" }) => (
  <div className="neo-card p-4 relative overflow-hidden group">
    {/* アクセント背景 */}
    <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity ${bg.replace('/10', '')}`}></div>

    <div className="flex justify-between items-start mb-3 relative z-10">
      <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider" title={tooltip}>{label}</span>
      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${bg}`}>
        <i className={`fas ${icon} ${color} text-[10px]`}></i>
      </div>
    </div>
    <div className="flex items-baseline gap-1 relative z-10">
      <span className="text-2xl font-black text-white font-mono">{value}</span>
      <span className="text-[10px] text-text-muted font-bold ml-0.5">{unit}</span>
    </div>
  </div>
);

export default App;
