"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import ApiKeySelect from "./ApiKeySelect";

const LOCAL_PI_BASE_URL = "http://localhost:20128/v1";

export default function PiToolCard({ tool, baseUrl, apiKeys, activeProviders = [], cloudEnabled }) {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState(apiKeys?.[0]?.key || "");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [selectedModels, setSelectedModels] = useState([]);
  const [activeModel, setActiveModel] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/cli-tools/pi-settings", { cache: "no-store" });
      const data = await res.json();
      setStatus(data);
      const models = data.provider?.models?.map((m) => m.id) || [];
      if (models.length && selectedModels.length === 0) setSelectedModels(models);
      if (data.defaultModel && !activeModel) setActiveModel(data.defaultModel);
    } catch (error) {
      setStatus({ error: error.message });
    } finally {
      setChecking(false);
    }
  }, [activeModel, selectedModels.length]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const effectiveBaseUrl = () => LOCAL_PI_BASE_URL;

  const effectiveApiKey = selectedApiKey?.trim() || (cloudEnabled ? "<API_KEY_FROM_DASHBOARD>" : "sk_9router");

  const apply = async () => {
    if (selectedModels.length === 0) {
      setMessage({ type: "error", text: "Select at least one model" });
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/pi-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: effectiveBaseUrl(),
          apiKey: effectiveApiKey,
          models: selectedModels,
          activeModel: activeModel || selectedModels[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply Pi config");
      setMessage({ type: "success", text: "Pi provider pi-dev applied" });
      await loadStatus();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const reset = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/pi-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset Pi config");
      setSelectedModels([]);
      setActiveModel("");
      setMessage({ type: "success", text: "Pi provider pi-dev removed" });
      await loadStatus();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const availableModels = useMemo(() => activeProviders.flatMap((conn) => (conn.models || []).map((m) => typeof m === "string" ? m : m.id || m.name || "")), [activeProviders]);

  const manualConfig = JSON.stringify({
    providers: {
      "pi-dev": {
        baseUrl: effectiveBaseUrl(),
        api: "openai-completions",
        apiKey: effectiveApiKey,
        models: (selectedModels.length ? selectedModels : ["provider/model-id"]).map((id) => ({ id, name: id })),
      },
    },
  }, null, 2);

  return (
    <Card padding="xs" className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 text-left">
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-8 overflow-hidden rounded-lg">
            <Image src="/pi.svg" alt={tool.name} width={32} height={32} className="size-8 object-cover" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm">{tool.name}</h3>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status?.installed === false ? "bg-red-500/10 text-red-600" : status?.hasRouterConfig ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}>
          {status?.installed === false ? "Uninstalled" : status?.hasRouterConfig ? "Configured" : "Not configured"}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
        {checking && <p className="text-xs text-text-muted">Checking Pi config...</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_auto_1fr] sm:items-center">
          <span className="text-xs font-semibold text-text-main sm:text-right">Endpoint</span>
          <span className="hidden text-text-muted sm:inline">→</span>
          <input value={effectiveBaseUrl()} readOnly className="rounded border border-border bg-surface px-2 py-2 text-xs opacity-80" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_auto_1fr] sm:items-center">
          <span className="text-xs font-semibold text-text-main sm:text-right">API Key</span>
          <span className="hidden text-text-muted sm:inline">→</span>
          <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_auto_1fr] sm:items-start">
          <span className="text-xs font-semibold text-text-main sm:text-right">Models</span>
          <span className="hidden text-text-muted sm:inline">→</span>
          <div className="flex flex-col gap-2">
            <div className="min-h-8 rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-muted">
              {selectedModels.length ? selectedModels.join(", ") : "No models selected"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>Add Model</Button>
              <input value={activeModel} onChange={(e) => setActiveModel(e.target.value)} placeholder="default model" className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs" />
            </div>
          </div>
        </div>
        {message && <p className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={apply} loading={applying}>Apply to Pi</Button>
          <Button size="sm" variant="outline" onClick={reset} loading={restoring}>Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setManualOpen(true)}>Manual Config</Button>
        </div>
      </div>

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={(m) => {
          if (!selectedModels.includes(m.value)) setSelectedModels([...selectedModels, m.value]);
          if (!activeModel) setActiveModel(m.value);
        }}
        onDeselect={(m) => setSelectedModels(selectedModels.filter((x) => x !== m.value))}
        selectedModel={null}
        addedModelValues={selectedModels}
        activeProviders={activeProviders}
        closeOnSelect={false}
        title="Add Model for Pi"
      />
      <ManualConfigModal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Pi - Manual Configuration"
        configs={[{ filename: "~/.pi/agent/models.json", content: manualConfig }]}
      />
    </Card>
  );
}
