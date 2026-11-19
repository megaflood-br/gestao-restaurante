'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChefHat,
  Copy,
  ExternalLink,
  Package,
  Search,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatDateTimeBR,
  WASTE_REASON_LABEL,
} from '@/lib/formatters';
import {
  formatStockQty,
  getCompatibleUnits,
  previewWasteDeduction,
} from '@/lib/stock-engine';
import { KitchenWasteAnalyticsSection } from '@/components/KitchenWasteAnalyticsSection';
import type {
  DeliveryStoreState,
  StockUnit,
  WasteReason,
  WasteTargetType,
} from '@/types/delivery';

export interface RegisterWastePayload {
  targetType: WasteTargetType;
  targetId: string;
  quantity: number;
  unit?: StockUnit;
  reason: WasteReason;
  employeeName: string;
  notes?: string;
}

interface WasteControlSectionProps {
  state: DeliveryStoreState;
  onRegisterWaste: (payload: RegisterWastePayload) => void;
  onOpenStock: () => void;
}

const REASON_OPTIONS: WasteReason[] = [
  'vencimento',
  'erro_preparo',
  'sobra_buffet',
  'avaria_embalagem',
  'qualidade',
  'outros',
];

const COOK_PRESETS = [
  'Dona Maria (Cozinheira)',
  'Chef Carlos',
  'Auxiliar de Cozinha',
  'Expedição / Balcão',
];

