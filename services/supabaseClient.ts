/// <reference types="vite/client" />
/**
 * Supabase クライアント設定
 * リクエストURLのパースや環境変数から URL と anon key を読み込み、クライアントインスタンスを生成する
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase の環境変数が設定されていません。.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
