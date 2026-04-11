import { z } from 'zod';

export const ModelBreakdownSchema = z.object({
  modelName: z.string(),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheCreationTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  cost: z.number().default(0),
});

export const DailyEntrySchema = z.object({
  date: z.string(),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheCreationTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  totalTokens: z.number().default(0),
  totalCost: z.number().default(0),
  modelsUsed: z.array(z.string()).default([]),
  modelBreakdowns: z.array(ModelBreakdownSchema).default([]),
});

export const TotalsSchema = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheCreationTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  totalTokens: z.number().default(0),
  totalCost: z.number().default(0),
});

export const DailyResponseSchema = z.object({
  daily: z.array(DailyEntrySchema).default([]),
  totals: TotalsSchema,
});

export const ProjectEntrySchema = z.object({
  projectPath: z.string(),
  instances: z.array(DailyEntrySchema).default([]),
});

export const ProjectsResponseSchema = z.object({
  projects: z.record(z.array(DailyEntrySchema).default([])).default({}),
});

export function validateDaily(data: unknown) {
  return DailyResponseSchema.parse(data);
}

export function validateProjects(data: unknown) {
  return ProjectsResponseSchema.parse(data);
}

const BlockEntrySchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  actualEndTime: z.string().nullable().default(null),
  isActive: z.boolean().default(false),
  isGap: z.boolean().default(false),
  entries: z.number().default(0),
  tokenCounts: z.object({
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    cacheCreationInputTokens: z.number().default(0),
    cacheReadInputTokens: z.number().default(0),
  }).default({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }),
  totalTokens: z.number().default(0),
  costUSD: z.number().default(0),
  models: z.array(z.string()).default([]),
});

export const BlocksResponseSchema = z.object({
  blocks: z.array(BlockEntrySchema).default([]),
});

export function validateBlocks(data: unknown) {
  return BlocksResponseSchema.parse(data);
}
