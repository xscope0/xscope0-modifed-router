export const SMART_HEALTH_INTERVAL_OPTIONS = [
  { value: 15, label: "Every 15m" },
  { value: 30, label: "Every 30m" },
  { value: 60, label: "Every 1h" },
  { value: 360, label: "Every 6h" },
  { value: 720, label: "Every 12h" },
  { value: 1440, label: "Every 24h" },
];

export function getSmartHealthIntervalMs(value) {
  const minutes = Number(value || 0);
  return SMART_HEALTH_INTERVAL_OPTIONS.some((option) => option.value === minutes) ? minutes * 60 * 1000 : 0;
}

export function summarizeProxyHealthResults(results) {
  const deadIds = [];
  let alive = 0;

  for (const result of results) {
    if (result.ok) {
      alive += 1;
    } else if (result.id) {
      deadIds.push(result.id);
    }
  }

  return { alive, deadIds };
}
