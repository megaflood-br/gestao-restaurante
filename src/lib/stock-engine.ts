import { WASTE_REASON_LABEL } from '@/lib/formatters';
import type {
  MenuItem,
  Order,
  StockIngredient,
  StockMovement,
  StockUnit,
  WasteAffectedIngredient,
  WasteLog,
  WasteReason,
  WasteTargetType,
} from '@/types/delivery';

export function convertStockUnit(
  qty: number,
  fromUnit: StockUnit,
  toUnit: StockUnit,
): number {
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'L') return qty / 1000;
  if (fromUnit === 'L' && toUnit === 'ml') return qty * 1000;
  return qty;
}

export function getCompatibleUnits(baseUnit: StockUnit): StockUnit[] {
  if (baseUnit === 'kg' || baseUnit === 'g') return ['g', 'kg'];
  if (baseUnit === 'L' || baseUnit === 'ml') return ['ml', 'L'];
  return ['un'];
}

export function calculateItemCmv(
  item: MenuItem,
  ingredients: StockIngredient[],
): number {
  const sheet = item.technicalSheet ?? [];
  return sheet.reduce((sum, line) => {
    const ing = ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) return sum;
    const qtyInBase = convertStockUnit(line.quantity, line.unit, ing.unit);
    return sum + qtyInBase * ing.unitCost;
  }, 0);
}

export function formatStockQty(qty: number, unit: StockUnit): string {
  const decimals = unit === 'un' ? 0 : unit === 'kg' || unit === 'L' ? 3 : 0;
  return `${qty.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${unit}`;
}

export function applyOrderStockDeduction(params: {
  order: Order;
  menuItems: MenuItem[];
  ingredients: StockIngredient[];
  nowIso?: string;
}): {
  ingredients: StockIngredient[];
  newMovements: StockMovement[];
  deducted: boolean;
} {
  const { order, menuItems, ingredients } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (order.stockDeducted || order.status === 'cancelado') {
    return { ingredients, newMovements: [], deducted: false };
  }

  const requiredByIngredient = new Map<
    string,
    { qty: number; itemLabels: Set<string> }
  >();

  for (const orderItem of order.items) {
    const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId);
    const sheet = menuItem?.technicalSheet ?? [];
    for (const line of sheet) {
      const ing = ingredients.find((i) => i.id === line.ingredientId);
      if (!ing) continue;
      const qtyInBase = convertStockUnit(
        line.quantity * orderItem.quantity,
        line.unit,
        ing.unit,
      );
      if (qtyInBase <= 0) continue;
      const existing = requiredByIngredient.get(ing.id) ?? {
        qty: 0,
        itemLabels: new Set<string>(),
      };
      existing.qty += qtyInBase;
      existing.itemLabels.add(`${orderItem.quantity}x ${orderItem.name}`);
      requiredByIngredient.set(ing.id, existing);
    }
  }

  if (requiredByIngredient.size === 0) {
    return { ingredients, newMovements: [], deducted: false };
  }

  const newMovements: StockMovement[] = [];
  let seq = 0;

  const updatedIngredients = ingredients.map((ing) => {
    const req = requiredByIngredient.get(ing.id);
    if (!req) return ing;
    seq += 1;
    const previousQty = Number(ing.currentQty.toFixed(4));
    const deductedQty = Number(req.qty.toFixed(4));
    const newQty = Math.max(0, Number((previousQty - deductedQty).toFixed(4)));

    newMovements.push({
      id: `mov-${order.orderNumber}-${ing.id}-${Date.now()}-${seq}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: 'saida_pedido',
      quantity: deductedQty,
      unit: ing.unit,
      previousQty,
      newQty,
      reason: `Baixa automática · Pedido #${order.orderNumber} (${[...req.itemLabels].join(', ')})`,
      orderNumber: order.orderNumber,
      createdAt: nowIso,
    });

    return {
      ...ing,
      currentQty: newQty,
      updatedAt: nowIso,
    };
  });

  return {
    ingredients: updatedIngredients,
    newMovements,
    deducted: newMovements.length > 0,
  };
}

export function reverseOrderStockDeduction(params: {
  order: Order;
  ingredients: StockIngredient[];
  stockMovements: StockMovement[];
  nowIso?: string;
}): {
  ingredients: StockIngredient[];
  newMovements: StockMovement[];
  reversed: boolean;
} {
  const { order, ingredients, stockMovements } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!order.stockDeducted) {
    return { ingredients, newMovements: [], reversed: false };
  }

  const orderDeductions = stockMovements.filter(
    (m) => m.orderNumber === order.orderNumber && m.type === 'saida_pedido',
  );

  if (orderDeductions.length === 0) {
    return { ingredients, newMovements: [], reversed: false };
  }

  const restoreMap = new Map<string, number>();
  for (const mov of orderDeductions) {
    restoreMap.set(
      mov.ingredientId,
      (restoreMap.get(mov.ingredientId) ?? 0) + mov.quantity,
    );
  }

  const newMovements: StockMovement[] = [];
  let seq = 0;

  const updatedIngredients = ingredients.map((ing) => {
    const qtyToRestore = restoreMap.get(ing.id);
    if (!qtyToRestore) return ing;
    seq += 1;
    const previousQty = Number(ing.currentQty.toFixed(4));
    const restoredQty = Number(qtyToRestore.toFixed(4));
    const newQty = Number((previousQty + restoredQty).toFixed(4));

    newMovements.push({
      id: `mov-est-${order.orderNumber}-${ing.id}-${Date.now()}-${seq}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: 'estorno',
      quantity: restoredQty,
      unit: ing.unit,
      previousQty,
      newQty,
      reason: `Estorno automático · Pedido #${order.orderNumber} cancelado`,
      orderNumber: order.orderNumber,
      createdAt: nowIso,
    });

    return {
      ...ing,
      currentQty: newQty,
      updatedAt: nowIso,
    };
  });

  return {
    ingredients: updatedIngredients,
    newMovements,
    reversed: newMovements.length > 0,
  };
}

