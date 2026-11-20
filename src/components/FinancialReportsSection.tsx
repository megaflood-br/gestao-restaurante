'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Download,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import {
  buildFinancialReportsData,
  type DailyWindowOption,
  type FinancialPeriodPoint,
  type FinancialReportGranularity,
  type MonthlyWindowOption,
  type WeeklyWindowOption,
} from '@/lib/financial-reports';
import type { DeliveryStoreState } from '@/types/delivery';

interface FinancialReportsSectionProps {
  state: DeliveryStoreState;
  onOpenCosts?: () => void;
  onOpenOrders?: () => void;
}

type ChartStyleMode = 'bar' | 'area';

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  payload?: FinancialPeriodPoint;
}

function FinancialTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-xs shadow-sm space-y-1.5 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-bold text-slate-900 dark:text-white">
          {point.fullLabel}
        </span>
        <span className="font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
          {formatCurrencyBRL(point.totalRevenue)}
        </span>
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span>Pedidos ({point.ordersCount})</span>
          <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
            {formatCurrencyBRL(point.ordersRevenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span>Entradas Extras</span>
          <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
            {formatCurrencyBRL(point.manualInflows)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span>Custos + CMV</span>
          <span className="font-mono-tabular font-semibold text-red-700 dark:text-red-400">
            −{formatCurrencyBRL(point.costsTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800 font-semibold">
          <span className="text-slate-700 dark:text-slate-200">Saldo Estimado</span>
          <span
            className={`font-mono-tabular ${
              point.netResult >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatCurrencyBRL(point.netResult)}
          </span>
        </div>
        {point.ordersCount > 0 && (
          <div className="flex items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
            <span>Ticket Médio</span>
            <span className="font-mono-tabular">
              {formatCurrencyBRL(point.avgTicket)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueChartCanvas({
  data,
  chartStyle,
  showCosts,
  mounted,
  heightClass = 'h-[280px]',
  gradientPrefix,
}: {
  data: FinancialPeriodPoint[];
  chartStyle: ChartStyleMode;
  showCosts: boolean;
  mounted: boolean;
  heightClass?: string;
  gradientPrefix: string;
}) {
  if (!mounted) {
    return (
      <div
        className={`${heightClass} w-full rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse`}
      />
    );
  }

  return (
    <div className={`${heightClass} w-full min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        {chartStyle === 'area' ? (
          <AreaChart
            data={data}
            margin={{ top: 10, right: 12, left: -4, bottom: 4 }}
          >
            <defs>
              <linearGradient
                id={`${gradientPrefix}-orders`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient
                id={`${gradientPrefix}-extras`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(148, 163, 184, 0.22)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val: number) => `R$${Math.round(val)}`}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(148, 163, 184, 0.4)', strokeWidth: 1 }}
              content={<FinancialTooltip />}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
            <Area
              type="monotone"
              dataKey="ordersRevenue"
              name="Receita de Pedidos"
              stackId="rev"
              stroke="#16a34a"
              strokeWidth={2}
              fill={`url(#${gradientPrefix}-orders)`}
            />
            <Area
              type="monotone"
              dataKey="manualInflows"
              name="Entradas Extras"
              stackId="rev"
              stroke="#2563eb"
              strokeWidth={2}
              fill={`url(#${gradientPrefix}-extras)`}
            />
            {showCosts && (
              <Area
                type="monotone"
                dataKey="costsTotal"
                name="Custos + CMV"
                stroke="#dc2626"
                strokeWidth={2}
                strokeDasharray="4 3"
                fill="none"
              />
            )}
          </AreaChart>
        ) : (
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 12, left: -4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(148, 163, 184, 0.22)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val: number) => `R$${Math.round(val)}`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
              content={<FinancialTooltip />}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
            <Bar
              dataKey="ordersRevenue"
              name="Receita de Pedidos"
              stackId="rev"
              fill="#16a34a"
              radius={[0, 0, 0, 0]}
              maxBarSize={42}
            />
            <Bar
              dataKey="manualInflows"
              name="Entradas Extras"
              stackId="rev"
              fill="#2563eb"
              radius={[4, 4, 0, 0]}
              maxBarSize={42}
            />
            {showCosts && (
              <Line
                type="monotone"
                dataKey="costsTotal"
                name="Custos + CMV"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 3, fill: '#dc2626' }}
              />
            )}
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function FinancialReportsSection({
  state,
  onOpenCosts,
  onOpenOrders,
}: FinancialReportsSectionProps) {
  const [mounted, setMounted] = useState(false);
  const [granularity, setGranularity] =
    useState<FinancialReportGranularity>('overview');
  const [chartStyle, setChartStyle] = useState<ChartStyleMode>('bar');
  const [showCosts, setShowCosts] = useState(true);
  const [dailyWindow, setDailyWindow] = useState<DailyWindowOption>(14);
  const [weeklyWindow, setWeeklyWindow] = useState<WeeklyWindowOption>(8);
  const [monthlyWindow, setMonthlyWindow] = useState<MonthlyWindowOption>(6);
  const [tableCadence, setTableCadence] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    setMounted(true);
  }, []);

  const reports = useMemo(
    () =>
      buildFinancialReportsData(state, {
        dailyWindow,
        weeklyWindow,
        monthlyWindow,
      }),
    [state, dailyWindow, weeklyWindow, monthlyWindow],
  );

  const activeCadence: 'daily' | 'weekly' | 'monthly' =
    granularity === 'overview' ? tableCadence : granularity;

  const activeSummary =
    activeCadence === 'daily'
      ? reports.dailySummary
      : activeCadence === 'weekly'
        ? reports.weeklySummary
        : reports.monthlySummary;

  const activeSeries =
    activeCadence === 'daily'
      ? reports.dailySeries
      : activeCadence === 'weekly'
        ? reports.weeklySeries
        : reports.monthlySeries;

  const avgLabel =
    activeCadence === 'daily'
      ? 'Média Diária'
      : activeCadence === 'weekly'
        ? 'Média Semanal'
        : 'Média Mensal';

  const handleExportCsv = () => {
    const header = [
      'Período',
      'Pedidos',
      'Receita Pedidos (R$)',
      'Entradas Extras (R$)',
      'Faturamento Total (R$)',
      'Custos + CMV (R$)',
      'Saldo Estimado (R$)',
      'Ticket Médio (R$)',
    ];
    const rows = activeSeries.map((p) => [
      `"${p.fullLabel}"`,
      String(p.ordersCount),
      p.ordersRevenue.toFixed(2).replace('.', ','),
      p.manualInflows.toFixed(2).replace('.', ','),
      p.totalRevenue.toFixed(2).replace('.', ','),
      p.costsTotal.toFixed(2).replace('.', ','),
      p.netResult.toFixed(2).replace('.', ','),
      p.avgTicket.toFixed(2).replace('.', ','),
    ]);
    const csv = `\uFEFF${header.join(';')}\n${rows.map((r) => r.join(';')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-faturamento-${activeCadence}-${reports.referenceDateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasAnyOrders =
    state.orders.some((o) => o.status !== 'cancelado') ||
    state.financialEntries.length > 0;

  return (
    <div className="space-y-6">
      {/* Header + Primary Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Relatórios Financeiros
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Faturamento diário, semanal e mensal com receita de pedidos, entradas manuais, custos e margem estimada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Periodicidade do relatório financeiro"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'overview', label: 'Visão Geral' },
                { id: 'daily', label: 'Diário' },
                { id: 'weekly', label: 'Semanal' },
                { id: 'monthly', label: 'Mensal' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={granularity === tab.id}
                onClick={() => {
                  setGranularity(tab.id);
                  if (tab.id !== 'overview') setTableCadence(tab.id);
                }}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  granularity === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Tipo de visualização"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setChartStyle('bar')}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartStyle === 'bar'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Barras</span>
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('area')}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartStyle === 'area'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Área</span>
            </button>
          </div>

          <button
            type="button"
            aria-pressed={showCosts}
            onClick={() => setShowCosts((v) => !v)}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showCosts
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showCosts ? 'Ocultar Custos' : 'Sobrepor Custos'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 4-KPI Summary Strip */}
      <section
        aria-label="Resumo financeiro do recorte"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Faturamento Total (
            {activeCadence === 'daily'
              ? `${dailyWindow} dias`
              : activeCadence === 'weekly'
                ? `${weeklyWindow} semanas`
                : `${monthlyWindow} meses`}
            )
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {formatCurrencyBRL(activeSummary.totalRevenue)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            {activeSummary.ordersCount} pedidos
            {activeSummary.deltaPct !== null
              ? ` · ${activeSummary.deltaPct >= 0 ? '+' : ''}${activeSummary.deltaPct}% vs ant.`
              : ''}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">{avgLabel}</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {formatCurrencyBRL(activeSummary.avgPerPeriod)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            Ticket médio: {formatCurrencyBRL(activeSummary.avgTicket)}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pico de Faturamento
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {formatCurrencyBRL(activeSummary.peakRevenue)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {activeSummary.peakLabel}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saldo Líquido Estimado
          </p>
          <p
            className={`mt-1 text-2xl font-bold font-mono-tabular ${
              activeSummary.netResult >= 0
                ? 'text-slate-900 dark:text-white'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatCurrencyBRL(activeSummary.netResult)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            Margem: {activeSummary.netMarginPct}% · Custos {formatCurrencyBRL(activeSummary.costsTotal)}
          </p>
        </div>
      </section>

      {!hasAnyOrders ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            Ainda não há faturamento registrado
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Assim que pedidos forem concluídos ou entradas manuais forem lançadas no fluxo de caixa, os gráficos diário, semanal e mensal serão preenchidos automaticamente.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {onOpenOrders && (
              <button
                type="button"
                onClick={onOpenOrders}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
              >
                Ir para Pedidos
              </button>
            )}
            {onOpenCosts && (
              <button
                type="button"
                onClick={onOpenCosts}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg whitespace-nowrap"
              >
                Lançar Entrada Manual
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* CHARTS SECTION */}
          {granularity === 'overview' ? (
            <div className="space-y-6">
              {/* Primary Full-Width Chart: Daily Revenue */}
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Faturamento Diário
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Evolução dia a dia · total de {formatCurrencyBRL(reports.dailySummary.totalRevenue)} nos últimos {dailyWindow} dias
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                    {([7, 14, 30] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDailyWindow(days)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                          dailyWindow === days
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                <RevenueChartCanvas
                  data={reports.dailySeries}
                  chartStyle={chartStyle}
                  showCosts={showCosts}
                  mounted={mounted}
                  heightClass="h-[290px]"
                  gradientPrefix="overview-daily"
                />
              </section>

              {/* Secondary 2-Column Charts: Weekly + Monthly */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Faturamento Semanal
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Consolidado seg–dom · {formatCurrencyBRL(reports.weeklySummary.totalRevenue)} em {weeklyWindow} semanas
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                      {([4, 8, 12] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setWeeklyWindow(w)}
                          className={`px-2 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                            weeklyWindow === w
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {w} sem
                        </button>
                      ))}
                    </div>
                  </div>

                  <RevenueChartCanvas
                    data={reports.weeklySeries}
                    chartStyle={chartStyle}
                    showCosts={showCosts}
                    mounted={mounted}
                    heightClass="h-[270px]"
                    gradientPrefix="overview-weekly"
                  />
                </section>

                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Faturamento Mensal
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Comparativo mensal · {formatCurrencyBRL(reports.monthlySummary.totalRevenue)} em {monthlyWindow} meses
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                      {([3, 6, 12] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMonthlyWindow(m)}
                          className={`px-2 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                            monthlyWindow === m
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <RevenueChartCanvas
                    data={reports.monthlySeries}
                    chartStyle={chartStyle}
                    showCosts={showCosts}
                    mounted={mounted}
                    heightClass="h-[270px]"
                    gradientPrefix="overview-monthly"
                  />
                </section>
              </div>
            </div>
          ) : (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {granularity === 'daily'
                      ? 'Faturamento Diário Detalhado'
                      : granularity === 'weekly'
                        ? 'Faturamento Semanal Detalhado'
                        : 'Faturamento Mensal Detalhado'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Passe o cursor sobre cada período para visualizar pedidos, entradas manuais, custos e saldo líquido.
                  </p>
                </div>

                {granularity === 'daily' && (
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                    {([7, 14, 30] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDailyWindow(days)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                          dailyWindow === days
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {days} dias
                      </button>
                    ))}
                  </div>
                )}

                {granularity === 'weekly' && (
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                    {([4, 8, 12] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeeklyWindow(w)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                          weeklyWindow === w
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {w} semanas
                      </button>
                    ))}
                  </div>
                )}

                {granularity === 'monthly' && (
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                    {([3, 6, 12] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMonthlyWindow(m)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                          monthlyWindow === m
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {m} meses
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <RevenueChartCanvas
                data={activeSeries}
                chartStyle={chartStyle}
                showCosts={showCosts}
                mounted={mounted}
                heightClass="h-[340px]"
                gradientPrefix={`focused-${granularity}`}
              />
            </section>
          )}

          {/* Channel & Payment Breakdown Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Faturamento por Canal de Venda
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribuição entre Cardápio Online, Atendimento WhatsApp e Balcão nos últimos {monthlyWindow} meses
                </p>
              </div>
              <div className="space-y-3">
                {reports.channelMix.map((ch) => (
                  <div key={ch.source} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {ch.label}{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-mono-tabular">
                          · {ch.ordersCount} pedidos
                        </span>
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(ch.revenue)} · {ch.sharePct}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                      <div
                        style={{ width: `${Math.max(ch.revenue > 0 ? 4 : 0, Math.round(ch.sharePct))}%` }}
                        className="h-full bg-emerald-600 dark:bg-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Receita por Forma de Pagamento
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Consolidado dos pedidos nos últimos {monthlyWindow} meses
                  </p>
                </div>
                {onOpenCosts && (
                  <button
                    type="button"
                    onClick={onOpenCosts}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Fluxo de Caixa</span>
                  </button>
                )}
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-6">Modalidade</th>
                    <th className="py-2.5 px-4 text-right">Pedidos</th>
                    <th className="py-2.5 px-4 text-right">Part.</th>
                    <th className="py-2.5 px-6 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {reports.paymentMix.map((pm) => (
                    <tr key={pm.method} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white">
                        {pm.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {pm.ordersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-500 dark:text-slate-400">
                        {pm.sharePct}%
                      </td>
                      <td className="py-3 px-6 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(pm.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* Period Ledger Table */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Detalhamento por Período (
                  {activeCadence === 'daily'
                    ? 'Diário'
                    : activeCadence === 'weekly'
                      ? 'Semanal'
                      : 'Mensal'}
                  )
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Valores consolidados de pedidos, entradas manuais, custos e margem por faixa de tempo.
                </p>
              </div>

              {granularity === 'overview' && (
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                  {(
                    [
                      { id: 'daily', label: 'Diário' },
                      { id: 'weekly', label: 'Semanal' },
                      { id: 'monthly', label: 'Mensal' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableCadence(opt.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                        tableCadence === opt.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-6">Período</th>
                    <th className="py-3 px-4 text-right">Pedidos</th>
                    <th className="py-3 px-4 text-right">Receita Pedidos</th>
                    <th className="py-3 px-4 text-right">Entradas Extras</th>
                    <th className="py-3 px-4 text-right">Faturamento Total</th>
                    <th className="py-3 px-4 text-right">Custos + CMV</th>
                    <th className="py-3 px-6 text-right">Saldo Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {[...activeSeries].reverse().map((row) => (
                    <tr
                      key={row.key}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {row.fullLabel}
                        {row.isPeak && (
                          <span className="ml-2 text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                            · Pico
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {row.ordersCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-700 dark:text-slate-200">
                        {formatCurrencyBRL(row.ordersRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {formatCurrencyBRL(row.manualInflows)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrencyBRL(row.totalRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-red-700 dark:text-red-400">
                        −{formatCurrencyBRL(row.costsTotal)}
                      </td>
                      <td
                        className={`py-3 px-6 text-right font-mono-tabular font-bold ${
                          row.netResult >= 0
                            ? 'text-slate-900 dark:text-white'
                            : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {formatCurrencyBRL(row.netResult)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
