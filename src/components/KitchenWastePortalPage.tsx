'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  History,
  Moon,
  Package,
  RefreshCw,
  Sun,
  Trash2,
  Utensils,
} from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  CHECKLIST_SHIFT_LABEL,
  formatCurrencyBRL,
  formatDateTimeBR,
  WASTE_REASON_LABEL,
} from '@/lib/formatters';
import {
  applyWasteStockDeduction,
  formatStockQty,
  getCompatibleUnits,
  previewWasteDeduction,
} from '@/lib/stock-engine';
import type {
  ChecklistRun,
  ChecklistTemplate,
  DeliveryStoreState,
  StockUnit,
  WasteReason,
  WasteTargetType,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';
const COOK_NAME_KEY = 'casa-tempero-cook-name';

type KitchenTab = 'desperdicio' | 'checklists' | 'historico';

const REASON_OPTIONS: WasteReason[] = [
  'vencimento',
  'erro_preparo',
  'sobra_buffet',
  'avaria_embalagem',
  'qualidade',
  'outros',
];

function hydrateState(parsed: DeliveryStoreState): DeliveryStoreState {
  return {
    ...INITIAL_DELIVERY_STATE,
    ...parsed,
    store: {
      ...INITIAL_DELIVERY_STATE.store,
      ...parsed.store,
    },
    ingredients:
      Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
        ? parsed.ingredients
        : INITIAL_DELIVERY_STATE.ingredients,
    stockMovements: Array.isArray(parsed.stockMovements)
      ? parsed.stockMovements
      : INITIAL_DELIVERY_STATE.stockMovements,
    checklistTemplates:
      Array.isArray(parsed.checklistTemplates) &&
      parsed.checklistTemplates.length > 0
        ? parsed.checklistTemplates
        : INITIAL_DELIVERY_STATE.checklistTemplates,
    checklistRuns: Array.isArray(parsed.checklistRuns)
      ? parsed.checklistRuns
      : INITIAL_DELIVERY_STATE.checklistRuns,
    wasteLogs: Array.isArray(parsed.wasteLogs)
      ? parsed.wasteLogs
      : INITIAL_DELIVERY_STATE.wasteLogs,
  };
}

export function KitchenWastePortalPage() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [activeTab, setActiveTab] = useState<KitchenTab>('desperdicio');
  const [isDark, setIsDark] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Cook identity
  const [cookName, setCookName] = useState('Dona Maria (Cozinheira)');

  // Waste form
  const [targetType, setTargetType] = useState<WasteTargetType>('insumo');
  const [targetId, setTargetId] = useState<string>(
    INITIAL_DELIVERY_STATE.ingredients[0]?.id ?? '',
  );
  const [quantityStr, setQuantityStr] = useState('0.5');
  const [unit, setUnit] = useState<StockUnit>(
    INITIAL_DELIVERY_STATE.ingredients[0]?.unit ?? 'kg',
  );
  const [reason, setReason] = useState<WasteReason>('vencimento');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Quick kitchen checklist runner
  const [activeRun, setActiveRun] = useState<ChecklistRun | null>(null);

  const loadFromSources = useCallback(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeliveryStoreState;
        if (parsed.store) {
          const hydrated = hydrateState(parsed);
          setState(hydrated);
          return;
        }
      }
    } catch {
      // fallback
    }
    try {
      const res = await fetch('/api/delivery');
      if (res.ok) {
        const data = (await res.json()) as DeliveryStoreState;
        setState(hydrateState(data));
      }
    } catch {
      // keep initial
    }
  }, []);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    try {
      const savedCook = localStorage.getItem(COOK_NAME_KEY);
      if (savedCook) setCookName(savedCook);
    } catch {
      // ignore
    }
    loadFromSources();

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as DeliveryStoreState;
        if (parsed.store) setState(hydrateState(parsed));
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [loadFromSources]);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem('vertice-theme', nextDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };

  const handleCookNameChange = (value: string) => {
    setCookName(value);
    try {
      localStorage.setItem(COOK_NAME_KEY, value);
    } catch {
      // ignore
    }
  };

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

  const handleTargetTypeSwitch = (next: WasteTargetType) => {
    setTargetType(next);
    setConfirming(false);
    if (next === 'insumo') {
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

  const canSubmit =
    Boolean(targetId) &&
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Boolean(cookName.trim());

  const handleConfirmWaste = async () => {
    if (!canSubmit) return;
    const cleanCook = cookName.trim() || 'Cozinheira';
    const result = applyWasteStockDeduction({
      targetType,
      targetId,
      quantity: parsedQty,
      unit: targetType === 'insumo' ? unit : undefined,
      reason,
      employeeName: cleanCook,
      notes: notes.trim() || undefined,
      menuItems: state.menuItems,
      ingredients: state.ingredients,
    });

    setState((prev) => {
      const next: DeliveryStoreState = {
        ...prev,
        ingredients: result.ingredients,
        stockMovements:
          result.newMovements.length > 0
            ? [...result.newMovements, ...prev.stockMovements]
            : prev.stockMovements,
        wasteLogs: [result.wasteLog, ...prev.wasteLogs],
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    await fetch('/api/waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType,
        targetId,
        quantity: parsedQty,
        unit: targetType === 'insumo' ? unit : undefined,
        reason,
        employeeName: cleanCook,
        notes: notes.trim() || undefined,
      }),
    }).catch(() => {});

    setConfirming(false);
    setNotes('');
    setFeedback(
      `Descarte de "${result.wasteLog.targetName}" lançado! Estoque atualizado (${formatCurrencyBRL(
        result.wasteLog.estimatedCost,
      )}).`,
    );
  };

  // Kitchen checklists (cozinha + limpeza)
  const kitchenTemplates = useMemo(
    () =>
      (state.checklistTemplates ?? []).filter(
        (t) => t.active && (t.role === 'cozinha' || t.role === 'limpeza'),
      ),
    [state.checklistTemplates],
  );

  const persistRun = async (run: ChecklistRun) => {
    setState((prev) => {
      const exists = prev.checklistRuns.some((r) => r.id === run.id);
      const nextRuns = exists
        ? prev.checklistRuns.map((r) => (r.id === run.id ? run : r))
        : [run, ...prev.checklistRuns];
      const next = { ...prev, checklistRuns: nextRuns };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_run', run }),
    }).catch(() => {});
  };

  const handleStartKitchenChecklist = (tpl: ChecklistTemplate) => {
    const newRun: ChecklistRun = {
      id: `run-${Date.now()}`,
      templateId: tpl.id,
      templateTitle: tpl.title,
      role: tpl.role,
      shift: tpl.shift,
      employeeName: cookName.trim() || 'Cozinheira',
      status: 'em_andamento',
      startedAt: new Date().toISOString(),
      items: tpl.items.map((item) => ({
        itemId: item.id,
        title: item.title,
        instruction: item.instruction,
        critical: item.critical,
        checked: false,
      })),
    };
    setActiveRun(newRun);
    persistRun(newRun);
  };

  const handleToggleRunStep = (itemId: string) => {
    if (!activeRun) return;
    const nowIso = new Date().toISOString();
    const updated: ChecklistRun = {
      ...activeRun,
      items: activeRun.items.map((s) =>
        s.itemId === itemId
          ? { ...s, checked: !s.checked, checkedAt: !s.checked ? nowIso : undefined }
          : s,
      ),
    };
    setActiveRun(updated);
    persistRun(updated);
  };

  const handleFinishRun = () => {
    if (!activeRun) return;
    const completed: ChecklistRun = {
      ...activeRun,
      status: 'concluido',
      completedAt: new Date().toISOString(),
    };
    persistRun(completed);
    setActiveRun(null);
    setFeedback(`Checklist "${completed.templateTitle}" finalizado com sucesso.`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFromSources();
    setRefreshing(false);
  };

  const totalWasteToday = useMemo(
    () => (state.wasteLogs ?? []).reduce((s, w) => s + w.estimatedCost, 0),
    [state.wasteLogs],
  );

  return (
    <div className="min-h-screen bg-[#f7f7f9] dark:bg-[#0c0d11] text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#13151c]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {state.store.logoImage && !logoFailed ? (
              <img
                src={state.store.logoImage}
                alt={state.store.name}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-brand-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                <ChefHat className="w-5 h-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {state.store.name}
              </p>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Portal da Cozinheira · Desperdícios
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Sincronizar estoque"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label="Alternar tema"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            >
              {isDark ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        {feedback && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Cook name bar */}
        <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label
              htmlFor="cook-name-input"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Cozinheira / Responsável logada
            </label>
            <input
              id="cook-name-input"
              type="text"
              value={cookName}
              onChange={(e) => handleCookNameChange(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
          </div>
          <div className="sm:text-right shrink-0">
            <p className="text-xs text-slate-500">Perda acumulada</p>
            <p className="text-lg font-bold font-mono-tabular text-red-700 dark:text-red-400">
              {formatCurrencyBRL(totalWasteToday)}
            </p>
          </div>
        </section>

        {/* Navigation tabs */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('desperdicio')}
            className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
              activeTab === 'desperdicio'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Lançar Descarte</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checklists')}
            className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
              activeTab === 'checklists'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Checklists</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`min-h-[46px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
              activeTab === 'historico'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Histórico ({(state.wasteLogs ?? []).length})</span>
          </button>
        </div>

        {/* TAB 1: LOG WASTE */}
        {activeTab === 'desperdicio' && (
          <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleTargetTypeSwitch('insumo')}
                className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                  targetType === 'insumo'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Insumo / Ingrediente</span>
              </button>
              <button
                type="button"
                onClick={() => handleTargetTypeSwitch('prato')}
                className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                  targetType === 'prato'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Utensils className="w-4 h-4" />
                <span>Prato / Marmita</span>
              </button>
            </div>

            {targetType === 'insumo' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Qual insumo foi descartado?
                </label>
                <select
                  value={targetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTargetId(id);
                    setConfirming(false);
                    const found = state.ingredients.find((i) => i.id === id);
                    if (found) setUnit(found.unit);
                  }}
                  className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  {state.ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} — Saldo: {formatStockQty(ing.currentQty, ing.unit)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Qual prato / marmita pronta foi descartada?
                </label>
                <select
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    setConfirming(false);
                  }}
                  className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  {state.menuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {targetType === 'insumo' ? 'Quantidade' : 'Qtd. de Porções'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={quantityStr}
                  onChange={(e) => {
                    setQuantityStr(e.target.value);
                    setConfirming(false);
                  }}
                  className="w-full min-h-[46px] px-3 py-2.5 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              {targetType === 'insumo' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Unidade
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value as StockUnit);
                      setConfirming(false);
                    }}
                    className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Baixa Automática
                  </label>
                  <input
                    readOnly
                    value="Por Ficha Técnica"
                    className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Motivo do Descarte
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as WasteReason)}
                className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
              >
                {REASON_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {WASTE_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Observação (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Queimou na chapa / lote fora da validade"
                className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Será baixado do estoque:
                </span>
                <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
                  {formatCurrencyBRL(deductionPreview.estimatedCost)}
                </span>
              </div>

              {deductionPreview.affectedIngredients.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {targetType === 'prato'
                      ? 'Prato sem ficha técnica configurada — o registro ficará salvo no histórico.'
                      : 'Informe uma quantidade válida para calcular a baixa.'}
                  </span>
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {deductionPreview.affectedIngredients.map((item) => (
                    <li
                      key={item.ingredientId}
                      className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                    >
                      <span>{item.ingredientName}</span>
                      <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
                        -{formatStockQty(item.quantity, item.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {confirming ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Confirmar descarte e dar baixa automática no estoque?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="min-h-[46px] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmWaste}
                    className="min-h-[46px] px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
                  >
                    Confirmar Baixa
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => setConfirming(true)}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Lançar Desperdício e Dar Baixa</span>
              </button>
            )}
          </section>
        )}

        {/* TAB 2: KITCHEN CHECKLISTS */}
        {activeTab === 'checklists' && (
          <section className="space-y-4">
            {activeRun ? (
              <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {activeRun.templateTitle}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {CHECKLIST_SHIFT_LABEL[activeRun.shift]} ·{' '}
                      {activeRun.employeeName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRun(null)}
                    className="text-xs font-semibold text-slate-500 underline"
                  >
                    Trocar
                  </button>
                </div>

                <div className="space-y-2.5">
                  {activeRun.items.map((step, idx) => (
                    <button
                      key={step.itemId}
                      type="button"
                      onClick={() => handleToggleRunStep(step.itemId)}
                      className={`w-full min-h-[52px] p-3.5 rounded-xl border flex items-start gap-3 text-left transition-colors ${
                        step.checked
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          step.checked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {step.checked && <Check className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            step.checked
                              ? 'line-through text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {idx + 1}. {step.title}
                        </p>
                        {step.instruction && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {step.instruction}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleFinishRun}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Concluir Checklist da Cozinha</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {kitchenTemplates.map((tpl) => (
                  <article
                    key={tpl.id}
                    className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs text-slate-500">
                        {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                        <span className="font-mono-tabular">
                          {tpl.items.length} etapas
                        </span>
                      </p>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {tpl.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartKitchenChecklist(tpl)}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shrink-0"
                    >
                      Executar Agora
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'historico' && (
          <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            {(state.wasteLogs ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Nenhum descarte lançado ainda.
              </div>
            ) : (
              (state.wasteLogs ?? []).map((log) => (
                <div key={log.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-500">
                        {formatDateTimeBR(log.createdAt)} · {log.employeeName}
                      </p>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {log.targetName} (
                        <span className="font-mono-tabular">
                          {log.quantity} {log.unitLabel}
                        </span>
                        )
                      </h3>
                    </div>
                    <span className="text-sm font-mono-tabular font-bold text-red-700 dark:text-red-400 shrink-0">
                      {formatCurrencyBRL(log.estimatedCost)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Motivo: {WASTE_REASON_LABEL[log.reason]}
                    {log.notes ? ` · ${log.notes}` : ''}
                  </p>
                  {log.affectedIngredients.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {log.affectedIngredients.map((aff) => (
                        <span
                          key={aff.ingredientId}
                          className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-red-700 dark:text-red-400"
                        >
                          <ArrowDownRight className="w-3 h-3" />
                          {formatStockQty(aff.quantity, aff.unit)}{' '}
                          {aff.ingredientName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </main>
    </div>
  );
}
