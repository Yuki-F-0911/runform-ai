-- ==========================================
-- Migration: Add runner intelligence columns
-- ==========================================

ALTER TABLE analysis_results
ADD COLUMN IF NOT EXISTS video_asset JSONB,
ADD COLUMN IF NOT EXISTS runner_profile JSONB,
ADD COLUMN IF NOT EXISTS performance_metrics JSONB,
ADD COLUMN IF NOT EXISTS challenge_proposals JSONB;
