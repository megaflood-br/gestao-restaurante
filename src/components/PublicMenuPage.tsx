'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import { applyOrderStockDeduction } from '@/lib/stock-engine';
import { DigitalMenuSection } from '@/components/DigitalMenuSection';
import type { OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';
import type { DeliveryStoreState, Order } from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';

export function PublicMenuPage() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    let cancelled = false;
    async function load() {
      try {
        const localRaw = localStorage.getItem(STORAGE_KEY);
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as DeliveryStoreState;
          if (!cancelled && parsed.store && parsed.menuItems && parsed.orders) {
            setState({
              ...INITIAL_DELIVERY_STATE,
              ...parsed,
              store: {
                ...INITIAL_DELIVERY_STATE.store,
                ...parsed.store,
              },
            });
            return;
          }
        }
      } catch {
        // Fallback to server API
      }

      try {
        const res = await fetch('/api/delivery');
        if (res.ok) {
          const serverData = (await res.json()) as DeliveryStoreState;
          if (!cancelled) setState(serverData);
        }
      } catch {
        // Keep seeded initial state
      }
    }

    load();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as DeliveryStoreState;
        if (parsed.store && parsed.menuItems) {
          setState(parsed);
        }
      } catch {
        // Ignore invalid storage payload
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem('vertice-theme', nextDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  };

  const handleOrderCreated = (
    newOrder: Order,
    sideEffects?: OrderCreatedSideEffects,
  ) => {
    setState((prev) => {
      let nextIngredients = prev.ingredients;
      let nextMovements = prev.stockMovements;
      let orderToStore = newOrder;

      if (
        sideEffects?.stockMovements &&
        sideEffects.stockMovements.length > 0 &&
        sideEffects.ingredients
      ) {
        nextIngredients = sideEffects.ingredients;
        nextMovements = [...sideEffects.stockMovements, ...prev.stockMovements];
      } else if (!newOrder.stockDeducted) {
        const localDeduction = applyOrderStockDeduction({
          order: newOrder,
          menuItems: prev.menuItems,
          ingredients: prev.ingredients,
          nowIso: newOrder.createdAt,
        });
        if (localDeduction.deducted) {
          nextIngredients = localDeduction.ingredients;
          nextMovements = [...localDeduction.newMovements, ...prev.stockMovements];
          orderToStore = { ...newOrder, stockDeducted: true };
        }
      }

      const next: DeliveryStoreState = {
        ...prev,
        orders: [orderToStore, ...prev.orders],
        coupons: newOrder.couponCode
          ? prev.coupons.map((c) =>
              c.code === newOrder.couponCode
                ? { ...c, usageCount: c.usageCount + 1 }
                : c,
            )
          : prev.coupons,
        whatsappLogs: sideEffects?.whatsappLog
          ? [sideEffects.whatsappLog, ...prev.whatsappLogs]
          : prev.whatsappLogs,
        ingredients: nextIngredients,
        stockMovements: nextMovements,
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }

      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] dark:bg-[#0c0d11] text-slate-900 dark:text-slate-100">
      <header className="h-14 bg-white dark:bg-[#13151c] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {state.store.logoImage ? (
            <img
              src={state.store.logoImage}
              alt={state.store.name}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <span className="w-6 h-6 rounded-md bg-brand-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
              P
            </span>
          )}
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {state.store.name}
          </span>
          <span
            className={`hidden sm:inline text-xs font-semibold whitespace-nowrap ${
              state.store.isOpen
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            · {state.store.isOpen ? 'Aberto agora' : 'Fechado'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleTheme}
          aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Claro</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Escuro</span>
            </>
          )}
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-5 sm:p-8">
        <DigitalMenuSection
          state={state}
          onOrderCreated={handleOrderCreated}
        />
      </main>
    </div>
  );
}
