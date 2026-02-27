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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* ロゴ & タイトル */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-2xl mb-4 shadow-lg shadow-green-500/20">
                        <i className="fas fa-running text-3xl text-white"></i>
                    </div>
                    <h1 className="text-3xl font-black text-white">
                        RunForm <span className="text-green-500">AI</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-2">AIによるランニングフォーム解析</p>
                </div>

                {/* カード */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    {/* モード切替タブ */}
                    <div className="flex bg-slate-800/50 rounded-xl p-1 mb-8">
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'login'
                                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            ログイン
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'signup'
                                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            新規登録
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* メール入力 */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                メールアドレス
                            </label>
                            <div className="relative">
                                <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm"></i>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/30 transition-all"
                                />
                            </div>
                        </div>

                        {/* パスワード入力 */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                パスワード
                            </label>
                            <div className="relative">
                                <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm"></i>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={mode === 'signup' ? '6文字以上' : '••••••••'}
                                    required
                                    minLength={6}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/30 transition-all"
                                />
                            </div>
                        </div>

                        {/* エラーメッセージ */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                                <i className="fas fa-exclamation-circle text-red-400 text-sm"></i>
                                <span className="text-red-400 text-sm">{error}</span>
                            </div>
                        )}

                        {/* 成功メッセージ */}
                        {successMessage && (
                            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                                <i className="fas fa-check-circle text-green-400 text-sm"></i>
                                <span className="text-green-400 text-sm">{successMessage}</span>
                            </div>
                        )}

                        {/* 送信ボタン */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    処理中...
                                </>
                            ) : mode === 'login' ? (
                                <>
                                    <i className="fas fa-sign-in-alt"></i>
                                    ログイン
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-user-plus"></i>
                                    アカウント作成
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* フッター */}
                <p className="text-center text-slate-600 text-xs mt-6">
                    {mode === 'login'
                        ? 'アカウントをお持ちでない方は「新規登録」タブへ'
                        : '既にアカウントをお持ちの方は「ログイン」タブへ'}
                </p>
            </div>
        </div>
    );
};

export default AuthForm;
