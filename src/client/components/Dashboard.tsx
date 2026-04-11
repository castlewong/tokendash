import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, Cell, LineChart, Line,
  ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchDaily, fetchProjects } from '../api/client.js';
import { useCcusageData } from '../hooks/useCcusageData.js';
import { formatDate, formatTokens, formatUSD, formatPercent } from '../utils/formatters.js';
import { shortModelName } from '../utils/modelNames.js';
import type { DailyEntry, MetricMode } from '../../shared/types.js';

const C = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const TIME_RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: Infinity },
] as const;

type TimeRangeKey = typeof TIME_RANGES[number]['key'];

/* ---- Shared UI primitives ---- */

function InsightCard({ label, title, detail, badge }: { label: string; title: string; detail: string; badge?: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">{label}</p>
        {badge ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-700">{badge}</span> : null}
      </div>
      <div>
        <p className="text-2xl font-black tracking-tight text-gray-900">{title}</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub, insight, accent }: { label: string; value: string; sub?: string; insight?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
      <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-400">{label}</span>
      <span className={`text-3xl font-black tracking-tighter font-mono mt-1 ${accent ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</span>
      {sub && <span className="text-xs font-medium text-gray-400 mt-0.5">{sub}</span>}
      {insight && <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] font-medium text-gray-500 leading-snug">{insight}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl bg-white border border-gray-200 p-5 shadow-sm ${className}`}>
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs font-medium text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function TooltipBox({ active, payload, label, fmt = formatTokens }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-lg shadow-black/8 text-[11px]">
      {label && <div className="text-gray-500 mb-1.5 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>
          <span className="font-mono text-gray-800">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FilterTab({ options, value, onChange }: { options: readonly { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-gray-100/80 rounded-lg border border-gray-200">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all duration-200 ${value === o.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProjectSelect({ projects, value, onChange }: { projects: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 max-w-[220px]">
      <option value="">All Projects</option>
      {projects.map(p => <option key={p} value={p}>{p.split('/').pop() || p}</option>)}
    </select>
  );
}

/* ---- Aggregation helpers ---- */

function filterByTime<T extends { date?: string; startTime?: string }>(data: T[], rangeKey: TimeRangeKey): T[] {
  if (rangeKey === 'all') return data;
  const days = TIME_RANGES.find(t => t.key === rangeKey)!.days;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter(d => {
    const field = d.date || d.startTime || '';
    return new Date(field) >= cutoff;
  });
}

function filterProjectDaily(projects: Record<string, DailyEntry[]>, project: string, range: TimeRangeKey): DailyEntry[] {
  if (!project) {
    // Merge all projects by date
    const merged: Record<string, DailyEntry> = {};
    for (const entries of Object.values(projects)) {
      for (const e of filterByTime(entries, range)) {
        if (!merged[e.date]) {
          merged[e.date] = { ...e, modelsUsed: [...e.modelsUsed], modelBreakdowns: e.modelBreakdowns.map(b => ({ ...b })) };
        } else {
          const m = merged[e.date];
          m.inputTokens += e.inputTokens;
          m.outputTokens += e.outputTokens;
          m.cacheCreationTokens += e.cacheCreationTokens;
          m.cacheReadTokens += e.cacheReadTokens;
          m.totalTokens += e.totalTokens;
          m.totalCost += e.totalCost;
          for (const b of e.modelBreakdowns) {
            const existing = m.modelBreakdowns.find(x => x.modelName === b.modelName);
            if (existing) {
              existing.inputTokens += b.inputTokens;
              existing.outputTokens += b.outputTokens;
              existing.cacheCreationTokens += b.cacheCreationTokens;
              existing.cacheReadTokens += b.cacheReadTokens;
              existing.cost += b.cost;
            } else {
              m.modelBreakdowns.push({ ...b });
            }
          }
        }
      }
    }
    return Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
  }
  return filterByTime(projects[project] || [], range);
}

/* ---- Main Dashboard ---- */

export function Dashboard() {
  const [agent, setAgent] = useState<'claude' | 'codex'>('claude');
  const isCodex = agent === 'codex';

  const dailyData = useCcusageData(useCallback(() => fetchDaily(agent), [agent]));
  const projectsData = useCcusageData(useCallback(() => fetchProjects(agent), [agent]));

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('30d');
  const [project, setProject] = useState('');
  const [metric, setMetric] = useState<MetricMode>('tokens');

  const handleAgentChange = (a: 'claude' | 'codex') => {
    setAgent(a);
    setProject('');
  };

  const isLoading = dailyData.loading || projectsData.loading;
  const error = dailyData.error || projectsData.error;
  const isTokens = metric === 'tokens';
  const dataKey = isTokens ? 'tokens' : 'cost';

  const projectList = useMemo(() => Object.keys(projectsData.data?.projects || {}).sort(), [projectsData.data]);

  // Filtered daily data for the selected project & time range
  const filteredDaily = useMemo(() => {
    if (!projectsData.data) return [];
    return filterProjectDaily(projectsData.data.projects, project, timeRange);
  }, [projectsData.data, project, timeRange]);

  // Totals from filtered data
  const totals = useMemo(() => {
    return filteredDaily.reduce((acc, d) => ({
      inputTokens: acc.inputTokens + d.inputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + d.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
      totalTokens: acc.totalTokens + d.totalTokens,
      totalCost: acc.totalCost + d.totalCost,
    }), { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 });
  }, [filteredDaily]);

  const activeDays = useMemo(() => filteredDaily.filter(d => d.totalTokens > 0).length, [filteredDaily]);
  const peakDay = useMemo(() => {
    if (!filteredDaily.length) return { date: '-', tokens: 0 };
    const top = filteredDaily.reduce((a, b) => b.totalTokens > a.totalTokens ? b : a, filteredDaily[0]);
    return { date: top.date, tokens: top.totalTokens };
  }, [filteredDaily]);
  const cacheHitRate = totals.inputTokens > 0 ? (totals.cacheReadTokens / (totals.cacheReadTokens + totals.inputTokens)) * 100 : 0;
  const outputRatio = totals.inputTokens > 0 ? (totals.outputTokens / totals.inputTokens) * 100 : 0;

  // Chart data: usage over time
  const trendData = useMemo(() => {
    if (isTokens) {
      return filteredDaily.map(d => ({
        date: formatDate(d.date),
        input: d.inputTokens,
        output: d.outputTokens,
        cacheRead: d.cacheReadTokens,
        total: d.totalTokens,
        cost: d.totalCost,
      }));
    }
    return filteredDaily.map(d => ({
      date: formatDate(d.date),
      cost: d.totalCost,
    }));
  }, [isTokens, filteredDaily]);

  // Model aggregation
  const modelAgg = useMemo(() => {
    const map: Record<string, { tokens: number; cost: number; input: number; output: number; cacheRead: number }> = {};
    for (const d of filteredDaily) {
      for (const b of d.modelBreakdowns) {
        const name = shortModelName(b.modelName);
        if (!map[name]) map[name] = { tokens: 0, cost: 0, input: 0, output: 0, cacheRead: 0 };
        map[name].tokens += b.inputTokens + b.outputTokens;
        map[name].cost += b.cost;
        map[name].input += b.inputTokens;
        map[name].output += b.outputTokens;
        map[name].cacheRead += b.cacheReadTokens;
      }
    }
    return Object.entries(map).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.tokens - a.tokens);
  }, [filteredDaily]);

  // Model trend data (per model per day)
  const modelTrendData = useMemo(() => {
    return filteredDaily.map(d => {
      const entry: Record<string, string | number> = { date: formatDate(d.date) };
      for (const b of d.modelBreakdowns) {
        const name = shortModelName(b.modelName);
        entry[name] = (entry[name] as number || 0) + (isTokens ? b.inputTokens + b.outputTokens : b.cost);
      }
      return entry;
    });
  }, [filteredDaily, isTokens]);

  // Project pie data
  const projectPieData = useMemo(() => {
    if (!projectsData.data) return [];
    return Object.entries(projectsData.data.projects)
      .map(([path, entries]) => {
        const filtered = filterByTime(entries, timeRange);
        return {
          name: path.split('/').pop() || path,
          full: path,
          tokens: filtered.reduce((s, e) => s + e.totalTokens, 0),
          cost: filtered.reduce((s, e) => s + e.totalCost, 0),
        };
      })
      .filter(d => d.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
  }, [projectsData.data, timeRange]);

  // Cache trend data
  const cacheTrendData = useMemo(() => filteredDaily.map(d => ({
    date: formatDate(d.date),
    cacheRead: d.cacheReadTokens,
    input: d.inputTokens,
    hitRate: d.inputTokens > 0 ? (d.cacheReadTokens / (d.cacheReadTokens + d.inputTokens)) * 100 : 0,
  })), [filteredDaily]);

  if (isLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-10">
        <div className="skeleton h-8 w-48 rounded mb-2" />
        <div className="skeleton h-4 w-72 rounded mb-8" />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="skeleton h-72 rounded-xl" /><div className="skeleton h-72 rounded-xl" /></div>
      </div>
    );
  }

  if (error) return (
    <div className="max-w-[1440px] mx-auto px-6 py-10">
      <div className="rounded-xl bg-red-50 border border-red-200 p-5"><div className="text-red-600 text-sm">{error}</div></div>
    </div>
  );

  if (!dailyData.data || !projectsData.data) return null;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-10">
      {/* Narrative Header & Filter Bar */}
      <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-1.5">Usage Analytics</h1>
          <p className="text-[14px] font-medium text-gray-500 leading-relaxed">
            Currently viewing <span className="font-bold text-gray-800">{isCodex ? 'Codex' : 'Claude'}</span> usage
            for <span className="font-bold text-gray-800">{TIME_RANGES.find(t => t.key === timeRange)?.label}</span>
            {project ? <span> in project <span className="font-bold text-gray-800">{project.split('/').pop() || project}</span></span> : ' across all projects'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Provider</span>
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100/80 rounded-lg border border-gray-200">
              <button onClick={() => handleAgentChange('claude')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all duration-200 ${agent === 'claude' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
                Claude
              </button>
              <button onClick={() => handleAgentChange('codex')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all duration-200 ${agent === 'codex' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
                Codex
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Time Range</span>
            <FilterTab options={TIME_RANGES} value={timeRange} onChange={v => setTimeRange(v as TimeRangeKey)} />
          </div>

          {!isCodex && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Project</span>
              <ProjectSelect projects={projectList} value={project} onChange={setProject} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Metric</span>
            <FilterTab options={[{ key: 'tokens', label: 'Tokens' }, { key: 'usd', label: 'Cost' }]} value={metric} onChange={v => setMetric(v as MetricMode)} />
          </div>
        </div>
      </div>

      {/* Insights Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <InsightCard
          label="Top Driver"
          title={modelAgg.length > 0 ? modelAgg[0].name : '-'}
          detail={`Accounted for ${modelAgg.length > 0 && totals.totalTokens > 0 ? formatPercent((modelAgg[0].tokens / totals.totalTokens) * 100) : '0%'} of selected ${isTokens ? 'tokens' : 'cost'}.`}
          badge="Model"
        />
        {!isCodex && !project ? (
          <InsightCard
            label="Highest Usage"
            title={projectPieData.length > 0 ? projectPieData[0].name : '-'}
            detail={`Top project consumed ${projectPieData.length > 0 ? (isTokens ? formatTokens(projectPieData[0].tokens) : formatUSD(projectPieData[0].cost)) : '0'} total.`}
            badge="Project"
          />
        ) : (
          <InsightCard
            label="Focus"
            title={project ? project.split('/').pop() || project : 'Codex Global'}
            detail={project ? 'Analyzing specific project usage pattern.' : 'Reviewing global Codex metrics.'}
            badge="Scope"
          />
        )}
        <InsightCard
          label="Trend Focus"
          title="Top 6 Models"
          detail="Trends are filtered to the top 6 contributing models to reduce noise."
          badge="View"
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <KPICard label="Total Tokens" value={formatTokens(totals.totalTokens)} accent insight="The primary volume indicator for the selected period." />
        <KPICard label="Total Cost" value={formatUSD(totals.totalCost)} insight="Estimated spend based on current pricing." />
        <KPICard label="Daily Avg" value={formatTokens(activeDays > 0 ? totals.totalTokens / activeDays : 0)} sub={`${activeDays} active days`} insight="Baseline for typical daily volume." />
        <KPICard label="Peak Day" value={formatTokens(peakDay.tokens)} sub={peakDay.date !== '-' ? formatDate(peakDay.date) : undefined} insight="Highest single day usage." />
        <KPICard label="Cache Hit" value={formatPercent(cacheHitRate)} insight="Higher hit rate reduces cost." />
        <KPICard label="Output/Input" value={formatPercent(outputRatio)} insight="Ratio of generation to context." />
      </div>

      {/* Row 1: Usage Over Time (full width) */}
      <Panel title="Usage Over Time" className="mb-4">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
            <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            {isTokens && <Bar dataKey="cacheRead" stackId="a" fill={C[0]} fillOpacity={0.7} name="Cache Read" maxBarSize={24} />}
            {isTokens && <Bar dataKey="input" stackId="a" fill={C[1]} fillOpacity={0.7} name="Input" maxBarSize={24} />}
            {isTokens && <Bar dataKey="output" stackId="a" fill={C[2]} fillOpacity={0.7} name="Output" maxBarSize={24} />}
            {!isTokens && <Area type="monotone" dataKey="cost" stroke={C[1]} fill={C[1]} fillOpacity={0.15} name="Cost" strokeWidth={1.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      {/* Row 2: Model Trend (left 60%) + Model Distribution (right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <Panel title="Model Trend" subtitle="Showing top 6 models to maintain readability" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={modelTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
              <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {modelAgg.slice(0, 6).map((m, i) => (
                <Line key={m.name} type="monotone" dataKey={m.name} stroke={C[i % C.length]} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Model Distribution" subtitle="Ranked by total volume" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelAgg.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} width={92} />
              <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={24}>
                {modelAgg.slice(0, 6).map((_, index) => (
                  <Cell key={index} fill={C[index % C.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Row 3: Project Pie (left) + Cache Efficiency (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {!isCodex && !project ? (
          <Panel title="Project Distribution" subtitle={`Top 8 projects by ${isTokens ? 'Tokens' : 'Cost'}`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={projectPieData.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
                <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {projectPieData.slice(0, 8).map((_, index) => (
                    <Cell key={index} fill={C[index % C.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        ) : !isCodex && project ? (
          <Panel title="Per-Model Breakdown">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={modelAgg} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTokens(v)} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<TooltipBox />} />
                <Bar dataKey="cacheRead" stackId="a" fill={C[0]} fillOpacity={0.7} name="Cache Read" maxBarSize={20} />
                <Bar dataKey="input" stackId="a" fill={C[1]} fillOpacity={0.7} name="Input" maxBarSize={20} />
                <Bar dataKey="output" stackId="a" fill={C[2]} fillOpacity={0.7} name="Output" maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        ) : null}

        <Panel title="Cache Efficiency">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cacheTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTokens(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip content={<TooltipBox />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Area yAxisId="left" type="monotone" dataKey="cacheRead" stroke={C[5]} fill={C[5]} fillOpacity={0.12} name="Cache Read" strokeWidth={1.5} />
              <Line yAxisId="right" type="monotone" dataKey="hitRate" stroke={C[3]} strokeWidth={2} dot={false} name="Hit Rate (%)" />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Row 4: Detail Table */}
      <Panel title="Daily Detail" subtitle="Recent 30 days of usage breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Date</th>
                <th className="text-right py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Input</th>
                <th className="text-right py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Output</th>
                <th className="text-right py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Cache Read</th>
                <th className="text-right py-3 px-4 text-gray-800 font-bold uppercase tracking-widest text-[10px]">Total Tokens</th>
                <th className="text-right py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Cost</th>
                <th className="text-left py-3 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Models</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredDaily].reverse().slice(0, 30).map(d => (
                <tr key={d.date} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 px-4 text-gray-800 font-semibold">{formatDate(d.date)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-500">{formatTokens(d.inputTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-500">{formatTokens(d.outputTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-600/70">{formatTokens(d.cacheReadTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">{formatTokens(d.totalTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-700 bg-gray-50/50">{formatUSD(d.totalCost)}</td>
                  <td className="py-2.5 px-4 text-gray-500 font-medium truncate max-w-[200px]">{d.modelsUsed.map(shortModelName).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
