import type {
  MenuCategory,
  MenuItem,
  StockIngredient,
  WasteLog,
  WasteTargetType,
} from '@/types/delivery';

export type WasteAnalyticsPeriod = '7d' | '30d' | 'all';
export type WasteAnalyticsMetric = 'cost' | 'count';
export type WasteAnalyticsTargetFilter = 'todos' | WasteTargetType;

export interface WeekdayWastePoint {
  weekdayIndex: number; // 1 (Seg) .. 7 (Dom)
  dayShort: string;
  dayFull: string;
  totalCost: number;
  occurrences: number;
  topItem: string;
  topCategory: string;
  isPeak: boolean;
  [categoryKey: string]: string | number | boolean;
}

export interface CategoryWastePoint {
  category: string;
  sourceKind: 'Insumos' | 'Pratos' | 'Misto';
  totalCost: number;
  occurrences: number;
  sharePct: number;
  topItem: string;
  color: string;
}

export interface WasteAnalyticsResult {
  filteredLogs: WasteLog[];
  weekdayData: WeekdayWastePoint[];
  categoryData: CategoryWastePoint[];
  stackedCategories: Array<{ name: string; color: string }>;
  summary: {
    totalCost: number;
    totalRecords: number;
    avgCostPerRecord: number;
    peakDayLabel: string;
    peakDayCost: number;
    topCategoryLabel: string;
    topCategoryCost: number;
  };
}

const WEEKDAY_ORDER: Array<{
  jsDay: number;
  weekdayIndex: number;
  dayShort: string;
  dayFull: string;
}> = [
  { jsDay: 1, weekdayIndex: 1, dayShort: 'Seg', dayFull: 'Segunda-feira' },
  { jsDay: 2, weekdayIndex: 2, dayShort: 'Ter', dayFull: 'Terça-feira' },
  { jsDay: 3, weekdayIndex: 3, dayShort: 'Qua', dayFull: 'Quarta-feira' },
  { jsDay: 4, weekdayIndex: 4, dayShort: 'Qui', dayFull: 'Quinta-feira' },
  { jsDay: 5, weekdayIndex: 5, dayShort: 'Sex', dayFull: 'Sexta-feira' },
  { jsDay: 6, weekdayIndex: 6, dayShort: 'Sáb', dayFull: 'Sábado' },
  { jsDay: 0, weekdayIndex: 7, dayShort: 'Dom', dayFull: 'Domingo' },
];

const CATEGORY_PALETTE = [
  '#dc2626', // Crimson
  '#d97706', // Amber
  '#2563eb', // Cobalt Blue
  '#0d9488', // Teal
  '#7c3aed', // Violet
  '#ea580c', // Deep Orange
  '#475569', // Slate
];

export function resolveWasteItemCategory(params: {
  log: WasteLog;
  ingredients: StockIngredient[];
  menuItems: MenuItem[];
  categories: MenuCategory[];
}): string {
  const { log, ingredients, menuItems, categories } = params;

  if (log.targetType === 'insumo') {
    const ing = ingredients.find((i) => i.id === log.targetId);
    if (ing?.category?.trim()) return ing.category.trim();
    return 'Outros Insumos';
  }

  const dish = menuItems.find((m) => m.id === log.targetId);
  if (dish) {
    const cat = categories.find((c) => c.id === dish.categoryId);
    if (cat?.name?.trim()) return cat.name.trim();
  }
  return 'Pratos Prontos';
}

