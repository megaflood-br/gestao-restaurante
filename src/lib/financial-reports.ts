import { PAYMENT_METHOD_LABEL, ORDER_SOURCE_LABEL } from '@/lib/formatters';
import { calculateItemCmv } from '@/lib/stock-engine';
import { DEFAULT_STORE_TIMEZONE } from '@/lib/store-hours';
import type {
  DeliveryStoreState,
  MenuItem,
  Order,
  OrderSource,
  PaymentMethod,
  StockIngredient,
} from '@/types/delivery';

export type FinancialReportGranularity = 'overview' | 'daily' | 'weekly' | 'monthly';
export type DailyWindowOption = 7 | 14 | 30;
export type WeeklyWindowOption = 4 | 8 | 12;
export type MonthlyWindowOption = 3 | 6 | 12;

export interface FinancialPeriodPoint {
  key: string;
  label: string;
  fullLabel: string;
  ordersRevenue: number;
  manualInflows: number;
  totalRevenue: number;
  costsTotal: number;
  netResult: number;
  ordersCount: number;
  avgTicket: number;
  cardapioRevenue: number;
  whatsappRevenue: number;
  balcaoRevenue: number;
  isPeak: boolean;
}

export interface FinancialGranularitySummary {
  totalRevenue: number;
  ordersRevenue: number;
  manualInflows: number;
  costsTotal: number;
  netResult: number;
  netMarginPct: number;
  ordersCount: number;
  avgTicket: number;
  avgPerPeriod: number;
  peakLabel: string;
  peakRevenue: number;
  deltaPct: number | null;
}

export interface ChannelMixPoint {
  source: OrderSource;
  label: string;
  ordersCount: number;
  revenue: number;
  sharePct: number;
}

export interface PaymentMixPoint {
  method: PaymentMethod;
  label: string;
  ordersCount: number;
  revenue: number;
  sharePct: number;
}

export interface FinancialReportsBundle {
  referenceDateKey: string;
  dailySeries: FinancialPeriodPoint[];
  weeklySeries: FinancialPeriodPoint[];
  monthlySeries: FinancialPeriodPoint[];
  dailySummary: FinancialGranularitySummary;
  weeklySummary: FinancialGranularitySummary;
  monthlySummary: FinancialGranularitySummary;
  channelMix: ChannelMixPoint[];
  paymentMix: PaymentMixPoint[];
}

const MONTH_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const MONTH_FULL_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

function formatDateKeyInTimezone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback below
  }
  return date.toISOString().slice(0, 10);
}

function parseDateKeyToUtcNoon(dateKey: string): Date {
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr) || 2026;
  const m = (Number(mStr) || 1) - 1;
  const d = Number(dStr) || 1;
  return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const dt = parseDateKeyToUtcNoon(dateKey);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function getMondayWeekKey(dateKey: string): string {
  const dt = parseDateKeyToUtcNoon(dateKey);
  const jsDay = dt.getUTCDay(); // 0=Dom..6=Sáb
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysToDateKey(dateKey, diffToMonday);
}

function formatShortDayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

function formatFullDayLabel(dateKey: string): string {
  const dt = parseDateKeyToUtcNoon(dateKey);
  const [y, m, d] = dateKey.split('-');
  const wd = WEEKDAY_SHORT_PT[dt.getUTCDay()] ?? '';
  return `${d}/${m}/${y} · ${wd}`;
}

function getOrderEstimatedCmv(
  order: Order,
  menuItems: MenuItem[],
  ingredients: StockIngredient[],
): number {
  let cmv = 0;
  for (const item of order.items) {
    const dish = menuItems.find((m) => m.id === item.menuItemId);
    if (dish && dish.technicalSheet && dish.technicalSheet.length > 0) {
      cmv += calculateItemCmv(dish, ingredients) * item.quantity;
    } else {
      cmv += item.totalPrice * 0.32;
    }
  }
  return round2(cmv);
}

interface BucketAccumulator {
  key: string;
  label: string;
  fullLabel: string;
  ordersRevenue: number;
  manualInflows: number;
  costsTotal: number;
  ordersCount: number;
  cardapioRevenue: number;
  whatsappRevenue: number;
  balcaoRevenue: number;
}

