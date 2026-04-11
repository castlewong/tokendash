import type { DailyEntry, DailyResponse, ProjectsResponse, BlocksResponse } from '../shared/types.js';

interface CodexModelEntry {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  isFallback: boolean;
}

interface CodexDailyEntry {
  date: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  costUSD: number;
  models: Record<string, CodexModelEntry>;
}

interface CodexDailyResponse {
  daily: CodexDailyEntry[];
  totals: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    costUSD: number;
  };
}

function parseCodexDate(dateStr: string): string {
  // "Mar 31, 2026" → "2026-03-31"
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10);
}

function normalizeCodexDaily(entry: CodexDailyEntry): DailyEntry {
  const modelBreakdowns = Object.entries(entry.models).map(([name, m]) => ({
    modelName: name,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: m.cachedInputTokens,
    cost: entry.costUSD / Object.keys(entry.models).length,
  }));

  return {
    date: parseCodexDate(entry.date),
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: entry.cachedInputTokens,
    totalTokens: entry.totalTokens,
    totalCost: entry.costUSD,
    modelsUsed: Object.keys(entry.models),
    modelBreakdowns,
  };
}

export function normalizeCodexDailyResponse(data: unknown): DailyResponse {
  const codex = data as CodexDailyResponse;
  return {
    daily: (codex.daily || []).map(normalizeCodexDaily),
    totals: {
      inputTokens: codex.totals?.inputTokens ?? 0,
      outputTokens: codex.totals?.outputTokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: codex.totals?.cachedInputTokens ?? 0,
      totalTokens: codex.totals?.totalTokens ?? 0,
      totalCost: codex.totals?.costUSD ?? 0,
    },
  };
}

export function normalizeCodexProjectsResponse(data: unknown): ProjectsResponse {
  const codex = data as CodexDailyResponse;
  const entries = (codex.daily || []).map(normalizeCodexDaily);
  return {
    projects: { 'OpenAI Codex': entries },
  };
}

export function emptyBlocksResponse(): BlocksResponse {
  return { blocks: [] };
}
