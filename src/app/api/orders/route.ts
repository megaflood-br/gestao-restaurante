import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import {
  getEvolutionEnvConfig,
  isPhoneOptedOut,
  sendEvolutionText,
} from '@/lib/evolution-client';
import {
  applyOrderStockDeduction,
  reverseOrderStockDeduction,
} from '@/lib/stock-engine';
import {
  computeRewardDiscountOnOrder,
  findCustomerByPhone,
  upsertCustomerAndAwardOrderPoints,
} from '@/lib/crm-engine';
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import { getStoreAvailability } from '@/lib/store-hours';
import { formatCurrencyBRL } from '@/lib/formatters';
import {
  broadcastOrderEvent,
  getActivePriorityOrders,
} from '@/lib/realtime-bus';
import type {
  DeliveryMode,
  Order,
  OrderItem,
  OrderPriority,
  OrderSource,
  OrderStatus,
  PaymentMethod,
} from '@/types/delivery';

interface CreateOrderPayload {
  source?: OrderSource;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  address: string;
  neighborhood: string;
  complement?: string;
  deliveryMode: DeliveryMode;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  couponCode?: string;
  loyaltyRewardId?: string;
  saveToCrm?: boolean;
  distanceKm?: number;
  deliveryFee?: number;
  priority?: OrderPriority;
  priorityReason?: string;
  notes?: string;
  items: OrderItem[];
}

