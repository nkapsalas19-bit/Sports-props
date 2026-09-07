"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function BankrollChart({ points, goal }: { points: number[]; goal: number }) {
  const data = points.map((bankroll, i) => ({ step: i, bankroll }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="step" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={[0, Math.max(goal * 1.1, ...points)]}
          />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Bankroll"]}
            labelFormatter={(step) => `Bet #${step}`}
          />
          <Line type="monotone" dataKey="bankroll" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
