import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import type { DeliveryStoreState } from '@/types/delivery';

export interface RuntimeApiCredentials {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  openAiApiKey: string;
  openAiModel: string;
}

declare global {
  var __deliveryPlatformStore: DeliveryStoreState | undefined;
  var __deliveryApiCredentials: RuntimeApiCredentials | undefined;
}

function sanitizeEnvValue(val: string | undefined, placeholders: string[]): string {
  const trimmed = (val ?? '').trim();
  if (!trimmed) return '';
  if (placeholders.some((p) => trimmed.includes(p))) return '';
  return trimmed;
}

export function getRuntimeApiCredentials(): RuntimeApiCredentials {
  if (!globalThis.__deliveryApiCredentials) {
    globalThis.__deliveryApiCredentials = {
      evolutionApiUrl: sanitizeEnvValue(process.env.EVOLUTION_API_URL, [
        'sua-evolution-api.com',
      ]).replace(/\/+$/, ''),
      evolutionApiKey: sanitizeEnvValue(process.env.EVOLUTION_API_KEY, [
        'SUA_CHAVE_EVOLUTION',
      ]),
      openAiApiKey: sanitizeEnvValue(process.env.OPENAI_API_KEY, [
        'MY_OPENAI_API_KEY',
      ]),
      openAiModel: (process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini',
    };
  }
  return globalThis.__deliveryApiCredentials;
}

export function updateRuntimeApiCredentials(
  updates: Partial<RuntimeApiCredentials> & {
    clearEvolutionKey?: boolean;
    clearOpenAiKey?: boolean;
  },
): RuntimeApiCredentials {
  const current = getRuntimeApiCredentials();
  const next: RuntimeApiCredentials = {
    evolutionApiUrl:
      typeof updates.evolutionApiUrl === 'string'
        ? updates.evolutionApiUrl.trim().replace(/\/+$/, '')
        : current.evolutionApiUrl,
    evolutionApiKey: updates.clearEvolutionKey
      ? ''
      : typeof updates.evolutionApiKey === 'string' && updates.evolutionApiKey.trim()
        ? updates.evolutionApiKey.trim()
        : current.evolutionApiKey,
    openAiApiKey: updates.clearOpenAiKey
      ? ''
      : typeof updates.openAiApiKey === 'string' && updates.openAiApiKey.trim()
        ? updates.openAiApiKey.trim()
        : current.openAiApiKey,
    openAiModel:
      typeof updates.openAiModel === 'string' && updates.openAiModel.trim()
        ? updates.openAiModel.trim()
        : current.openAiModel,
  };
  globalThis.__deliveryApiCredentials = next;
  return next;
}

export function maskSecret(secret: string): string {
  const clean = secret.trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••' + clean.slice(-2);
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function getDeliveryStore(): DeliveryStoreState {
  if (!globalThis.__deliveryPlatformStore) {
    globalThis.__deliveryPlatformStore = structuredClone(INITIAL_DELIVERY_STATE);
  }
  return globalThis.__deliveryPlatformStore;
}

export function resetDeliveryStore(): DeliveryStoreState {
  globalThis.__deliveryPlatformStore = structuredClone(INITIAL_DELIVERY_STATE);
  return globalThis.__deliveryPlatformStore;
}