export async function GET(request: NextRequest) {
  const db = getDeliveryStore();
  const { searchParams } = new URL(request.url);
  const orderNumberParam = searchParams.get('orderNumber');

  if (orderNumberParam) {
    const num = Number(orderNumberParam);
    const found = db.orders.find((o) => o.orderNumber === num);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: 'Pedido não encontrado.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, order: found });
  }

  return NextResponse.json({ ok: true, orders: db.orders });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateOrderPayload;
    const db = getDeliveryStore();

    const availability = getStoreAvailability(db.store);
    if (!availability.isOpen && body.source !== 'balcao') {
      return NextResponse.json(
        {
          ok: false,
          error:
            availability.closedReason ||
            'A loja está fechada para novos pedidos no momento.',
        },
        { status: 400 },
      );
    }

    if (!body.customerName?.trim() || !body.customerPhone?.trim() || !body.items?.length) {
      return NextResponse.json(
        { ok: false, error: 'Preencha nome, telefone e ao menos um item no pedido.' },
        { status: 400 },
      );
    }

    const subtotal = body.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let discount = 0;
    let appliedCoupon: string | undefined;

    if (body.couponCode?.trim()) {
      const normalized = body.couponCode.trim().toUpperCase();
      const coupon = db.coupons.find(
        (c) => c.code.toUpperCase() === normalized && c.active,
      );
      if (coupon && subtotal >= coupon.minOrderValue) {
        discount =
          coupon.type === 'percent'
            ? Number(((subtotal * coupon.value) / 100).toFixed(2))
            : Math.min(subtotal, coupon.value);
        appliedCoupon = coupon.code;
        coupon.usageCount += 1;
      }
    }

    const quote = calculateDeliveryQuote({
      store: db.store,
      subtotal,
      deliveryMode: body.deliveryMode,
      neighborhood: body.neighborhood,
      distanceKm: body.distanceKm,
    });

    let deliveryFee =
      typeof body.deliveryFee === 'number' &&
      Number.isFinite(body.deliveryFee) &&
      body.deliveryFee >= 0 &&
      body.deliveryMode === 'entrega'
        ? Number(body.deliveryFee.toFixed(2))
        : quote.deliveryFee;

    const matchedCustomer =
      (body.customerId
        ? db.customers.find((c) => c.id === body.customerId)
        : undefined) || findCustomerByPhone(db.customers, body.customerPhone);

    let appliedRewardId: string | undefined;
    let appliedRewardTitle: string | undefined;
    if (body.loyaltyRewardId && matchedCustomer) {
      const reward = db.loyaltyRewards.find(
        (r) => r.id === body.loyaltyRewardId && r.active,
      );
      if (reward && matchedCustomer.pointsBalance >= reward.pointsCost) {
        const rewardEffect = computeRewardDiscountOnOrder({
          reward,
          subtotal,
          deliveryFee,
        });
        if (rewardEffect.freeDelivery) {
          deliveryFee = 0;
        } else if (rewardEffect.discount > 0) {
          discount = Math.min(subtotal, Number((discount + rewardEffect.discount).toFixed(2)));
        }
        appliedRewardId = reward.id;
        appliedRewardTitle = reward.title;
      }
    }

    const total = Math.max(0, Number((subtotal + deliveryFee - discount).toFixed(2)));
    const maxOrderNum = db.orders.reduce(
      (max, item) => Math.max(max, item.orderNumber),
      1040,
    );
    const nextNumber = maxOrderNum + 1;
    const now = new Date().toISOString();

    const rewardNote = appliedRewardTitle
      ? `Prêmio fidelidade resgatado: ${appliedRewardTitle}`
      : '';
    const mergedNotes = [body.notes?.trim(), rewardNote].filter(Boolean).join(' · ');

    const isPriority = body.priority === 'prioritario';
    const newOrder: Order = {
      id: `ord-${nextNumber}-${Date.now()}`,
      orderNumber: nextNumber,
      source: body.source ?? 'cardapio',
      customerId: matchedCustomer?.id,
      customerName: body.customerName.trim(),
      customerPhone: body.customerPhone.replace(/\D/g, ''),
      address:
        body.deliveryMode === 'retirada'
          ? 'Retirada no Balcão'
          : body.address.trim(),
      neighborhood:
        body.deliveryMode === 'retirada'
          ? db.store.neighborhood
          : body.neighborhood.trim(),
      complement: body.complement?.trim() || undefined,
      deliveryMode: body.deliveryMode,
      paymentMethod: body.paymentMethod,
      changeFor: body.changeFor,
      couponCode: appliedCoupon,
      loyaltyRewardId: appliedRewardId,
      loyaltyRewardTitle: appliedRewardTitle,
      subtotal: Number(subtotal.toFixed(2)),
      deliveryFee,
      distanceKm:
        typeof body.distanceKm === 'number' && Number.isFinite(body.distanceKm)
          ? Number(body.distanceKm.toFixed(2))
          : undefined,
      discount,
      total,
      status: 'pendente',
      priority: isPriority ? 'prioritario' : 'normal',
      priorityReason: isPriority
        ? body.priorityReason?.trim() || 'Pedido marcado como prioritário'
        : undefined,
      notes: mergedNotes || undefined,
      items: body.items,
      createdAt: now,
      updatedAt: now,
      history: [{ status: 'pendente', at: now }],
    };

    const stockResult = applyOrderStockDeduction({
      order: newOrder,
      menuItems: db.menuItems,
      ingredients: db.ingredients,
      nowIso: now,
    });

    if (stockResult.deducted) {
      newOrder.stockDeducted = true;
      db.ingredients = stockResult.ingredients;
      db.stockMovements = [...stockResult.newMovements, ...db.stockMovements];
    }

    const crmResult = upsertCustomerAndAwardOrderPoints({
      customers: db.customers,
      loyaltyConfig: db.loyaltyConfig,
      loyaltyPromotions: db.loyaltyPromotions,
      loyaltyRewards: db.loyaltyRewards,
      loyaltyTransactions: db.loyaltyTransactions,
      order: newOrder,
      autoCreate: body.saveToCrm !== false,
      redeemedRewardId: appliedRewardId,
    });

    db.customers = crmResult.customers;
    db.loyaltyRewards = crmResult.loyaltyRewards;
    db.loyaltyTransactions = crmResult.loyaltyTransactions;
    if (crmResult.customer) {
      newOrder.customerId = crmResult.customer.id;
    }
    if (crmResult.pointsEarned > 0) {
      newOrder.loyaltyPointsEarned = crmResult.pointsEarned;
    }
    if (crmResult.pointsRedeemed > 0) {
      newOrder.loyaltyPointsRedeemed = crmResult.pointsRedeemed;
    }

    db.orders = [newOrder, ...db.orders];

    let createdLog = null;
    if (
      db.store.evolution.autoNotifyOnStatus &&
      !isPhoneOptedOut(db.store.evolution, newOrder.customerPhone)
    ) {
      const msg = db.store.evolution.templates.pendente
        .replace('{cliente}', newOrder.customerName)
        .replace('{numero}', String(newOrder.orderNumber))
        .replace('{total}', formatCurrencyBRL(newOrder.total));

      const env = getEvolutionEnvConfig();
      let dispatchStatus: 'enviada' | 'simulada' | 'erro' = 'simulada';
      if (env.isConfigured && db.store.evolution.connectionStatus === 'conectado') {
        const res = await sendEvolutionText(
          db.store.evolution.instanceName,
          newOrder.customerPhone,
          msg,
        );
        dispatchStatus = res.ok ? 'enviada' : 'erro';
      }

      createdLog = {
        id: `wlog-${Date.now()}`,
        direction: 'outbound' as const,
        phone: newOrder.customerPhone,
        customerName: newOrder.customerName,
        message: msg,
        event: 'ORDER_CREATED',
        status: dispatchStatus,
        engine: 'template' as const,
        timestamp: now,
        orderNumber: newOrder.orderNumber,
      };
      db.whatsappLogs = [createdLog, ...db.whatsappLogs];
    }

    const activePriorityOrders = getActivePriorityOrders(db.orders);
    broadcastOrderEvent({
      id: `evt-create-${newOrder.id}-${Date.now()}`,
      type: 'order:created',
      timestamp: now,
      order: newOrder,
      activePriorityOrders,
    });

    if (newOrder.priority === 'prioritario') {
      broadcastOrderEvent({
        id: `evt-prio-${newOrder.id}-${Date.now()}`,
        type: 'order:priority_alert',
        timestamp: now,
        order: newOrder,
        activePriorityOrders,
        message: `Novo pedido prioritário #${newOrder.orderNumber} (${newOrder.customerName})`,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        order: newOrder,
        whatsappLog: createdLog,
        stockMovements: stockResult.newMovements,
        ingredients: db.ingredients,
        customers: db.customers,
        loyaltyRewards: db.loyaltyRewards,
        loyaltyTransactions: db.loyaltyTransactions,
        customerPointsEarned: crmResult.pointsEarned,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Falha ao registrar pedido.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id: string;
      status?: OrderStatus;
      courierId?: string;
      priority?: OrderPriority;
      priorityReason?: string;
      acknowledgePriority?: { by: string };
    };

    const db = getDeliveryStore();
    const order = db.orders.find((o) => o.id === body.id);
    if (!order) {
      return NextResponse.json(
        { ok: false, error: 'Pedido não encontrado.' },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const wasPriority = order.priority === 'prioritario';

    if (body.courierId !== undefined) {
      order.courierId = body.courierId;
    }

    if (body.priority !== undefined) {
      order.priority = body.priority;
      if (body.priority === 'prioritario') {
        order.priorityReason =
          body.priorityReason?.trim() ||
          order.priorityReason ||
          'Prioridade acionada pela operação';
        if (!wasPriority) {
          order.priorityAcknowledgedAt = undefined;
          order.priorityAcknowledgedBy = undefined;
        }
      } else {
        order.priorityReason = undefined;
        order.priorityAcknowledgedAt = undefined;
        order.priorityAcknowledgedBy = undefined;
      }
      order.updatedAt = now;
    } else if (body.priorityReason !== undefined && order.priority === 'prioritario') {
      order.priorityReason = body.priorityReason.trim() || undefined;
      order.updatedAt = now;
    }

    if (body.acknowledgePriority) {
      order.priorityAcknowledgedAt = now;
      order.priorityAcknowledgedBy =
        body.acknowledgePriority.by?.trim() || 'Cozinha';
      order.updatedAt = now;
    }

    if (body.status && body.status !== order.status) {
      order.status = body.status;
      order.updatedAt = now;
      order.history = [...order.history, { status: body.status, at: now }];
      if (
        order.priority === 'prioritario' &&
        body.status !== 'pendente' &&
        !order.priorityAcknowledgedAt
      ) {
        order.priorityAcknowledgedAt = now;
        order.priorityAcknowledgedBy =
          body.acknowledgePriority?.by?.trim() || 'Cozinha (em preparo)';
      }

      let generatedMovements = [] as typeof db.stockMovements;
      if (body.status === 'cancelado' && order.stockDeducted) {
        const reversal = reverseOrderStockDeduction({
          order,
          ingredients: db.ingredients,
          stockMovements: db.stockMovements,
          nowIso: now,
        });
        if (reversal.reversed) {
          order.stockDeducted = false;
          db.ingredients = reversal.ingredients;
          db.stockMovements = [...reversal.newMovements, ...db.stockMovements];
          generatedMovements = reversal.newMovements;
        }
      } else if (body.status !== 'pendente' && body.status !== 'cancelado' && !order.stockDeducted) {
        const deduction = applyOrderStockDeduction({
          order,
          menuItems: db.menuItems,
          ingredients: db.ingredients,
          nowIso: now,
        });
        if (deduction.deducted) {
          order.stockDeducted = true;
          db.ingredients = deduction.ingredients;
          db.stockMovements = [...deduction.newMovements, ...db.stockMovements];
          generatedMovements = deduction.newMovements;
        }
      }

      if (body.status === 'entrega' && order.courierId) {
        const courier = db.couriers.find((c) => c.id === order.courierId);
        if (courier) courier.status = 'em_rota';
      }
      if (body.status === 'finalizado' && order.courierId) {
        const courier = db.couriers.find((c) => c.id === order.courierId);
        if (courier) {
          courier.deliveriesToday += 1;
          const stillActive = db.orders.some(
            (o) =>
              o.id !== order.id &&
              o.courierId === courier.id &&
              o.status === 'entrega',
          );
          if (!stillActive) courier.status = 'disponivel';
        }
      }

      let statusLog = null;
      if (
        db.store.evolution.autoNotifyOnStatus &&
        body.status !== 'cancelado' &&
        !isPhoneOptedOut(db.store.evolution, order.customerPhone)
      ) {
        const templateKey = body.status;
        const rawTemplate = db.store.evolution.templates[templateKey];
        if (rawTemplate) {
          const courierName =
            db.couriers.find((c) => c.id === order.courierId)?.name ??
            'nosso entregador';
          const msg = rawTemplate
            .replace('{cliente}', order.customerName)
            .replace('{numero}', String(order.orderNumber))
            .replace('{total}', formatCurrencyBRL(order.total))
            .replace('{entregador}', courierName);

          const env = getEvolutionEnvConfig();
          let dispatchStatus: 'enviada' | 'simulada' | 'erro' = 'simulada';
          if (env.isConfigured && db.store.evolution.connectionStatus === 'conectado') {
            const res = await sendEvolutionText(
              db.store.evolution.instanceName,
              order.customerPhone,
              msg,
            );
            dispatchStatus = res.ok ? 'enviada' : 'erro';
          }

          statusLog = {
            id: `wlog-${Date.now()}`,
            direction: 'outbound' as const,
            phone: order.customerPhone,
            customerName: order.customerName,
            message: msg,
            event: `ORDER_STATUS_${body.status.toUpperCase()}`,
            status: dispatchStatus,
            engine: 'template' as const,
            timestamp: now,
            orderNumber: order.orderNumber,
          };
          db.whatsappLogs = [statusLog, ...db.whatsappLogs];
        }
      }

      const activePriorityOrders = getActivePriorityOrders(db.orders);
      broadcastOrderEvent({
        id: `evt-upd-${order.id}-${Date.now()}`,
        type: 'order:updated',
        timestamp: now,
        order,
        activePriorityOrders,
      });

      if (!wasPriority && order.priority === 'prioritario') {
        broadcastOrderEvent({
          id: `evt-prio-${order.id}-${Date.now()}`,
          type: 'order:priority_alert',
          timestamp: now,
          order,
          activePriorityOrders,
          message: `Pedido #${order.orderNumber} elevado para PRIORITÁRIO`,
        });
      }

      return NextResponse.json({
        ok: true,
        order,
        whatsappLog: statusLog,
        stockMovements: generatedMovements,
        ingredients: db.ingredients,
      });
    }

    const activePriorityOrders = getActivePriorityOrders(db.orders);
    broadcastOrderEvent({
      id: `evt-upd-${order.id}-${Date.now()}`,
      type: 'order:updated',
      timestamp: now,
      order,
      activePriorityOrders,
    });

    if (!wasPriority && order.priority === 'prioritario') {
      broadcastOrderEvent({
        id: `evt-prio-${order.id}-${Date.now()}`,
        type: 'order:priority_alert',
        timestamp: now,
        order,
        activePriorityOrders,
        message: `Pedido #${order.orderNumber} elevado para PRIORITÁRIO`,
      });
    }

    return NextResponse.json({ ok: true, order });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar pedido.' },
      { status: 400 },
    );
  }
}
