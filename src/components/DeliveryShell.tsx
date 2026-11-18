'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bike,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  PackageCheck,
  Settings,
  Sun,
  Tags,
  Trash2,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  applyOrderStockDeduction,
  applyWasteStockDeduction,
  reverseOrderStockDeduction,
} from '@/lib/stock-engine';
import { getCurrentMonthKey } from '@/lib/finance-engine';
import { getStoreAvailability } from '@/lib/store-hours';
import { DigitalMenuSection } from '@/components/DigitalMenuSection';
import { OrdersManagerSection } from '@/components/OrdersManagerSection';
import { WhatsappEvolutionSection } from '@/components/WhatsappEvolutionSection';
import { CatalogCouponsSection } from '@/components/CatalogCouponsSection';
import { StockTechnicalSheetSection } from '@/components/StockTechnicalSheetSection';
import { CouriersReportsSection } from '@/components/CouriersReportsSection';
import { CostsFinanceSection } from '@/components/CostsFinanceSection';
import { ChecklistsSection } from '@/components/ChecklistsSection';
import {
  WasteControlSection,
  type RegisterWastePayload,
} from '@/components/WasteControlSection';
import {
  SettingsSection,
  type SettingsTabId,
} from '@/components/SettingsSection';
import type { OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';
import type {
  ChecklistRun,
  ChecklistTemplate,
  Coupon,
  Courier,
  CourierSettlement,
  DeliveryModuleId,
  DeliveryStoreState,
  EvolutionConfig,
  FinancialEntry,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  RecurringExpense,
  StockIngredient,
  StockMovement,
  StoreSettings,
  TechnicalSheetIngredient,
  WhatsappLog,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';

interface NavGroup {
  groupLabel: string;
  items: Array<{
    id: DeliveryModuleId;
    label: string;
    icon: typeof ClipboardList;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupLabel: 'Operação',
    items: [
      { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
      { id: 'atendimento', label: 'Atendimento IA', icon: MessageSquare },
      { id: 'entregadores', label: 'Entregadores', icon: Bike },
      { id: 'checklists', label: 'Checklists Equipe', icon: ListChecks },
      { id: 'desperdicios', label: 'Desperdícios', icon: Trash2 },
    ],
  },
  {
    groupLabel: 'Cardápio e Loja',
    items: [
      { id: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed },
      { id: 'promocoes', label: 'Promoções e Cupons', icon: Tags },
      { id: 'estoque', label: 'Estoque e Fichas', icon: PackageCheck },
      { id: 'vitrine', label: 'Cardápio Online', icon: ExternalLink },
    ],
  },
  {
    groupLabel: 'Análise e Ajustes',
    items: [
      { id: 'desempenho', label: 'Desempenho', icon: BarChart3 },
      { id: 'custos', label: 'Custos e Fluxo', icon: Wallet },
      { id: 'configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
];

export function DeliveryShell() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [activeModule, setActiveModule] =
    useState<DeliveryModuleId>('pedidos');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('loja');
  const [isDark, setIsDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }

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
                ...INITIAL_DELIVERY_STATE.store,
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
              financialEntries: Array.isArray(parsed.financialEntries)
                ? parsed.financialEntries
                : INITIAL_DELIVERY_STATE.financialEntries,
              recurringExpenses: Array.isArray(parsed.recurringExpenses)
                ? parsed.recurringExpenses
                : INITIAL_DELIVERY_STATE.recurringExpenses,
              courierSettlements: Array.isArray(parsed.courierSettlements)
                ? parsed.courierSettlements
                : INITIAL_DELIVERY_STATE.courierSettlements,
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

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as DeliveryStoreState;
        if (parsed.store && parsed.orders) {
          setState({
            ...INITIAL_DELIVERY_STATE,
            ...parsed,
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
          });
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

  const handleDeleteCourier = (id: string) => {
    persistState((prev) => ({
      ...prev,
      couriers: prev.couriers.filter((c) => c.id !== id),
      orders: prev.orders.map((order) =>
        order.courierId === id ? { ...order, courierId: undefined } : order,
      ),
    }));
    fetch('/api/couriers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const handleAddCourierSettlement = (settlement: CourierSettlement) => {
    persistState((prev) => ({
      ...prev,
      courierSettlements: [settlement, ...prev.courierSettlements],
    }));
  };

  const handleUpdateCourierSettlement = (
    id: string,
    updates: Partial<CourierSettlement>,
  ) => {
    persistState((prev) => ({
      ...prev,
      courierSettlements: prev.courierSettlements.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    }));
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

  const handleAddFinancialEntry = (entry: FinancialEntry) => {
    persistState((prev) => ({
      ...prev,
      financialEntries: [entry, ...prev.financialEntries],
    }));
  };

  const handleDeleteFinancialEntry = (id: string) => {
    persistState((prev) => ({
      ...prev,
      financialEntries: prev.financialEntries.filter((e) => e.id !== id),
    }));
    fetch('/api/finance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'entry', id }),
    }).catch(() => {});
  };

  const handleAddRecurringExpense = (recurring: RecurringExpense) => {
    persistState((prev) => ({
      ...prev,
      recurringExpenses: [recurring, ...prev.recurringExpenses],
    }));
  };

  const handleUpdateRecurringExpense = (
    id: string,
    updates: Partial<RecurringExpense>,
  ) => {
    persistState((prev) => ({
      ...prev,
      recurringExpenses: prev.recurringExpenses.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      ),
    }));
    fetch('/api/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, updates }),
    }).catch(() => {});
  };

  const handleDeleteRecurringExpense = (id: string) => {
    persistState((prev) => ({
      ...prev,
      recurringExpenses: prev.recurringExpenses.filter((r) => r.id !== id),
    }));
    fetch('/api/finance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'recurring', id }),
    }).catch(() => {});
  };

  const handleLaunchRecurringExpenses = async (options: {
    recurringId?: string;
    launchAllPending?: boolean;
  }) => {
    const monthKey = getCurrentMonthKey();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    persistState((prev) => {
      const targets = options.launchAllPending
        ? prev.recurringExpenses.filter(
            (r) => r.active && r.lastLaunchedMonth !== monthKey,
          )
        : prev.recurringExpenses.filter((r) => r.id === options.recurringId);
      if (targets.length === 0) return prev;

      const launchedIds = new Set<string>();
      const created: FinancialEntry[] = targets.map((rec, idx) => {
        launchedIds.add(rec.id);
        return {
          id: `fin-rec-${rec.id}-${Date.now()}-${idx}`,
          type: 'custo',
          category: rec.category,
          description: `${rec.name} (${monthKey})`,
          amount: rec.amount,
          date: today,
          paymentMethod: 'Débito / Pix',
          recurringExpenseId: rec.id,
          notes: `Lançado a partir do gasto recorrente (venc. dia ${rec.dueDay})`,
          createdAt: now,
        };
      });

      return {
        ...prev,
        financialEntries: [...created, ...prev.financialEntries],
        recurringExpenses: prev.recurringExpenses.map((r) =>
          launchedIds.has(r.id) ? { ...r, lastLaunchedMonth: monthKey } : r,
        ),
      };
    });

    await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'launch_recurring',
        recurringId: options.recurringId,
        launchAllPending: options.launchAllPending,
        monthKey,
      }),
    }).catch(() => {});
  };

  const handleSaveChecklistTemplate = async (template: ChecklistTemplate) => {
    persistState((prev) => {
      const list = prev.checklistTemplates ?? [];
      const exists = list.some((t) => t.id === template.id);
      return {
        ...prev,
        checklistTemplates: exists
          ? list.map((t) => (t.id === template.id ? template : t))
          : [template, ...list],
      };
    });

    await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_template', template }),
    }).catch(() => {});
  };

  const handleToggleChecklistActive = async (templateId: string) => {
    const target = (state.checklistTemplates ?? []).find(
      (t) => t.id === templateId,
    );
    const nextActive = target ? !target.active : true;
    persistState((prev) => ({
      ...prev,
      checklistTemplates: (prev.checklistTemplates ?? []).map((t) =>
        t.id === templateId
          ? { ...t, active: !t.active, updatedAt: new Date().toISOString() }
          : t,
      ),
    }));

    await fetch('/api/checklists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_template',
        templateId,
        updates: { active: nextActive },
      }),
    }).catch(() => {});
  };

  const handleDeleteChecklistTemplate = async (templateId: string) => {
    persistState((prev) => ({
      ...prev,
      checklistTemplates: (prev.checklistTemplates ?? []).filter(
        (t) => t.id !== templateId,
      ),
    }));

    await fetch(`/api/checklists?templateId=${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  const handleSubmitChecklistRun = async (run: ChecklistRun) => {
    persistState((prev) => {
      const list = prev.checklistRuns ?? [];
      const exists = list.some((r) => r.id === run.id);
      return {
        ...prev,
        checklistRuns: exists
          ? list.map((r) => (r.id === run.id ? run : r))
          : [run, ...list],
      };
    });

    await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_run', run }),
    }).catch(() => {});
  };

  const handleRegisterWaste = async (payload: RegisterWastePayload) => {
    persistState((prev) => {
      const result = applyWasteStockDeduction({
        ...payload,
        menuItems: prev.menuItems,
        ingredients: prev.ingredients,
      });
      return {
        ...prev,
        ingredients: result.ingredients,
        stockMovements:
          result.newMovements.length > 0
            ? [...result.newMovements, ...prev.stockMovements]
            : prev.stockMovements,
        wasteLogs: [result.wasteLog, ...(prev.wasteLogs ?? [])],
      };
    });

    await fetch('/api/waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const pendingOrdersCount = state.orders.filter(
    (o) => o.status === 'pendente',
  ).length;
  const handoffChatsCount = (state.store.evolution.humanHandoffPhones ?? []).length;

  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((i) => i.id === activeModule),
  );
  const activeNav = activeGroup?.items.find((i) => i.id === activeModule);

  const customerMenuUrl = origin ? `${origin}/cardapio` : '/cardapio';

  const handleCopyCustomerLink = async () => {
    try {
      await navigator.clipboard.writeText(customerMenuUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const openSettingsAt = (tab: SettingsTabId = 'loja') => {
    setSettingsTab(tab);
    setActiveModule('configuracoes');
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full w-64 bg-white dark:bg-[#13151c] border-r border-slate-200 dark:border-slate-800">
      <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setActiveModule('pedidos');
            setMobileMenuOpen(false);
          }}
          className="inline-flex items-center gap-2.5 text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 min-w-0"
        >
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
          <span className="truncate">PedidoFácil</span>
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

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Menu principal">
        {NAV_GROUPS.map((group) => (
          <div key={group.groupLabel}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
              {group.groupLabel}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                const counter =
                  item.id === 'pedidos' && pendingOrdersCount > 0
                    ? pendingOrdersCount
                    : item.id === 'atendimento' && handoffChatsCount > 0
                      ? handoffChatsCount
                      : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-400'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {counter !== null && (
                      <span
                        className={`text-xs font-mono-tabular font-bold shrink-0 ${
                          isActive
                            ? 'text-brand-700 dark:text-brand-300'
                            : 'text-brand-600 dark:text-brand-400'
                        }`}
                      >
                        {counter}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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

        <button
          type="button"
          onClick={() => openSettingsAt('loja')}
          className="w-full text-left px-1 py-0.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-xs"
        >
          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
            {state.store.name}
          </p>
          <p className="text-slate-500 dark:text-slate-400 truncate">
            {state.store.openingHours}
          </p>
        </button>
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
              <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap hidden sm:inline">
                {activeGroup?.groupLabel}
              </span>
              <span className="text-slate-300 dark:text-slate-600 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNav?.label}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {(() => {
              const availability = getStoreAvailability(
                state.store,
                new Date(nowTick),
              );
              return (
                <button
                  type="button"
                  onClick={
                    availability.statusMode === 'closed_schedule'
                      ? () => openSettingsAt('loja')
                      : handleToggleStoreOpen
                  }
                  title={
                    availability.statusMode === 'closed_schedule'
                      ? `Fora do horário (${state.store.openingHours}). Clique para configurar horários.`
                      : 'Alternar abertura manual da loja'
                  }
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    availability.isOpen
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                      : availability.statusMode === 'closed_schedule'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                  }`}
                >
                  {availability.adminBadgeLabel}
                </button>
              );
            })()}
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto">
          {activeModule === 'pedidos' ? (
            <OrdersManagerSection
              state={state}
              onOrderCreated={handleOrderCreated}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          ) : activeModule === 'atendimento' ? (
            <WhatsappEvolutionSection
              state={state}
              onUpdateEvolution={handleUpdateEvolution}
              onAppendLogs={handleAppendWhatsappLogs}
              onOrderCreatedFromBot={(order, stockMovements, ingredients) =>
                handleOrderCreated(order, { stockMovements, ingredients })
              }
              onOpenOrders={() => setActiveModule('pedidos')}
              onOpenSettings={openSettingsAt}
            />
          ) : activeModule === 'entregadores' ? (
            <CouriersReportsSection
              mode="entregadores"
              state={state}
              onAddCourier={handleAddCourier}
              onUpdateCourier={handleUpdateCourier}
              onDeleteCourier={handleDeleteCourier}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onAddSettlement={handleAddCourierSettlement}
              onUpdateSettlement={handleUpdateCourierSettlement}
              onAddFinancialEntry={handleAddFinancialEntry}
              onAppendWhatsappLogs={handleAppendWhatsappLogs}
            />
          ) : activeModule === 'checklists' ? (
            <ChecklistsSection
              state={state}
              onSaveTemplate={handleSaveChecklistTemplate}
              onToggleTemplateActive={handleToggleChecklistActive}
              onDeleteTemplate={handleDeleteChecklistTemplate}
              onSubmitRun={handleSubmitChecklistRun}
            />
          ) : activeModule === 'desperdicios' ? (
            <WasteControlSection
              state={state}
              onRegisterWaste={handleRegisterWaste}
              onOpenStock={() => setActiveModule('estoque')}
            />
          ) : activeModule === 'cardapio' ? (
            <CatalogCouponsSection
              mode="cardapio"
              state={state}
              onAddMenuItem={handleAddMenuItem}
              onUpdateMenuItem={handleUpdateMenuItem}
              onDeleteMenuItem={handleDeleteMenuItem}
              onAddCategory={handleAddCategory}
              onToggleCategory={handleToggleCategory}
              onAddCoupon={handleAddCoupon}
              onToggleCoupon={handleToggleCoupon}
              onDeleteCoupon={handleDeleteCoupon}
              onOpenTechnicalSheet={() => setActiveModule('estoque')}
            />
          ) : activeModule === 'promocoes' ? (
            <CatalogCouponsSection
              mode="promocoes"
              state={state}
              onAddMenuItem={handleAddMenuItem}
              onUpdateMenuItem={handleUpdateMenuItem}
              onDeleteMenuItem={handleDeleteMenuItem}
              onAddCategory={handleAddCategory}
              onToggleCategory={handleToggleCategory}
              onAddCoupon={handleAddCoupon}
              onToggleCoupon={handleToggleCoupon}
              onDeleteCoupon={handleDeleteCoupon}
              onOpenTechnicalSheet={() => setActiveModule('estoque')}
            />
          ) : activeModule === 'estoque' ? (
            <StockTechnicalSheetSection
              state={state}
              onUpdateTechnicalSheet={handleUpdateTechnicalSheet}
              onAddIngredient={handleAddIngredient}
              onAdjustStock={handleAdjustStock}
            />
          ) : activeModule === 'vitrine' ? (
            <div className="space-y-5">
              <div className="p-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-white">
                      Link de Acesso do Cliente
                    </strong>{' '}
                    — compartilhe o endereço abaixo para seus clientes fazerem pedidos sem acessar o painel administrativo.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openSettingsAt('loja')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                    >
                      <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Trocar Capa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModule('cardapio')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                    >
                      Editar Cardápio
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModule('pedidos')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
                    >
                      Ver Pedidos
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <input
                    type="text"
                    readOnly
                    value={customerMenuUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link público do cardápio para o cliente"
                    className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyCustomerLink}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
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
                      href="/cardapio"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Abrir como Cliente</span>
                    </a>
                  </div>
                </div>
              </div>
              <DigitalMenuSection
                state={state}
                onOrderCreated={handleOrderCreated}
              />
            </div>
          ) : activeModule === 'desempenho' ? (
            <CouriersReportsSection
              mode="desempenho"
              state={state}
              onAddCourier={handleAddCourier}
              onUpdateCourier={handleUpdateCourier}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          ) : activeModule === 'custos' ? (
            <CostsFinanceSection
              state={state}
              onAddEntry={handleAddFinancialEntry}
              onDeleteEntry={handleDeleteFinancialEntry}
              onAddRecurring={handleAddRecurringExpense}
              onUpdateRecurring={handleUpdateRecurringExpense}
              onDeleteRecurring={handleDeleteRecurringExpense}
              onLaunchRecurring={handleLaunchRecurringExpenses}
            />
          ) : (
            <SettingsSection
              state={state}
              initialTab={settingsTab}
              onUpdateStore={handleUpdateStore}
              onToggleStoreOpen={handleToggleStoreOpen}
              onUpdateEvolution={handleUpdateEvolution}
              onOpenChatInbox={() => setActiveModule('atendimento')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
