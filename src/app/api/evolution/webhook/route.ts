import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import {
  calculateHumanTypingDelayMs,
  getEvolutionEnvConfig,
  sendEvolutionText,
} from '@/lib/evolution-client';
import { generateBrendiBotReply } from '@/lib/whatsapp-bot';

declare global {
  var __evolutionProcessedMessageIds: string[] | undefined;
}

function isDuplicateMessageId(messageId?: string): boolean {
  if (!messageId) return false;
  if (!globalThis.__evolutionProcessedMessageIds) {
    globalThis.__evolutionProcessedMessageIds = [];
  }
  const list = globalThis.__evolutionProcessedMessageIds;
  if (list.includes(messageId)) return true;
  list.push(messageId);
  if (list.length > 200) {
    list.splice(0, list.length - 200);
  }
  return false;
}

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  simulated?: boolean;
  phone?: string;
  customerName?: string;
  message?: string;
  data?: {
    key?: {
      id?: string;
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

    const eventName = (
      body.event ?? (body.simulated ? 'MESSAGES_UPSERT' : '')
    ).toUpperCase();

    if (eventName === 'CONNECTION_UPDATE') {
      const state = body.data?.state?.toLowerCase();
      if (state === 'open') db.store.evolution.connectionStatus = 'conectado';
      if (state === 'close') db.store.evolution.connectionStatus = 'desconectado';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        connectionStatus: db.store.evolution.connectionStatus,
      });
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

    // Anti-ban guideline: never auto-reply in WhatsApp groups (@g.us)
    const remoteJid = body.data?.key?.remoteJid ?? '';
    if (remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ ok: true, ignored: 'group_message' });
    }

    // Anti-ban guideline: deduplicate repeated webhook deliveries by message ID
    const messageId = body.data?.key?.id;
    if (!body.simulated && isDuplicateMessageId(messageId)) {
      return NextResponse.json({ ok: true, ignored: 'duplicate_message' });
    }

    const rawPhone = body.phone || remoteJid.replace(/@.*/, '') || '';
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

    const typingDelayMs = calculateHumanTypingDelayMs(
      botRes.reply,
      db.store.evolution,
    );

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
        {
          delayMs: typingDelayMs,
          bypassOptOut: Boolean(botRes.optOutTriggered),
        },
      );
      outboundStatus = sendRes.ok ? 'enviada' : 'erro';
    }

    const outboundLog = {
      id: `wlog-out-${Date.now() + 1}`,
      direction: 'outbound' as const,
      phone: cleanPhone,
      customerName,
      message: botRes.reply,
      event: botRes.optOutTriggered
        ? 'AI_OPT_OUT'
        : botRes.createdOrder
          ? 'AI_ORDER_CREATED'
          : botRes.handoffTriggered
            ? 'AI_HUMAN_HANDOFF'
            : 'AUTO_REPLY_BOT',
      status: outboundStatus,
      engine: botRes.engine,
      orderNumber: botRes.createdOrder?.orderNumber,
      delayMs: typingDelayMs,
      timestamp: new Date().toISOString(),
    };

    db.whatsappLogs = [outboundLog, ...db.whatsappLogs];

    return NextResponse.json({
      ok: true,
      inboundLog,
      outboundLog,
      reply: botRes.reply,
      engine: botRes.engine,
      typingDelayMs,
      pausedForHuman: false,
      handoffTriggered: Boolean(botRes.handoffTriggered),
      optOutTriggered: Boolean(botRes.optOutTriggered),
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
