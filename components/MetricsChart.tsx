
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { StepMetrics } from '../types';

interface MetricsChartProps {
  metrics: StepMetrics;
}

const MetricsChart: React.FC<MetricsChartProps> = ({ metrics }) => {
  // Normalize data for radar chart (mock normalization for display)
  const data = [
    { subject: 'ピッチ', value: Math.min(100, (metrics.cadence / 200) * 100), fullMark: 100 },
    { subject: 'ストライド', value: Math.min(100, metrics.strideLength * 40), fullMark: 100 },
    { subject: '接地時間', value: Math.max(0, 100 - (metrics.groundContactTime / 5)), fullMark: 100 },
    { subject: '上下動', value: Math.max(0, 100 - (metrics.verticalOscillation * 5)), fullMark: 100 },
    { subject: '滞空時間', value: Math.min(100, (metrics.flightTime / 2)), fullMark: 100 },
  ];

  return (
    <div className="w-full h-full min-h-[250px] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
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
