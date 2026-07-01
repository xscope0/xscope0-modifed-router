"use client";

import { useEffect, useState } from "react";
import Card from "./Card";
import Select from "./Select";
import Badge from "./Badge";

const NONE_PROXY_POOL_VALUE = "__none__";

export default function NoAuthProxyCard({ providerId }) {
  const [proxyPools, setProxyPools] = useState([]);
  const [proxyPoolId, setProxyPoolId] = useState(NONE_PROXY_POOL_VALUE);
  const [strategy, setStrategy] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/proxy-pools?isActive=true", { cache: "no-store", signal: controller.signal }).then((r) => r.ok ? r.json() : { proxyPools: [] }),
      fetch("/api/settings", { cache: "no-store", signal: controller.signal }).then((r) => r.ok ? r.json() : {}),
    ]).then(([poolData, settingsData]) => {
      if (controller.signal.aborted) return;
      setProxyPools(poolData.proxyPools || []);
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setStrategy(override);
      setProxyPoolId(override.proxyPoolId || NONE_PROXY_POOL_VALUE);
    }).catch(() => {});
    return () => controller.abort();
  }, [providerId]);

  const saveStrategy = async (patch) => {
    const nextStrategy = { ...strategy, ...patch };
    for (const [key, value] of Object.entries(nextStrategy)) {
      if (value === null || value === undefined || value === "") delete nextStrategy[key];
    }
    setStrategy(nextStrategy);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      const current = data.providerStrategies || {};
      const updated = { ...current };
      if (Object.keys(nextStrategy).length === 0) delete updated[providerId];
      else updated[providerId] = nextStrategy;
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      console.log("Save provider strategy error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = async (newValue) => {
    setProxyPoolId(newValue);
    await saveStrategy({ proxyPoolId: newValue === NONE_PROXY_POOL_VALUE ? null : newValue });
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 text-green-500">
          <span className="material-symbols-outlined text-[20px]">lock_open</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">No authentication required</p>
          <p className="text-xs text-text-muted">This provider is ready to use. Optionally route requests through a proxy pool to bypass IP-based limits.</p>
        </div>
        {strategy.inactive === true && <Badge variant="error" size="sm">Inactive</Badge>}
        {savedFlash && <Badge variant="success" size="sm">Saved</Badge>}
      </div>
      <Select
        label="Proxy Pool"
        value={proxyPoolId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        options={[
          { value: NONE_PROXY_POOL_VALUE, label: "None (direct)" },
          ...proxyPools.map((pool) => ({ value: pool.id, label: pool.name })),
        ]}
      />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Select
            label="Auto-rotate"
            value={strategy.autoRotateProxyMinutes || ""}
            onChange={(e) => saveStrategy({ autoRotateProxyMinutes: e.target.value ? Number(e.target.value) : null })}
            disabled={saving}
            options={[
              { value: "", label: "Off" },
              { value: 5, label: "Every 5m" },
              { value: 10, label: "Every 10m" },
              { value: 15, label: "Every 15m" },
            ]}
          />
          <button
            onClick={() => saveStrategy({ autoRotateProxyOnError: strategy.autoRotateProxyOnError !== true })}
            disabled={saving}
            className={`mt-5 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${strategy.autoRotateProxyOnError ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:text-primary"}`}
          >
            <span className="material-symbols-outlined text-[18px]">sync_problem</span>
            Rate-limit/error → next proxy
          </button>

        </div>
    </Card>
  );
}

