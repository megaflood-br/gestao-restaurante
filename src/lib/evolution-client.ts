import { getDeliveryStore, getRuntimeApiCredentials } from '@/lib/server-store';
import type { EvolutionConfig } from '@/types/delivery';

export interface EvolutionEnvConfig {
  baseUrl: string;
  apiKey: string;
  defaultInstance: string;
  isConfigured: boolean;
}

declare global {
  var __evolutionLastDispatchAt: Record<string, number> | undefined;
}

function getLastDispatchMap(): Record<string, number> {
  if (!globalThis.__evolutionLastDispatchAt) {
    globalThis.__evolutionLastDispatchAt = {};
  }
  return globalThis.__evolutionLastDispatchAt;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatWhatsAppNumber(number: string): string {
  const cleanPhone = number.replace(/\D/g, '');
  if (!cleanPhone) return '';
  return cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
}

export function isPhoneOptedOut(
  evo: EvolutionConfig,
  phone: string,
): boolean {
  if (evo.optOutEnabled === false) return false;
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 8) return false;
  const suffix = clean.slice(-8);
  return (evo.optOutPhones ?? []).some((p) =>
    p.replace(/\D/g, '').endsWith(suffix),
  );
}

/**
 * Computes a randomized, human-like typing delay proportional to message length,
 * following Evolution API v2 anti-ban guidelines (avoids robotic fixed intervals).
 */
export function calculateHumanTypingDelayMs(
  text: string,
  evo?: Partial<EvolutionConfig>,
): number {
  const minMs = Math.max(600, evo?.typingMinDelayMs ?? 1800);
  const maxMs = Math.max(minMs + 400, evo?.typingMaxDelayMs ?? 4800);

  // Reading + typing proportional duration (~30ms per character) + random ±20% jitter
  const baseDuration = 950 + text.trim().length * 30;
  const jitterFactor = 0.8 + Math.random() * 0.4; // [0.8, 1.2]
  const raw = Math.round(baseDuration * jitterFactor);

  return Math.min(maxMs, Math.max(minMs, raw));
}

async function enforceAntiBanPacing(
  instanceName: string,
  baseSpacingMs: number,
): Promise<void> {
  if (baseSpacingMs <= 0) return;
  const map = getLastDispatchMap();
  const lastAt = map[instanceName] ?? 0;
  const jitteredSpacing = Math.round(
    baseSpacingMs * (0.9 + Math.random() * 0.35),
  );
  const elapsed = Date.now() - lastAt;
  if (elapsed < jitteredSpacing) {
    await sleep(jitteredSpacing - elapsed);
  }
  map[instanceName] = Date.now();
}

export function getEvolutionEnvConfig(): EvolutionEnvConfig {
  const creds = getRuntimeApiCredentials();
  const db = getDeliveryStore();
  const baseUrl = creds.evolutionApiUrl.trim().replace(/\/+$/, '');
  const apiKey = creds.evolutionApiKey.trim();
  const defaultInstance =
    db.store.evolution.instanceName?.trim() ||
    (process.env.EVOLUTION_INSTANCE_NAME ?? 'casa-do-tempero').trim() ||
    'casa-do-tempero';

  const isConfigured =
    Boolean(baseUrl) &&
    Boolean(apiKey) &&
    !baseUrl.includes('sua-evolution-api.com') &&
    apiKey !== 'SUA_CHAVE_EVOLUTION';

  return { baseUrl, apiKey, defaultInstance, isConfigured };
}

async function evolutionRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const cfg = getEvolutionEnvConfig();
  if (!cfg.isConfigured) {
    return { ok: false, error: 'Evolution API não configurada no painel.' };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = (await res.json().catch(() => ({}))) as T & {
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `HTTP ${res.status}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro de rede na Evolution API',
    };
  }
}

export async function createEvolutionInstance(instanceName: string) {
  return evolutionRequest<{
    qrcode?: { base64?: string; code?: string };
    instance?: { instanceName?: string; status?: string };
  }>('/instance/create', {
    method: 'POST',
    body: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    },
  });
}

export async function connectEvolutionInstance(instanceName: string) {
  return evolutionRequest<{
    base64?: string;
    code?: string;
    pairingCode?: string;
  }>(`/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

export async function fetchEvolutionConnectionState(instanceName: string) {
  return evolutionRequest<{
    instance?: { instanceName?: string; state?: string };
  }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

export async function setEvolutionWebhook(
  instanceName: string,
  webhookUrl: string,
) {
  return evolutionRequest('/webhook/set/' + encodeURIComponent(instanceName), {
    method: 'POST',
    body: {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false,
      events: ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    },
  });
}

/**
 * Sends WhatsApp typing/recording presence indicator via Evolution API v2
 * (/chat/sendPresence/{instanceName}) before message dispatch.
 */
export async function sendEvolutionPresence(
  instanceName: string,
  number: string,
  presence: 'composing' | 'recording' | 'paused' = 'composing',
  delayMs = 3000,
) {
  const formattedNumber = formatWhatsAppNumber(number);
  if (!formattedNumber) {
    return { ok: false, error: 'Número inválido para presença.' };
  }

  return evolutionRequest(
    `/chat/sendPresence/${encodeURIComponent(instanceName)}`,
    {
      method: 'POST',
      body: {
        number: formattedNumber,
        delay: delayMs,
        presence,
      },
    },
  );
}

/**
 * Dispatches a WhatsApp text message following Evolution API v2 anti-ban guidelines:
 * 1) Checks opt-out list
 * 2) Enforces randomized anti-burst pacing per instance
 * 3) Emits 'composing' presence ("digitando...") and waits human typing duration
 * 4) Sends root-level v2 sendText payload with delay and linkPreview control
 */
export async function sendEvolutionText(
  instanceName: string,
  number: string,
  text: string,
  options?: {
    delayMs?: number;
    bypassOptOut?: boolean;
  },
): Promise<{
  ok: boolean;
  data?: unknown;
  error?: string;
  delayMs: number;
  blockedByOptOut?: boolean;
}> {
  const db = getDeliveryStore();
  const evo = db.store.evolution;
  const formattedNumber = formatWhatsAppNumber(number);

  if (!options?.bypassOptOut && isPhoneOptedOut(evo, number)) {
    return {
      ok: false,
      error: 'Contato solicitou opt-out de mensagens automáticas.',
      delayMs: 0,
      blockedByOptOut: true,
    };
  }

  const typingDelayMs =
    options?.delayMs ?? calculateHumanTypingDelayMs(text, evo);
  const pacingMs = evo.antiBanPacingMs ?? 2200;

  await enforceAntiBanPacing(instanceName, pacingMs);

  if (evo.typingPresenceEnabled !== false) {
    await sendEvolutionPresence(
      instanceName,
      formattedNumber,
      'composing',
      typingDelayMs,
    ).catch(() => {});
    await sleep(typingDelayMs);
  }

  const res = await evolutionRequest(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: 'POST',
      body: {
        number: formattedNumber,
        text,
        delay: Math.min(1200, Math.round(typingDelayMs * 0.25)),
        linkPreview: !(evo.disableLinkPreview !== false),
      },
    },
  );

  return {
    ...res,
    delayMs: typingDelayMs,
  };
}
