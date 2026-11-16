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
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import { formatCurrencyBRL } from '@/lib/formatters';
import type {
  DeliveryMode,
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  PaymentMethod,
} from '@/types/delivery';

interface CreateOrderPayload {
  source?: OrderSource;
  customerName: string;
  customerPhone: string;
  address: string;
  neighborhood: string;
  complement?: string;
  deliveryMode: DeliveryMode;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  couponCode?: string;
  distanceKm?: number;
  deliveryFee?: number;
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

    if (!db.store.isOpen && body.source !== 'balcao') {
      return NextResponse.json(
        { ok: false, error: 'A loja está fechada para novos pedidos no momento.' },
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

    const deliveryFee =
      typeof body.deliveryFee === 'number' &&
      Number.isFinite(body.deliveryFee) &&
      body.deliveryFee >= 0 &&
      body.deliveryMode === 'entrega'
        ? Number(body.deliveryFee.toFixed(2))
        : quote.deliveryFee;

    const total = Math.max(0, Number((subtotal + deliveryFee - discount).toFixed(2)));
    const maxOrderNum = db.orders.reduce(
      (max, item) => Math.max(max, item.orderNumber),
      1040,
    );
    const nextNumber = maxOrderNum + 1;
    const now = new Date().toISOString();

    const newOrder: Order = {
      id: `ord-${nextNumber}-${Date.now()}`,
      orderNumber: nextNumber,
      source: body.source ?? 'cardapio',
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
      subtotal: Number(subtotal.toFixed(2)),
      deliveryFee,
      distanceKm:
        typeof body.distanceKm === 'number' && Number.isFinite(body.distanceKm)
          ? Number(body.distanceKm.toFixed(2))
          : undefined,
      discount,
      total,
      status: 'pendente',
      notes: body.notes?.trim() || undefined,
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

    return NextResponse.json(
      {
        ok: true,
        order: newOrder,
        whatsappLog: createdLog,
        stockMovements: stockResult.newMovements,
        ingredients: db.ingredients,
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
    if (body.courierId !== undefined) {
      order.courierId = body.courierId;
    }

    if (body.status && body.status !== order.status) {
      order.status = body.status;
      order.updatedAt = now;
      order.history = [...order.history, { status: body.status, at: now }];

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

      return NextResponse.json({
        ok: true,
        order,
        whatsappLog: statusLog,
        stockMovements: generatedMovements,
        ingredients: db.ingredients,
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