export function buildWasteAnalytics(params: {
  wasteLogs: WasteLog[];
  ingredients: StockIngredient[];
  menuItems: MenuItem[];
  categories: MenuCategory[];
  period: WasteAnalyticsPeriod;
  targetFilter: WasteAnalyticsTargetFilter;
  metric: WasteAnalyticsMetric;
  referenceDate?: Date;
}): WasteAnalyticsResult {
  const {
    wasteLogs,
    ingredients,
    menuItems,
    categories,
    period,
    targetFilter,
    metric,
    referenceDate,
  } = params;

  const logs = wasteLogs ?? [];

  // Reference newest timestamp or today so historical seed + live entries work consistently
  const newestTs = logs.reduce((max, item) => {
    const t = new Date(item.createdAt).getTime();
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const nowTs = (referenceDate ?? new Date()).getTime();
  const anchorTs = Math.max(nowTs, newestTs);

  const cutoffMs =
    period === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : period === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : null;

  const filteredLogs = logs.filter((log) => {
    if (targetFilter !== 'todos' && log.targetType !== targetFilter) {
      return false;
    }
    if (cutoffMs !== null) {
      const ts = new Date(log.createdAt).getTime();
      if (!Number.isFinite(ts) || anchorTs - ts > cutoffMs) {
        return false;
      }
    }
    return true;
  });

  // 1. Aggregate by Category
  const categoryMap = new Map<
    string,
    {
      totalCost: number;
      occurrences: number;
      types: Set<WasteTargetType>;
      itemCosts: Map<string, number>;
    }
  >();

  for (const log of filteredLogs) {
    const cat = resolveWasteItemCategory({
      log,
      ingredients,
      menuItems,
      categories,
    });
    const entry = categoryMap.get(cat) ?? {
      totalCost: 0,
      occurrences: 0,
      types: new Set<WasteTargetType>(),
      itemCosts: new Map<string, number>(),
    };
    entry.totalCost = Number((entry.totalCost + log.estimatedCost).toFixed(2));
    entry.occurrences += 1;
    entry.types.add(log.targetType);
    entry.itemCosts.set(
      log.targetName,
      (entry.itemCosts.get(log.targetName) ?? 0) + log.estimatedCost,
    );
    categoryMap.set(cat, entry);
  }

  const totalCostAll = filteredLogs.reduce((s, w) => s + w.estimatedCost, 0);
  const totalRecordsAll = filteredLogs.length;

  const categoryData: CategoryWastePoint[] = Array.from(categoryMap.entries())
    .map(([category, info]) => {
      let topItem = '—';
      let topItemVal = -1;
      for (const [name, cost] of info.itemCosts.entries()) {
        if (cost > topItemVal) {
          topItem = name;
          topItemVal = cost;
        }
      }
      const sourceKind: 'Insumos' | 'Pratos' | 'Misto' =
        info.types.size > 1
          ? 'Misto'
          : info.types.has('prato')
            ? 'Pratos'
            : 'Insumos';

      const sharePct =
        metric === 'cost'
          ? totalCostAll > 0
            ? Number(((info.totalCost / totalCostAll) * 100).toFixed(1))
            : 0
          : totalRecordsAll > 0
            ? Number(((info.occurrences / totalRecordsAll) * 100).toFixed(1))
            : 0;

      return {
        category,
        sourceKind,
        totalCost: info.totalCost,
        occurrences: info.occurrences,
        sharePct,
        topItem,
        color: '#64748b',
      };
    })
    .sort((a, b) =>
      metric === 'cost'
        ? b.totalCost - a.totalCost
        : b.occurrences - a.occurrences,
    )
    .map((row, idx) => ({
      ...row,
      color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
    }));

  const stackedCategories = categoryData.slice(0, 6).map((c) => ({
    name: c.category,
    color: c.color,
  }));

  // 2. Aggregate by Day of Week (Seg -> Dom)
  const dayBuckets = new Map<
    number,
    {
      totalCost: number;
      occurrences: number;
      itemCosts: Map<string, number>;
      catMetric: Map<string, number>;
    }
  >();

  for (const d of WEEKDAY_ORDER) {
    dayBuckets.set(d.jsDay, {
      totalCost: 0,
      occurrences: 0,
      itemCosts: new Map(),
      catMetric: new Map(),
    });
  }

  for (const log of filteredLogs) {
    const dt = new Date(log.createdAt);
    if (Number.isNaN(dt.getTime())) continue;
    const bucket = dayBuckets.get(dt.getDay());
    if (!bucket) continue;

    const cat = resolveWasteItemCategory({
      log,
      ingredients,
      menuItems,
      categories,
    });
    const stackedKey = stackedCategories.some((c) => c.name === cat)
      ? cat
      : 'Outras';

    bucket.totalCost = Number((bucket.totalCost + log.estimatedCost).toFixed(2));
    bucket.occurrences += 1;
    bucket.itemCosts.set(
      log.targetName,
      (bucket.itemCosts.get(log.targetName) ?? 0) + log.estimatedCost,
    );
    bucket.catMetric.set(
      stackedKey,
      Number(
        (
          (bucket.catMetric.get(stackedKey) ?? 0) +
          (metric === 'cost' ? log.estimatedCost : 1)
        ).toFixed(2),
      ),
    );
  }

  let maxDayValue = 0;
  for (const d of WEEKDAY_ORDER) {
    const b = dayBuckets.get(d.jsDay)!;
    const val = metric === 'cost' ? b.totalCost : b.occurrences;
    if (val > maxDayValue) maxDayValue = val;
  }

  const weekdayData: WeekdayWastePoint[] = WEEKDAY_ORDER.map((d) => {
    const bucket = dayBuckets.get(d.jsDay)!;
    let topItem = 'Sem registros';
    let topItemVal = -1;
    for (const [name, cost] of bucket.itemCosts.entries()) {
      if (cost > topItemVal) {
        topItem = name;
        topItemVal = cost;
      }
    }

    let topCategory = '—';
    let topCatVal = -1;
    for (const [catName, val] of bucket.catMetric.entries()) {
      if (val > topCatVal) {
        topCategory = catName;
        topCatVal = val;
      }
    }

    const currentVal = metric === 'cost' ? bucket.totalCost : bucket.occurrences;
    const point: WeekdayWastePoint = {
      weekdayIndex: d.weekdayIndex,
      dayShort: d.dayShort,
      dayFull: d.dayFull,
      totalCost: bucket.totalCost,
      occurrences: bucket.occurrences,
      topItem,
      topCategory,
      isPeak: maxDayValue > 0 && currentVal === maxDayValue,
    };

    for (const cat of stackedCategories) {
      point[cat.name] = bucket.catMetric.get(cat.name) ?? 0;
    }

    return point;
  });

  const peakDay =
    weekdayData.find((d) => d.isPeak) ??
    weekdayData[0];
  const topCat = categoryData[0];

  return {
    filteredLogs,
    weekdayData,
    categoryData,
    stackedCategories,
    summary: {
      totalCost: Number(totalCostAll.toFixed(2)),
      totalRecords: totalRecordsAll,
      avgCostPerRecord:
        totalRecordsAll > 0
          ? Number((totalCostAll / totalRecordsAll).toFixed(2))
          : 0,
      peakDayLabel: peakDay && maxDayValue > 0 ? peakDay.dayFull : 'Sem dados',
      peakDayCost: peakDay ? peakDay.totalCost : 0,
      topCategoryLabel: topCat ? topCat.category : 'Sem dados',
      topCategoryCost: topCat ? topCat.totalCost : 0,
    },
  };
}
