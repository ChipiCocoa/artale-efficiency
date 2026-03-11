import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ChartPoint } from '../types'
import './ExpChart.css'

interface ExpChartProps {
  data: ChartPoint[]
}

export function ExpChart({ data }: ExpChartProps) {
  const { t } = useTranslation()

  if (data.length < 2) {
    return (
      <div className="exp-chart-empty">
        {t('chart.collectingData')}
      </div>
    )
  }

  return (
    <div className="exp-chart">
      <h3>{t('chart.title')}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#666" fontSize={12} />
          <YAxis stroke="#666" fontSize={12} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: '8px' }}
            labelStyle={{ color: '#888' }}
            formatter={(value: number | undefined) => [value?.toLocaleString() ?? '0', t('chart.tooltipLabel')]}
          />
          <Line
            type="monotone"
            dataKey="expPer10Min"
            stroke="#4a6cf7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}