import { NextRequest, NextResponse } from 'next/server';
import {
  getDeliveryStore,
  getRuntimeApiCredentials,
  maskSecret,
  updateRuntimeApiCredentials,
} from '@/lib/server-store';
import {
  connectEvolutionInstance,
  createEvolutionInstance,
  fetchEvolutionConnectionState,
  getEvolutionEnvConfig,
  isPhoneOptedOut,
  sendEvolutionText,
  setEvolutionWebhook,
} from '@/lib/evolution-client';
import { formatCurrencyBRL } from '@/lib/formatters';
import { getOpenAiRuntimeConfig } from '@/lib/whatsapp-bot';
import type { BotTone, EvolutionTemplates } from '@/types/delivery';

function buildEnvStatusPayload() {
  const env = getEvolutionEnvConfig();
  const openAi = getOpenAiRuntimeConfig();
  const raw = getRuntimeApiCredentials();
  return {
    evolutionConfigured: env.isConfigured,
    evolutionApiUrl: raw.evolutionApiUrl,
    evolutionKeyPreview: maskSecret(raw.evolutionApiKey),
    openAiConfigured: openAi.isConfigured,
    openAiModel: openAi.model,
    openAiKeyPreview: maskSecret(raw.openAiApiKey),
    defaultInstance: env.defaultInstance,
  };
}

