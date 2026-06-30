"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const getPiDir = () => path.join(os.homedir(), ".pi", "agent");
const getModelsPath = () => path.join(getPiDir(), "models.json");
const getSettingsPath = () => path.join(getPiDir(), "settings.json");
const PROVIDER_ID = "pi-dev";
const LOCAL_BASE_URL = "http://localhost:20128/v1";
const execFileAsync = promisify(execFile);

async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
}

async function isPiInstalled() {
  try {
    await execFileAsync("/bin/sh", ["-lc", "command -v pi"], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const installed = await isPiInstalled();
  const modelsPath = getModelsPath();
  const settingsPath = getSettingsPath();
  const modelsJson = await readJson(modelsPath, { providers: {} });
  const settingsJson = await readJson(settingsPath, {});
  const provider = modelsJson.providers?.[PROVIDER_ID] || null;
  return NextResponse.json({
    installed,
    hasRouterConfig: installed && !!provider,
    providerId: PROVIDER_ID,
    modelsPath,
    settingsPath,
    provider,
    defaultProvider: settingsJson.defaultProvider || null,
    defaultModel: settingsJson.defaultModel || null,
  });
}

export async function POST(request) {
  const { apiKey, models, activeModel } = await request.json();
  const modelIds = (Array.isArray(models) ? models : []).filter((m) => typeof m === "string" && m.trim()).map((m) => m.trim());
  if (modelIds.length === 0) {
    return NextResponse.json({ error: "at least one model is required" }, { status: 400 });
  }

  const normalizedBaseUrl = LOCAL_BASE_URL;
  const keyToUse = apiKey || "sk_9router";
  const finalActive = activeModel || modelIds[0];

  const modelsPath = getModelsPath();
  const settingsPath = getSettingsPath();
  const modelsJson = await readJson(modelsPath, { providers: {} });
  if (!modelsJson.providers) modelsJson.providers = {};
  modelsJson.providers[PROVIDER_ID] = {
    baseUrl: normalizedBaseUrl,
    api: "openai-completions",
    apiKey: keyToUse,
    models: modelIds.map((id) => ({ id, name: id })),
  };
  await writeJson(modelsPath, modelsJson);

  const settingsJson = await readJson(settingsPath, {});
  settingsJson.defaultProvider = PROVIDER_ID;
  settingsJson.defaultModel = finalActive;
  await writeJson(settingsPath, settingsJson);

  return NextResponse.json({ success: true, providerId: PROVIDER_ID, defaultModel: finalActive });
}

export async function DELETE() {
  const modelsPath = getModelsPath();
  const settingsPath = getSettingsPath();
  const modelsJson = await readJson(modelsPath, { providers: {} });
  if (modelsJson.providers) delete modelsJson.providers[PROVIDER_ID];
  await writeJson(modelsPath, modelsJson);

  const settingsJson = await readJson(settingsPath, {});
  if (settingsJson.defaultProvider === PROVIDER_ID) {
    delete settingsJson.defaultProvider;
    delete settingsJson.defaultModel;
  }
  await writeJson(settingsPath, settingsJson);

  return NextResponse.json({ success: true });
}
