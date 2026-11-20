'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import {
  computeCashFlowSummary,
  FINANCIAL_CATEGORY_LABEL,
  getCurrentMonthKey,
  getRecurringMonthlyEquivalent,
  RECURRING_FREQUENCY_LABEL,
} from '@/lib/finance-engine';
import type {
  DeliveryStoreState,
  FinancialCategory,
  FinancialEntry,
  FinancialEntryType,
  RecurringExpense,
  RecurringFrequency,
} from '@/types/delivery';

interface CostsFinanceSectionProps {
  state: DeliveryStoreState;
  onAddEntry: (entry: FinancialEntry) => void;
  onDeleteEntry: (id: string) => void;
  onAddRecurring: (recurring: RecurringExpense) => void;
  onUpdateRecurring: (id: string, updates: Partial<RecurringExpense>) => void;
  onDeleteRecurring: (id: string) => void;
  onLaunchRecurring: (options: {
    recurringId?: string;
    launchAllPending?: boolean;
  }) => Promise<void>;
  onOpenFinancialReports?: () => void;
}

type FinanceTab = 'fluxo' | 'lancamentos' | 'recorrentes';

const QUICK_RECURRING_PRESETS: Array<{
  name: string;
  category: FinancialCategory;
  dueDay: number;
  amount: string;
}> = [
  { name: 'Aluguel', category: 'aluguel_infra', dueDay: 5, amount: '3200' },
  { name: 'Luz (Energia)', category: 'utilidades', dueDay: 12, amount: '680' },
  { name: 'Água', category: 'utilidades', dueDay: 15, amount: '240' },
  { name: 'Gás (GLP)', category: 'utilidades', dueDay: 10, amount: '520' },
  { name: 'Telefone / Internet', category: 'utilidades', dueDay: 20, amount: '169.9' },
];

