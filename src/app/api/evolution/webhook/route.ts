import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import {
  getEvolutionEnvConfig,
  sendEvolutionText,
} from '@/lib/evolution-client';
import { generateBrendiBotReply } from '@/lib/whatsapp-bot';

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  simulated?: boolean;
  phone?: string;
  customerName?: string;
  message?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
    };
    state?: string;
    qrcode?: {
      base64?: string;
    };
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/evolution/webhook',
    eventsSupported: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EvolutionWebhookPayload;
    const db = getDeliveryStore();
    const env = getEvolutionEnvConfig();
    const now = new Date().toISOString();

    const eventName = (body.event ?? (body.simulated ? 'MESSAGES_UPSERT' : '')).toUpperCase();

    if (eventName === 'CONNECTION_UPDATE') {
      const state = body.data?.state?.toLowerCase();
      if (state === 'open') db.store.evolution.connectionStatus = 'conectado';
      if (state === 'close') db.store.evolution.connectionStatus = 'desconectado';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({ ok: true, connectionStatus: db.store.evolution.connectionStatus });
    }

    if (eventName === 'QRCODE_UPDATED') {
      db.store.evolution.connectionStatus = 'aguardando_qr';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({ ok: true });
    }

    // Handle MESSAGES_UPSERT (real Evolution API v2 payload OR local simulator)
    const isFromMe = body.data?.key?.fromMe === true;
    if (isFromMe) {
      return NextResponse.json({ ok: true, ignored: 'fromMe' });
    }

    const rawPhone =
      body.phone ||
      body.data?.key?.remoteJid?.replace(/@.*/, '') ||
      '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const customerName =
      body.customerName?.trim() ||
      body.data?.pushName?.trim() ||
      'Cliente WhatsApp';
    const inboundText =
      body.message?.trim() ||
      body.data?.message?.conversation?.trim() ||
      body.data?.message?.extendedTextMessage?.text?.trim() ||
      '';

    if (!cleanPhone || !inboundText) {
      return NextResponse.json({ ok: true, ignored: 'empty_payload' });
    }

    const inboundLog = {
      id: `wlog-in-${Date.now()}`,
      direction: 'inbound' as const,
      phone: cleanPhone,
      customerName,
      message: inboundText,
      event: body.simulated ? 'SIMULATOR_MESSAGES_UPSERT' : 'MESSAGES_UPSERT',
      status: 'recebida' as const,
      timestamp: now,
    };

    db.whatsappLogs = [inboundLog, ...db.whatsappLogs];

    if (!db.store.evolution.autoReplyEnabled) {
      return NextResponse.json({
        ok: true,
        inboundLog,
        autoReplied: false,
      });
    }

    const botRes = await generateBrendiBotReply({
      state: db,
      phone: cleanPhone,
      customerName,
      userMessage: inboundText,
    });

    if (botRes.pausedForHuman) {
      return NextResponse.json({
        ok: true,
        inboundLog,
        pausedForHuman: true,
        autoReplied: false,
        evolution: db.store.evolution,
      });
    }

    let outboundStatus: 'enviada' | 'simulada' | 'erro' = 'simulada';
    if (
      !body.simulated &&
      env.isConfigured &&
      db.store.evolution.connectionStatus === 'conectado'
    ) {
      const sendRes = await sendEvolutionText(
        db.store.evolution.instanceName,
        cleanPhone,
        botRes.reply,
      );
      outboundStatus = sendRes.ok ? 'enviada' : 'erro';
    }

    const outboundLog = {
      id: `wlog-out-${Date.now() + 1}`,
      direction: 'outbound' as const,
      phone: cleanPhone,
      customerName,
      message: botRes.reply,
      event: botRes.createdOrder
        ? 'AI_ORDER_CREATED'
        : botRes.handoffTriggered
          ? 'AI_HUMAN_HANDOFF'
          : 'AUTO_REPLY_BOT',
      status: outboundStatus,
      engine: botRes.engine,
      orderNumber: botRes.createdOrder?.orderNumber,
      timestamp: new Date().toISOString(),
    };

    db.whatsappLogs = [outboundLog, ...db.whatsappLogs];

    return NextResponse.json({
      ok: true,
      inboundLog,
      outboundLog,
      reply: botRes.reply,
      engine: botRes.engine,
      pausedForHuman: false,
      handoffTriggered: Boolean(botRes.handoffTriggered),
      createdOrder: botRes.createdOrder ?? null,
      stockMovements: botRes.stockMovements ?? [],
      ingredients: botRes.createdOrder ? db.ingredients : undefined,
      evolution: db.store.evolution,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Falha ao processar webhook da Evolution API.' },
      { status: 400 },
    );
  }
}
