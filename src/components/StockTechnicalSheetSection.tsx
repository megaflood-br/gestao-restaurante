'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { formatCurrencyBRL, formatDateTimeBR } from '@/lib/formatters';
import {
  calculateItemCmv,
  convertStockUnit,
  formatStockQty,
  getCompatibleUnits,
} from '@/lib/stock-engine';
import type {
  DeliveryStoreState,
  StockIngredient,
  StockMovement,
  StockUnit,
  TechnicalSheetIngredient,
} from '@/types/delivery';

interface StockTechnicalSheetSectionProps {
  state: DeliveryStoreState;
  onUpdateTechnicalSheet: (
    menuItemId: string,
    technicalSheet: TechnicalSheetIngredient[],
  ) => void;
  onAddIngredient: (
    ingredient: StockIngredient,
    movement?: StockMovement | null,
  ) => void;
  onAdjustStock: (
    ingredientId: string,
    movementType: 'entrada' | 'ajuste',
    quantity: number,
    reason: string,
  ) => Promise<void>;
}

export function StockTechnicalSheetSection({
  state,
  onUpdateTechnicalSheet,
  onAddIngredient,
  onAdjustStock,
}: StockTechnicalSheetSectionProps) {
  const [activeTab, setActiveTab] = useState<'fichas' | 'estoque' | 'movimentos'>(
    'fichas',
  );

  // Ficha técnica state
  const [selectedItemId, setSelectedItemId] = useState<string>(
    state.menuItems[0]?.id ?? '',
  );
  const selectedItem =
    state.menuItems.find((i) => i.id === selectedItemId) ?? state.menuItems[0];

  const [draftSheet, setDraftSheet] = useState<TechnicalSheetIngredient[]>(
    selectedItem?.technicalSheet ?? [],
  );
  const [addIngId, setAddIngId] = useState<string>(
    state.ingredients[0]?.id ?? '',
  );
  const [addQty, setAddQty] = useState<string>('100');
  const [addUnit, setAddUnit] = useState<StockUnit>('g');
  const [sheetSavedFeedback, setSheetSavedFeedback] = useState(false);

  // Stock table & new ingredient state
  const [stockSearch, setStockSearch] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [showNewIngForm, setShowNewIngForm] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngCategory, setNewIngCategory] = useState('Proteínas');
  const [newIngUnit, setNewIngUnit] = useState<StockUnit>('kg');
  const [newIngQty, setNewIngQty] = useState('10');
  const [newIngMin, setNewIngMin] = useState('3');
  const [newIngCost, setNewIngCost] = useState('25');

  // Inline restock / adjust state
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<'entrada' | 'ajuste'>('entrada');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    setDraftSheet(selectedItem?.technicalSheet ?? []);
    setSheetSavedFeedback(false);
  }, [selectedItem]);

  useEffect(() => {
    const ing = state.ingredients.find((i) => i.id === addIngId);
    if (ing) {
      const units = getCompatibleUnits(ing.unit);
      if (!units.includes(addUnit)) {
        setAddUnit(units[0]);
      }
    }
  }, [addIngId, addUnit, state.ingredients]);

  const linkedCount = state.menuItems.filter(
    (m) => (m.technicalSheet?.length ?? 0) > 0,
  ).length;

  const lowStockIngredients = state.ingredients.filter(
    (i) => i.currentQty <= i.minQty,
  );

  const avgCmvPercent = useMemo(() => {
    const valid = state.menuItems.filter((m) => (m.technicalSheet?.length ?? 0) > 0);
    if (valid.length === 0) return 0;
    const totalPct = valid.reduce((sum, m) => {
      const sale = m.promoPrice ?? m.price;
      const cmv = calculateItemCmv(m, state.ingredients);
      return sum + (sale > 0 ? (cmv / sale) * 100 : 0);
    }, 0);
    return totalPct / valid.length;
  }, [state.menuItems, state.ingredients]);

  const draftCmv = useMemo(() => {
    if (!selectedItem) return 0;
    return calculateItemCmv(
      { ...selectedItem, technicalSheet: draftSheet },
      state.ingredients,
    );
  }, [selectedItem, draftSheet, state.ingredients]);

  const selectedSalePrice = selectedItem
    ? selectedItem.promoPrice ?? selectedItem.price
    : 0;
  const draftMarginValue = selectedSalePrice - draftCmv;
  const draftMarginPct =
    selectedSalePrice > 0 ? (draftMarginValue / selectedSalePrice) * 100 : 0;

  const filteredIngredients = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return state.ingredients.filter((ing) => {
      if (onlyLowStock && ing.currentQty > ing.minQty) return false;
      if (!q) return true;
      return (
        ing.name.toLowerCase().includes(q) ||
        ing.category.toLowerCase().includes(q)
      );
    });
  }, [state.ingredients, stockSearch, onlyLowStock]);

  const handleAddLineToSheet = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Math.max(0.001, Number(addQty) || 0);
    if (!addIngId || qty <= 0) return;

    setDraftSheet((prev) => {
      const exists = prev.find((l) => l.ingredientId === addIngId);
      if (exists) {
        return prev.map((l) =>
          l.ingredientId === addIngId
            ? { ...l, quantity: qty, unit: addUnit }
            : l,
        );
      }
      return [...prev, { ingredientId: addIngId, quantity: qty, unit: addUnit }];
    });
    setSheetSavedFeedback(false);
  };

  const handleSaveSheet = () => {
    if (!selectedItem) return;
    onUpdateTechnicalSheet(selectedItem.id, draftSheet);
    setSheetSavedFeedback(true);
    setTimeout(() => setSheetSavedFeedback(false), 3000);
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;

    const payload = {
      action: 'create_ingredient',
      name: newIngName.trim(),
      category: newIngCategory.trim() || 'Insumos Gerais',
      unit: newIngUnit,
      currentQty: Math.max(0, Number(newIngQty) || 0),
      minQty: Math.max(0, Number(newIngMin) || 1),
      unitCost: Math.max(0, Number(newIngCost) || 0),
    };

    const res = await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);

    const data = res
      ? ((await res.json()) as {
          ok: boolean;
          ingredient?: StockIngredient;
          movement?: StockMovement | null;
        })
      : null;

    if (data?.ok && data.ingredient) {
      onAddIngredient(data.ingredient, data.movement);
    } else {
      const now = new Date().toISOString();
      const ing: StockIngredient = {
        id: `ing-${Date.now()}`,
        name: payload.name,
        category: payload.category,
        unit: payload.unit,
        currentQty: payload.currentQty,
        minQty: payload.minQty,
        unitCost: payload.unitCost,
        updatedAt: now,
      };
      onAddIngredient(
        ing,
        payload.currentQty > 0
          ? {
              id: `mov-init-${Date.now()}`,
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'entrada',
              quantity: payload.currentQty,
              unit: ing.unit,
              previousQty: 0,
              newQty: payload.currentQty,
              reason: 'Saldo inicial de cadastro',
              createdAt: now,
            }
          : null,
      );
    }

    setNewIngName('');
    setShowNewIngForm(false);
  };

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingId) return;
    const qty = Number(adjustQty);
    if (!Number.isFinite(qty) || qty < 0) return;

    await onAdjustStock(
      adjustingId,
      adjustType,
      qty,
      adjustReason.trim() ||
        (adjustType === 'entrada'
          ? 'Entrada de fornecedor'
          : 'Ajuste manual de inventário'),
    );
    setAdjustingId(null);
    setAdjustQty('');
    setAdjustReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Ficha Técnica e Estoque Automático
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Vincule insumos e quantidades a cada prato do cardápio. Toda saída de pedido dá baixa automática no estoque.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Seções de ficha técnica e estoque"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto"
        >
          {(
            [
              { id: 'fichas', label: 'Fichas Técnicas' },
              { id: 'estoque', label: 'Estoque de Insumos' },
              { id: 'movimentos', label: 'Baixas e Movimentações' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {lowStockIngredients.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              Alerta de reposição: {lowStockIngredients.length}{' '}
              {lowStockIngredients.length === 1
                ? 'insumo está abaixo do estoque mínimo'
                : 'insumos estão abaixo do estoque mínimo'}{' '}
              ({lowStockIngredients.map((i) => i.name).join(', ')}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('estoque');
              setOnlyLowStock(true);
            }}
            className="font-semibold underline self-start sm:self-auto whitespace-nowrap"
          >
            Ver itens críticos
          </button>
        </div>
      )}

      <section
        aria-label="Indicadores de ficha técnica e estoque"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pratos com Ficha Vinculada
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {linkedCount}/{state.menuItems.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Insumos Cadastrados
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {state.ingredients.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            CMV Médio do Cardápio
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {avgCmvPercent.toFixed(1)}%
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Insumos em Alerta
          </p>
          <p
            className={`mt-1 text-2xl font-bold font-mono-tabular ${
              lowStockIngredients.length > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {lowStockIngredients.length}
          </p>
        </div>
      </section>

      {activeTab === 'fichas' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Itens do Cardápio ({state.menuItems.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione um prato para editar os insumos da ficha técnica.
              </p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {state.menuItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const salePrice = item.promoPrice ?? item.price;
                const cmv = calculateItemCmv(item, state.ingredients);
                const sheetCount = item.technicalSheet?.length ?? 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full px-5 py-3.5 text-left transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-brand-50/70 dark:bg-brand-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isSelected
                            ? 'text-brand-800 dark:text-brand-300'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                        {sheetCount}{' '}
                        {sheetCount === 1 ? 'insumo vinculado' : 'insumos vinculados'}{' '}
                        · CMV {formatCurrencyBRL(cmv)}
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatCurrencyBRL(salePrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            {selectedItem ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedItem.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Baixa automática aplicada proporcionalmente à quantidade pedida.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSheet}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {sheetSavedFeedback ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ficha Salva</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Ficha Técnica</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg divide-x divide-slate-200 dark:divide-slate-800">
                  <div className="p-3.5">
                    <p className="text-[11px] text-slate-500">Preço de Venda</p>
                    <p className="mt-0.5 text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                      {formatCurrencyBRL(selectedSalePrice)}
                    </p>
                  </div>
                  <div className="p-3.5">
                    <p className="text-[11px] text-slate-500">CMV da Receita</p>
                    <p className="mt-0.5 text-base font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
                      {formatCurrencyBRL(draftCmv)}
                    </p>
                  </div>
                  <div className="p-3.5">
                    <p className="text-[11px] text-slate-500">Margem Bruta</p>
                    <p className="mt-0.5 text-base font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                      {formatCurrencyBRL(draftMarginValue)} ({draftMarginPct.toFixed(0)}%)
                    </p>
                  </div>
                </div>

                {draftSheet.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
                    Nenhum insumo vinculado a este prato ainda. Adicione abaixo.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950">
                          <th className="py-2.5 px-4">Insumo</th>
                          <th className="py-2.5 px-3">Consumo / Porção</th>
                          <th className="py-2.5 px-3 text-right">Custo</th>
                          <th className="py-2.5 px-3 text-right">Estoque Atual</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {draftSheet.map((line) => {
                          const ing = state.ingredients.find(
                            (i) => i.id === line.ingredientId,
                          );
                          if (!ing) return null;
                          const units = getCompatibleUnits(ing.unit);
                          const cost =
                            convertStockUnit(line.quantity, line.unit, ing.unit) *
                            ing.unitCost;

                          return (
                            <tr key={line.ingredientId}>
                              <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                                {ing.name}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="any"
                                    value={line.quantity}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0,
                                        Number(e.target.value) || 0,
                                      );
                                      setDraftSheet((prev) =>
                                        prev.map((l) =>
                                          l.ingredientId === line.ingredientId
                                            ? { ...l, quantity: val }
                                            : l,
                                        ),
                                      );
                                    }}
                                    className="w-20 px-2 py-1 font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                                  />
                                  <select
                                    value={line.unit}
                                    onChange={(e) =>
                                      setDraftSheet((prev) =>
                                        prev.map((l) =>
                                          l.ingredientId === line.ingredientId
                                            ? {
                                                ...l,
                                                unit: e.target.value as StockUnit,
                                              }
                                            : l,
                                        ),
                                      )
                                    }
                                    className="px-2 py-1 font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                                  >
                                    {units.map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                                {formatCurrencyBRL(cost)}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono-tabular ${
                                  ing.currentQty <= ing.minQty
                                    ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {formatStockQty(ing.currentQty, ing.unit)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftSheet((prev) =>
                                      prev.filter(
                                        (l) => l.ingredientId !== line.ingredientId,
                                      ),
                                    )
                                  }
                                  aria-label={`Remover ${ing.name}`}
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <form
                  onSubmit={handleAddLineToSheet}
                  className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2"
                >
                  <select
                    value={addIngId}
                    onChange={(e) => setAddIngId(e.target.value)}
                    aria-label="Selecionar insumo"
                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {state.ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({formatStockQty(ing.currentQty, ing.unit)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    placeholder="Qtd."
                    className="w-24 px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <select
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value as StockUnit)}
                    className="w-20 px-2.5 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {getCompatibleUnits(
                      state.ingredients.find((i) => i.id === addIngId)?.unit ?? 'kg',
                    ).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Vincular</span>
                  </button>
                </form>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Cadastre um prato primeiro para configurar a ficha técnica.
              </p>
            )}
          </section>
        </div>
      )}

      {activeTab === 'estoque' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Buscar insumo ou categoria..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyLowStock((v) => !v)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  onlyLowStock
                    ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {onlyLowStock ? 'Mostrando Críticos' : 'Filtrar Estoque Baixo'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowNewIngForm((v) => !v)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap self-start md:self-auto"
            >
              <PackagePlus className="w-4 h-4" aria-hidden="true" />
              <span>Novo Insumo</span>
            </button>
          </div>

          {showNewIngForm && (
            <form
              onSubmit={handleCreateIngredient}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end"
            >
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Insumo
                </label>
                <input
                  required
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  placeholder="Ex.: Bacon em Cubos"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Categoria
                </label>
                <input
                  value={newIngCategory}
                  onChange={(e) => setNewIngCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unidade
                </label>
                <select
                  value={newIngUnit}
                  onChange={(e) => setNewIngUnit(e.target.value as StockUnit)}
                  className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="un">un</option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Saldo Inicial
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={newIngQty}
                  onChange={(e) => setNewIngQty(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mínimo / Custo (R$)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newIngMin}
                    onChange={(e) => setNewIngMin(e.target.value)}
                    title="Estoque mínimo"
                    className="w-1/2 px-2 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newIngCost}
                    onChange={(e) => setNewIngCost(e.target.value)}
                    title="Custo por unidade"
                    className="w-1/2 px-2 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="py-2 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                Salvar Insumo
              </button>
            </form>
          )}

          {adjustingId && (
            <form
              onSubmit={handleApplyAdjustment}
              className="bg-brand-50/70 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3"
            >
              <div className="flex-1 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Movimentar:{' '}
                  {state.ingredients.find((i) => i.id === adjustingId)?.name}
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  {adjustType === 'entrada'
                    ? 'Informe quanto entrou na compra (será somado ao saldo atual).'
                    : 'Informe o novo saldo contado no inventário.'}
                </p>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="Quantidade"
                className="w-32 px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Nota Fiscal / Motivo (opcional)"
                className="sm:w-56 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustingId(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Insumo</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Saldo Atual</th>
                    <th className="py-3 px-4 text-right">Mínimo</th>
                    <th className="py-3 px-4 text-right">Custo Unit.</th>
                    <th className="py-3 px-4 text-right">Valor em Estoque</th>
                    <th className="py-3 px-5 text-right">Movimentar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredIngredients.map((ing) => {
                    const isLow = ing.currentQty <= ing.minQty;
                    const stockValue = ing.currentQty * ing.unitCost;
                    return (
                      <tr
                        key={ing.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {ing.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {ing.category}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono-tabular font-bold whitespace-nowrap ${
                            isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {formatStockQty(ing.currentQty, ing.unit)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-500 whitespace-nowrap">
                          {formatStockQty(ing.minQty, ing.unit)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatCurrencyBRL(ing.unitCost)}/{ing.unit}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatCurrencyBRL(stockValue)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustingId(ing.id);
                                setAdjustType('entrada');
                                setAdjustQty('');
                                setAdjustReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md"
                            >
                              + Entrada
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustingId(ing.id);
                                setAdjustType('ajuste');
                                setAdjustQty(String(ing.currentQty));
                                setAdjustReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                            >
                              Ajustar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'movimentos' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Histórico de Baixas Automáticas e Entradas
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500">
              {state.stockMovements.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Data / Hora</th>
                  <th className="py-3 px-4">Insumo</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Movimentação</th>
                  <th className="py-3 px-4 text-right">Saldo (Antes → Depois)</th>
                  <th className="py-3 px-5">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {state.stockMovements.map((mov) => {
                  const isOutbound = mov.type === 'saida_pedido';
                  return (
                    <tr
                      key={mov.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-5 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {formatDateTimeBR(mov.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {mov.ingredientName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isOutbound
                              ? 'text-red-700 dark:text-red-400'
                              : mov.type === 'estorno'
                                ? 'text-brand-600 dark:text-brand-400'
                                : mov.type === 'entrada'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {isOutbound ? (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {mov.type === 'saida_pedido'
                              ? 'Baixa Pedido'
                              : mov.type === 'entrada'
                                ? 'Entrada'
                                : mov.type === 'estorno'
                                  ? 'Estorno'
                                  : 'Ajuste'}
                          </span>
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-tabular font-bold whitespace-nowrap ${
                          isOutbound
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {isOutbound ? '-' : '+'}
                        {formatStockQty(mov.quantity, mov.unit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatStockQty(mov.previousQty, mov.unit)} →{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {formatStockQty(mov.newQty, mov.unit)}
                        </strong>
                      </td>
                      <td className="py-3 px-5 text-slate-600 dark:text-slate-300 max-w-sm">
                        {mov.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
