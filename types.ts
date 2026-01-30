
export interface StepMetrics {
  cadence: number; // steps per minute
  strideLength: number; // meters
  groundContactTime: number; // ms
  verticalOscillation: number; // cm
  flightTime: number; // ms
}

export interface FormObservation {
  joint: string;
  finding: string;
  score: number; // 0-100
  advice: string;
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
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  PREPARING = 'PREPARING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
