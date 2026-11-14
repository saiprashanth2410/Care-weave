import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** Orders at each workflow stage. Its own file so the chart library loads only when the overview draws it. */
export default function OrderPipelineChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#56655f" />
        <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 12 }} stroke="#56655f" tickLine={false} />
        <Tooltip cursor={{ fill: '#e9ece7' }} wrapperStyle={{ boxShadow: 'none' }} contentStyle={{ fontSize: 12, borderRadius: 0, border: '1px solid #c3cac2', background: '#f6f7f3', boxShadow: 'none' }} />
        <Bar dataKey="value" name="Orders" fill="#0c6b6d" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
