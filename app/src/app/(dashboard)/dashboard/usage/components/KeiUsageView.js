"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Card from "@/shared/components/Card";

const AreaChart = dynamic(() => import("recharts").then((mod) => {
  const { Area, AreaChart: RechartsAreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } = mod;

  function UsageAreaChart({ rows }) {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <RechartsAreaChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="keiUsageRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            contentStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
            formatter={(value) => [formatNumber(value), "Requests"]}
          />
          <Area type="monotone" dataKey="requests" stroke="var(--color-primary, #6366f1)" strokeWidth={2} fill="url(#keiUsageRequests)" dot={false} activeDot={{ r: 4 }} />
        </RechartsAreaChart>
      </ResponsiveContainer>
    );
  }

  return { default: UsageAreaChart };
}), { ssr: false, loading: () => <div className="flex h-[220px] items-center justify-center text-sm text-text-muted">Loading chart...</div> });

const formatNumber = (value) => new Intl.NumberFormat().format(value || 0);
const formatCost = (value) => `$${(value || 0).toFixed(4)}`;

function listValues(record) {
  return Object.entries(record || {}).map(([id, value]) => ({ id, ...value }));
}

function buildProviderRows(stats) {
  const totalRequests = stats?.totalRequests || 0;
  return listValues(stats?.byProvider)
    .map((provider) => ({
      ...provider,
      name: provider.id,
      totalTokens: (provider.promptTokens || 0) + (provider.completionTokens || 0),
      share: totalRequests > 0 ? ((provider.requests || 0) / totalRequests) * 100 : 0,
    }))
    .sort((a, b) => (b.requests || 0) - (a.requests || 0));
}

function buildModelRows(stats) {
  return listValues(stats?.byModel)
    .map((model) => ({
      ...model,
      totalTokens: (model.promptTokens || 0) + (model.completionTokens || 0),
    }))
    .sort((a, b) => (b.requests || 0) - (a.requests || 0));
}

function buildTimeline(stats) {
  return (stats?.last10Minutes || []).map((point, index) => ({
    label: `${index - 9}m`,
    requests: point.requests || 0,
  }));
}

function StatCard({ label, value, hint }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-2 truncate text-2xl font-bold text-text">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-text-muted">{hint}</div>}
    </Card>
  );
}

function ProviderTopology({ providers }) {
  const active = providers.slice(0, 6);

  if (active.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-text-muted">No provider traffic for this period</div>;
  }

  return (
    <div className="relative h-[220px] overflow-hidden rounded-xl bg-bg-subtle">
      <svg viewBox="0 0 720 220" className="h-full w-full">
        {active.map((provider, index) => {
          const y = ((index + 1) * 220) / (active.length + 1);
          return (
            <g key={provider.id}>
              <path d={`M 142 ${y} C 300 ${y}, 350 110, 500 110`} fill="none" stroke="currentColor" strokeDasharray="5 8" strokeOpacity="0.25" strokeWidth="2" />
              <rect x="24" y={y - 19} width="132" height="38" rx="10" fill="var(--color-bg)" stroke="var(--color-border)" />
              <text x="38" y={y - 1} className="fill-current text-[12px] font-semibold">{provider.name.slice(0, 16)}</text>
              <text x="38" y={y + 13} className="fill-current text-[10px] text-text-muted">{provider.share.toFixed(0)}% traffic</text>
            </g>
          );
        })}
        <rect x="500" y="82" width="150" height="56" rx="28" fill="var(--color-bg)" stroke="var(--color-border)" strokeWidth="1.5" />
        <circle cx="530" cy="110" r="16" fill="var(--color-bg-subtle)" stroke="var(--color-border)" />
        <text x="558" y="115" className="fill-current text-[15px] font-bold">9Router</text>
      </svg>
    </div>
  );
}

export default function KeiUsageView({ period }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const es = new EventSource(`/api/usage/stream?period=${encodeURIComponent(period)}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStats(data);
        setLoading(false);
      } catch (err) {
        console.error("[KeiUsageView] stream parse failed:", err);
      }
    };

    es.onerror = () => {
      setLoading(false);
    };

    return () => es.close();
  }, [period]);

  const providers = useMemo(() => buildProviderRows(stats), [stats]);
  const models = useMemo(() => buildModelRows(stats), [stats]);
  const timeline = useMemo(() => buildTimeline(stats), [stats]);
  const totalTokens = (stats?.totalPromptTokens || 0) + (stats?.totalCompletionTokens || 0);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-text-muted"><span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span></div>;
  }

  if (!stats) {
    return <Card className="p-6 text-sm text-text-muted">Usage data unavailable.</Card>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Requests" value={formatNumber(stats.totalRequests)} hint="Same stats endpoint" />
        <StatCard label="Input Tokens" value={formatNumber(stats.totalPromptTokens)} hint={`${formatNumber(totalTokens)} total`} />
        <StatCard label="Output Tokens" value={formatNumber(stats.totalCompletionTokens)} hint="Completion usage" />
        <StatCard label="Est. Cost" value={formatCost(stats.totalCost)} hint="Estimated, not billing" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Activity</h2>
              <p className="text-xs text-text-muted">Last 10 minutes from usage stats.</p>
            </div>
          </div>
          {timeline.some((point) => point.requests > 0) ? <AreaChart rows={timeline} /> : <div className="flex h-[220px] items-center justify-center text-sm text-text-muted">No recent activity</div>}
        </Card>

        <Card className="min-w-0 p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Provider Flow</h2>
            <p className="text-xs text-text-muted">KeiRouter-style traffic topology.</p>
          </div>
          <ProviderTopology providers={providers} />
        </Card>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-border bg-bg-subtle px-4 py-3">
            <h2 className="text-sm font-semibold">Model Usage</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold">Model</th>
                  <th className="px-4 py-3 text-left font-semibold">Provider</th>
                  <th className="px-4 py-3 text-right font-semibold">Requests</th>
                  <th className="px-4 py-3 text-right font-semibold">Tokens</th>
                  <th className="px-4 py-3 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.slice(0, 12).map((model) => (
                  <tr key={model.id} className="hover:bg-bg-subtle">
                    <td className="px-4 py-3 font-medium">{model.rawModel || model.id}</td>
                    <td className="px-4 py-3 text-text-muted">{model.provider || "unknown"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(model.requests)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(model.totalTokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCost(model.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {models.length === 0 && <div className="px-4 py-10 text-center text-sm text-text-muted">No model usage for this period</div>}
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-border bg-bg-subtle px-4 py-3">
            <h2 className="text-sm font-semibold">Providers</h2>
          </div>
          <div className="divide-y divide-border">
            {providers.slice(0, 8).map((provider) => (
              <div key={provider.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{provider.name}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, provider.share)}%` }} />
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-semibold">{formatNumber(provider.requests)}</div>
                  <div className="text-xs text-text-muted">{provider.share.toFixed(0)}%</div>
                </div>
              </div>
            ))}
            {providers.length === 0 && <div className="px-4 py-10 text-center text-sm text-text-muted">No provider usage for this period</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
