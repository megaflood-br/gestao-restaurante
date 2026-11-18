import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import { normalizePhoneDigits } from '@/lib/crm-engine';
import {
  getEvolutionEnvConfig,
  isPhoneOptedOut,
  sendEvolutionText,
} from '@/lib/evolution-client';
import type {
  CrmCustomer,
  LoyaltyProgramConfig,
  LoyaltyPromotion,
  LoyaltyReward,
  LoyaltyTransaction,
} from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    customers: db.customers,
    loyaltyConfig: db.loyaltyConfig,
    loyaltyPromotions: db.loyaltyPromotions,
    loyaltyRewards: db.loyaltyRewards,
    loyaltyTransactions: db.loyaltyTransactions,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action:
        | 'upsert_customer'
        | 'adjust_points'
        | 'redeem_reward'
        | 'send_reward_offer'
        | 'save_promotion'
        | 'save_reward'
        | 'update_config';
      customer?: CrmCustomer;
      customerId?: string;
      pointsDelta?: number;
      reason?: string;
      rewardId?: string;
      customMessage?: string;
      promotion?: LoyaltyPromotion;
      reward?: LoyaltyReward;
      config?: Partial<LoyaltyProgramConfig>;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();

    if (body.action === 'upsert_customer' && body.customer) {
      const cleanPhone = normalizePhoneDigits(body.customer.phone);
      const nextCustomer: CrmCustomer = {
        ...body.customer,
        phone: cleanPhone,
        updatedAt: now,
      };
      const exists = db.customers.some((c) => c.id === nextCustomer.id);
      db.customers = exists
        ? db.customers.map((c) => (c.id === nextCustomer.id ? nextCustomer : c))
        : [nextCustomer, ...db.customers];
      return NextResponse.json({
        ok: true,
        customer: nextCustomer,
        customers: db.customers,
      });
    }

    if (
      body.action === 'adjust_points' &&
      body.customerId &&
      typeof body.pointsDelta === 'number'
    ) {
      const customer = db.customers.find((c) => c.id === body.customerId);
      if (!customer) {
        return NextResponse.json(
          { ok: false, error: 'Cliente não encontrado.' },
          { status: 404 },
        );
      }
      const nextBalance = Math.max(0, customer.pointsBalance + body.pointsDelta);
      const updatedCustomer: CrmCustomer = {
        ...customer,
        pointsBalance: nextBalance,
        totalPointsEarned:
          body.pointsDelta > 0
            ? customer.totalPointsEarned + body.pointsDelta
            : customer.totalPointsEarned,
        updatedAt: now,
      };
      db.customers = db.customers.map((c) =>
        c.id === customer.id ? updatedCustomer : c,
      );
      const tx: LoyaltyTransaction = {
        id: `ltx-adj-${Date.now()}`,
        customerId: customer.id,
        customerName: customer.name,
        type: 'ajuste_manual',
        pointsDelta: body.pointsDelta,
        description: body.reason?.trim() || 'Ajuste manual de pontos pelo painel',
        createdAt: now,
      };
      db.loyaltyTransactions = [tx, ...db.loyaltyTransactions];

      return NextResponse.json({
        ok: true,
        customer: updatedCustomer,
        customers: db.customers,
        loyaltyTransactions: db.loyaltyTransactions,
      });
    }

    if (
      body.action === 'redeem_reward' &&
      body.customerId &&
      body.rewardId
    ) {
      const customer = db.customers.find((c) => c.id === body.customerId);
      const reward = db.loyaltyRewards.find((r) => r.id === body.rewardId);
      if (!customer || !reward) {
        return NextResponse.json(
          { ok: false, error: 'Cliente ou prêmio não encontrado.' },
          { status: 404 },
        );
      }
      if (customer.pointsBalance < reward.pointsCost) {
        return NextResponse.json(
          { ok: false, error: 'Saldo de pontos insuficiente para este prêmio.' },
          { status: 400 },
        );
      }

      const updatedCustomer: CrmCustomer = {
        ...customer,
        pointsBalance: customer.pointsBalance - reward.pointsCost,
        totalRedeemed: customer.totalRedeemed + reward.pointsCost,
        updatedAt: now,
      };
      db.customers = db.customers.map((c) =>
        c.id === customer.id ? updatedCustomer : c,
      );
      db.loyaltyRewards = db.loyaltyRewards.map((r) =>
        r.id === reward.id
          ? { ...r, redemptionsCount: r.redemptionsCount + 1 }
          : r,
      );
      const tx: LoyaltyTransaction = {
        id: `ltx-red-${Date.now()}`,
        customerId: customer.id,
        customerName: customer.name,
        type: 'resgate_premio',
        pointsDelta: -reward.pointsCost,
        description: `Prêmio resgatado: ${reward.title}`,
        rewardId: reward.id,
        createdAt: now,
      };
      db.loyaltyTransactions = [tx, ...db.loyaltyTransactions];

      return NextResponse.json({
        ok: true,
        customer: updatedCustomer,
        customers: db.customers,
        loyaltyRewards: db.loyaltyRewards,
        loyaltyTransactions: db.loyaltyTransactions,
      });
    }

    if (
      body.action === 'send_reward_offer' &&
      body.customerId &&
      body.rewardId
    ) {
      const customer = db.customers.find((c) => c.id === body.customerId);
      const reward = db.loyaltyRewards.find((r) => r.id === body.rewardId);
      if (!customer || !reward) {
        return NextResponse.json(
          { ok: false, error: 'Cliente ou prêmio não encontrado.' },
          { status: 404 },
        );
      }

      if (isPhoneOptedOut(db.store.evolution, customer.phone)) {
        return NextResponse.json(
          { ok: false, error: 'Este cliente solicitou descadastro (opt-out).' },
          { status: 400 },
        );
      }

      const firstName = customer.name.split(' ')[0] || customer.name;
      const text =
        body.customMessage?.trim() ||
        `Oi, ${firstName}! Aqui é da ${db.store.name}. Você já acumulou *${customer.pointsBalance} pontos* no nosso Clube Fidelidade e pode resgatar agora o prêmio *${reward.title}* (${reward.pointsCost} pts)! Quer aproveitar no seu pedido de hoje?`;

      const env = getEvolutionEnvConfig();
      let dispatchStatus: 'enviada' | 'simulada' | 'erro' = 'simulada';
      if (env.isConfigured && db.store.evolution.connectionStatus === 'conectado') {
        const res = await sendEvolutionText(
          db.store.evolution.instanceName,
          customer.phone,
          text,
        );
        dispatchStatus = res.ok ? 'enviada' : 'erro';
      }

      const log = {
        id: `wlog-loy-${Date.now()}`,
        direction: 'outbound' as const,
        phone: customer.phone,
        customerName: customer.name,
        message: text,
        event: 'LOYALTY_REWARD_OFFER',
        status: dispatchStatus,
        engine: 'template' as const,
        timestamp: now,
      };
      db.whatsappLogs = [log, ...db.whatsappLogs];

      return NextResponse.json({ ok: true, log });
    }

    if (body.action === 'save_promotion' && body.promotion) {
      const exists = db.loyaltyPromotions.some(
        (p) => p.id === body.promotion!.id,
      );
      db.loyaltyPromotions = exists
        ? db.loyaltyPromotions.map((p) =>
            p.id === body.promotion!.id ? body.promotion! : p,
          )
        : [body.promotion, ...db.loyaltyPromotions];
      return NextResponse.json({
        ok: true,
        loyaltyPromotions: db.loyaltyPromotions,
      });
    }

    if (body.action === 'save_reward' && body.reward) {
      const exists = db.loyaltyRewards.some((r) => r.id === body.reward!.id);
      db.loyaltyRewards = exists
        ? db.loyaltyRewards.map((r) =>
            r.id === body.reward!.id ? body.reward! : r,
          )
        : [body.reward, ...db.loyaltyRewards];
      return NextResponse.json({
        ok: true,
        loyaltyRewards: db.loyaltyRewards,
      });
    }

    if (body.action === 'update_config' && body.config) {
      db.loyaltyConfig = { ...db.loyaltyConfig, ...body.config };
      return NextResponse.json({
        ok: true,
        loyaltyConfig: db.loyaltyConfig,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar operação CRM.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get('entity');
    const id = url.searchParams.get('id');
    if (!entity || !id) {
      return NextResponse.json(
        { ok: false, error: 'Parâmetros inválidos.' },
        { status: 400 },
      );
    }
    const db = getDeliveryStore();
    if (entity === 'customer') {
      db.customers = db.customers.filter((c) => c.id !== id);
    } else if (entity === 'promotion') {
      db.loyaltyPromotions = db.loyaltyPromotions.filter((p) => p.id !== id);
    } else if (entity === 'reward') {
      db.loyaltyRewards = db.loyaltyRewards.filter((r) => r.id !== id);
    }
    return NextResponse.json({
      ok: true,
      customers: db.customers,
      loyaltyPromotions: db.loyaltyPromotions,
      loyaltyRewards: db.loyaltyRewards,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao excluir registro CRM.' },
      { status: 400 },
    );
  }
}