export async function GET() {
  const db = getDeliveryStore();

  return NextResponse.json({
    ok: true,
    evolution: db.store.evolution,
    whatsappLogs: db.whatsappLogs,
    envStatus: buildEnvStatusPayload(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action:
        | 'connect'
        | 'simulate_scan'
        | 'disconnect'
        | 'configure_webhook'
        | 'update_config'
        | 'send_manual'
        | 'toggle_handoff'
        | 'remove_opt_out'
        | 'send_recovery'
        | 'save_api_credentials'
        | 'test_openai'
        | 'test_evolution';
      instanceName?: string;
      autoReplyEnabled?: boolean;
      autoNotifyOnStatus?: boolean;
      assistantName?: string;
      tone?: BotTone;
      customInstructions?: string;
      allowAiOrderCreation?: boolean;
      upsellEnabled?: boolean;
      humanHandoffEnabled?: boolean;
      typingPresenceEnabled?: boolean;
      typingMinDelayMs?: number;
      typingMaxDelayMs?: number;
      antiBanPacingMs?: number;
      disableLinkPreview?: boolean;
      optOutEnabled?: boolean;
      templates?: Partial<EvolutionTemplates>;
      phone?: string;
      customerName?: string;
      message?: string;
      couponCode?: string;
      evolutionApiUrl?: string;
      evolutionApiKey?: string;
      openAiApiKey?: string;
      openAiModel?: string;
      clearEvolutionKey?: boolean;
      clearOpenAiKey?: boolean;
    };

    const db = getDeliveryStore();
    const env = getEvolutionEnvConfig();
    const now = new Date().toISOString();

    if (body.instanceName?.trim()) {
      db.store.evolution.instanceName = body.instanceName.trim();
    }
    const instanceName = db.store.evolution.instanceName;

    if (body.action === 'save_api_credentials') {
      updateRuntimeApiCredentials({
        evolutionApiUrl: body.evolutionApiUrl,
        evolutionApiKey: body.evolutionApiKey,
        openAiApiKey: body.openAiApiKey,
        openAiModel: body.openAiModel,
        clearEvolutionKey: body.clearEvolutionKey,
        clearOpenAiKey: body.clearOpenAiKey,
      });
      return NextResponse.json({
        ok: true,
        envStatus: buildEnvStatusPayload(),
      });
    }

    if (body.action === 'test_openai') {
      const openAi = getOpenAiRuntimeConfig();
      if (!openAi.isConfigured) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Informe e salve uma chave da OpenAI antes de testar.',
          },
          { status: 400 },
        );
      }

      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${openAi.apiKey}`,
          },
        });
        if (!res.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: `OpenAI retornou HTTP ${res.status}. Verifique se a chave está correta e ativa.`,
            },
            { status: 400 },
          );
        }
        return NextResponse.json({
          ok: true,
          message: `Conexão com OpenAI validada! Modelo selecionado: ${openAi.model}.`,
        });
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'Falha de rede ao testar OpenAI.',
          },
          { status: 400 },
        );
      }
    }

    if (body.action === 'test_evolution') {
      const evoCfg = getEvolutionEnvConfig();
      if (!evoCfg.isConfigured) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Informe e salve a URL e a API Key da Evolution API antes de testar.',
          },
          { status: 400 },
        );
      }

      try {
        const res = await fetch(`${evoCfg.baseUrl}/instance/fetchInstances`, {
          method: 'GET',
          headers: { apikey: evoCfg.apiKey },
        });
        if (!res.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: `Evolution API retornou HTTP ${res.status}. Verifique a URL e a API Key.`,
            },
            { status: 400 },
          );
        }
        return NextResponse.json({
          ok: true,
          message: `Servidor Evolution API respondendo normalmente em ${evoCfg.baseUrl}.`,
        });
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'Não foi possível alcançar o servidor da Evolution API.',
          },
          { status: 400 },
        );
      }
    }

    if (body.action === 'connect') {
      if (env.isConfigured) {
        const stateRes = await fetchEvolutionConnectionState(instanceName);
        if (stateRes.data?.instance?.state === 'open') {
          db.store.evolution.connectionStatus = 'conectado';
          db.store.evolution.lastSyncAt = now;
          return NextResponse.json({
            ok: true,
            mode: 'real',
            evolution: db.store.evolution,
          });
        }

        const createRes = await createEvolutionInstance(instanceName);
        let qrBase64 = createRes.data?.qrcode?.base64;
        if (!qrBase64) {
          const connectRes = await connectEvolutionInstance(instanceName);
          qrBase64 = connectRes.data?.base64;
        }
        db.store.evolution.connectionStatus = 'aguardando_qr';
        db.store.evolution.lastSyncAt = now;

        return NextResponse.json({
          ok: true,
          mode: 'real',
          qrBase64: qrBase64 ?? null,
          evolution: db.store.evolution,
          warning: !qrBase64
            ? createRes.error || 'Instância aguardando QR Code na Evolution API.'
            : undefined,
        });
      }

      db.store.evolution.connectionStatus = 'aguardando_qr';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        mode: 'simulator',
        qrSimulated: true,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'simulate_scan') {
      db.store.evolution.connectionStatus = 'conectado';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'disconnect') {
      db.store.evolution.connectionStatus = 'desconectado';
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'configure_webhook') {
      const baseAppUrl = (
        process.env.APP_URL ||
        request.nextUrl.origin ||
        'http://localhost:3000'
      ).replace(/\/+$/, '');
      const fullWebhookUrl = `${baseAppUrl}/api/evolution/webhook`;
      db.store.evolution.webhookUrl = '/api/evolution/webhook';
      db.store.evolution.lastSyncAt = now;

      if (env.isConfigured) {
        const res = await setEvolutionWebhook(instanceName, fullWebhookUrl);
        if (!res.ok) {
          return NextResponse.json(
            { ok: false, error: res.error || 'Erro ao registrar webhook.' },
            { status: 400 },
          );
        }
      }

      return NextResponse.json({
        ok: true,
        webhookUrl: fullWebhookUrl,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'update_config') {
      if (typeof body.autoReplyEnabled === 'boolean') {
        db.store.evolution.autoReplyEnabled = body.autoReplyEnabled;
      }
      if (typeof body.autoNotifyOnStatus === 'boolean') {
        db.store.evolution.autoNotifyOnStatus = body.autoNotifyOnStatus;
      }
      if (typeof body.assistantName === 'string' && body.assistantName.trim()) {
        db.store.evolution.assistantName = body.assistantName.trim();
      }
      if (
        body.tone === 'acolhedor' ||
        body.tone === 'descontraido' ||
        body.tone === 'objetivo'
      ) {
        db.store.evolution.tone = body.tone;
      }
      if (typeof body.customInstructions === 'string') {
        db.store.evolution.customInstructions = body.customInstructions.trim();
      }
      if (typeof body.allowAiOrderCreation === 'boolean') {
        db.store.evolution.allowAiOrderCreation = body.allowAiOrderCreation;
      }
      if (typeof body.upsellEnabled === 'boolean') {
        db.store.evolution.upsellEnabled = body.upsellEnabled;
      }
      if (typeof body.humanHandoffEnabled === 'boolean') {
        db.store.evolution.humanHandoffEnabled = body.humanHandoffEnabled;
      }
      if (typeof body.typingPresenceEnabled === 'boolean') {
        db.store.evolution.typingPresenceEnabled = body.typingPresenceEnabled;
      }
      if (
        typeof body.typingMinDelayMs === 'number' &&
        Number.isFinite(body.typingMinDelayMs)
      ) {
        db.store.evolution.typingMinDelayMs = Math.max(
          500,
          Math.min(15000, Math.round(body.typingMinDelayMs)),
        );
      }
      if (
        typeof body.typingMaxDelayMs === 'number' &&
        Number.isFinite(body.typingMaxDelayMs)
      ) {
        const minBound = db.store.evolution.typingMinDelayMs ?? 1800;
        db.store.evolution.typingMaxDelayMs = Math.max(
          minBound + 400,
          Math.min(25000, Math.round(body.typingMaxDelayMs)),
        );
      }
      if (
        typeof body.antiBanPacingMs === 'number' &&
        Number.isFinite(body.antiBanPacingMs)
      ) {
        db.store.evolution.antiBanPacingMs = Math.max(
          0,
          Math.min(30000, Math.round(body.antiBanPacingMs)),
        );
      }
      if (typeof body.disableLinkPreview === 'boolean') {
        db.store.evolution.disableLinkPreview = body.disableLinkPreview;
      }
      if (typeof body.optOutEnabled === 'boolean') {
        db.store.evolution.optOutEnabled = body.optOutEnabled;
      }
      if (body.templates) {
        db.store.evolution.templates = {
          ...db.store.evolution.templates,
          ...body.templates,
        };
      }
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'toggle_handoff') {
      const cleanPhone = (body.phone ?? '').replace(/\D/g, '');
      if (!cleanPhone) {
        return NextResponse.json(
          { ok: false, error: 'Telefone inválido para transbordo.' },
          { status: 400 },
        );
      }
      const list = db.store.evolution.humanHandoffPhones ?? [];
      const suffix = cleanPhone.slice(-8);
      const exists = list.some((p) => p.replace(/\D/g, '').endsWith(suffix));
      const updatedList = exists
        ? list.filter((p) => !p.replace(/\D/g, '').endsWith(suffix))
        : [...list, cleanPhone];

      db.store.evolution.humanHandoffPhones = updatedList;
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        activeHumanHandoff: !exists,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'remove_opt_out') {
      const cleanPhone = (body.phone ?? '').replace(/\D/g, '');
      if (!cleanPhone) {
        return NextResponse.json(
          { ok: false, error: 'Telefone inválido.' },
          { status: 400 },
        );
      }
      const suffix = cleanPhone.slice(-8);
      db.store.evolution.optOutPhones = (
        db.store.evolution.optOutPhones ?? []
      ).filter((p) => !p.replace(/\D/g, '').endsWith(suffix));
      db.store.evolution.lastSyncAt = now;
      return NextResponse.json({
        ok: true,
        evolution: db.store.evolution,
      });
    }

    if (body.action === 'send_recovery') {
      const cleanPhone = (body.phone ?? '').replace(/\D/g, '');
      if (!cleanPhone) {
        return NextResponse.json(
          { ok: false, error: 'Informe um telefone para recuperação.' },
          { status: 400 },
        );
      }
      if (isPhoneOptedOut(db.store.evolution, cleanPhone)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Contato solicitou opt-out ("PARAR") e está protegido contra disparos.',
          },
          { status: 400 },
        );
      }
      const customerName = body.customerName?.trim() || 'Cliente';
      const assistantName = db.store.evolution.assistantName?.trim() || 'Brenda';
      const activeCoupon =
        db.coupons.find(
          (c) =>
            c.active &&
            (!body.couponCode ||
              c.code.toUpperCase() === body.couponCode.toUpperCase()),
        ) ?? db.coupons.find((c) => c.active);

      const appUrl = (
        process.env.APP_URL ||
        request.nextUrl.origin ||
        'https://pedidofacil.local'
      ).replace(/\/+$/, '');

      const benefitText = activeCoupon
        ? `use o cupom *${activeCoupon.code}* (${
            activeCoupon.type === 'percent'
              ? `${activeCoupon.value}% OFF`
              : `${formatCurrencyBRL(activeCoupon.value)} OFF`
          })`
        : `aproveite *entrega grátis* a partir de ${formatCurrencyBRL(db.store.freeDeliveryMin)}`;

      const recoveryMessage = `Oi, ${customerName}! Aqui é a ${assistantName} da *${db.store.name}*. Vi que você começou a escolher seu almoço hoje e separei uma vantagem especial para fechar seu pedido: ${benefitText}! Se preferir, me responda por aqui mesmo ou acesse ${appUrl}.`;

      let status: 'enviada' | 'simulada' | 'erro' = 'simulada';
      if (env.isConfigured && db.store.evolution.connectionStatus === 'conectado') {
        const sendRes = await sendEvolutionText(
          instanceName,
          cleanPhone,
          recoveryMessage,
        );
        status = sendRes.ok ? 'enviada' : 'erro';
      }

      const log = {
        id: `wlog-rec-${Date.now()}`,
        direction: 'outbound' as const,
        phone: cleanPhone,
        customerName,
        message: recoveryMessage,
        event: 'RECOVERY_MESSAGE',
        status,
        engine: 'template' as const,
        timestamp: now,
      };
      db.whatsappLogs = [log, ...db.whatsappLogs];
      return NextResponse.json({ ok: true, log });
    }

    if (body.action === 'send_manual') {
      if (!body.phone?.trim() || !body.message?.trim()) {
        return NextResponse.json(
          { ok: false, error: 'Informe telefone e mensagem.' },
          { status: 400 },
        );
      }

      let status: 'enviada' | 'simulada' | 'erro' = 'simulada';
      if (env.isConfigured && db.store.evolution.connectionStatus === 'conectado') {
        const sendRes = await sendEvolutionText(
          instanceName,
          body.phone,
          body.message,
        );
        status = sendRes.ok ? 'enviada' : 'erro';
      }

      const log = {
        id: `wlog-${Date.now()}`,
        direction: 'outbound' as const,
        phone: body.phone.replace(/\D/g, ''),
        customerName: body.customerName?.trim() || 'Cliente WhatsApp',
        message: body.message.trim(),
        event: 'MANUAL_SEND_TEXT',
        status,
        engine: 'template' as const,
        timestamp: now,
      };
      db.whatsappLogs = [log, ...db.whatsappLogs];
      return NextResponse.json({ ok: true, log });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Falha ao processar ação da Evolution API.' },
      { status: 400 },
    );
  }
}
