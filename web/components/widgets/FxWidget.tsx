"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { apiGet, fmt, pctClass } from "../../lib/api";
import Flash from "../Flash";
import { useTerminal } from "../../store/terminal";

type FxRow = {
  symbol: string;
  pair: string;
  ticker: string;
  digits: number;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  perfWeek: number | null;
  perfMonth: number | null;
  perfYtd: number | null;
  perfYear: number | null;
};

type Observado = {
  date: string;
  value: number;
  source: string;
  series: Array<{ date: string; value: number }>;
};

function Pct({ value }: { value: number | null }) {
  return <td className={pctClass(value)}>{value === null ? "—" : `${fmt(value)}%`}</td>;
}

export default function FxWidget() {
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const { data = [], error } = useQuery({
    queryKey: ["fx"],
    queryFn: () => apiGet<FxRow[]>("/api/fx"),
    refetchInterval: 2_000,
  });
  // Published once per banking day — no point polling it like a live quote.
  const { data: observado } = useQuery({
    queryKey: ["fx-observado"],
    queryFn: () => apiGet<Observado>("/api/fx/observado"),
    refetchInterval: 600_000,
    retry: 1,
  });

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;

  const spot = data.find((r) => r.pair === "USD/CLP")?.price ?? null;
  const gap = spot !== null && observado ? spot - observado.value : null;

  return (
    <div>
      {observado && (
        <div className="px-2 py-1 border-b border-[var(--border)] flex flex-wrap gap-x-4 gap-y-0.5 items-baseline">
          <span className="dim">
            Dólar observado <span className="text-[9px]">({observado.date})</span>{" "}
            <span className="amber font-bold">{fmt(observado.value)}</span>
          </span>
          {gap !== null && (
            <span className="dim">
              Spot vs obs. <span className={pctClass(gap)}>{gap >= 0 ? "+" : ""}{fmt(gap)}</span>
            </span>
          )}
          <span className="dim text-[9px] ml-auto">{observado.source}</span>
        </div>
      )}
      {observado && observado.series.length > 1 && (
        <div className="h-20 px-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={observado.series} margin={{ top: 4, right: 12, bottom: 0, left: -14 }}>
              <XAxis dataKey="date" stroke="#808080" fontSize={9} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis stroke="#808080" fontSize={9} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#111", border: "1px solid #262626", fontSize: 10 }}
                labelStyle={{ color: "#808080" }}
                formatter={(v: number) => [fmt(v), "Observado"]}
              />
              <Line type="monotone" dataKey="value" stroke="#ff9900" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length === 0 ? (
        <div className="p-2 dim">Loading FX…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Pair</th><th>Last</th><th>Chg%</th><th>1W</th><th>1M</th><th>YTD</th><th>1Y</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.ticker} title={`${r.ticker} — click to chart`} onClick={() => setActiveSymbol(r.symbol)}>
                <td className="!text-left font-bold">{r.pair}</td>
                <td><Flash value={r.price}>{fmt(r.price, r.digits)}</Flash></td>
                <td className={pctClass(r.changePercent)}>
                  <Flash value={r.changePercent}>{r.changePercent === null ? "—" : `${fmt(r.changePercent)}%`}</Flash>
                </td>
                <Pct value={r.perfWeek} />
                <Pct value={r.perfMonth} />
                <Pct value={r.perfYtd} />
                <Pct value={r.perfYear} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
