'use client';

import { useEffect, useState } from 'react';
import {
  Store,
  UtensilsCrossed,
  ClipboardList,
  MessageSquare,
  Tags,
  PackageCheck,
  Bike,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  applyOrderStockDeduction,
  reverseOrderStockDeduction,
} from '@/lib/stock-engine';
import { StageOneBase } from '@/components/StageOneBase';
import { DigitalMenuSection } from '@/components/DigitalMenuSection';
import { OrdersManagerSection } from '@/components/OrdersManagerSection';
import { WhatsappEvolutionSection } from '@/components/WhatsappEvolutionSection';
import { CatalogCouponsSection } from '@/components/CatalogCouponsSection';
import { StockTechnicalSheetSection } from '@/components/StockTechnicalSheetSection';
import { CouriersReportsSection } from '@/components/CouriersReportsSection';
import type { OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';
import type {
  Coupon,
  Courier,
  DeliveryModuleId,
  DeliveryStoreState,
  EvolutionConfig,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  StockIngredient,
  StockMovement,
  StoreSettings,
  TechnicalSheetIngredient,
  WhatsappLog,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';

const NAV_ITEMS: Array<{
  id: DeliveryModuleId;
  label: string;
  icon: typeof Store;
}> = [
  { id: 'visao_base', label: 'Base e Loja', icon: Store },
  {
    id: 'cardapio_digital',
    label: 'Cardápio Digital',
    icon: UtensilsCrossed,
  },
  {
    id: 'gestor_pedidos',
    label: 'Gestor de Pedidos',
    icon: ClipboardList,
  },
  {
    id: 'whatsapp_evolution',
    label: 'Atendimento Virtual IA',
    icon: MessageSquare,
  },
  {
    id: 'catalogo_cupons',
    label: 'Cardápio e Cupons',
    icon: Tags,
  },
  {
    id: 'estoque_ficha',
    label: 'Estoque e Ficha Técnica',
    icon: PackageCheck,
  },
  {
    id: 'entregadores_relatorios',
    label: 'Entregadores e Relatórios',
    icon: Bike,
  },
];

export function DeliveryShell() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [activeModule, setActiveModule] =
    useState<DeliveryModuleId>('whatsapp_evolution');
  const [isDark, setIsDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    let cancelled = false;
    async function load() {
      try {
        const localRaw = localStorage.getItem(STORAGE_KEY);
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as DeliveryStoreState;
          if (!cancelled && parsed.store && parsed.menuItems && parsed.orders) {
            const existingOrderIds = new Set(parsed.orders.map((o) => o.id));
            const missingSeedOrders = INITIAL_DELIVERY_STATE.orders.filter(
              (o) => !existingOrderIds.has(o.id),
            );
            const mergedMenuItems = parsed.menuItems.map((item) => {
              if (item.technicalSheet !== undefined) return item;
              const seedMatch = INITIAL_DELIVERY_STATE.menuItems.find(
                (s) => s.id === item.id,
              );
              return seedMatch?.technicalSheet
                ? { ...item, technicalSheet: seedMatch.technicalSheet }
                : item;
            });
            setState({
              ...parsed,
              store: {
                ...parsed.store,
                evolution: {
                  ...INITIAL_DELIVERY_STATE.store.evolution,
                  ...parsed.store.evolution,
                  templates: {
                    ...INITIAL_DELIVERY_STATE.store.evolution.templates,
                    ...(parsed.store.evolution?.templates ?? {}),
                  },
                },
              },
              menuItems: mergedMenuItems,
              orders:
                missingSeedOrders.length > 0
                  ? [...parsed.orders, ...missingSeedOrders]
                  : parsed.orders,
              ingredients:
                Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
                  ? parsed.ingredients
                  : INITIAL_DELIVERY_STATE.ingredients,
              stockMovements: Array.isArray(parsed.stockMovements)
                ? parsed.stockMovements
                : INITIAL_DELIVERY_STATE.stockMovements,
            });
            return;
          }
        }
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
    return () => {
      cancelled = true;
    };
  }, []);

  const persistState = (
    updater:
      | DeliveryStoreState
      | ((prev: DeliveryStoreState) => DeliveryStoreState),
  ) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

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

  const handleToggleStoreOpen = async () => {
    persistState((prev) => ({
      ...prev,
      store: { ...prev.store, isOpen: !prev.store.isOpen },
    }));
    await fetch('/api/delivery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_store' }),
    }).catch(() => {});
  };

  const handleUpdateStore = async (updates: Partial<StoreSettings>) => {
    persistState((prev) => ({
      ...prev,
      store: { ...prev.store, ...updates },
    }));
    await fetch('/api/delivery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_store', updates }),
    }).catch(() => {});
  };

  const handleUpdateEvolution = (evolution: EvolutionConfig) => {
    persistState((prev) => ({
      ...prev,
      store: { ...prev.store, evolution },
    }));
  };

  const handleAppendWhatsappLogs = (logs: WhatsappLog[]) => {
    if (logs.length === 0) return;
    persistState((prev) => ({
      ...prev,
      whatsappLogs: [...logs, ...prev.whatsappLogs],
    }));
  };

  const handleOrderCreated = (
    newOrder: Order,
    sideEffects?: OrderCreatedSideEffects,
  ) => {
    persistState((prev) => {
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

      return {
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
    });
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    courierId?: string,
  ) => {
    const now = new Date().toISOString();
    persistState((prev) => {
      let nextIngredients = prev.ingredients;
      let nextMovements = prev.stockMovements;

      const updatedOrders = prev.orders.map((order) => {
        if (order.id !== orderId) return order;
        let nextOrder: Order = {
          ...order,
          status,
          courierId: courierId !== undefined ? courierId : order.courierId,
          updatedAt: now,
          history: [...order.history, { status, at: now }],
        };

        if (status === 'cancelado' && order.stockDeducted) {
          const reversal = reverseOrderStockDeduction({
            order,
            ingredients: nextIngredients,
            stockMovements: nextMovements,
            nowIso: now,
          });
          if (reversal.reversed) {
            nextIngredients = reversal.ingredients;
            nextMovements = [...reversal.newMovements, ...nextMovements];
            nextOrder = { ...nextOrder, stockDeducted: false };
          }
        } else if (
          status !== 'pendente' &&
          status !== 'cancelado' &&
          !order.stockDeducted
        ) {
          const deduction = applyOrderStockDeduction({
            order: nextOrder,
            menuItems: prev.menuItems,
            ingredients: nextIngredients,
            nowIso: now,
          });
          if (deduction.deducted) {
            nextIngredients = deduction.ingredients;
            nextMovements = [...deduction.newMovements, ...nextMovements];
            nextOrder = { ...nextOrder, stockDeducted: true };
          }
        }

        return nextOrder;
      });

      return {
        ...prev,
        orders: updatedOrders,
        ingredients: nextIngredients,
        stockMovements: nextMovements,
        couriers: prev.couriers.map((courier) => {
          if (courier.id !== courierId) return courier;
          if (status === 'entrega') return { ...courier, status: 'em_rota' as const };
          if (status === 'finalizado') {
            return {
              ...courier,
              status: 'disponivel' as const,
              deliveriesToday: courier.deliveriesToday + 1,
            };
          }
          return courier;
        }),
      };
    });

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status, courierId }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          whatsappLog?: WhatsappLog | null;
        };
        if (data.whatsappLog) {
          const log = data.whatsappLog;
          persistState((prev) => ({
            ...prev,
            whatsappLogs: [log, ...prev.whatsappLogs],
          }));
        }
      }
    } catch {
      // Ignore network errors on optimistic status change
    }
  };

  const handleAddMenuItem = (item: MenuItem) => {
    persistState((prev) => ({
      ...prev,
      menuItems: [item, ...prev.menuItems],
    }));
  };

  const handleUpdateMenuItem = (id: string, updates: Partial<MenuItem>) => {
    persistState((prev) => ({
      ...prev,
      menuItems: prev.menuItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    }));
    fetch('/api/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'menu_item', id, updates }),
    }).catch(() => {});
  };

  const handleDeleteMenuItem = (id: string) => {
    persistState((prev) => ({
      ...prev,
      menuItems: prev.menuItems.filter((item) => item.id !== id),
    }));
    fetch('/api/catalog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'menu_item', id }),
    }).catch(() => {});
  };

  const handleAddCategory = (category: MenuCategory) => {
    persistState((prev) => ({
      ...prev,
      categories: [...prev.categories, category],
    }));
  };

  const handleToggleCategory = (id: string, active: boolean) => {
    persistState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === id ? { ...cat, active } : cat,
      ),
    }));
    fetch('/api/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'category', id, updates: { active } }),
    }).catch(() => {});
  };

  const handleAddCoupon = (coupon: Coupon) => {
    persistState((prev) => ({
      ...prev,
      coupons: [coupon, ...prev.coupons],
    }));
  };

  const handleToggleCoupon = (id: string, active: boolean) => {
    persistState((prev) => ({
      ...prev,
      coupons: prev.coupons.map((c) => (c.id === id ? { ...c, active } : c)),
    }));
    fetch('/api/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'coupon', id, updates: { active } }),
    }).catch(() => {});
  };

  const handleDeleteCoupon = (id: string) => {
    persistState((prev) => ({
      ...prev,
      coupons: prev.coupons.filter((c) => c.id !== id),
    }));
    fetch('/api/catalog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'coupon', id }),
    }).catch(() => {});
  };

  const handleAddCourier = (courier: Courier) => {
    persistState((prev) => ({
      ...prev,
      couriers: [courier, ...prev.couriers],
    }));
  };

  const handleUpdateCourier = (id: string, updates: Partial<Courier>) => {
    persistState((prev) => ({
      ...prev,
      couriers: prev.couriers.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
    fetch('/api/couriers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, updates }),
    }).catch(() => {});
  };

  const handleUpdateTechnicalSheet = (
    menuItemId: string,
    technicalSheet: TechnicalSheetIngredient[],
  ) => {
    persistState((prev) => ({
      ...prev,
      menuItems: prev.menuItems.map((item) =>
        item.id === menuItemId ? { ...item, technicalSheet } : item,
      ),
    }));
    fetch('/api/stock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_technical_sheet',
        menuItemId,
        technicalSheet,
      }),
    }).catch(() => {});
  };

  const handleAddIngredient = (
    ingredient: StockIngredient,
    movement?: StockMovement | null,
  ) => {
    persistState((prev) => ({
      ...prev,
      ingredients: [ingredient, ...prev.ingredients],
      stockMovements: movement
        ? [movement, ...prev.stockMovements]
        : prev.stockMovements,
    }));
  };

  const handleAdjustStock = async (
    ingredientId: string,
    movementType: 'entrada' | 'ajuste',
    quantity: number,
    reason: string,
  ) => {
    const now = new Date().toISOString();
    persistState((prev) => {
      const target = prev.ingredients.find((i) => i.id === ingredientId);
      if (!target) return prev;
      const previousQty = Number(target.currentQty.toFixed(4));
      const newQty =
        movementType === 'ajuste'
          ? Math.max(0, Number(quantity.toFixed(4)))
          : Math.max(0, Number((previousQty + quantity).toFixed(4)));
      const delta = Number(Math.abs(newQty - previousQty).toFixed(4));

      const movement: StockMovement = {
        id: `mov-adj-${Date.now()}`,
        ingredientId: target.id,
        ingredientName: target.name,
        type: movementType,
        quantity: delta,
        unit: target.unit,
        previousQty,
        newQty,
        reason,
        createdAt: now,
      };

      return {
        ...prev,
        ingredients: prev.ingredients.map((i) =>
          i.id === ingredientId ? { ...i, currentQty: newQty, updatedAt: now } : i,
        ),
        stockMovements: [movement, ...prev.stockMovements],
      };
    });

    await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'adjust_stock',
        ingredientId,
        movementType,
        quantity,
        reason,
      }),
    }).catch(() => {});
  };

  const activeNav = NAV_ITEMS.find((item) => item.id === activeModule);

  const sidebarContent = (
    <div className="flex flex-col h-full w-64 bg-white dark:bg-[#13151c] border-r border-slate-200 dark:border-slate-800">
      <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setActiveModule('visao_base');
            setMobileMenuOpen(false);
          }}
          className="inline-flex items-center gap-2.5 text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          <span className="w-6 h-6 rounded-md bg-brand-600 text-white text-xs font-extrabold flex items-center justify-center">
            P
          </span>
          <span>PedidoFácil</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Fechar menu"
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Módulos do sistema">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveModule(item.id);
                setMobileMenuOpen(false);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-400'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <button
          type="button"
          onClick={handleToggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <span>{isDark ? 'Tema Escuro' : 'Tema Claro'}</span>
          {isDark ? (
            <Moon className="w-4 h-4 text-slate-400" aria-hidden="true" />
          ) : (
            <Sun className="w-4 h-4 text-slate-600" aria-hidden="true" />
          )}
        </button>

        <div className="px-1 text-xs">
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
            {state.store.name}
          </p>
          <p className="text-slate-500 dark:text-slate-400 truncate">
            {state.store.openingHours}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f7f7f9] dark:bg-[#0c0d11] text-slate-900 dark:text-slate-100">
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-[#13151c] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu lateral"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Localização" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                PedidoFácil
              </span>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNav?.label}
              </span>
            </nav>
          </div>

          <button
            type="button"
            onClick={handleToggleStoreOpen}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              state.store.isOpen
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
            }`}
          >
            {state.store.isOpen ? 'Loja Aberta' : 'Loja Fechada'}
          </button>
        </header>

        <main className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto">
          {activeModule === 'visao_base' ? (
            <StageOneBase
              state={state}
              onUpdateStore={handleUpdateStore}
              onToggleStoreOpen={handleToggleStoreOpen}
              onSelectModule={setActiveModule}
            />
          ) : activeModule === 'cardapio_digital' ? (
            <DigitalMenuSection
              state={state}
              onOrderCreated={handleOrderCreated}
            />
          ) : activeModule === 'gestor_pedidos' ? (
            <OrdersManagerSection
              state={state}
              onOrderCreated={handleOrderCreated}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          ) : activeModule === 'whatsapp_evolution' ? (
            <WhatsappEvolutionSection
              state={state}
              onUpdateEvolution={handleUpdateEvolution}
              onAppendLogs={handleAppendWhatsappLogs}
              onOrderCreatedFromBot={(order, stockMovements, ingredients) =>
                handleOrderCreated(order, { stockMovements, ingredients })
              }
              onOpenOrders={() => setActiveModule('gestor_pedidos')}
            />
          ) : activeModule === 'catalogo_cupons' ? (
            <CatalogCouponsSection
              state={state}
              onAddMenuItem={handleAddMenuItem}
              onUpdateMenuItem={handleUpdateMenuItem}
              onDeleteMenuItem={handleDeleteMenuItem}
              onAddCategory={handleAddCategory}
              onToggleCategory={handleToggleCategory}
              onAddCoupon={handleAddCoupon}
              onToggleCoupon={handleToggleCoupon}
              onDeleteCoupon={handleDeleteCoupon}
              onOpenTechnicalSheet={() => setActiveModule('estoque_ficha')}
            />
          ) : activeModule === 'estoque_ficha' ? (
            <StockTechnicalSheetSection
              state={state}
              onUpdateTechnicalSheet={handleUpdateTechnicalSheet}
              onAddIngredient={handleAddIngredient}
              onAdjustStock={handleAdjustStock}
            />
          ) : (
            <CouriersReportsSection
              state={state}
              onAddCourier={handleAddCourier}
              onUpdateCourier={handleUpdateCourier}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          )}
        </main>
      </div>
    </div>
  );
}
