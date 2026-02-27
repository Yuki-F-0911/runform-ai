
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
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row">
      {/* サイドバー: 履歴 */}
      <aside className="w-full md:w-72 bg-slate-900 border-r border-slate-800 p-6 overflow-y-auto max-h-screen">
        <div className="flex items-center gap-2 mb-8">
          <i className="fas fa-history text-green-500"></i>
          <h2 className="font-bold text-slate-200">解析履歴</h2>
        </div>

        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm italic text-center py-10">履歴はありません</p>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                onClick={() => handleSelectHistoryItem(item)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${result?.id === item.id ? 'bg-green-500/10 border-green-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                  <button onClick={(e) => handleDeleteHistoryItem(item.id, e)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fas fa-trash-alt text-[10px]"></i>
                  </button>
                </div>
                <div className="text-sm font-bold text-white truncate">{item.runnerDescription || 'ランナー'}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-300">Score: {item.overallScore}</span>
                  <div className="flex items-center gap-1">
                    {item.videoPath && <i className="fas fa-video text-[10px] text-green-500" title="動画あり"></i>}
                    <span className="text-[10px] text-slate-500">{item.targetPace || '--'} min/km</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <header className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                <i className="fas fa-running text-xl text-white"></i>
              </div>
              <h1 className="text-2xl font-black text-white">RunForm <span className="text-green-500">AI</span></h1>
            </div>
            <div className="flex items-center gap-4">
              {status !== AnalysisStatus.IDLE && (
                <button onClick={reset} className="text-sm text-slate-400 hover:text-white flex items-center gap-2">
                  <i className="fas fa-plus"></i> 新規解析
                </button>
              )}
              {/* ユーザー情報 & ログアウト */}
              <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
                <span className="text-xs text-slate-500 hidden md:block truncate max-w-[140px]" title={user.email || ''}>
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
                  title="ログアウト"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            </div>
          </header>

          <main>
            {status === AnalysisStatus.IDLE && (
              <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <i className="fas fa-upload text-2xl text-slate-400"></i>
                </div>
                <h2 className="text-xl font-bold mb-2">動画をアップロードして分析</h2>
                <p className="text-slate-500 text-sm mb-4">動画はクラウドに安全に保存されます</p>
                <input type="file" accept="video/*" className="hidden" ref={fileInputRef} onChange={onFileSelect} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-8 py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
                >
                  ファイルを選択
                </button>
              </div>
            )}

            {status === AnalysisStatus.PREPARING && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-4">分析設定</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">分析対象のランナー（任意）</label>
                      <input
                        type="text"
                        placeholder="例: 赤いシャツの人、右側の走者"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors"
                        value={runnerDesc}
                        onChange={(e) => setRunnerDesc(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">走行ペース（任意）</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="4:00"
                          className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors"
                          value={targetPace}
                          onChange={(e) => setTargetPace(e.target.value)}
                        />
                        <span className="text-slate-400 text-sm">min/km</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">ランナーレベル</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { val: RunnerLevel.BEGINNER, label: '初心者', icon: 'fa-seedling' },
                          { val: RunnerLevel.INTERMEDIATE, label: '中級者', icon: 'fa-shoe-prints' },
                          { val: RunnerLevel.ELITE, label: '上級者', icon: 'fa-medal' }
                        ].map((level) => (
                          <button
                            key={level.val}
                            onClick={() => setRunnerLevel(level.val)}
                            className={`p-3 rounded-lg text-sm font-bold border transition-all flex flex-col items-center gap-1
                              ${runnerLevel === level.val
                                ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'}`}
                          >
                            <i className={`fas ${level.icon}`}></i>
                            {level.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleStartAnalysis}
                      className="w-full py-4 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-all"
                    >
                      AI解析を開始する
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl overflow-hidden border border-slate-800">
                  <video src={videoPreview || ""} className="w-full h-full object-cover" muted autoPlay loop />
                </div>
              </div>
            )}

            {status === AnalysisStatus.ANALYZING && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 border-4 border-slate-800 border-t-green-500 rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-bold mb-1">高度な動作解析を実行中</h2>
                <p className="text-slate-500 text-sm italic">
                  {saveStatus || '関節位置の特定とステップ変数を抽出しています...'}
                </p>
              </div>
            )}

            {status === AnalysisStatus.ERROR && error && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                  <i className="fas fa-exclamation-triangle text-2xl text-red-400"></i>
                </div>
                <h2 className="text-xl font-bold mb-2 text-red-400">エラーが発生しました</h2>
                <p className="text-slate-400 text-sm mb-4">{error}</p>
                <button onClick={reset} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
                  もう一度試す
                </button>
              </div>
            )}

            {status === AnalysisStatus.COMPLETED && result && (
              <div className="space-y-6 animate-in fade-in duration-700">
                {/* 結果ヘッダーカード */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center">
                  <div className="relative">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * result.overallScore) / 100} className="text-green-500" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-white">{result.overallScore}</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Score</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 text-center md:text-left">
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-2">
                      <span className="px-3 py-1 bg-green-500/10 text-green-500 text-xs font-bold rounded-full border border-green-500/20">
                        {footStrikeMap[result.footStrike]}着地
                      </span>
                      {result.targetPace && (
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-500 text-xs font-bold rounded-full border border-blue-500/20">
                          {result.targetPace} min/km
                        </span>
                      )}
                      {result.videoPath && (
                        <span className="px-3 py-1 bg-purple-500/10 text-purple-500 text-xs font-bold rounded-full border border-purple-500/20">
                          <i className="fas fa-cloud-check mr-1"></i>クラウド保存済
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white leading-tight">
                      {result.runnerDescription ? `${result.runnerDescription} の解析結果` : 'メインランナーの解析結果'}
                    </h2>
                    <p className="text-slate-400 text-sm italic">{result.summary}</p>
                  </div>
                </div>

                {/* 動画再生 (保存済みの場合) */}
                {videoPreview && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800">
                      <i className="fas fa-play-circle text-green-500"></i>
                      <span className="text-sm font-bold text-slate-300">解析動画</span>
                    </div>
                    <video src={videoPreview} className="w-full max-h-80 object-contain bg-black" controls />
                  </div>
                )}

                {/* メトリクスグリッド */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="ピッチ" value={`${result.metrics.cadence}`} unit="spm" icon="fa-bolt" />
                  <MetricCard label="ストライド" value={`${result.metrics.strideLength}`} unit="m" icon="fa-arrows-alt-h" />
                  <MetricCard label="接地時間" value={`${result.metrics.groundContactTime}`} unit="ms" icon="fa-shoe-prints" />
                  <MetricCard label="上下動" value={`${result.metrics.verticalOscillation}`} unit="cm" icon="fa-arrows-alt-v" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><i className="fas fa-chart-pie text-green-500"></i>バイオメカニクス評価</h3>
                    <MetricsChart metrics={result.metrics} />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><i className="fas fa-list-check text-green-500"></i>部位別詳細</h3>
                    <div className="space-y-4">
                      {result.observations.map((obs, idx) => (
                        <div key={idx} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-green-500 uppercase">{obs.joint}</span>
                            <span className="text-xs font-bold text-slate-400">{obs.score}/100</span>
                          </div>
                          <div className="text-sm font-bold text-white mb-1">{obs.finding}</div>
                          <p className="text-xs text-slate-400 leading-relaxed">{obs.advice}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 推奨トレーニング */}
                <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-green-400"><i className="fas fa-dumbbell"></i>推奨トレーニング</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {result.trainingSteps.map((step, idx) => (
                      <div key={idx} className="flex gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <span className="text-green-500 font-black text-sm">{idx + 1}.</span>
                        <p className="text-xs text-slate-300">{step}</p>
                      </div>
                    ))}
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

const MetricCard: React.FC<{ label: string; value: string; unit: string; icon: string }> = ({ label, value, unit, icon }) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
    <div className="flex justify-between items-start mb-2">
      <span className="text-[10px] text-slate-500 font-bold uppercase">{label}</span>
      <i className={`fas ${icon} text-slate-700 text-xs`}></i>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-black text-white">{value}</span>
      <span className="text-[10px] text-slate-500 font-bold">{unit}</span>
    </div>
  </div>
);

export default App;
