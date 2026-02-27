/**
 * Supabase クライアント設定
 * 環境変数から URL と anon key を読み込み、クライアントインスタンスを生成する
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase の環境変数が設定されていません。.env.local に SUPABASE_URL と SUPABASE_ANON_KEY を設定してください。'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
