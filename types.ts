
export interface StepMetrics {
  cadence: number; // steps per minute
  strideLength: number; // meters
  groundContactTime: number; // ms
  verticalOscillation: number; // cm
  flightTime: number; // ms
  stepTime: number; // ms
  dutyFactor: number; // %
  stepWidth: number; // cm
  strideAngle: number; // degrees
  legStiffness: number; // kN/m
  symmetryScore: number; // 0-100
  brakingIndex: number; // 0-100
}

export interface FormObservation {
  joint: string;
  finding: string;
  score: number; // 0-100
  advice: string;
}

export enum RunnerLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ELITE = 'ELITE'
}

export interface AdvancedInsights {
  personalConstants: string[];
  paceVariables: string[];
  weakPaceZone?: string;
  historicalFeedback?: string;
}

export enum VideoStorageProvider {
  SUPABASE = 'SUPABASE',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  ONEDRIVE = 'ONEDRIVE',
  DROPBOX = 'DROPBOX'
}

export interface VideoAsset {
  provider: VideoStorageProvider;
  syncStatus: 'UPLOADED' | 'LINKED' | 'PENDING';
  label: string;
  path?: string;
  externalUrl?: string;
}

export interface RunnerProfile {
  runningType: string;
  estimatedSpeedKmh: number;
  estimatedDistanceM: number;
  speedBand: string;
  dominantStrengths: string[];
  limiterFactors: string[];
}

export interface PerformanceMetrics {
  strideFrequencyHz: number;
  stepsPerMeter: number;
  cadenceReserve: number;
  projected100mTime: number;
  projected5kTime: string;
  accelerationIndex: number;
  sprintMechanicalScore: number;
  runningEconomyScore: number;
  fatigueResistanceScore: number;
  dataConfidence: number;
}

export interface ChallengeProposal {
  title: string;
  reason: string;
  targetMetric: string;
  currentValue: string;
  targetValue: string;
  timeframe: string;
}

export interface AnalysisResult {
  id: string;
  timestamp: string;
  overallScore: number;
  metrics: StepMetrics;
  observations: FormObservation[];
  footStrike: 'Heel' | 'Midfoot' | 'Forefoot';
  summary: string;
  trainingSteps: string[];
  targetPace?: string; // e.g. "4:00"
  runnerDescription?: string;
  runnerLevel: RunnerLevel;
  videoPath?: string;
  videoAsset?: VideoAsset;
  userId?: string;
  advancedInsights?: AdvancedInsights;
  runnerProfile?: RunnerProfile;
  performanceMetrics?: PerformanceMetrics;
  challengeProposals?: ChallengeProposal[];
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  PREPARING = 'PREPARING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
