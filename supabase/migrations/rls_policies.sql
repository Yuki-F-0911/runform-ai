-- ==========================================
-- Security Configuration for RunForm AI
-- ==========================================
-- Enable RLS on the analysis_results table
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
-- Drop existing policies if they exist to avoid "already exists" error
DROP POLICY IF EXISTS "Users can insert their own results" ON analysis_results;
DROP POLICY IF EXISTS "Users can view their own results" ON analysis_results;
DROP POLICY IF EXISTS "Users can update their own results" ON analysis_results;
DROP POLICY IF EXISTS "Users can delete their own results" ON analysis_results;
-- Policy: Users can insert their own analysis results
CREATE POLICY "Users can insert their own results" ON analysis_results FOR
INSERT WITH CHECK (auth.uid() = user_id);
-- Policy: Users can select their own analysis results
CREATE POLICY "Users can view their own results" ON analysis_results FOR
SELECT USING (auth.uid() = user_id);
-- Policy: Users can update their own analysis results
CREATE POLICY "Users can update their own results" ON analysis_results FOR
UPDATE USING (auth.uid() = user_id);
-- Policy: Users can delete their own analysis results
CREATE POLICY "Users can delete their own results" ON analysis_results FOR DELETE USING (auth.uid() = user_id);
-- ==========================================
-- Security Configuration for Storage (videos)
-- ==========================================
-- Note: Replace 'videos' with your actual bucket name if different.
DROP POLICY IF EXISTS "Users can upload videos to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view videos in their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete videos in their own folder" ON storage.objects;
CREATE POLICY "Users can upload videos to their own folder" ON storage.objects FOR
INSERT WITH CHECK (
        bucket_id = 'videos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name)) [1] = auth.uid()::text
    );
CREATE POLICY "Users can view videos in their own folder" ON storage.objects FOR
SELECT USING (
        bucket_id = 'videos'
        AND (storage.foldername(name)) [1] = auth.uid()::text
    );
CREATE POLICY "Users can delete videos in their own folder" ON storage.objects FOR DELETE USING (
    bucket_id = 'videos'
    AND (storage.foldername(name)) [1] = auth.uid()::text
);