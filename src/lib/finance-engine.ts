import { calculateItemCmv } from '@/lib/stock-engine';
import type {
  DeliveryStoreState,
  FinancialCategory,
  RecurringExpense,
  RecurringFrequency,
} from '@/types/delivery';

export const FINANCIAL_CATEGORY_LABEL: Record<FinancialCategory, string> = {
  vendas_extras: 'Vendas / Entradas Extras',
  insumos_compras: 'Compra de Insumos e Mercado',
  aluguel_infra: 'Aluguel e Estrutura',
  utilidades: 'Água, Luz, Gás e Telefone',
  equipe_entregas: 'Equipe e Entregadores',
  marketing_taxas: 'Marketing, Taxas e Contabilidade',
  outros: 'Outros Lançamentos',
};

export const RECURRING_FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  mensal: 'Mensal',
  quinzenal: 'Quinzenal (2x/mês)',
  semanal: 'Semanal (~4,3x/mês)',
};

export function getMonthlyRecurringMultiplier(freq: RecurringFrequency): number {
  if (freq === 'quinzenal') return 2;
  if (freq === 'semanal') return 4.33;
  return 1;
}

export function getRecurringMonthlyEquivalent(exp: RecurringExpense): number {
  return Number((exp.amount * getMonthlyRecurringMultiplier(exp.frequency)).toFixed(2));
}

export function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface CashFlowSummary {
  validOrdersCount: number;
  ordersRevenue: number;
  estimatedOrdersCmv: number;
  manualInflows: number;
  manualOutflows: number;
  totalRealizedInflows: number;
  totalRealizedOutflows: number;
  realizedNetBalance: number;
  activeRecurringMonthlyTotal: number;
  alreadyLaunchedRecurringTotal: number;
  pendingRecurringTotal: number;
  pendingRecurringCount: number;
  avgTicket: number;
  dailyRevenueRate: number;
  projectedRevenue30d: number;
  projectedConservative30d: number;
  projectedOptimistic30d: number;
  projectedVariableCost30d: number;
  projectedTotalCosts30d: number;
  projectedNetProfit30d: number;
  contributionMarginPct: number;
  breakEvenRevenueMonthly: number;
  breakEvenOrdersNeeded: number;
  revenueProgressToBreakEvenPct: number;
}