export function previewWasteDeduction(params: {
  targetType: WasteTargetType;
  targetId: string;
  quantity: number;
  unit?: StockUnit;
  menuItems: MenuItem[];
  ingredients: StockIngredient[];
}): {
  targetName: string;
  unitLabel: string;
  affectedIngredients: WasteAffectedIngredient[];
  estimatedCost: number;
} {
  const { targetType, targetId, quantity, unit, menuItems, ingredients } = params;
  if (!targetId || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      targetName: '',
      unitLabel: unit ?? 'un',
      affectedIngredients: [],
      estimatedCost: 0,
    };
  }

  if (targetType === 'insumo') {
    const ing = ingredients.find((i) => i.id === targetId);
    if (!ing) {
      return {
        targetName: '',
        unitLabel: unit ?? 'un',
        affectedIngredients: [],
        estimatedCost: 0,
      };
    }
    const chosenUnit = unit ?? ing.unit;
    const qtyInBase = Number(
      convertStockUnit(quantity, chosenUnit, ing.unit).toFixed(4),
    );
    const estimatedCost = Number((qtyInBase * ing.unitCost).toFixed(2));
    return {
      targetName: ing.name,
      unitLabel: chosenUnit,
      affectedIngredients: [
        {
          ingredientId: ing.id,
          ingredientName: ing.name,
          quantity: qtyInBase,
          unit: ing.unit,
          estimatedCost,
        },
      ],
      estimatedCost,
    };
  }

  const menuItem = menuItems.find((m) => m.id === targetId);
  if (!menuItem) {
    return {
      targetName: '',
      unitLabel: 'un',
      affectedIngredients: [],
      estimatedCost: 0,
    };
  }

  const sheet = menuItem.technicalSheet ?? [];
  const agg = new Map<string, number>();
  for (const line of sheet) {
    const ing = ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) continue;
    const qtyInBase = convertStockUnit(line.quantity * quantity, line.unit, ing.unit);
    if (qtyInBase <= 0) continue;
    agg.set(ing.id, (agg.get(ing.id) ?? 0) + qtyInBase);
  }

  const affectedIngredients: WasteAffectedIngredient[] = [];
  let totalCost = 0;

  for (const [ingredientId, qty] of agg.entries()) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) continue;
    const roundedQty = Number(qty.toFixed(4));
    const lineCost = Number((roundedQty * ing.unitCost).toFixed(2));
    totalCost += lineCost;
    affectedIngredients.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      quantity: roundedQty,
      unit: ing.unit,
      estimatedCost: lineCost,
    });
  }

  return {
    targetName: menuItem.name,
    unitLabel: quantity === 1 ? 'porção' : 'porções',
    affectedIngredients,
    estimatedCost: Number(totalCost.toFixed(2)),
  };
}

export function applyWasteStockDeduction(params: {
  targetType: WasteTargetType;
  targetId: string;
  quantity: number;
  unit?: StockUnit;
  reason: WasteReason;
  employeeName: string;
  notes?: string;
  menuItems: MenuItem[];
  ingredients: StockIngredient[];
  nowIso?: string;
}): {
  wasteLog: WasteLog;
  ingredients: StockIngredient[];
  newMovements: StockMovement[];
  deducted: boolean;
} {
  const {
    targetType,
    targetId,
    quantity,
    unit,
    reason,
    employeeName,
    notes,
    menuItems,
    ingredients,
  } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  const preview = previewWasteDeduction({
    targetType,
    targetId,
    quantity,
    unit,
    menuItems,
    ingredients,
  });

  const deductionMap = new Map<string, number>();
  for (const item of preview.affectedIngredients) {
    deductionMap.set(item.ingredientId, item.quantity);
  }

  const newMovements: StockMovement[] = [];
  let seq = 0;
  const reasonLabel = WASTE_REASON_LABEL[reason] ?? reason;
  const cleanEmployee = employeeName.trim() || 'Cozinha';
  const cleanNotes = notes?.trim();

  const updatedIngredients = ingredients.map((ing) => {
    const deductQty = deductionMap.get(ing.id);
    if (!deductQty || deductQty <= 0) return ing;
    seq += 1;
    const previousQty = Number(ing.currentQty.toFixed(4));
    const newQty = Math.max(0, Number((previousQty - deductQty).toFixed(4)));

    newMovements.push({
      id: `mov-waste-${ing.id}-${Date.now()}-${seq}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: 'desperdicio',
      quantity: deductQty,
      unit: ing.unit,
      previousQty,
      newQty,
      reason: `Descarte (${cleanEmployee}) · ${reasonLabel} · ${preview.targetName}${
        cleanNotes ? ` (${cleanNotes})` : ''
      }`,
      createdAt: nowIso,
    });

    return {
      ...ing,
      currentQty: newQty,
      updatedAt: nowIso,
    };
  });

  const wasteLog: WasteLog = {
    id: `waste-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    targetType,
    targetId,
    targetName: preview.targetName || 'Item não encontrado',
    quantity,
    unitLabel: preview.unitLabel,
    reason,
    employeeName: cleanEmployee,
    notes: cleanNotes || undefined,
    estimatedCost: preview.estimatedCost,
    stockDeducted: newMovements.length > 0,
    affectedIngredients: preview.affectedIngredients,
    createdAt: nowIso,
  };

  return {
    wasteLog,
    ingredients: updatedIngredients,
    newMovements,
    deducted: newMovements.length > 0,
  };
}
