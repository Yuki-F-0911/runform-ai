
import React, { useState, useRef, useEffect } from 'react';
import { AnalysisStatus, AnalysisResult } from './types';
import { analyzeRunningForm } from './services/geminiService';
import MetricsChart from './components/MetricsChart';

const App: React.FC = () => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Settings for analysis
  const [targetPace, setTargetPace] = useState<string>('');
  const [runnerDesc, setRunnerDesc] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('runform_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history when it changes
  useEffect(() => {
    localStorage.setItem('runform_history', JSON.stringify(history));
  }, [history]);

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
    if (!selectedFile) return;

    setStatus(AnalysisStatus.ANALYZING);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          const analysisResult = await analyzeRunningForm(base64String, runnerDesc, targetPace);
          setResult(analysisResult);
          setHistory(prev => [analysisResult, ...prev]);
          setStatus(AnalysisStatus.COMPLETED);
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

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const reset = () => {
    setStatus(AnalysisStatus.IDLE);
    setResult(null);
    setVideoPreview(null);
    setError(null);
    setSelectedFile(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row">
      {/* Sidebar: History */}
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
                onClick={() => { setResult(item); setStatus(AnalysisStatus.COMPLETED); }}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${result?.id === item.id ? 'bg-green-500/10 border-green-500/50' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                  <button onClick={(e) => deleteHistoryItem(item.id, e)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fas fa-trash-alt text-[10px]"></i>
                  </button>
                </div>
                <div className="text-sm font-bold text-white truncate">{item.runnerDescription || 'ランナー'}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-300">Score: {item.overallScore}</span>
                  <span className="text-[10px] text-slate-500">{item.targetPace || '--'} min/km</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <header className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                <i className="fas fa-running text-xl text-white"></i>
              </div>
              <h1 className="text-2xl font-black text-white">RunForm <span className="text-green-500">AI</span></h1>
            </div>
            {status !== AnalysisStatus.IDLE && (
              <button onClick={reset} className="text-sm text-slate-400 hover:text-white flex items-center gap-2">
                <i className="fas fa-plus"></i> 新規解析
              </button>
            )}
          </header>

          <main>
            {status === AnalysisStatus.IDLE && (
              <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <i className="fas fa-upload text-2xl text-slate-400"></i>
                </div>
                <h2 className="text-xl font-bold mb-2">動画をアップロードして分析</h2>
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
                <p className="text-slate-500 text-sm italic">関節位置の特定とステップ変数を抽出しています...</p>
              </div>
            )}

            {status === AnalysisStatus.COMPLETED && result && (
              <div className="space-y-6 animate-in fade-in duration-700">
                {/* Result Header Card */}
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
                    </div>
                    <h2 className="text-xl font-bold text-white leading-tight">
                      {result.runnerDescription ? `${result.runnerDescription} の解析結果` : 'メインランナーの解析結果'}
                    </h2>
                    <p className="text-slate-400 text-sm italic">{result.summary}</p>
                  </div>
                </div>

                {/* Metrics Grid */}
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

                {/* Training Steps */}
                <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-green-400"><i className="fas fa-dumbbell"></i>推奨トレーニング</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {result.trainingSteps.map((step, idx) => (
                      <div key={idx} className="flex gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <span className="text-green-500 font-black text-sm">{idx+1}.</span>
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
