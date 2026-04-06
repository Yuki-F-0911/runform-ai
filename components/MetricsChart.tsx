import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { StepMetrics } from '../types';

interface MetricsChartProps {
  metrics: StepMetrics;
}

const MetricsChart: React.FC<MetricsChartProps> = ({ metrics }) => {
  const cadence = metrics.cadence ?? 0;
  const strideLength = metrics.strideLength ?? 0;
  const groundContactTime = metrics.groundContactTime ?? 0;
  const verticalOscillation = metrics.verticalOscillation ?? 0;
  const flightTime = metrics.flightTime ?? 0;
  const symmetryScore = metrics.symmetryScore ?? 0;
  const brakingIndex = metrics.brakingIndex ?? 0;

  const data = [
    { subject: 'ピッチ', value: Math.min(100, (cadence / 200) * 100), fullMark: 100 },
    { subject: 'ストライド', value: Math.min(100, strideLength * 40), fullMark: 100 },
    { subject: '接地時間', value: Math.max(0, 100 - (groundContactTime / 5)), fullMark: 100 },
    { subject: '上下動', value: Math.max(0, 100 - (verticalOscillation * 5)), fullMark: 100 },
    { subject: '滞空時間', value: Math.min(100, flightTime / 2), fullMark: 100 },
    { subject: '対称性', value: Math.min(100, symmetryScore), fullMark: 100 },
    { subject: '減速抑制', value: Math.max(0, 100 - brakingIndex), fullMark: 100 },
  ];

  return (
    <div className="w-full h-full min-h-[250px] min-w-0 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="3 3" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#8888a0', fontSize: 11, fontWeight: 700 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="RunForm"
            dataKey="value"
            stroke="#1cd981"
            strokeWidth={2}
            fill="url(#radar-gradient)"
            fillOpacity={1}
          />
          <defs>
            <linearGradient id="radar-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1cd981" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#0bb36c" stopOpacity={0.1} />
            </linearGradient>
          </defs>
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