function finalizeSeries(
  buckets: BucketAccumulator[],
): { series: FinancialPeriodPoint[]; summary: FinancialGranularitySummary } {
  let maxRevenue = 0;
  for (const b of buckets) {
    const rev = b.ordersRevenue + b.manualInflows;
    if (rev > maxRevenue) maxRevenue = rev;
  }

  const series: FinancialPeriodPoint[] = buckets.map((b) => {
    const ordersRevenue = round2(b.ordersRevenue);
    const manualInflows = round2(b.manualInflows);
    const totalRevenue = round2(ordersRevenue + manualInflows);
    const costsTotal = round2(b.costsTotal);
    const netResult = round2(totalRevenue - costsTotal);
    const avgTicket =
      b.ordersCount > 0 ? round2(ordersRevenue / b.ordersCount) : 0;

    return {
      key: b.key,
      label: b.label,
      fullLabel: b.fullLabel,
      ordersRevenue,
      manualInflows,
      totalRevenue,
      costsTotal,
      netResult,
      ordersCount: b.ordersCount,
      avgTicket,
      cardapioRevenue: round2(b.cardapioRevenue),
      whatsappRevenue: round2(b.whatsappRevenue),
      balcaoRevenue: round2(b.balcaoRevenue),
      isPeak: maxRevenue > 0 && Math.abs(totalRevenue - maxRevenue) < 0.01,
    };
  });

  const ordersRevenue = round2(
    series.reduce((sum, p) => sum + p.ordersRevenue, 0),
  );
  const manualInflows = round2(
    series.reduce((sum, p) => sum + p.manualInflows, 0),
  );
  const totalRevenue = round2(ordersRevenue + manualInflows);
  const costsTotal = round2(series.reduce((sum, p) => sum + p.costsTotal, 0));
  const netResult = round2(totalRevenue - costsTotal);
  const netMarginPct =
    totalRevenue > 0 ? round2((netResult / totalRevenue) * 100) : 0;
  const ordersCount = series.reduce((sum, p) => sum + p.ordersCount, 0);
  const avgTicket = ordersCount > 0 ? round2(ordersRevenue / ordersCount) : 0;
  const avgPerPeriod =
    series.length > 0 ? round2(totalRevenue / series.length) : 0;

  const peakPoint =
    series.reduce<FinancialPeriodPoint | null>(
      (best, cur) =>
        !best || cur.totalRevenue > best.totalRevenue ? cur : best,
      null,
    ) ?? null;

  let deltaPct: number | null = null;
  if (series.length >= 2) {
    const current = series[series.length - 1]?.totalRevenue ?? 0;
    const previous = series[series.length - 2]?.totalRevenue ?? 0;
    if (previous > 0) {
      deltaPct = round2(((current - previous) / previous) * 100);
    }
  }

  return {
    series,
    summary: {
      totalRevenue,
      ordersRevenue,
      manualInflows,
      costsTotal,
      netResult,
      netMarginPct,
      ordersCount,
      avgTicket,
      avgPerPeriod,
      peakLabel:
        peakPoint && peakPoint.totalRevenue > 0 ? peakPoint.fullLabel : '—',
      peakRevenue: peakPoint ? peakPoint.totalRevenue : 0,
      deltaPct,
    },
  };
}

