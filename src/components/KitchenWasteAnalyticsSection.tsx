'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Layers, RotateCcw } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import {
  buildWasteAnalytics,
  type CategoryWastePoint,
  type WasteAnalyticsMetric,
  type WasteAnalyticsPeriod,
  type WasteAnalyticsTargetFilter,
  type WeekdayWastePoint,
} from '@/lib/waste-analytics';
import type {
  MenuCategory,
  MenuItem,
  StockIngredient,
  WasteLog,
} from '@/types/delivery';

interface KitchenWasteAnalyticsSectionProps {
  wasteLogs: WasteLog[];
  ingredients: StockIngredient[];
  menuItems: MenuItem[];
  categories: MenuCategory[];
  onLogFirstWaste?: () => void;
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  payload?: WeekdayWastePoint | CategoryWastePoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  metric: WasteAnalyticsMetric;
  mode: 'weekday' | 'category';
}

function WasteChartTooltip({
  active,
  payload,
  metric,
  mode,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0]?.payload;
  if (!first) return null;

  if (mode === 'weekday') {
    const row = first as WeekdayWastePoint;
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-xs shadow-sm space-y-1.5 min-w-[190px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1">
          <span className="font-bold text-slate-900 dark:text-white">
            {row.dayFull}
          </span>
          <span className="font-mono-tabular font-semibold text-red-700 dark:text-red-400">
            {formatCurrencyBRL(row.totalCost)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
          <span>Registros</span>
          <span className="font-mono-tabular font-semibold">
            {row.occurrences}
          </span>
        </div>
        {payload.length > 1 && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
            {payload
              .filter((p) => Number(p.value ?? 0) > 0)
              .map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <span className="text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                    {entry.name}
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {metric === 'cost'
                      ? formatCurrencyBRL(Number(entry.value ?? 0))
                      : `${entry.value} reg.`}
                  </span>
                </div>
              ))}
          </div>
        )}
        {row.occurrences > 0 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5 truncate max-w-[230px]">
            Maior perda: {row.topItem}
          </p>
        )}
      </div>
    );
  }

  const cat = first as CategoryWastePoint;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-xs shadow-sm space-y-1.5 min-w-[200px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1">
        <span className="font-bold text-slate-900 dark:text-white">
          {cat.category}
        </span>
        <span className="font-mono-tabular text-slate-500">
          {cat.sharePct}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
        <span>Custo Perdido</span>
        <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
          {formatCurrencyBRL(cat.totalCost)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
        <span>Ocorrências</span>
        <span className="font-mono-tabular font-semibold">
          {cat.occurrences} ({cat.sourceKind})
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5 truncate max-w-[230px]">
        Item líder: {cat.topItem}
      </p>
    </div>
  );
}

