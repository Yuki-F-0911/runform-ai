import React, { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthForm from './components/AuthForm';
import MetricsChart from './components/MetricsChart';
import { supabase } from './services/supabaseClient';
import { analyzeRunningForm, MAX_ANALYSIS_VIDEO_BYTES } from './services/geminiService';
import { createAnalysisVideoUrl, deleteAnalysisResult, deleteVideoByPath, fetchAnalysisHistory, getVideoUrl, saveAnalysisResult, uploadVideo } from './services/databaseService';
import { AnalysisResult, AnalysisStatus, FormObservation, RunnerLevel, VideoAsset, VideoStorageProvider } from './types';

const footStrikeMap: Record<string, string> = { Heel: 'ヒール', Midfoot: 'ミッドフット', Forefoot: 'フォアフット' };
const storageLabels: Record<VideoStorageProvider, string> = {
  SUPABASE: 'Supabase Cloud',
  GOOGLE_DRIVE: 'Google Drive Link',
  ONEDRIVE: 'OneDrive Link',
  DROPBOX: 'Dropbox Link',
};
const externalVideoPattern = /\.(mp4|mov|webm|m4v|ogg)(\?.*)?$/i;
const metricValue = (value?: number, digits = 1): string => value === undefined || Number.isNaN(value) ? '--' : value.toFixed(digits);
const MAX_ANALYSIS_VIDEO_MB = Math.round(MAX_ANALYSIS_VIDEO_BYTES / (1024 * 1024));

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [targetPace, setTargetPace] = useState('');
  const [runnerDesc, setRunnerDesc] = useState('');
  const [runnerLevel, setRunnerLevel] = useState<RunnerLevel>(RunnerLevel.INTERMEDIATE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [storageProvider, setStorageProvider] = useState<VideoStorageProvider>(VideoStorageProvider.SUPABASE);
  const [externalVideoUrl, setExternalVideoUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    void loadHistory(user.id);
  }, [user]);

  const loadHistory = async (userId: string): Promise<void> => {
    try {
      setHistory(await fetchAnalysisHistory(userId));
    } catch (loadError) {
      console.error('履歴の読み込みに失敗:', loadError);
      const saved = localStorage.getItem('runform_history');
      if (saved) {
        try {
          setHistory(JSON.parse(saved) as AnalysisResult[]);
        } catch {
          setHistory([]);
        }
      }
    }
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_ANALYSIS_VIDEO_BYTES) {
      setSelectedFile(null);
      setVideoPreview(null);
      setError(`動画ファイルが大きすぎます。${MAX_ANALYSIS_VIDEO_MB}MB 以下の短い動画を選択してください。`);
      setStatus(AnalysisStatus.IDLE);
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setError(null);
    setStatus(AnalysisStatus.PREPARING);
  };

  const resolveVideoAsset = async (file: File, userId: string): Promise<VideoAsset | undefined> => {
    if (storageProvider === VideoStorageProvider.SUPABASE) {
      setSaveStatus('動画をクラウド保存中...');
      try {
        const path = await uploadVideo(file, userId);
        return { provider: storageProvider, syncStatus: 'UPLOADED', label: storageLabels[storageProvider], path };
      } catch (uploadError) {
        console.warn('動画アップロード失敗:', uploadError);
        return { provider: storageProvider, syncStatus: 'PENDING', label: storageLabels[storageProvider] };
      }
    }

    return { provider: storageProvider, syncStatus: 'LINKED', label: storageLabels[storageProvider], externalUrl: externalVideoUrl.trim() };
  };

  const handleStartAnalysis = async (): Promise<void> => {
    if (!selectedFile || !user) return;
    if (storageProvider !== VideoStorageProvider.SUPABASE && !externalVideoUrl.trim()) {
      setError('ドライブ連携には共有URLが必要です。');
      return;
    }

    setStatus(AnalysisStatus.ANALYZING);
    setError(null);
    setSaveStatus('解析用に動画を準備中...');

    let analysisVideoPath: string | null = null;

    try {
      analysisVideoPath = await uploadVideo(selectedFile, user.id);
      const analysisVideoUrl = await createAnalysisVideoUrl(analysisVideoPath);

      setSaveStatus('AIがステップ変数と走力を解析中...');
      const analysis = await analyzeRunningForm(analysisVideoUrl, runnerDesc, targetPace, runnerLevel, history);

      let videoAsset: VideoAsset | undefined;
      let persistedVideoPath: string | undefined;

      if (storageProvider === VideoStorageProvider.SUPABASE) {
        videoAsset = { provider: storageProvider, syncStatus: 'UPLOADED', label: storageLabels[storageProvider], path: analysisVideoPath };
        persistedVideoPath = analysisVideoPath;
      } else {
        videoAsset = await resolveVideoAsset(selectedFile, user.id);
      }

      const enriched: AnalysisResult = { ...analysis, videoPath: persistedVideoPath, videoAsset, userId: user.id };
      setSaveStatus('解析結果を保存中...');
      try {
        await saveAnalysisResult(enriched, user.id, persistedVideoPath);
      } catch (saveError) {
        console.warn('DB保存に失敗:', saveError);
      }

      if (storageProvider !== VideoStorageProvider.SUPABASE && analysisVideoPath) {
        try {
          await deleteVideoByPath(analysisVideoPath);
        } catch (cleanupError) {
          console.warn('解析用動画の削除に失敗:', cleanupError);
        }
      }

      const updatedHistory = [enriched, ...history];
      localStorage.setItem('runform_history', JSON.stringify(updatedHistory));
      setResult(enriched);
      setHistory(updatedHistory);
      setStatus(AnalysisStatus.COMPLETED);
      setSaveStatus(null);
    } catch (analysisError) {
      console.error(analysisError);

      if (storageProvider !== VideoStorageProvider.SUPABASE && analysisVideoPath) {
        try {
          await deleteVideoByPath(analysisVideoPath);
        } catch (cleanupError) {
          console.warn('解析失敗後の動画削除に失敗:', cleanupError);
        }
      }

      setError(analysisError instanceof Error ? analysisError.message : 'AI分析中にエラーが発生しました。');
      setStatus(AnalysisStatus.ERROR);
      setSaveStatus(null);
    }
  };

  const handleDeleteHistoryItem = async (id: string, event: React.MouseEvent): Promise<void> => {
    event.stopPropagation();
    if (!user) return;
    try {
      await deleteAnalysisResult(id, user.id);
    } catch (deleteError) {
      console.warn('削除に失敗:', deleteError);
    }
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem('runform_history', JSON.stringify(updated));
      return updated;
    });
    if (result?.id === id) {
      setResult(null);
      setStatus(AnalysisStatus.IDLE);
      setVideoPreview(null);
    }
  };

  const handleSelectHistoryItem = async (item: AnalysisResult): Promise<void> => {
    setResult(item);
    setStatus(AnalysisStatus.COMPLETED);
    if (item.videoPath) {
      try {
        setVideoPreview(await getVideoUrl(item.videoPath));
        return;
      } catch (videoError) {
        console.warn('署名URL取得失敗:', videoError);
      }
    }
    if (item.videoAsset?.externalUrl && externalVideoPattern.test(item.videoAsset.externalUrl)) {
      setVideoPreview(item.videoAsset.externalUrl);
      return;
    }
    setVideoPreview(null);
  };

  const reset = (): void => {
    setStatus(AnalysisStatus.IDLE);
    setResult(null);
    setVideoPreview(null);
    setError(null);
    setSaveStatus(null);
    setSelectedFile(null);
    setTargetPace('');
    setRunnerDesc('');
    setRunnerLevel(RunnerLevel.INTERMEDIATE);
    setStorageProvider(VideoStorageProvider.SUPABASE);
    setExternalVideoUrl('');
  };

  const handleLogout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setUser(null);
    reset();
    setHistory([]);
  };

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">読み込み中...</div>;
  if (!user) return <AuthForm />;

  const needsExternalUrl = storageProvider !== VideoStorageProvider.SUPABASE;
  const startDisabled = !selectedFile || (needsExternalUrl && !externalVideoUrl.trim());

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col md:flex-row">
      <aside className="w-full md:w-80 bg-bg-secondary/60 border-r border-white/5 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-white">History</h2>
          <button onClick={() => void handleLogout()} className="text-xs text-text-secondary hover:text-white">Logout</button>
        </div>
        <div className="space-y-3">
          {history.length === 0 && <div className="neo-card p-4 text-sm text-text-muted">履歴はありません</div>}
          {history.map((item) => (
            <div key={item.id} onClick={() => void handleSelectHistoryItem(item)} className={`w-full text-left neo-card p-4 cursor-pointer ${result?.id === item.id ? 'border-accent-primary/40 bg-accent-primary/5' : ''}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-xs text-text-muted">{new Date(item.timestamp).toLocaleDateString()}</div>
                  <div className="text-sm font-bold text-white truncate">{item.runnerDescription || 'Runner Analysis'}</div>
                  <div className="text-xs text-text-secondary mt-1">{item.targetPace || '--'} min/km</div>
                </div>
                <button onClick={(event) => void handleDeleteHistoryItem(item.id, event)} className="text-xs text-text-muted hover:text-red-400">削除</button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-white">RunForm AI</h1>
              <p className="text-sm text-text-secondary">動画保存、特徴量抽出、ランニング課題提案まで一括管理</p>
            </div>
            {status !== AnalysisStatus.IDLE && <button onClick={reset} className="btn-primary">新規解析</button>}
          </header>

          {status === AnalysisStatus.IDLE && (
            <div className="glass-card p-12 text-center">
              <h2 className="text-2xl font-bold text-white mb-3">ランニング動画を分析</h2>
              <p className="text-text-secondary mb-6">速度・距離・ステップ変数・スプリント指標を推定して保存します。</p>
              <input type="file" accept="video/*" className="hidden" ref={fileInputRef} onChange={onFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary">ファイルを選択する</button>
            </div>
          )}

          {status === AnalysisStatus.PREPARING && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-card p-6 space-y-5">
                <div>
                  <label className="block text-xs text-text-muted mb-2">ターゲット</label>
                  <input value={runnerDesc} onChange={(event) => setRunnerDesc(event.target.value)} className="w-full input-premium px-4 py-3" placeholder="例: 赤いシャツの走者" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-2">走行ペース</label>
                  <input value={targetPace} onChange={(event) => setTargetPace(event.target.value)} className="w-40 input-premium px-4 py-3 font-mono" placeholder="4:00" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-2">レベル</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[RunnerLevel.BEGINNER, RunnerLevel.INTERMEDIATE, RunnerLevel.ELITE].map((level) => (
                      <button key={level} onClick={() => setRunnerLevel(level)} className={`rounded-xl p-3 text-sm border ${runnerLevel === level ? 'border-accent-primary/40 text-accent-primary bg-accent-primary/10' : 'border-white/5 text-text-secondary bg-bg-tertiary/40'}`}>{level}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-2">動画保存先</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {Object.values(VideoStorageProvider).map((provider) => (
                      <button key={provider} onClick={() => setStorageProvider(provider)} className={`rounded-xl p-3 text-left border ${storageProvider === provider ? 'border-accent-primary/40 text-accent-primary bg-accent-primary/10' : 'border-white/5 text-text-secondary bg-bg-tertiary/40'}`}>
                        <div className="text-sm font-bold">{storageLabels[provider]}</div>
                        <div className="text-xs mt-1">{provider === VideoStorageProvider.SUPABASE ? '動画本体を保存' : '共有URLを保存'}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {needsExternalUrl && (
                  <div>
                    <label className="block text-xs text-text-muted mb-2">共有URL</label>
                    <input value={externalVideoUrl} onChange={(event) => setExternalVideoUrl(event.target.value)} className="w-full input-premium px-4 py-3" placeholder="https://drive.google.com/..." />
                    <p className="text-xs text-text-muted mt-2">現在は共有URL紐付け方式です。自動アップロード実装の受け皿として保存します。</p>
                  </div>
                )}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button onClick={() => void handleStartAnalysis()} disabled={startDisabled} className={`btn-primary w-full ${startDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>AI解析を開始する</button>
              </div>
              <div className="neo-card overflow-hidden bg-black">
                <div className="px-4 py-3 border-b border-white/5 text-xs text-text-muted">Preview</div>
                <video src={videoPreview || ''} className="w-full min-h-[320px] object-contain" muted autoPlay loop playsInline />
              </div>
            </div>
          )}

          {status === AnalysisStatus.ANALYZING && <div className="glass-card p-12 text-center text-white"><div className="text-2xl font-bold mb-3">Analyzing...</div><div className="text-text-secondary">{saveStatus || '解析中'}</div></div>}
          {status === AnalysisStatus.ERROR && error && <div className="neo-card p-8 text-center text-red-300">{error}</div>}

          {status === AnalysisStatus.COMPLETED && result && (
            <>
              <section className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                  <div className="w-32 h-32 rounded-full border-8 border-accent-primary/20 flex items-center justify-center text-4xl font-black text-white shrink-0">{result.overallScore}</div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary">{footStrikeMap[result.footStrike] || result.footStrike}</span>
                      {result.targetPace && <span className="px-3 py-1 rounded-full bg-white/5 text-text-secondary">{result.targetPace} min/km</span>}
                      {result.videoAsset && <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400">{result.videoAsset.label}</span>}
                      {result.performanceMetrics && <span className="px-3 py-1 rounded-full bg-white/5 text-text-secondary">confidence {Math.round(result.performanceMetrics.dataConfidence)}</span>}
                    </div>
                    <h2 className="text-2xl font-bold text-white">{result.runnerDescription || 'Analysis Report'}</h2>
                    <p className="text-text-secondary leading-relaxed">{result.summary}</p>
                    {result.runnerProfile && (
                      <div className="grid md:grid-cols-3 gap-3">
                        <MiniCard label="推定速度" value={`${metricValue(result.runnerProfile.estimatedSpeedKmh, 1)} km/h`} />
                        <MiniCard label="推定距離" value={`${metricValue(result.runnerProfile.estimatedDistanceM, 0)} m`} />
                        <MiniCard label="走タイプ" value={result.runnerProfile.runningType} />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                  {videoPreview && <div className="neo-card overflow-hidden bg-black"><video src={videoPreview} className="w-full max-h-[360px] object-contain" controls playsInline /></div>}
                  {!videoPreview && result.videoAsset?.externalUrl && <a href={result.videoAsset.externalUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex">紐付いた動画を開く</a>}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard label="Cadence" value={metricValue(result.metrics.cadence, 0)} unit="spm" />
                    <MetricCard label="Stride" value={metricValue(result.metrics.strideLength, 2)} unit="m" />
                    <MetricCard label="GCT" value={metricValue(result.metrics.groundContactTime, 0)} unit="ms" />
                    <MetricCard label="Vertical" value={metricValue(result.metrics.verticalOscillation, 1)} unit="cm" />
                    <MetricCard label="Flight" value={metricValue(result.metrics.flightTime, 0)} unit="ms" />
                    <MetricCard label="Step Time" value={metricValue(result.metrics.stepTime, 0)} unit="ms" />
                    <MetricCard label="Duty Factor" value={metricValue(result.metrics.dutyFactor, 1)} unit="%" />
                    <MetricCard label="Step Width" value={metricValue(result.metrics.stepWidth, 1)} unit="cm" />
                  </div>

                  <div className="neo-card p-6">
                    <h3 className="font-bold text-white mb-4">Quantitative Lab</h3>
                    <div className="grid md:grid-cols-2 gap-3 text-sm">
                      <ValueRow label="Stride Angle" value={`${metricValue(result.metrics.strideAngle, 1)} deg`} />
                      <ValueRow label="Leg Stiffness" value={`${metricValue(result.metrics.legStiffness, 1)} kN/m`} />
                      <ValueRow label="Symmetry Score" value={`${metricValue(result.metrics.symmetryScore, 0)} / 100`} />
                      <ValueRow label="Braking Index" value={`${metricValue(result.metrics.brakingIndex, 0)} / 100`} />
                      <ValueRow label="Stride Frequency" value={`${metricValue(result.performanceMetrics?.strideFrequencyHz, 2)} Hz`} />
                      <ValueRow label="Steps / Meter" value={metricValue(result.performanceMetrics?.stepsPerMeter, 2)} />
                      <ValueRow label="Projected 100m" value={`${metricValue(result.performanceMetrics?.projected100mTime, 2)} sec`} />
                      <ValueRow label="Projected 5k" value={result.performanceMetrics?.projected5kTime || '--'} />
                      <ValueRow label="Sprint Score" value={`${metricValue(result.performanceMetrics?.sprintMechanicalScore, 0)} / 100`} />
                      <ValueRow label="Economy Score" value={`${metricValue(result.performanceMetrics?.runningEconomyScore, 0)} / 100`} />
                    </div>
                  </div>

                  <div className="neo-card p-6">
                    <h3 className="font-bold text-white mb-4">Action Plan</h3>
                    <div className="space-y-3">
                      {result.trainingSteps.map((step, index) => <div key={index} className="rounded-xl border border-white/5 bg-bg-tertiary/30 p-4 text-sm">{index + 1}. {step}</div>)}
                    </div>
                  </div>

                  {!!result.challengeProposals?.length && (
                    <div className="neo-card p-6">
                      <h3 className="font-bold text-white mb-4">Suggested Challenges</h3>
                      <div className="space-y-3">
                        {result.challengeProposals.map((proposal, index) => (
                          <div key={`${proposal.title}-${index}`} className="rounded-xl border border-white/5 bg-bg-tertiary/20 p-4">
                            <div className="flex justify-between gap-4 mb-2">
                              <div className="font-bold text-white">{proposal.title}</div>
                              <div className="text-xs text-orange-300">{proposal.timeframe}</div>
                            </div>
                            <p className="text-sm text-text-secondary mb-3">{proposal.reason}</p>
                            <div className="grid md:grid-cols-3 gap-2 text-xs">
                              <MiniCard label="指標" value={proposal.targetMetric} />
                              <MiniCard label="現在値" value={proposal.currentValue} />
                              <MiniCard label="目標値" value={proposal.targetValue} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="neo-card p-6 h-[320px]">
                    <h3 className="font-bold text-white mb-1">Biomechanics Profile</h3>
                    <p className="text-xs text-text-muted mb-4">フォームバランスと効率</p>
                    <MetricsChart metrics={result.metrics} />
                  </div>

                  {result.runnerProfile && (
                    <div className="neo-card p-6">
                      <h3 className="font-bold text-white mb-4">Runner Profile</h3>
                      <ValueRow label="Speed Band" value={result.runnerProfile.speedBand} />
                      <ValueRow label="Cadence Reserve" value={`${metricValue(result.performanceMetrics?.cadenceReserve, 0)} spm`} />
                      <ValueRow label="Fatigue Resistance" value={`${metricValue(result.performanceMetrics?.fatigueResistanceScore, 0)} / 100`} />
                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <ListCard title="強み" items={result.runnerProfile.dominantStrengths} />
                        <ListCard title="制限因子" items={result.runnerProfile.limiterFactors} />
                      </div>
                    </div>
                  )}

                  {result.advancedInsights && (
                    <div className="neo-card p-6">
                      <h3 className="font-bold text-white mb-4">Personal AI Insights</h3>
                      {result.advancedInsights.historicalFeedback && <p className="text-sm text-text-secondary mb-4">{result.advancedInsights.historicalFeedback}</p>}
                      <div className="grid md:grid-cols-2 gap-4">
                        <ListCard title="定数" items={result.advancedInsights.personalConstants} />
                        <ListCard title="変数" items={result.advancedInsights.paceVariables} />
                      </div>
                      {result.advancedInsights.weakPaceZone && <div className="mt-4 text-sm text-red-300">要注意ペース帯: {result.advancedInsights.weakPaceZone}</div>}
                    </div>
                  )}

                  <div className="neo-card p-6">
                    <h3 className="font-bold text-white mb-4">Joint Observations</h3>
                    <div className="space-y-3">
                      {result.observations.map((obs: FormObservation, index: number) => (
                        <div key={index} className="rounded-xl border border-white/5 bg-bg-tertiary/20 p-4">
                          <div className="flex justify-between gap-4 text-sm mb-2">
                            <span className="font-bold text-accent-primary">{obs.joint}</span>
                            <span className="text-text-secondary">{obs.score}</span>
                          </div>
                          <p className="text-sm text-white mb-2">{obs.finding}</p>
                          <p className="text-xs text-text-secondary">{obs.advice}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; unit: string }> = ({ label, value, unit }) => (
  <div className="neo-card p-4">
    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{label}</div>
    <div className="text-2xl font-black text-white font-mono">{value}<span className="text-[10px] text-text-muted ml-1">{unit}</span></div>
  </div>
);

const MiniCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/5 bg-bg-tertiary/20 p-3">
    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
    <div className="text-sm text-white">{value}</div>
  </div>
);

const ValueRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-bg-tertiary/20 px-4 py-3">
    <span className="text-sm text-text-secondary">{label}</span>
    <span className="text-sm text-white font-mono">{value}</span>
  </div>
);

const ListCard: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div className="rounded-xl border border-white/5 bg-bg-tertiary/20 p-4">
    <div className="text-sm font-bold text-white mb-3">{title}</div>
    <div className="space-y-2">
      {items.map((item, index) => <div key={`${item}-${index}`} className="text-sm text-text-secondary">- {item}</div>)}
    </div>
  </div>
);

export default App;
