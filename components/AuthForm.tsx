/**
 * 認証フォームコンポーネント
 * メール + パスワードでのサインアップ / ログインを提供する
 */

import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

type AuthMode = 'login' | 'signup';

const AuthForm: React.FC = () => {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setSuccessMessage('確認メールを送信しました。メールボックスを確認してください。');
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
        } catch (err: any) {
            setError(err.message || '認証に失敗しました。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 relative overflow-hidden">
            {/* 背景の装飾オーブ（Craftwork的リッチな背景アプローチ） */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-primary/20 rounded-full blur-[100px] pointer-events-none animate-pulse-glow"></div>
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-secondary/10 rounded-full blur-[120px] pointer-events-none delay-100 animate-pulse-glow"></div>

            <div className="w-full max-w-md animate-fade-in-up relative z-10">
                {/* ロゴ & タイトル */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-gradient rounded-2xl mb-6 shadow-lg shadow-accent-primary/30 relative">
                        <div className="absolute inset-0 bg-white/20 rounded-2xl"></div>
                        <i className="fas fa-running text-3xl text-white relative z-10"></i>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                        RunForm <span className="gradient-text">AI</span>
                    </h1>
                    <p className="text-text-secondary text-sm">AIによる高度なランニングフォーム解析</p>
                </div>

                {/* グラスモーフィズム カード */}
                <div className="glass-card p-8 relative z-10">
                    {/* モード切替タブ */}
                    <div className="flex bg-bg-primary/50 rounded-xl p-1.5 mb-8 border border-white/5">
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'login'
                                    ? 'bg-bg-secondary text-white shadow-md border border-white/10'
                                    : 'text-text-secondary hover:text-white'
                                }`}
                        >
                            ログイン
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'signup'
                                    ? 'bg-bg-secondary text-white shadow-md border border-white/10'
                                    : 'text-text-secondary hover:text-white'
                                }`}
                        >
                            新規登録
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* メール入力 */}
                        <div>
                            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                メールアドレス
                            </label>
                            <div className="relative">
                                <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm"></i>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    className="w-full input-premium pl-11 pr-4 py-3.5"
                                />
                            </div>
                        </div>

                        {/* パスワード入力 */}
                        <div>
                            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                パスワード
                            </label>
                            <div className="relative">
                                <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm"></i>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={mode === 'signup' ? '6文字以上' : '••••••••'}
                                    required
                                    minLength={6}
                                    className="w-full input-premium pl-11 pr-4 py-3.5"
                                />
                            </div>
                        </div>

                        {/* エラーメッセージ */}
                        {error && (
                            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-fade-in-up">
                                <i className="fas fa-exclamation-circle text-red-500 text-sm"></i>
                                <span className="text-red-400 text-sm font-medium">{error}</span>
                            </div>
                        )}

                        {/* 成功メッセージ */}
                        {successMessage && (
                            <div className="flex items-center gap-3 bg-accent-primary/10 border border-accent-primary/20 rounded-xl px-4 py-3 animate-fade-in-up">
                                <i className="fas fa-check-circle text-accent-primary text-sm"></i>
                                <span className="text-accent-primary text-sm font-medium">{successMessage}</span>
                            </div>
                        )}

                        {/* 送信ボタン */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary py-4 mt-2 h-14"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                                    <span className="font-bold">処理中...</span>
                                </>
                            ) : mode === 'login' ? (
                                <>
                                    <i className="fas fa-sign-in-alt mr-1"></i>
                                    ログイン
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-user-plus mr-1"></i>
                                    アカウントを作成
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* フッター */}
                <p className="text-center text-text-muted text-sm mt-8 animate-fade-in-up delay-100">
                    {mode === 'login'
                        ? 'アカウントをお持ちでない方は「新規登録」タブへ'
                        : '既にアカウントをお持ちの方は「ログイン」タブへ'}
                </p>
            </div>
        </div>
    );
};

export default AuthForm;