export function buildFinancialReportsData(
  state: DeliveryStoreState,
  options?: {
    referenceDate?: Date;
    dailyWindow?: DailyWindowOption;
    weeklyWindow?: WeeklyWindowOption;
    monthlyWindow?: MonthlyWindowOption;
  },
): FinancialReportsBundle {
  const timeZone = state.store.timezone || DEFAULT_STORE_TIMEZONE;
  const dailyWindow = options?.dailyWindow ?? 14;
  const weeklyWindow = options?.weeklyWindow ?? 8;
  const monthlyWindow = options?.monthlyWindow ?? 6;

  const validOrders = (state.orders ?? []).filter(
    (o) => o.status !== 'cancelado',
  );
  const financialEntries = state.financialEntries ?? [];

  const todayKey = formatDateKeyInTimezone(
    options?.referenceDate ?? new Date(),
    timeZone,
  );
  let latestDataKey = todayKey;
  for (const o of validOrders) {
    const dt = new Date(o.createdAt);
    if (!Number.isFinite(dt.getTime())) continue;
    const k = formatDateKeyInTimezone(dt, timeZone);
    if (k > latestDataKey) latestDataKey = k;
  }
  for (const e of financialEntries) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date > latestDataKey) {
      latestDataKey = e.date;
    }
  }

  const normalizedOrders = validOrders
    .map((order) => {
      const dt = new Date(order.createdAt);
      if (!Number.isFinite(dt.getTime())) return null;
      const dateKey = formatDateKeyInTimezone(dt, timeZone);
      const weekKey = getMondayWeekKey(dateKey);
      const monthKey = dateKey.slice(0, 7);
      const cmv = getOrderEstimatedCmv(
        order,
        state.menuItems,
        state.ingredients,
      );
      return { order, dateKey, weekKey, monthKey, cmv };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const normalizedEntries = financialEntries.map((entry) => {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      ? entry.date
      : todayKey;
    return {
      entry,
      dateKey,
      weekKey: getMondayWeekKey(dateKey),
      monthKey: dateKey.slice(0, 7),
    };
  });

  // 1. Daily Series
  const dailyBuckets: BucketAccumulator[] = [];
  const dailyMap = new Map<string, BucketAccumulator>();
  for (let i = dailyWindow - 1; i >= 0; i--) {
    const key = addDaysToDateKey(latestDataKey, -i);
    const acc: BucketAccumulator = {
      key,
      label: formatShortDayMonth(key),
      fullLabel: formatFullDayLabel(key),
      ordersRevenue: 0,
      manualInflows: 0,
      costsTotal: 0,
      ordersCount: 0,
      cardapioRevenue: 0,
      whatsappRevenue: 0,
      balcaoRevenue: 0,
    };
    dailyBuckets.push(acc);
    dailyMap.set(key, acc);
  }

  for (const item of normalizedOrders) {
    const bucket = dailyMap.get(item.dateKey);
    if (!bucket) continue;
    bucket.ordersRevenue += item.order.total;
    bucket.costsTotal += item.cmv;
    bucket.ordersCount += 1;
    if (item.order.source === 'cardapio') bucket.cardapioRevenue += item.order.total;
    else if (item.order.source === 'whatsapp') bucket.whatsappRevenue += item.order.total;
    else bucket.balcaoRevenue += item.order.total;
  }

  for (const item of normalizedEntries) {
    const bucket = dailyMap.get(item.dateKey);
    if (!bucket) continue;
    if (item.entry.type === 'entrada') {
      bucket.manualInflows += item.entry.amount;
    } else {
      bucket.costsTotal += item.entry.amount;
    }
  }

  const dailyFinal = finalizeSeries(dailyBuckets);

  // 2. Weekly Series (Monday..Sunday)
  const currentMondayKey = getMondayWeekKey(latestDataKey);
  const weeklyBuckets: BucketAccumulator[] = [];
  const weeklyMap = new Map<string, BucketAccumulator>();
  for (let w = weeklyWindow - 1; w >= 0; w--) {
    const weekStart = addDaysToDateKey(currentMondayKey, -w * 7);
    const weekEnd = addDaysToDateKey(weekStart, 6);
    const acc: BucketAccumulator = {
      key: weekStart,
      label: `Sem ${formatShortDayMonth(weekStart)}`,
      fullLabel: `${formatShortDayMonth(weekStart)} a ${formatShortDayMonth(weekEnd)}`,
      ordersRevenue: 0,
      manualInflows: 0,
      costsTotal: 0,
      ordersCount: 0,
      cardapioRevenue: 0,
      whatsappRevenue: 0,
      balcaoRevenue: 0,
    };
    weeklyBuckets.push(acc);
    weeklyMap.set(weekStart, acc);
  }

  for (const item of normalizedOrders) {
    const bucket = weeklyMap.get(item.weekKey);
    if (!bucket) continue;
    bucket.ordersRevenue += item.order.total;
    bucket.costsTotal += item.cmv;
    bucket.ordersCount += 1;
    if (item.order.source === 'cardapio') bucket.cardapioRevenue += item.order.total;
    else if (item.order.source === 'whatsapp') bucket.whatsappRevenue += item.order.total;
    else bucket.balcaoRevenue += item.order.total;
  }

  for (const item of normalizedEntries) {
    const bucket = weeklyMap.get(item.weekKey);
    if (!bucket) continue;
    if (item.entry.type === 'entrada') {
      bucket.manualInflows += item.entry.amount;
    } else {
      bucket.costsTotal += item.entry.amount;
    }
  }

  const weeklyFinal = finalizeSeries(weeklyBuckets);

  // 3. Monthly Series
  const [refYearStr, refMonthStr] = latestDataKey.split('-');
  const refYear = Number(refYearStr) || 2026;
  const refMonthIdx = (Number(refMonthStr) || 11) - 1;

  const monthlyBuckets: BucketAccumulator[] = [];
  const monthlyMap = new Map<string, BucketAccumulator>();
  for (let m = monthlyWindow - 1; m >= 0; m--) {
    const dt = new Date(Date.UTC(refYear, refMonthIdx - m, 1, 12, 0, 0));
    const y = dt.getUTCFullYear();
    const mIdx = dt.getUTCMonth();
    const key = `${y}-${pad2(mIdx + 1)}`;
    const acc: BucketAccumulator = {
      key,
      label: `${MONTH_SHORT_PT[mIdx]}/${String(y).slice(-2)}`,
      fullLabel: `${MONTH_FULL_PT[mIdx]} ${y}`,
      ordersRevenue: 0,
      manualInflows: 0,
      costsTotal: 0,
      ordersCount: 0,
      cardapioRevenue: 0,
      whatsappRevenue: 0,
      balcaoRevenue: 0,
    };
    monthlyBuckets.push(acc);
    monthlyMap.set(key, acc);
  }

  for (const item of normalizedOrders) {
    const bucket = monthlyMap.get(item.monthKey);
    if (!bucket) continue;
    bucket.ordersRevenue += item.order.total;
    bucket.costsTotal += item.cmv;
    bucket.ordersCount += 1;
    if (item.order.source === 'cardapio') bucket.cardapioRevenue += item.order.total;
    else if (item.order.source === 'whatsapp') bucket.whatsappRevenue += item.order.total;
    else bucket.balcaoRevenue += item.order.total;
  }

  for (const item of normalizedEntries) {
    const bucket = monthlyMap.get(item.monthKey);
    if (!bucket) continue;
    if (item.entry.type === 'entrada') {
      bucket.manualInflows += item.entry.amount;
    } else {
      bucket.costsTotal += item.entry.amount;
    }
  }

  const monthlyFinal = finalizeSeries(monthlyBuckets);

  // 4. Overall Channel & Payment Mix across valid orders in Monthly Window
  const activeMonthKeys = new Set(monthlyBuckets.map((b) => b.key));
  const windowOrders = normalizedOrders
    .filter((item) => activeMonthKeys.has(item.monthKey))
    .map((item) => item.order);

  const totalWindowOrdersRev = windowOrders.reduce((sum, o) => sum + o.total, 0);

  const channelList: OrderSource[] = ['cardapio', 'whatsapp', 'balcao'];
  const channelMix: ChannelMixPoint[] = channelList.map((source) => {
    const matching = windowOrders.filter((o) => o.source === source);
    const revenue = round2(matching.reduce((sum, o) => sum + o.total, 0));
    return {
      source,
      label: ORDER_SOURCE_LABEL[source],
      ordersCount: matching.length,
      revenue,
      sharePct:
        totalWindowOrdersRev > 0
          ? round2((revenue / totalWindowOrdersRev) * 100)
          : 0,
    };
  });

  const paymentList: PaymentMethod[] = [
    'pix',
    'cartao_entrega',
    'dinheiro',
    'pagamento_online',
  ];
  const paymentMix: PaymentMixPoint[] = paymentList.map((method) => {
    const matching = windowOrders.filter((o) => o.paymentMethod === method);
    const revenue = round2(matching.reduce((sum, o) => sum + o.total, 0));
    return {
      method,
      label: PAYMENT_METHOD_LABEL[method],
      ordersCount: matching.length,
      revenue,
      sharePct:
        totalWindowOrdersRev > 0
          ? round2((revenue / totalWindowOrdersRev) * 100)
          : 0,
    };
  });

  return {
    referenceDateKey: latestDataKey,
    dailySeries: dailyFinal.series,
    weeklySeries: weeklyFinal.series,
    monthlySeries: monthlyFinal.series,
    dailySummary: dailyFinal.summary,
    weeklySummary: weeklyFinal.summary,
    monthlySummary: monthlyFinal.summary,
    channelMix,
    paymentMix,
  };
}