export function CostsFinanceSection({
  state,
  onAddEntry,
  onDeleteEntry,
  onAddRecurring,
  onUpdateRecurring,
  onDeleteRecurring,
  onLaunchRecurring,
  onOpenFinancialReports,
}: CostsFinanceSectionProps) {
  const [activeTab, setActiveTab] = useState<FinanceTab>('fluxo');
  const currentMonth = getCurrentMonthKey();

  const summary = useMemo(
    () => computeCashFlowSummary(state, currentMonth),
    [state, currentMonth],
  );

  // Manual entry form state
  const [entryType, setEntryType] = useState<FinancialEntryType>('custo');
  const [entryCategory, setEntryCategory] =
    useState<FinancialCategory>('insumos_compras');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [entryPayment, setEntryPayment] = useState('Pix');
  const [entryNotes, setEntryNotes] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryFilter, setEntryFilter] = useState<'todos' | FinancialEntryType>('todos');
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);

  // Recurring expense form state
  const [recName, setRecName] = useState('');
  const [recCategory, setRecCategory] = useState<FinancialCategory>('utilidades');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDay, setRecDueDay] = useState('10');
  const [recFrequency, setRecFrequency] = useState<RecurringFrequency>('mensal');
  const [savingRec, setSavingRec] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [confirmDeleteRecId, setConfirmDeleteRecId] = useState<string | null>(null);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editRecAmount, setEditRecAmount] = useState('');
  const [editRecDueDay, setEditRecDueDay] = useState('10');
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    const sorted = [...state.financialEntries].sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    if (entryFilter === 'todos') return sorted;
    return sorted.filter((e) => e.type === entryFilter);
  }, [state.financialEntries, entryFilter]);

  const categoryBreakdown = useMemo(() => {
    const costMap = new Map<FinancialCategory, number>();
    for (const entry of state.financialEntries) {
      if (entry.type === 'custo') {
        costMap.set(
          entry.category,
          (costMap.get(entry.category) ?? 0) + entry.amount,
        );
      }
    }
    const items = [
      {
        label: 'CMV dos Pedidos (Insumos)',
        amount: summary.estimatedOrdersCmv,
        hint: 'Baixa por ficha técnica',
      },
      ...(Object.keys(FINANCIAL_CATEGORY_LABEL) as FinancialCategory[])
        .filter((cat) => cat !== 'vendas_extras')
        .map((cat) => ({
          label: FINANCIAL_CATEGORY_LABEL[cat],
          amount: Number((costMap.get(cat) ?? 0).toFixed(2)),
          hint: 'Lançado no fluxo',
        }))
        .filter((row) => row.amount > 0),
    ];
    if (summary.pendingRecurringTotal > 0) {
      items.push({
        label: 'Recorrentes Pendentes do Mês',
        amount: summary.pendingRecurringTotal,
        hint: `${summary.pendingRecurringCount} contas a lançar`,
      });
    }
    const maxVal = Math.max(1, ...items.map((i) => i.amount));
    return { items, maxVal };
  }, [
    state.financialEntries,
    summary.estimatedOrdersCmv,
    summary.pendingRecurringTotal,
    summary.pendingRecurringCount,
  ]);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(entryAmount);
    if (!entryDescription.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setSavingEntry(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_entry',
          type: entryType,
          category: entryCategory,
          description: entryDescription.trim(),
          amount: parsedAmount,
          date: entryDate,
          paymentMethod: entryPayment,
          notes: entryNotes.trim() || undefined,
        }),
      }).catch(() => null);

      const data = res
        ? ((await res.json()) as { ok: boolean; entry?: FinancialEntry })
        : null;

      if (data?.ok && data.entry) {
        onAddEntry(data.entry);
      } else {
        onAddEntry({
          id: `fin-${Date.now()}`,
          type: entryType,
          category: entryCategory,
          description: entryDescription.trim(),
          amount: Number(parsedAmount.toFixed(2)),
          date: entryDate,
          paymentMethod: entryPayment,
          notes: entryNotes.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
      }

      setEntryDescription('');
      setEntryAmount('');
      setEntryNotes('');
      setFeedback(
        entryType === 'entrada'
          ? 'Entrada lançada e somada ao fluxo de caixa.'
          : 'Custo lançado e descontado do fluxo de caixa.',
      );
    } finally {
      setSavingEntry(false);
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(recAmount);
    if (!recName.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setSavingRec(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_recurring',
          name: recName.trim(),
          category: recCategory,
          amount: parsedAmount,
          dueDay: Number(recDueDay) || 10,
          frequency: recFrequency,
        }),
      }).catch(() => null);

      const data = res
        ? ((await res.json()) as { ok: boolean; recurring?: RecurringExpense })
        : null;

      if (data?.ok && data.recurring) {
        onAddRecurring(data.recurring);
      } else {
        onAddRecurring({
          id: `rec-${Date.now()}`,
          name: recName.trim(),
          category: recCategory,
          amount: Number(parsedAmount.toFixed(2)),
          dueDay: Math.min(31, Math.max(1, Math.round(Number(recDueDay) || 10))),
          frequency: recFrequency,
          active: true,
        });
      }

      setRecName('');
      setRecAmount('');
      setFeedback('Gasto recorrente cadastrado e incluído nas previsões.');
    } finally {
      setSavingRec(false);
    }
  };

  const handleLaunchSingle = async (recurringId: string) => {
    setLaunchingId(recurringId);
    setFeedback(null);
    try {
      await onLaunchRecurring({ recurringId });
      setFeedback('Conta recorrente lançada no fluxo de caixa do mês.');
    } finally {
      setLaunchingId(null);
    }
  };

  const handleLaunchAllPending = async () => {
    setLaunchingId('all');
    setFeedback(null);
    try {
      await onLaunchRecurring({ launchAllPending: true });
      setFeedback('Todas as contas recorrentes pendentes do mês foram lançadas no fluxo.');
    } finally {
      setLaunchingId(null);
    }
  };

  const projectedAfterPending = Number(
    (summary.realizedNetBalance - summary.pendingRecurringTotal).toFixed(2),
  );

  return (
    <div className="space-y-6">
      {/* Header + Subtabs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Custos, Entradas e Fluxo de Caixa
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Lance despesas e receitas manuais, cadastre contas fixas (aluguel, água, luz, gás, telefone) e acompanhe previsões de faturamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto max-w-full">
          {onOpenFinancialReports && (
            <button
              type="button"
              onClick={onOpenFinancialReports}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg whitespace-nowrap shrink-0 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Relatórios Visuais</span>
            </button>
          )}
          <div
            role="tablist"
            aria-label="Seções financeiras"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto max-w-full"
          >
            {(
              [
                { id: 'fluxo', label: 'Fluxo & Previsões' },
                { id: 'lancamentos', label: 'Lançamentos Manuais' },
                { id: 'recorrentes', label: 'Gastos Recorrentes' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-700 dark:text-emerald-300 font-semibold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Always-visible 4-KPI Summary Strip */}
      <section
        aria-label="Indicadores financeiros principais"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Entradas no Fluxo
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {formatCurrencyBRL(summary.totalRealizedInflows)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            {summary.validOrdersCount} pedidos + {formatCurrencyBRL(summary.manualInflows)} extras
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Custos Lançados + CMV
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-red-700 dark:text-red-400">
            {formatCurrencyBRL(summary.totalRealizedOutflows)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            +{formatCurrencyBRL(summary.pendingRecurringTotal)} recorrentes a vencer
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saldo Líquido Atual
          </p>
          <p
            className={`mt-1 text-2xl font-bold font-mono-tabular ${
              summary.realizedNetBalance >= 0
                ? 'text-slate-900 dark:text-white'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatCurrencyBRL(summary.realizedNetBalance)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            Pós-recorrentes: {formatCurrencyBRL(projectedAfterPending)}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Previsão Faturamento (30d)
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {formatCurrencyBRL(summary.projectedRevenue30d)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
            Equilíbrio: {formatCurrencyBRL(summary.breakEvenRevenueMonthly)}
          </p>
        </div>
      </section>

      {/* TAB 1: FLUXO & PREVISÕES */}
      {activeTab === 'fluxo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Demonstrativo de Fluxo de Caixa */}
            <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Demonstrativo do Fluxo de Caixa
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Consolidação automática de pedidos, fichas técnicas, lançamentos manuais e contas fixas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('lancamentos')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 rounded-lg whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Lançar Agora</span>
                </button>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    (+) Receita de Pedidos (Cardápio, WhatsApp e Balcão)
                  </span>
                  <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrencyBRL(summary.ordersRevenue)}
                  </span>
                </div>
                <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    (+) Entradas Manuais Lançadas
                  </span>
                  <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrencyBRL(summary.manualInflows)}
                  </span>
                </div>
                <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    (−) CMV dos Pedidos (Custo de Insumos / Fichas Técnicas)
                  </span>
                  <span className="font-mono-tabular font-semibold text-red-700 dark:text-red-400">
                    −{formatCurrencyBRL(summary.estimatedOrdersCmv)}
                  </span>
                </div>
                <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    (−) Custos Manuais & Contas Já Lançadas
                  </span>
                  <span className="font-mono-tabular font-semibold text-red-700 dark:text-red-400">
                    −{formatCurrencyBRL(summary.manualOutflows)}
                  </span>
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-4 font-bold text-sm">
                  <span className="text-slate-900 dark:text-white">
                    (=) Saldo Realizado Atual
                  </span>
                  <span
                    className={`font-mono-tabular ${
                      summary.realizedNetBalance >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {formatCurrencyBRL(summary.realizedNetBalance)}
                  </span>
                </div>
                <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <span className="text-slate-600 dark:text-slate-400">
                    (−) Gastos Recorrentes Pendentes no Mês ({summary.pendingRecurringCount} contas)
                  </span>
                  <span className="font-mono-tabular font-semibold text-amber-700 dark:text-amber-400">
                    −{formatCurrencyBRL(summary.pendingRecurringTotal)}
                  </span>
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-4 font-bold text-sm">
                  <span className="text-slate-900 dark:text-white">
                    (=) Saldo Previsto após Todas as Contas Fixas
                  </span>
                  <span
                    className={`font-mono-tabular ${
                      projectedAfterPending >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {formatCurrencyBRL(projectedAfterPending)}
                  </span>
                </div>
              </div>
            </section>

            {/* Previsões de Faturamento & Ponto de Equilíbrio */}
            <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Previsões de Faturamento & Ponto de Equilíbrio</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Projeção para 30 dias baseada no ritmo diário atual ({formatCurrencyBRL(summary.dailyRevenueRate)}/dia) e estrutura de custos.
                  </p>
                </div>
              </div>

              {/* 3 Cenários */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Cenário Conservador (−15%)
                  </p>
                  <p className="mt-1 text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                    {formatCurrencyBRL(summary.projectedConservative30d)}
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-brand-50/60 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800">
                  <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                    Projeção Realista (30d)
                  </p>
                  <p className="mt-1 text-base font-bold font-mono-tabular text-brand-700 dark:text-brand-300">
                    {formatCurrencyBRL(summary.projectedRevenue30d)}
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                    Cenário Otimista (+20%)
                  </p>
                  <p className="mt-1 text-base font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                    {formatCurrencyBRL(summary.projectedOptimistic30d)}
                  </p>
                </div>
              </div>

              {/* Break-even progress */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Meta de Ponto de Equilíbrio Mensal (Zero a Zero)
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                    {formatCurrencyBRL(summary.breakEvenRevenueMonthly)}
                  </span>
                </div>

                <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-md overflow-hidden">
                  <div
                    style={{ width: `${summary.revenueProgressToBreakEvenPct}%` }}
                    className={`h-full transition-all ${
                      summary.revenueProgressToBreakEvenPct >= 100
                        ? 'bg-emerald-600'
                        : 'bg-brand-600'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-mono-tabular">
                  <span>
                    Atingido até agora: {summary.revenueProgressToBreakEvenPct}%
                  </span>
                  <span>
                    Equivale a ~{summary.breakEvenOrdersNeeded} pedidos/mês (ticket {formatCurrencyBRL(summary.avgTicket)})
                  </span>
                </div>
              </div>

              {/* Other key unit economics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Margem de Contribuição</p>
                  <p className="mt-1 text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                    {summary.contributionMarginPct}%
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Custo Fixo Recorrente/Mês</p>
                  <p className="mt-1 text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                    {formatCurrencyBRL(summary.activeRecurringMonthlyTotal)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                  <p className="text-slate-500 dark:text-slate-400">Lucro Projetado (30d)</p>
                  <p
                    className={`mt-1 text-base font-bold font-mono-tabular ${
                      summary.projectedNetProfit30d >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {formatCurrencyBRL(summary.projectedNetProfit30d)}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Distribuição de Custos por Categoria */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Composição de Custos e Contas no Fluxo
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visualize onde está concentrado o maior peso financeiro da operação.
                </p>
              </div>
              {summary.pendingRecurringCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('recorrentes')}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline self-start sm:self-auto"
                >
                  Gerenciar {summary.pendingRecurringCount} contas recorrentes pendentes
                </button>
              )}
            </div>

            <div className="space-y-3">
              {categoryBreakdown.items.map((row) => {
                const widthPct = Math.max(
                  4,
                  Math.round((row.amount / categoryBreakdown.maxVal) * 100),
                );
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {row.label}{' '}
                        <span className="text-slate-400 font-normal">· {row.hint}</span>
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(row.amount)}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full bg-brand-600 dark:bg-brand-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: LANÇAMENTOS MANUAIS */}
      {activeTab === 'lancamentos' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulário de Lançamento Manual */}
          <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span>Novo Lançamento Manual</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Registre compras, despesas avulsas ou entradas extras no fluxo de caixa.
            </p>

            <form onSubmit={handleCreateEntry} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('custo');
                    if (entryCategory === 'vendas_extras') {
                      setEntryCategory('insumos_compras');
                    }
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                    entryType === 'custo'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Custo / Saída</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('entrada');
                    setEntryCategory('vendas_extras');
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                    entryType === 'entrada'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Entrada / Receita</span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="fin-cat"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Categoria
                </label>
                <select
                  id="fin-cat"
                  value={entryCategory}
                  onChange={(e) =>
                    setEntryCategory(e.target.value as FinancialCategory)
                  }
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {(Object.keys(FINANCIAL_CATEGORY_LABEL) as FinancialCategory[]).map(
                    (cat) => (
                      <option key={cat} value={cat}>
                        {FINANCIAL_CATEGORY_LABEL[cat]}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="fin-desc"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Descrição
                </label>
                <input
                  id="fin-desc"
                  required
                  value={entryDescription}
                  onChange={(e) => setEntryDescription(e.target.value)}
                  placeholder={
                    entryType === 'entrada'
                      ? 'Ex.: Evento corporativo 20 marmitas'
                      : 'Ex.: Compra de embalagens / Hortifruti'
                  }
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="fin-amount"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Valor (R$)
                  </label>
                  <input
                    id="fin-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="fin-date"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Data
                  </label>
                  <input
                    id="fin-date"
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="fin-pay"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Forma de Pagamento
                </label>
                <select
                  id="fin-pay"
                  value={entryPayment}
                  onChange={(e) => setEntryPayment(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro / Caixa</option>
                  <option value="Cartão Débito">Cartão Débito</option>
                  <option value="Cartão Crédito">Cartão Crédito</option>
                  <option value="Boleto / Transferência">Boleto / Transferência</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="fin-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Observações (opcional)
                </label>
                <input
                  id="fin-notes"
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  placeholder="Nota fiscal, fornecedor ou detalhe..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <button
                type="submit"
                disabled={savingEntry}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
              >
                {savingEntry
                  ? 'Registrando...'
                  : entryType === 'entrada'
                    ? 'Lançar Entrada no Fluxo'
                    : 'Lançar Custo no Fluxo'}
              </button>
            </form>
          </section>

          {/* Extrato de Lançamentos */}
          <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Extrato de Lançamentos ({filteredEntries.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Histórico de custos, contas pagas e entradas extras registradas.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
                {(
                  [
                    { id: 'todos', label: 'Todos' },
                    { id: 'entrada', label: 'Entradas' },
                    { id: 'custo', label: 'Custos' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEntryFilter(f.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                      entryFilter === f.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhum lançamento manual encontrado para este filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-5">Data</th>
                      <th className="py-3 px-4">Descrição</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4 text-right">Valor</th>
                      <th className="py-3 px-5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredEntries.map((entry) => {
                      const confirming = confirmDeleteEntryId === entry.id;
                      return (
                        <tr
                          key={entry.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3.5 px-5 font-mono-tabular text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {entry.date.split('-').reverse().join('/')}
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {entry.description}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {entry.paymentMethod || 'Pix'}
                              {entry.notes ? ` · ${entry.notes}` : ''}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {FINANCIAL_CATEGORY_LABEL[entry.category]}
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-mono-tabular font-bold whitespace-nowrap ${
                              entry.type === 'entrada'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {entry.type === 'entrada' ? '+' : '−'}
                            {formatCurrencyBRL(entry.amount)}
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            {confirming ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteEntry(entry.id);
                                    setConfirmDeleteEntryId(null);
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEntryId(null)}
                                  className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEntryId(entry.id)}
                                aria-label={`Excluir lançamento ${entry.description}`}
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: GASTOS RECORRENTES */}
      {activeTab === 'recorrentes' && (
        <div className="space-y-6">
          {/* Action bar for launching pending monthly bills */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarClock
                className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Compromissos Fixos Mensais:{' '}
                  <span className="font-mono-tabular">
                    {formatCurrencyBRL(summary.activeRecurringMonthlyTotal)}/mês
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Já lançado este mês:{' '}
                  <strong className="font-mono-tabular text-slate-800 dark:text-slate-200">
                    {formatCurrencyBRL(summary.alreadyLaunchedRecurringTotal)}
                  </strong>{' '}
                  · Pendente:{' '}
                  <strong className="font-mono-tabular text-amber-700 dark:text-amber-400">
                    {formatCurrencyBRL(summary.pendingRecurringTotal)}
                  </strong>
                </p>
              </div>
            </div>

            {summary.pendingRecurringCount > 0 && (
              <button
                type="button"
                disabled={launchingId === 'all'}
                onClick={handleLaunchAllPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {launchingId === 'all'
                    ? 'Lançando...'
                    : `Lançar ${summary.pendingRecurringCount} Pendentes no Fluxo`}
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Formulário Novo Gasto Recorrente */}
            <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                  <span>Cadastrar Gasto Recorrente</span>
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Cadastre contas fixas para compor o ponto de equilíbrio e lançar no fluxo mensalmente.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Atalhos rápidos:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_RECURRING_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setRecName(preset.name);
                        setRecCategory(preset.category);
                        setRecDueDay(String(preset.dueDay));
                        setRecAmount(preset.amount);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleCreateRecurring} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="rec-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nome da Conta / Despesa
                  </label>
                  <input
                    id="rec-name"
                    required
                    value={recName}
                    onChange={(e) => setRecName(e.target.value)}
                    placeholder="Ex.: Aluguel, Luz, Água, Gás, Telefone"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rec-cat"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Categoria
                  </label>
                  <select
                    id="rec-cat"
                    value={recCategory}
                    onChange={(e) =>
                      setRecCategory(e.target.value as FinancialCategory)
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {(Object.keys(FINANCIAL_CATEGORY_LABEL) as FinancialCategory[])
                      .filter((c) => c !== 'vendas_extras')
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {FINANCIAL_CATEGORY_LABEL[cat]}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="rec-amount"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Valor (R$)
                    </label>
                    <input
                      id="rec-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={recAmount}
                      onChange={(e) => setRecAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rec-day"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Dia Vencimento
                    </label>
                    <input
                      id="rec-day"
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={recDueDay}
                      onChange={(e) => setRecDueDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="rec-freq"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Periodicidade
                  </label>
                  <select
                    id="rec-freq"
                    value={recFrequency}
                    onChange={(e) =>
                      setRecFrequency(e.target.value as RecurringFrequency)
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="quinzenal">Quinzenal (2x/mês)</option>
                    <option value="semanal">Semanal (~4,3x/mês)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={savingRec}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                >
                  {savingRec ? 'Salvando...' : 'Adicionar Gasto Recorrente'}
                </button>
              </form>
            </section>

            {/* Lista de Gastos Recorrentes */}
            <section className="xl:col-span-8 space-y-3">
              {state.recurringExpenses.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
                  Nenhuma conta recorrente cadastrada. Use o formulário ao lado para adicionar aluguel, água, luz, gás ou telefone.
                </div>
              ) : (
                state.recurringExpenses.map((rec) => {
                  const launchedThisMonth = rec.lastLaunchedMonth === currentMonth;
                  const monthlyEq = getRecurringMonthlyEquivalent(rec);
                  const isEditing = editingRecId === rec.id;
                  const confirming = confirmDeleteRecId === rec.id;

                  return (
                    <article
                      key={rec.id}
                      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 ${
                        !rec.active ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              {rec.name}
                            </h3>
                            <span
                              className={`text-xs font-semibold ${
                                launchedThisMonth
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {launchedThisMonth ? 'Lançado neste mês' : 'Pendente neste mês'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {FINANCIAL_CATEGORY_LABEL[rec.category]} · Vence dia{' '}
                            <span className="font-mono-tabular font-semibold">{rec.dueDay}</span> ·{' '}
                            {RECURRING_FREQUENCY_LABEL[rec.frequency]}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <div className="text-right mr-1">
                            <p className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-white">
                              {formatCurrencyBRL(rec.amount)}
                            </p>
                            {rec.frequency !== 'mensal' && (
                              <p className="text-[11px] font-mono-tabular text-slate-500">
                                ~{formatCurrencyBRL(monthlyEq)}/mês
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={!rec.active || launchingId === rec.id}
                            onClick={() => handleLaunchSingle(rec.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap disabled:opacity-50 ${
                              launchedThisMonth
                                ? 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                            }`}
                          >
                            {launchedThisMonth ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Lançar Novamente</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Lançar no Fluxo</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRecurring(rec.id, { active: !rec.active })
                            }
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                              rec.active
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            {rec.active ? 'Ativo' : 'Pausado'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingRecId(null);
                              } else {
                                setEditingRecId(rec.id);
                                setEditRecAmount(String(rec.amount));
                                setEditRecDueDay(String(rec.dueDay));
                              }
                            }}
                            aria-label={`Editar valor de ${rec.name}`}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {confirming ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteRecurring(rec.id);
                                  setConfirmDeleteRecId(null);
                                }}
                                className="px-2 py-1.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRecId(null)}
                                className="px-2 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRecId(rec.id)}
                              aria-label={`Excluir gasto recorrente ${rec.name}`}
                              className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Novo Valor (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editRecAmount}
                              onChange={(e) => setEditRecAmount(e.target.value)}
                              className="w-32 px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Dia Vencimento
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={editRecDueDay}
                              onChange={(e) => setEditRecDueDay(e.target.value)}
                              className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const nextAmt = Math.max(0.01, Number(editRecAmount) || rec.amount);
                              const nextDay = Math.min(
                                31,
                                Math.max(1, Math.round(Number(editRecDueDay) || rec.dueDay)),
                              );
                              onUpdateRecurring(rec.id, {
                                amount: Number(nextAmt.toFixed(2)),
                                dueDay: nextDay,
                              });
                              setEditingRecId(null);
                              setFeedback(`Valor de "${rec.name}" atualizado.`);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                          >
                            Salvar Alteração
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
