export interface EvolutionEnvConfig {
  baseUrl: string;
  apiKey: string;
  defaultInstance: string;
  isConfigured: boolean;
}

export function getEvolutionEnvConfig(): EvolutionEnvConfig {
  const baseUrl = (process.env.EVOLUTION_API_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.EVOLUTION_API_KEY ?? '').trim();
  const defaultInstance =
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
    return { ok: false, error: 'Evolution API não configurada no ambiente.' };
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

export async function sendEvolutionText(
  instanceName: string,
  number: string,
  text: string,
) {
  const cleanPhone = number.replace(/\D/g, '');
  const formattedNumber = cleanPhone.startsWith('55')
    ? cleanPhone
    : `55${cleanPhone}`;

  return evolutionRequest(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: 'POST',
      body: {
        number: formattedNumber,
        text,
      },
    },
  );
}