export function computeCashFlowSummary(
  state: DeliveryStoreState,
  monthKey = getCurrentMonthKey(),
): CashFlowSummary {
  const validOrders = state.orders.filter((o) => o.status !== 'cancelado');
  const validOrdersCount = validOrders.length;
  const ordersRevenue = Number(
    validOrders.reduce((sum, o) => sum + o.total, 0).toFixed(2),
  );

  // Calculate CMV from technical sheets across valid orders
  let estimatedOrdersCmv = 0;
  for (const order of validOrders) {
    for (const orderItem of order.items) {
      const menuItem = state.menuItems.find((m) => m.id === orderItem.menuItemId);
      if (menuItem && menuItem.technicalSheet && menuItem.technicalSheet.length > 0) {
        const unitCmv = calculateItemCmv(menuItem, state.ingredients);
        estimatedOrdersCmv += unitCmv * orderItem.quantity;
      } else {
        // Fallback 32% food cost estimate when a dish has no technical sheet yet
        estimatedOrdersCmv += orderItem.totalPrice * 0.32;
      }
    }
  }
  estimatedOrdersCmv = Number(estimatedOrdersCmv.toFixed(2));

  const manualInflows = Number(
    state.financialEntries
      .filter((e) => e.type === 'entrada')
      .reduce((sum, e) => sum + e.amount, 0)
      .toFixed(2),
  );

  const manualOutflows = Number(
    state.financialEntries
      .filter((e) => e.type === 'custo')
      .reduce((sum, e) => sum + e.amount, 0)
      .toFixed(2),
  );

  const totalRealizedInflows = Number((ordersRevenue + manualInflows).toFixed(2));
  const totalRealizedOutflows = Number(
    (estimatedOrdersCmv + manualOutflows).toFixed(2),
  );
  const realizedNetBalance = Number(
    (totalRealizedInflows - totalRealizedOutflows).toFixed(2),
  );

  const activeRecurring = state.recurringExpenses.filter((r) => r.active);
  const activeRecurringMonthlyTotal = Number(
    activeRecurring
      .reduce((sum, r) => sum + getRecurringMonthlyEquivalent(r), 0)
      .toFixed(2),
  );

  const alreadyLaunchedRecurringTotal = Number(
    activeRecurring
      .filter((r) => r.lastLaunchedMonth === monthKey)
      .reduce((sum, r) => sum + getRecurringMonthlyEquivalent(r), 0)
      .toFixed(2),
  );

  const pendingRecurringItems = activeRecurring.filter(
    (r) => r.lastLaunchedMonth !== monthKey,
  );
  const pendingRecurringTotal = Number(
    pendingRecurringItems
      .reduce((sum, r) => sum + getRecurringMonthlyEquivalent(r), 0)
      .toFixed(2),
  );

  const avgTicket =
    validOrdersCount > 0
      ? Number((ordersRevenue / validOrdersCount).toFixed(2))
      : 35;

  // Estimate active observation span in days (at least 1 day, capped cleanly to observed span)
  const orderDates = validOrders
    .map((o) => new Date(o.createdAt).getTime())
    .filter((t) => Number.isFinite(t));

  let observedDays = 1;
  if (orderDates.length >= 2) {
    const minT = Math.min(...orderDates);
    const maxT = Math.max(...orderDates);
    const diffDays = (maxT - minT) / (24 * 60 * 60 * 1000);
    observedDays = Math.max(1, Math.min(30, Math.ceil(diffDays) || 1));
  }

  // Daily run-rate blends observed orders pace + manual inflows spread smoothly
  const dailyOrdersRate = ordersRevenue / observedDays;
  const dailyManualInflowRate = manualInflows / Math.max(7, observedDays);
  const dailyRevenueRate = Number((dailyOrdersRate + dailyManualInflowRate).toFixed(2));

  const projectedRevenue30d = Number((dailyRevenueRate * 30).toFixed(2));
  const projectedConservative30d = Number((projectedRevenue30d * 0.85).toFixed(2));
  const projectedOptimistic30d = Number((projectedRevenue30d * 1.2).toFixed(2));

  const cmvRatio =
    ordersRevenue > 0
      ? Math.min(0.85, Math.max(0.15, estimatedOrdersCmv / ordersRevenue))
      : 0.34;
  const contributionMarginPct = Number(((1 - cmvRatio) * 100).toFixed(1));

  // Non-recurring manual costs also contribute to monthly operating costs
  const nonRecurringManualCosts = state.financialEntries
    .filter((e) => e.type === 'custo' && !e.recurringExpenseId)
    .reduce((sum, e) => sum + e.amount, 0);

  const projectedVariableCost30d = Number(
    (projectedRevenue30d * cmvRatio).toFixed(2),
  );
  const projectedTotalCosts30d = Number(
    (
      projectedVariableCost30d +
      activeRecurringMonthlyTotal +
      nonRecurringManualCosts
    ).toFixed(2),
  );
  const projectedNetProfit30d = Number(
    (projectedRevenue30d - projectedTotalCosts30d).toFixed(2),
  );

  const fixedCostsForBreakEven =
    activeRecurringMonthlyTotal + nonRecurringManualCosts;
  const marginFraction = Math.max(0.1, 1 - cmvRatio);
  const breakEvenRevenueMonthly = Number(
    (fixedCostsForBreakEven / marginFraction).toFixed(2),
  );
  const breakEvenOrdersNeeded =
    avgTicket > 0 ? Math.ceil(breakEvenRevenueMonthly / avgTicket) : 0;

  const revenueProgressToBreakEvenPct =
    breakEvenRevenueMonthly > 0
      ? Math.min(
          100,
          Number(((totalRealizedInflows / breakEvenRevenueMonthly) * 100).toFixed(1)),
        )
      : 100;

  return {
    validOrdersCount,
    ordersRevenue,
    estimatedOrdersCmv,
    manualInflows,
    manualOutflows,
    totalRealizedInflows,
    totalRealizedOutflows,
    realizedNetBalance,
    activeRecurringMonthlyTotal,
    alreadyLaunchedRecurringTotal,
    pendingRecurringTotal,
    pendingRecurringCount: pendingRecurringItems.length,
    avgTicket,
    dailyRevenueRate,
    projectedRevenue30d,
    projectedConservative30d,
    projectedOptimistic30d,
    projectedVariableCost30d,
    projectedTotalCosts30d,
    projectedNetProfit30d,
    contributionMarginPct,
    breakEvenRevenueMonthly,
    breakEvenOrdersNeeded,
    revenueProgressToBreakEvenPct,
  };
}