export function KitchenWasteAnalyticsSection({
  wasteLogs,
  ingredients,
  menuItems,
  categories,
  onLogFirstWaste,
}: KitchenWasteAnalyticsSectionProps) {
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<WasteAnalyticsPeriod>('30d');
  const [metric, setMetric] = useState<WasteAnalyticsMetric>('cost');
  const [targetFilter, setTargetFilter] =
    useState<WasteAnalyticsTargetFilter>('todos');
  const [stackedByCategory, setStackedByCategory] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const analytics = useMemo(
    () =>
      buildWasteAnalytics({
        wasteLogs,
        ingredients,
        menuItems,
        categories,
        period,
        targetFilter,
        metric,
      }),
    [wasteLogs, ingredients, menuItems, categories, period, targetFilter, metric],
  );

  const hasFiltersActive = period !== '30d' || targetFilter !== 'todos';

  return (
    <section
      aria-labelledby="waste-analytics-heading"
      className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Header & Interactive Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <BarChart3
              className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0"
              aria-hidden="true"
            />
            <h2
              id="waste-analytics-heading"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              Análise Visual de Desperdícios
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Histórico por dia da semana e categoria de item para reduzir perdas na cozinha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Toggle */}
          <div
            role="group"
            aria-label="Métrica dos gráficos"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setMetric('cost')}
              className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metric === 'cost'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Valor (R$)
            </button>
            <button
              type="button"
              onClick={() => setMetric('count')}
              className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metric === 'count'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Ocorrências
            </button>
          </div>

          {/* Period Filter */}
          <div
            role="group"
            aria-label="Período do histórico"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {(
              [
                { id: '7d', label: '7 dias' },
                { id: '30d', label: '30 dias' },
                { id: 'all', label: 'Tudo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  period === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Target Type Filter */}
          <div
            role="group"
            aria-label="Tipo de item"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'insumo', label: 'Insumos' },
                { id: 'prato', label: 'Pratos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTargetFilter(opt.id)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  targetFilter === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabular Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-slate-200 dark:border-slate-800 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Perda no Período
          </p>
          <p className="text-lg font-bold font-mono-tabular text-red-700 dark:text-red-400 mt-0.5">
            {formatCurrencyBRL(analytics.summary.totalCost)}
          </p>
          <p className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
            {analytics.summary.totalRecords} registro(s)
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Dia com Maior Perda
          </p>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
            {analytics.summary.peakDayLabel}
          </p>
          <p className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
            {formatCurrencyBRL(analytics.summary.peakDayCost)}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Categoria Mais Afetada
          </p>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
            {analytics.summary.topCategoryLabel}
          </p>
          <p className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
            {formatCurrencyBRL(analytics.summary.topCategoryCost)}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Ticket Médio por Descarte
          </p>
          <p className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
            {formatCurrencyBRL(analytics.summary.avgCostPerRecord)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Custo médio por baixa
          </p>
        </div>
      </div>

      {analytics.filteredLogs.length === 0 ? (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Nenhum descarte encontrado para este recorte
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Ajuste o período ou o filtro de itens acima, ou registre o primeiro desperdício para visualizar os gráficos por dia da semana e categoria.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {hasFiltersActive && (
              <button
                type="button"
                onClick={() => {
                  setPeriod('all');
                  setTargetFilter('todos');
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Limpar filtros</span>
              </button>
            )}
            {onLogFirstWaste && (
              <button
                type="button"
                onClick={onLogFirstWaste}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                <span>Lançar Descarte</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {/* 2-Column Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* CHART 1: Day of Week */}
            <div className="p-4 sm:p-5 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Desperdício por Dia da Semana
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Segunda a Domingo · pico semanal destacado em vermelho
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStackedByCategory((prev) => !prev)}
                  className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    stackedByCategory
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {stackedByCategory ? 'Empilhado p/ Categoria' : 'Empilhar Categorias'}
                  </span>
                </button>
              </div>

              <div className="h-[270px] w-full min-w-0">
                {!mounted ? (
                  <div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.weekdayData}
                      margin={{ top: 10, right: 10, left: -8, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(148, 163, 184, 0.22)"
                      />
                      <XAxis
                        dataKey="dayShort"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={metric === 'cost'}
                        tickFormatter={(val: number) =>
                          metric === 'cost' ? `R$${val}` : String(val)
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                        content={
                          <WasteChartTooltip metric={metric} mode="weekday" />
                        }
                      />
                      {stackedByCategory ? (
                        <>
                          <Legend
                            wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                          />
                          {analytics.stackedCategories.map((cat) => (
                            <Bar
                              key={cat.name}
                              dataKey={cat.name}
                              stackId="waste"
                              fill={cat.color}
                              radius={[2, 2, 0, 0]}
                              maxBarSize={42}
                            />
                          ))}
                        </>
                      ) : (
                        <Bar
                          dataKey={metric === 'cost' ? 'totalCost' : 'occurrences'}
                          name={
                            metric === 'cost' ? 'Custo Perdido' : 'Ocorrências'
                          }
                          radius={[6, 6, 0, 0]}
                          maxBarSize={42}
                        >
                          {analytics.weekdayData.map((entry) => (
                            <Cell
                              key={entry.dayShort}
                              fill={entry.isPeak ? '#dc2626' : '#d97706'}
                            />
                          ))}
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* CHART 2: Category */}
            <div className="p-4 sm:p-5 space-y-3 min-w-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Desperdício por Categoria de Item
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ranking de grupos de insumos e categorias do cardápio
                </p>
              </div>

              <div className="h-[270px] w-full min-w-0">
                {!mounted ? (
                  <div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={analytics.categoryData}
                      margin={{ top: 6, right: 18, left: 6, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="rgba(148, 163, 184, 0.22)"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={metric === 'cost'}
                        tickFormatter={(val: number) =>
                          metric === 'cost' ? `R$${val}` : String(val)
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={132}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                        content={
                          <WasteChartTooltip metric={metric} mode="category" />
                        }
                      />
                      <Bar
                        dataKey={metric === 'cost' ? 'totalCost' : 'occurrences'}
                        name={
                          metric === 'cost' ? 'Custo Perdido' : 'Ocorrências'
                        }
                        radius={[0, 6, 6, 0]}
                        maxBarSize={26}
                      >
                        {analytics.categoryData.map((cat) => (
                          <Cell key={cat.category} fill={cat.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Category Breakdown Table (Tabular Alignment) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Categoria de Item</th>
                  <th className="py-2.5 px-4">Origem</th>
                  <th className="py-2.5 px-4">Item de Maior Perda</th>
                  <th className="py-2.5 px-4 text-right">Registros</th>
                  <th className="py-2.5 px-4 text-right">Participação</th>
                  <th className="py-2.5 px-4 text-right">Custo Perdido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {analytics.categoryData.map((row) => (
                  <tr
                    key={row.category}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: row.color }}
                          aria-hidden="true"
                        />
                        <span>{row.category}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {row.sourceKind}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                      {row.topItem}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {row.occurrences}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {row.sharePct}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular font-bold text-red-700 dark:text-red-400 whitespace-nowrap">
                      {formatCurrencyBRL(row.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
