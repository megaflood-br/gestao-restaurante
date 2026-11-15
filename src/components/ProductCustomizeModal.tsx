'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, UtensilsCrossed, X } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import type { MenuItem, OrderItem, SelectedAddon } from '@/types/delivery';

interface ProductCustomizeModalProps {
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (orderItem: OrderItem) => void;
}

export function ProductCustomizeModal({
  item,
  onClose,
  onAddToCart,
}: ProductCustomizeModalProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!item) return;
    const defaults: Record<string, string[]> = {};
    for (const group of item.addonGroups) {
      if (group.required && group.options.length > 0) {
        const firstAvailable = group.options.find((o) => o.available);
        defaults[group.id] = firstAvailable ? [firstAvailable.id] : [];
      } else {
        defaults[group.id] = [];
      }
    }
    setSelections(defaults);
    setQuantity(1);
    setNotes('');
    setImgFailed(false);
  }, [item]);

  const basePrice = item ? (item.promoPrice ?? item.price) : 0;

  const selectedAddons: SelectedAddon[] = useMemo(() => {
    if (!item) return [];
    const list: SelectedAddon[] = [];
    for (const group of item.addonGroups) {
      const pickedIds = selections[group.id] ?? [];
      for (const optionId of pickedIds) {
        const opt = group.options.find((o) => o.id === optionId);
        if (opt) {
          list.push({
            groupId: group.id,
            groupTitle: group.title,
            optionId: opt.id,
            optionName: opt.name,
            price: opt.price,
          });
        }
      }
    }
    return list;
  }, [item, selections]);

  const missingRequiredGroup = useMemo(() => {
    if (!item) return null;
    return (
      item.addonGroups.find((group) => {
        if (!group.required) return false;
        const count = (selections[group.id] ?? []).length;
        return count < Math.max(1, group.minSelect);
      }) ?? null
    );
  }, [item, selections]);

  if (!item) return null;

  const addonsSum = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = basePrice + addonsSum;
  const totalPrice = Number((unitPrice * quantity).toFixed(2));

  const toggleOption = (
    groupId: string,
    optionId: string,
    maxSelect: number,
  ) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= maxSelect) {
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const handleConfirm = () => {
    if (missingRequiredGroup) return;
    onAddToCart({
      id: `cart-${item.id}-${Date.now()}`,
      menuItemId: item.id,
      name: item.name,
      quantity,
      unitPrice,
      totalPrice,
      notes: notes.trim() || undefined,
      selectedAddons,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-dish-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="relative aspect-[16/9] w-full bg-slate-100 dark:bg-slate-800 shrink-0">
          {imgFailed ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <UtensilsCrossed className="w-8 h-8 mb-2" aria-hidden="true" />
              <span className="text-xs font-medium">{item.name}</span>
            </div>
          ) : (
            <img
              src={item.image}
              alt={item.name}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do prato"
            className="absolute top-3 right-3 p-2 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Preparo ~{item.prepMinutes} min · {item.serves}
            </p>
            <h2
              id="customize-dish-title"
              className="mt-1 text-xl font-bold text-slate-900 dark:text-white"
            >
              {item.name}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {item.description}
            </p>
            <div className="mt-3 flex items-baseline gap-2.5 font-mono-tabular">
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {formatCurrencyBRL(basePrice)}
              </span>
              {item.promoPrice && (
                <span className="text-xs line-through text-slate-400">
                  {formatCurrencyBRL(item.price)}
                </span>
              )}
            </div>
          </div>

          {item.addonGroups.map((group) => {
            const picked = selections[group.id] ?? [];
            return (
              <div
                key={group.id}
                className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {group.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {group.required
                        ? `Obrigatório · Escolha ${group.maxSelect} opção`
                        : `Opcional · Até ${group.maxSelect} opções`}
                    </p>
                  </div>
                  <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                    {picked.length}/{group.maxSelect}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  {group.options.map((option) => {
                    const isSelected = picked.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center justify-between gap-3 px-4 py-3 text-sm cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-brand-50/70 dark:bg-brand-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        } ${!option.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type={group.maxSelect === 1 ? 'radio' : 'checkbox'}
                            name={group.id}
                            disabled={!option.available}
                            checked={isSelected}
                            onChange={() =>
                              toggleOption(group.id, option.id, group.maxSelect)
                            }
                            className="accent-brand-600 w-4 h-4 shrink-0"
                          />
                          <span className="text-slate-900 dark:text-slate-100 truncate">
                            {option.name}
                          </span>
                        </div>
                        <span className="font-mono-tabular text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {option.price > 0
                            ? `+ ${formatCurrencyBRL(option.price)}`
                            : 'Incluso'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
            <label
              htmlFor="dish-notes"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Observações para a cozinha (opcional)
            </label>
            <textarea
              id="dish-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Sem cebola, enviar talheres..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-4 shrink-0">
          <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Diminuir quantidade"
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-mono-tabular font-semibold text-slate-900 dark:text-white">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Aumentar quantidade"
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            disabled={Boolean(missingRequiredGroup)}
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50 font-mono-tabular whitespace-nowrap"
          >
            {missingRequiredGroup
              ? `Escolha: ${missingRequiredGroup.title}`
              : `Adicionar · ${formatCurrencyBRL(totalPrice)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
