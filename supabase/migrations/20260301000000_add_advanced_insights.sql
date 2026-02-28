-- ==========================================
-- Migration: Add advanced_insights to analysis_results
-- ==========================================
-- Add the advanced_insights column to the analysis_results table
-- This column will store personalized insights such as constants (unchanging habits)
-- and variables (pace-dependent changes)
ALTER TABLE analysis_results
ADD COLUMN IF NOT EXISTS advanced_insights JSONB;