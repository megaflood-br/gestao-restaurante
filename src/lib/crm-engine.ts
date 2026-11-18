import type {
  CrmCustomer,
  LoyaltyProgramConfig,
  LoyaltyPromotion,
  LoyaltyReward,
  LoyaltyTransaction,
  Order,
} from '@/types/delivery';

export function normalizePhoneDigits(phone?: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function phonesMatch(a?: string, b?: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  if (da.length >= 8 && db.length >= 8) {
    return da.slice(-8) === db.slice(-8);
  }
  return da === db;
}

export function formatPhoneBR(phone?: string): string {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return '—';
  const local =
    digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone ?? digits;
}

export function findCustomerByPhone(
  customers: CrmCustomer[] | undefined,
  phone?: string,
): CrmCustomer | undefined {
  if (!customers || !phone) return undefined;
  return customers.find((c) => phonesMatch(c.phone, phone));
}

export function getCustomerOrders(
  orders: Order[],
  customer?: CrmCustomer,
  phone?: string,
): Order[] {
  const targetPhone = phone || customer?.phone;
  return orders.filter(
    (o) =>
      (customer && o.customerId === customer.id) ||
      (targetPhone && phonesMatch(o.customerPhone, targetPhone)),
  );
}

export function calculateOrderLoyaltyPoints(params: {
  orderTotal: number;
  nextOrdersCount: number;
  config: LoyaltyProgramConfig;
  promotions: LoyaltyPromotion[];
}): {
  basePoints: number;
  promoBonusPoints: number;
  totalPoints: number;
  appliedPromoTitles: string[];
} {
  const { orderTotal, nextOrdersCount, config, promotions } = params;
  if (!config.enabled || orderTotal < config.minOrderValueToEarn) {
    return {
      basePoints: 0,
      promoBonusPoints: 0,
      totalPoints: 0,
      appliedPromoTitles: [],
    };
  }

  let basePoints = 0;
  if (config.earnMode === 'por_pedido') {
    basePoints = Math.max(0, Math.round(config.pointsPerStep));
  } else {
    const step = Math.max(1, config.amountStepBrl);
    basePoints = Math.floor(orderTotal / step) * Math.max(1, config.pointsPerStep);
  }

  let promoBonusPoints = 0;
  const appliedPromoTitles: string[] = [];

  for (const promo of promotions) {
    if (!promo.active) continue;
    if (orderTotal < promo.minOrderValue) continue;

    if (promo.type === 'multiplier' && (promo.pointsMultiplier ?? 1) > 1 && basePoints > 0) {
      const extra = Math.round(basePoints * ((promo.pointsMultiplier ?? 1) - 1));
      if (extra > 0) {
        promoBonusPoints += extra;
        appliedPromoTitles.push(promo.title);
      }
    } else if (promo.type === 'bonus_points' && (promo.bonusPoints ?? 0) > 0) {
      promoBonusPoints += Math.round(promo.bonusPoints ?? 0);
      appliedPromoTitles.push(promo.title);
    } else if (
      promo.type === 'milestone_bonus' &&
      (promo.minOrdersCount ?? 0) > 0 &&
      nextOrdersCount > 0 &&
      nextOrdersCount % (promo.minOrdersCount ?? 1) === 0 &&
      (promo.bonusPoints ?? 0) > 0
    ) {
      promoBonusPoints += Math.round(promo.bonusPoints ?? 0);
      appliedPromoTitles.push(promo.title);
    }
  }

  return {
    basePoints,
    promoBonusPoints,
    totalPoints: basePoints + promoBonusPoints,
    appliedPromoTitles,
  };
}

export function getAvailableRewardsForCustomer(
  pointsBalance: number,
  rewards: LoyaltyReward[] | undefined,
): LoyaltyReward[] {
  return (rewards ?? [])
    .filter((r) => r.active && pointsBalance >= r.pointsCost)
    .sort((a, b) => a.pointsCost - b.pointsCost);
}

export function computeRewardDiscountOnOrder(params: {
  reward?: LoyaltyReward;
  subtotal: number;
  deliveryFee: number;
}): { discount: number; freeDelivery: boolean } {
  const { reward, subtotal, deliveryFee } = params;
  if (!reward || !reward.active) return { discount: 0, freeDelivery: false };

  if (reward.type === 'frete_gratis') {
    return { discount: deliveryFee, freeDelivery: true };
  }
  if (reward.type === 'desconto_valor') {
    return {
      discount: Math.min(subtotal, Math.max(0, reward.discountValue ?? 0)),
      freeDelivery: false,
    };
  }
  if (reward.type === 'desconto_percentual') {
    const pct = Math.min(100, Math.max(0, reward.discountValue ?? 0));
    return {
      discount: Number(((subtotal * pct) / 100).toFixed(2)),
      freeDelivery: false,
    };
  }
  // brinde_item
  return { discount: 0, freeDelivery: false };
}

export function upsertCustomerAndAwardOrderPoints(params: {
  customers: CrmCustomer[];
  loyaltyConfig: LoyaltyProgramConfig;
  loyaltyPromotions: LoyaltyPromotion[];
  loyaltyRewards: LoyaltyReward[];
  loyaltyTransactions: LoyaltyTransaction[];
  order: Order;
  autoCreate?: boolean;
  redeemedRewardId?: string;
}): {
  customers: CrmCustomer[];
  loyaltyRewards: LoyaltyReward[];
  loyaltyTransactions: LoyaltyTransaction[];
  customer?: CrmCustomer;
  pointsEarned: number;
  pointsRedeemed: number;
} {
  const {
    customers,
    loyaltyConfig,
    loyaltyPromotions,
    loyaltyRewards,
    loyaltyTransactions,
    order,
    autoCreate = true,
    redeemedRewardId,
  } = params;

  const nowIso = order.createdAt || new Date().toISOString();
  const cleanPhone = normalizePhoneDigits(order.customerPhone);
  let target =
    (order.customerId
      ? customers.find((c) => c.id === order.customerId)
      : undefined) || findCustomerByPhone(customers, cleanPhone);

  if (!target && !autoCreate) {
    return {
      customers,
      loyaltyRewards,
      loyaltyTransactions,
      pointsEarned: 0,
      pointsRedeemed: 0,
    };
  }

  const nextOrdersCount = (target?.ordersCount ?? 0) + 1;
  const newTxs: LoyaltyTransaction[] = [];
  let updatedRewards = loyaltyRewards;
  let pointsRedeemed = 0;

  let currentPoints = target?.pointsBalance ?? 0;
  let totalPointsEarned = target?.totalPointsEarned ?? 0;
  let totalRedeemed = target?.totalRedeemed ?? 0;

  const resolvedId = target?.id ?? `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const resolvedName = target?.name || order.customerName.trim() || 'Cliente';

  if (redeemedRewardId) {
    const reward = loyaltyRewards.find(
      (r) => r.id === redeemedRewardId && r.active,
    );
    if (reward && currentPoints >= reward.pointsCost) {
      currentPoints -= reward.pointsCost;
      totalRedeemed += reward.pointsCost;
      pointsRedeemed = reward.pointsCost;
      updatedRewards = loyaltyRewards.map((r) =>
        r.id === reward.id
          ? { ...r, redemptionsCount: r.redemptionsCount + 1 }
          : r,
      );
      newTxs.push({
        id: `ltx-red-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customerId: resolvedId,
        customerName: resolvedName,
        type: 'resgate_premio',
        pointsDelta: -reward.pointsCost,
        description: `Resgate de prêmio no Pedido #${order.orderNumber}: ${reward.title}`,
        orderNumber: order.orderNumber,
        rewardId: reward.id,
        createdAt: nowIso,
      });
    }
  }

  const earned = calculateOrderLoyaltyPoints({
    orderTotal: order.total,
    nextOrdersCount,
    config: loyaltyConfig,
    promotions: loyaltyPromotions,
  });

  if (earned.basePoints > 0) {
    currentPoints += earned.basePoints;
    totalPointsEarned += earned.basePoints;
    newTxs.push({
      id: `ltx-earn-${Date.now()}-1`,
      customerId: resolvedId,
      customerName: resolvedName,
      type: 'ganho_compra',
      pointsDelta: earned.basePoints,
      description: `Compra Pedido #${order.orderNumber}`,
      orderNumber: order.orderNumber,
      createdAt: nowIso,
    });
  }

  if (earned.promoBonusPoints > 0) {
    currentPoints += earned.promoBonusPoints;
    totalPointsEarned += earned.promoBonusPoints;
    newTxs.push({
      id: `ltx-promo-${Date.now()}-2`,
      customerId: resolvedId,
      customerName: resolvedName,
      type: 'bonus_promocao',
      pointsDelta: earned.promoBonusPoints,
      description: `Bônus Fidelidade (${earned.appliedPromoTitles.join(' + ')}) · Pedido #${order.orderNumber}`,
      orderNumber: order.orderNumber,
      createdAt: nowIso,
    });
  }

  const shouldUpdateAddress =
    order.deliveryMode === 'entrega' &&
    order.address &&
    order.address !== 'Retirada no Balcão' &&
    order.address !== 'Endereço informado via WhatsApp';

  const nextCustomer: CrmCustomer = {
    id: resolvedId,
    name: target?.name || resolvedName,
    phone: cleanPhone || target?.phone || '',
    address: shouldUpdateAddress ? order.address : target?.address ?? '',
    neighborhood: shouldUpdateAddress
      ? order.neighborhood
      : target?.neighborhood ?? '',
    complement: order.complement ?? target?.complement,
    notes: target?.notes,
    tags: target?.tags ?? [],
    pointsBalance: Math.max(0, currentPoints),
    totalPointsEarned,
    totalRedeemed,
    ordersCount: nextOrdersCount,
    totalSpent: Number(((target?.totalSpent ?? 0) + order.total).toFixed(2)),
    lastOrderAt: nowIso,
    createdAt: target?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  const updatedCustomers = target
    ? customers.map((c) => (c.id === target!.id ? nextCustomer : c))
    : [nextCustomer, ...customers];

  return {
    customers: updatedCustomers,
    loyaltyRewards: updatedRewards,
    loyaltyTransactions: [...newTxs, ...loyaltyTransactions],
    customer: nextCustomer,
    pointsEarned: earned.totalPoints,
    pointsRedeemed,
  };
}
