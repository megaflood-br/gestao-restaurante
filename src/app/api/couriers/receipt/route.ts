import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import { sendEvolutionText } from '@/lib/evolution-client';
import { formatCurrencyBRL } from '@/lib/formatters';
import type {
  CourierSettlement,
  FinancialEntry,
  WhatsappLog,
} from '@/types/delivery';

function buildReceiptText(params: {
  storeName: string;
  courierName: string;
  vehicle: string;
  plate: string;
  date: string;
  deliveriesCount: number;
  orderNumbers: number[];
  deliveryFeesTotal: number;
  fixedDailyPay: number;
  bonusAmount: number;
  discountAmount: number;
  totalPaid: number;
  paymentMethod: string;
  pixKey?: string;
  notes?: string;
  settlementCode: string;
}): string {
  const formattedDate = params.date.split('-').reverse().join('/');
  const lines = [
    `*RECIBO DE FECHAMENTO DIÁRIO — ${params.storeName}*`,
    `Recibo Nº: ${params.settlementCode}`,
    `Data: ${formattedDate}`,
    `Entregador: ${params.courierName} (${params.vehicle} · ${params.plate})`,
    ``,
    `• Entregas no dia: ${params.deliveriesCount}`,
    params.orderNumbers.length > 0
      ? `• Pedidos: ${params.orderNumbers.map((n) => `#${n}`).join(', ')}`
      : null,
    `• Taxas de entrega: ${formatCurrencyBRL(params.deliveryFeesTotal)}`,
    params.fixedDailyPay > 0
      ? `• Diária fixa: ${formatCurrencyBRL(params.fixedDailyPay)}`
      : null,
    params.bonusAmount > 0
      ? `• Adicional / Bônus: +${formatCurrencyBRL(params.bonusAmount)}`
      : null,
    params.discountAmount > 0
      ? `• Descontos / Vales: -${formatCurrencyBRL(params.discountAmount)}`
      : null,
    ``,
    `*TOTAL PAGO: ${formatCurrencyBRL(params.totalPaid)}*`,
    `Forma de pagamento: ${params.paymentMethod}${
      params.pixKey ? ` (Chave Pix: ${params.pixKey})` : ''
    }`,
    params.notes ? `Obs.: ${params.notes}` : null,
    ``,
    `Obrigado pelo trabalho hoje! Bom descanso.`,
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const db = getDeliveryStore();
  const courierId = new URL(request.url).searchParams.get('courierId');
  const settlements = courierId
    ? db.courierSettlements.filter((s) => s.courierId === courierId)
    : db.courierSettlements;
  return NextResponse.json({ ok: true, settlements });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: 'close_and_send' | 'resend_whatsapp';
      settlementId?: string;
      courierId?: string;
      courierName?: string;
      courierPhone?: string;
      courierVehicle?: string;
      courierPlate?: string;
      date?: string;
      deliveriesCount?: number;
      orderNumbers?: number[];
      deliveryFeesTotal?: number;
      fixedDailyPay?: number;
      bonusAmount?: number;
      discountAmount?: number;
      totalPaid?: number;
      paymentMethod?: string;
      pixKey?: string;
      notes?: string;
      sendWhatsapp?: boolean;
      recordInFinance?: boolean;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();

    if (body.action === 'resend_whatsapp' && body.settlementId) {
      const existing = db.courierSettlements.find(
        (s) => s.id === body.settlementId,
      );
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: 'Recibo não encontrado.' },
          { status: 404 },
        );
      }

      const courier = db.couriers.find((c) => c.id === existing.courierId);
      const targetPhone = courier?.phone || body.courierPhone || '';
      if (!targetPhone) {
        return NextResponse.json(
          { ok: false, error: 'Telefone do entregador não informado.' },
          { status: 400 },
        );
      }

      const sendRes = await sendEvolutionText(
        db.store.evolution.instanceName,
        targetPhone,
        existing.receiptText,
      );

      const isSimulated =
        !sendRes.ok &&
        db.store.evolution.connectionStatus === 'simulador';

      const whatsappStatus = sendRes.ok
        ? 'Enviado via Evolution'
        : isSimulated
          ? 'Simulador Local'
          : sendRes.error || 'Falha no envio';

      const log: WhatsappLog = {
        id: `wlog-rec-${Date.now()}`,
        direction: 'outbound',
        phone: targetPhone.replace(/\D/g, ''),
        customerName: existing.courierName,
        message: existing.receiptText,
        event: 'COURIER_DAILY_RECEIPT',
        status: sendRes.ok ? 'enviada' : isSimulated ? 'simulada' : 'erro',
        engine: 'template',
        timestamp: now,
        delayMs: sendRes.delayMs,
      };
      db.whatsappLogs = [log, ...db.whatsappLogs];

      db.courierSettlements = db.courierSettlements.map((s) =>
        s.id === existing.id
          ? {
              ...s,
              whatsappSent: sendRes.ok || isSimulated,
              whatsappStatus,
            }
          : s,
      );

      const updated = db.courierSettlements.find((s) => s.id === existing.id);
      return NextResponse.json({
        ok: true,
        settlement: updated,
        whatsappLog: log,
        sentLive: sendRes.ok,
        simulated: isSimulated,
      });
    }

    // Default: close_and_send
    const courier = db.couriers.find((c) => c.id === body.courierId);
    const courierName = courier?.name || body.courierName || 'Entregador';
    const courierPhone = courier?.phone || body.courierPhone || '';
    const vehicle = courier?.vehicle || body.courierVehicle || 'Moto';
    const plate = courier?.plate || body.courierPlate || '—';
    const date = body.date || now.slice(0, 10);
    const deliveriesCount = Math.max(0, Math.round(Number(body.deliveriesCount) || 0));
    const deliveryFeesTotal = Math.max(0, Number(body.deliveryFeesTotal) || 0);
    const fixedDailyPay = Math.max(0, Number(body.fixedDailyPay) || 0);
    const bonusAmount = Math.max(0, Number(body.bonusAmount) || 0);
    const discountAmount = Math.max(0, Number(body.discountAmount) || 0);
    const computedTotal = Math.max(
      0,
      Number(
        (
          deliveryFeesTotal +
          fixedDailyPay +
          bonusAmount -
          discountAmount
        ).toFixed(2),
      ),
    );
    const totalPaid =
      typeof body.totalPaid === 'number' && body.totalPaid >= 0
        ? Number(body.totalPaid.toFixed(2))
        : computedTotal;
    const paymentMethod = body.paymentMethod?.trim() || 'Pix';
    const pixKey = body.pixKey?.trim() || courier?.pixKey || undefined;
    const orderNumbers = Array.isArray(body.orderNumbers) ? body.orderNumbers : [];

    const settlementId = `set-${Date.now()}`;
    const settlementCode = `REC-${date.replace(/-/g, '')}-${String(
      db.courierSettlements.length + 1,
    ).padStart(2, '0')}`;

    const receiptText = buildReceiptText({
      storeName: db.store.name,
      courierName,
      vehicle,
      plate,
      date,
      deliveriesCount,
      orderNumbers,
      deliveryFeesTotal,
      fixedDailyPay,
      bonusAmount,
      discountAmount,
      totalPaid,
      paymentMethod,
      pixKey,
      notes: body.notes?.trim() || undefined,
      settlementCode,
    });

    let whatsappLog: WhatsappLog | null = null;
    let whatsappSent = false;
    let whatsappStatus = 'Recibo gerado (sem envio)';
    let sentLive = false;

    if (body.sendWhatsapp !== false && courierPhone) {
      const sendRes = await sendEvolutionText(
        db.store.evolution.instanceName,
        courierPhone,
        receiptText,
      );
      sentLive = sendRes.ok;
      const isSimulated =
        !sendRes.ok &&
        db.store.evolution.connectionStatus === 'simulador';

      whatsappSent = sendRes.ok || isSimulated;
      whatsappStatus = sendRes.ok
        ? 'Enviado via Evolution'
        : isSimulated
          ? 'Simulador Local'
          : sendRes.error || 'Falha no envio';

      whatsappLog = {
        id: `wlog-rec-${Date.now()}`,
        direction: 'outbound',
        phone: courierPhone.replace(/\D/g, ''),
        customerName: courierName,
        message: receiptText,
        event: 'COURIER_DAILY_RECEIPT',
        status: sendRes.ok ? 'enviada' : isSimulated ? 'simulada' : 'erro',
        engine: 'template',
        timestamp: now,
        delayMs: sendRes.delayMs,
      };
      db.whatsappLogs = [whatsappLog, ...db.whatsappLogs];
    }

    const settlement: CourierSettlement = {
      id: settlementId,
      courierId: body.courierId || courier?.id || 'unknown',
      courierName,
      date,
      deliveriesCount,
      orderNumbers,
      deliveryFeesTotal: Number(deliveryFeesTotal.toFixed(2)),
      fixedDailyPay: Number(fixedDailyPay.toFixed(2)),
      bonusAmount: Number(bonusAmount.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      totalPaid,
      paymentMethod,
      pixKey,
      notes: body.notes?.trim() || undefined,
      whatsappSent,
      whatsappStatus,
      receiptText,
      createdAt: now,
    };
    db.courierSettlements = [settlement, ...db.courierSettlements];

    let financialEntry: FinancialEntry | null = null;
    if (body.recordInFinance !== false && totalPaid > 0) {
      financialEntry = {
        id: `fin-cour-${Date.now()}`,
        type: 'custo',
        category: 'equipe_entregas',
        description: `Fechamento diário — ${courierName} (${deliveriesCount} entregas)`,
        amount: totalPaid,
        date,
        paymentMethod,
        notes: `Recibo ${settlementCode}${pixKey ? ` · Pix: ${pixKey}` : ''}`,
        createdAt: now,
      };
      db.financialEntries = [financialEntry, ...db.financialEntries];
    }

    return NextResponse.json(
      {
        ok: true,
        settlement,
        financialEntry,
        whatsappLog,
        sentLive,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar fechamento e recibo do entregador.' },
      { status: 400 },
    );
  }
}
