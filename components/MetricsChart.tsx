
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
    <div className="w-full h-64 md:h-80 bg-slate-900/50 rounded-xl border border-slate-800 p-4">
      <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">バイオメカニクス特性</h3>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="RunForm"
            dataKey="value"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