export function WasteControlSection({
  state,
  onRegisterWaste,
  onOpenStock,
}: WasteControlSectionProps) {
  const [origin, setOrigin] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [targetType, setTargetType] = useState<WasteTargetType>('insumo');
  const [targetId, setTargetId] = useState<string>(
    state.ingredients[0]?.id ?? '',
  );
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [unit, setUnit] = useState<StockUnit>(
    state.ingredients[0]?.unit ?? 'kg',
  );
  const [reason, setReason] = useState<WasteReason>('vencimento');
  const [employeeName, setEmployeeName] = useState<string>(
    'Dona Maria (Cozinheira)',
  );
  const [notes, setNotes] = useState<string>('');
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [reasonFilter, setReasonFilter] = useState<'todos' | WasteReason>(
    'todos',
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const selectedIngredient = useMemo(
    () =>
      targetType === 'insumo'
        ? state.ingredients.find((i) => i.id === targetId)
        : undefined,
    [targetType, targetId, state.ingredients],
  );

  const compatibleUnits = useMemo<StockUnit[]>(() => {
    if (!selectedIngredient) return ['un'];
    return getCompatibleUnits(selectedIngredient.unit);
  }, [selectedIngredient]);

  const handleSelectTargetType = (nextType: WasteTargetType) => {
    setTargetType(nextType);
    setConfirmingSubmit(false);
    if (nextType === 'insumo') {
      const firstIng = state.ingredients[0];
      setTargetId(firstIng?.id ?? '');
      setUnit(firstIng?.unit ?? 'kg');
      setQuantityStr('0.5');
    } else {
      const firstDish =
        state.menuItems.find((m) => (m.technicalSheet?.length ?? 0) > 0) ??
        state.menuItems[0];
      setTargetId(firstDish?.id ?? '');
      setQuantityStr('1');
    }
  };

  const handleSelectIngredient = (ingId: string) => {
    setTargetId(ingId);
    setConfirmingSubmit(false);
    const ing = state.ingredients.find((i) => i.id === ingId);
    if (ing) {
      setUnit(ing.unit);
    }
  };

  const parsedQty = Number(quantityStr.replace(',', '.'));

  const deductionPreview = useMemo(
    () =>
      previewWasteDeduction({
        targetType,
        targetId,
        quantity: Number.isFinite(parsedQty) ? parsedQty : 0,
        unit: targetType === 'insumo' ? unit : undefined,
        menuItems: state.menuItems,
        ingredients: state.ingredients,
      }),
    [
      targetType,
      targetId,
      parsedQty,
      unit,
      state.menuItems,
      state.ingredients,
    ],
  );

  const wasteLogs = state.wasteLogs ?? [];

  const kpis = useMemo(() => {
    const totalCost = wasteLogs.reduce((sum, w) => sum + w.estimatedCost, 0);
    const reasonCounts = new Map<WasteReason, number>();
    for (const log of wasteLogs) {
      reasonCounts.set(log.reason, (reasonCounts.get(log.reason) ?? 0) + 1);
    }
    let topReason: WasteReason | null = null;
    let topCount = 0;
    for (const [r, c] of reasonCounts.entries()) {
      if (c > topCount) {
        topReason = r;
        topCount = c;
      }
    }
    const lowStockCount = state.ingredients.filter(
      (i) => i.currentQty <= i.minQty,
    ).length;

    return {
      totalCost,
      totalRecords: wasteLogs.length,
      topReasonLabel: topReason ? WASTE_REASON_LABEL[topReason] : 'Sem perdas',
      topReasonCount: topCount,
      lowStockCount,
    };
  }, [wasteLogs, state.ingredients]);

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return wasteLogs.filter((log) => {
      if (reasonFilter !== 'todos' && log.reason !== reasonFilter) return false;
      if (!q) return true;
      return (
        log.targetName.toLowerCase().includes(q) ||
        log.employeeName.toLowerCase().includes(q) ||
        (log.notes ?? '').toLowerCase().includes(q) ||
        log.affectedIngredients.some((a) =>
          a.ingredientName.toLowerCase().includes(q),
        )
      );
    });
  }, [wasteLogs, searchTerm, reasonFilter]);

  const kitchenPortalUrl = origin ? `${origin}/cozinha` : '/cozinha';

  const handleCopyKitchenLink = async () => {
    try {
      await navigator.clipboard.writeText(kitchenPortalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Clipboard blocked
    }
  };

  const canSubmit =
    Boolean(targetId) &&
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Boolean(employeeName.trim());

  const handleConfirmRegister = () => {
    if (!canSubmit) return;
    onRegisterWaste({
      targetType,
      targetId,
      quantity: parsedQty,
      unit: targetType === 'insumo' ? unit : undefined,
      reason,
      employeeName: employeeName.trim(),
      notes: notes.trim() || undefined,
    });
    setConfirmingSubmit(false);
    setNotes('');
    setFeedback(
      `Descarte de "${deductionPreview.targetName}" registrado com baixa automática no estoque (${formatCurrencyBRL(
        deductionPreview.estimatedCost,
      )}).`,
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Desperdícios, Descartes e Baixa da Cozinha
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Registre insumos vencidos, erros de preparo ou pratos descartados
            com baixa automática no estoque e rastreio de custo perdido.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenStock}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg self-start lg:self-auto whitespace-nowrap"
        >
          <Package className="w-4 h-4" aria-hidden="true" />
          <span>Ver Estoque e Movimentações</span>
        </button>
      </header>

      {/* Kitchen link strip */}
      <section className="p-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white">
            Link Exclusivo da Cozinheira (/cozinha)
          </strong>{' '}
          — acesse no tablet ou celular da cozinha para lançar desperdícios na
          hora e dar baixa automática no estoque.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={kitchenPortalUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link exclusivo do portal da cozinheira"
            className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyKitchenLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Link Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
            <a
              href="/cozinha"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Abrir Portal da Cozinheira</span>
            </a>
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Custo Perdido em Descarte
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-red-700 dark:text-red-400 mt-1">
            {formatCurrencyBRL(kpis.totalCost)}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Registros Lançados
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
            {kpis.totalRecords}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Principal Motivo
          </p>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1.5 truncate">
            {kpis.topReasonLabel}
          </p>
          {kpis.topReasonCount > 0 && (
            <p className="text-xs font-mono-tabular text-slate-500 mt-0.5">
              {kpis.topReasonCount} ocorrência(s)
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Insumos em Estoque Baixo
          </p>
          <p
            className={`text-2xl font-bold font-mono-tabular mt-1 ${
              kpis.lowStockCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {kpis.lowStockCount}
          </p>
        </div>
      </section>

      {/* Recharts Visual Analytics: Weekday + Item Category */}
      <KitchenWasteAnalyticsSection
        wasteLogs={wasteLogs}
        ingredients={state.ingredients}
        menuItems={state.menuItems}
        categories={state.categories ?? []}
      />

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Split: Form + History */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Form */}
        <section className="xl:col-span-5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 self-start">
          <div className="flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Lançar Desperdício / Descarte
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSelectTargetType('insumo')}
              className={`inline-flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                targetType === 'insumo'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Insumo / Ingrediente</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTargetType('prato')}
              className={`inline-flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                targetType === 'prato'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Prato / Marmita Pronta</span>
            </button>
          </div>

          {targetType === 'insumo' ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Insumo Descartado
              </label>
              <select
                value={targetId}
                onChange={(e) => handleSelectIngredient(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {state.ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} (Saldo: {formatStockQty(ing.currentQty, ing.unit)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Prato / Item do Cardápio Descartado
              </label>
              <select
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value);
                  setConfirmingSubmit(false);
                }}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {state.menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {(item.technicalSheet?.length ?? 0) === 0
                      ? ' (Sem ficha técnica)'
                      : ` (${item.technicalSheet?.length} insumos)`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {targetType === 'insumo'
                  ? 'Quantidade Descartada'
                  : 'Qtd. de Pratos / Porções'}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={quantityStr}
                onChange={(e) => {
                  setQuantityStr(e.target.value);
                  setConfirmingSubmit(false);
                }}
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            {targetType === 'insumo' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unidade
                </label>
                <select
                  value={unit}
                  onChange={(e) => {
                    setUnit(e.target.value as StockUnit);
                    setConfirmingSubmit(false);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {compatibleUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unidade
                </label>
                <input
                  readOnly
                  value="Porções (Ficha Técnica)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Motivo do Descarte
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as WasteReason)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {WASTE_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Responsável pelo Lançamento
            </label>
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Nome da cozinheira ou responsável"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {COOK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setEmployeeName(preset)}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Observações (opcional)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Lote aberto na segunda / embalagem caiu da bancada"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
          </div>

          {/* Live deduction preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Prévia de Baixa no Estoque
              </span>
              <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
                Perda est.: {formatCurrencyBRL(deductionPreview.estimatedCost)}
              </span>
            </div>

            {deductionPreview.affectedIngredients.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {targetType === 'prato'
                    ? 'Este prato não possui ficha técnica vinculada. O registro será salvo sem baixa automática de insumos.'
                    : 'Informe uma quantidade válida para calcular a baixa.'}
                </span>
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {deductionPreview.affectedIngredients.map((item) => {
                  const ing = state.ingredients.find(
                    (i) => i.id === item.ingredientId,
                  );
                  const current = ing?.currentQty ?? 0;
                  const next = Math.max(0, current - item.quantity);
                  return (
                    <li
                      key={item.ingredientId}
                      className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300"
                    >
                      <span className="truncate">{item.ingredientName}</span>
                      <span className="font-mono-tabular shrink-0 text-red-700 dark:text-red-400">
                        -{formatStockQty(item.quantity, item.unit)}{' '}
                        <span className="text-slate-400">
                          ({formatStockQty(next, item.unit)} rest.)
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {confirmingSubmit ? (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Confirmar baixa imediata no estoque? Esta ação deduzirá os
                insumos listados acima.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmRegister}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Confirmar Descarte e Baixa
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingSubmit(false)}
                  className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => setConfirmingSubmit(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Registrar Desperdício e Dar Baixa</span>
            </button>
          )}
        </section>

        {/* History Table */}
        <section className="xl:col-span-7 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Histórico de Descartes e Baixas
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-48">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar item ou cozinheira..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <select
                value={reasonFilter}
                onChange={(e) =>
                  setReasonFilter(e.target.value as 'todos' | WasteReason)
                }
                aria-label="Filtrar por motivo"
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="todos">Todos os motivos</option>
                {REASON_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {WASTE_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhum desperdício registrado com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Data / Cozinheira</th>
                    <th className="py-3 px-4">Item Descartado</th>
                    <th className="py-3 px-4">Motivo & Baixa no Estoque</th>
                    <th className="py-3 px-4 text-right">Custo Perdido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <p className="font-mono-tabular text-slate-500">
                          {formatDateTimeBR(log.createdAt)}
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                          {log.employeeName}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {log.targetName}
                        </p>
                        <p className="font-mono-tabular text-slate-500 mt-0.5">
                          {log.quantity.toLocaleString('pt-BR')} {log.unitLabel}{' '}
                          · {log.targetType === 'insumo' ? 'Insumo' : 'Prato'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {WASTE_REASON_LABEL[log.reason]}
                        </p>
                        {log.notes && (
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {log.notes}
                          </p>
                        )}
                        {log.affectedIngredients.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {log.affectedIngredients.map((aff) => (
                              <p
                                key={aff.ingredientId}
                                className="inline-flex items-center gap-1 mr-2 text-[11px] font-mono-tabular text-red-700 dark:text-red-400"
                              >
                                <ArrowDownRight className="w-3 h-3" />
                                <span>
                                  {formatStockQty(aff.quantity, aff.unit)}{' '}
                                  {aff.ingredientName}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-red-700 dark:text-red-400 whitespace-nowrap">
                        {formatCurrencyBRL(log.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
