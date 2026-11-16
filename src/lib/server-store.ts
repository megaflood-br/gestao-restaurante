import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import type { DeliveryStoreState } from '@/types/delivery';

export interface RuntimeApiCredentials {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  openAiApiKey: string;
  openAiModel: string;
  googleMapsApiKey?: string;
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

export function getGoogleMapsApiKey(): string {
  const runtime = getRuntimeApiCredentials();
  if (runtime.googleMapsApiKey) return runtime.googleMapsApiKey;

  const envCandidates = [
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY,
    (globalThis as Record<string, unknown>).GOOGLE_MAPS_API_KEY as string | undefined,
  ];
  for (const candidate of envCandidates) {
    const clean = sanitizeEnvValue(candidate, ['MY_GOOGLE_MAPS_API_KEY']);
    if (clean) return clean;
  }
  return '';
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
      googleMapsApiKey: sanitizeEnvValue(
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
        ['MY_GOOGLE_MAPS_API_KEY'],
      ),
    };
  }
  return globalThis.__deliveryApiCredentials;
}

export function updateRuntimeApiCredentials(
  updates: Partial<RuntimeApiCredentials> & {
    clearEvolutionKey?: boolean;
    clearOpenAiKey?: boolean;
    clearGoogleMapsKey?: boolean;
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
    googleMapsApiKey: updates.clearGoogleMapsKey
      ? ''
      : typeof updates.googleMapsApiKey === 'string' && updates.googleMapsApiKey.trim()
        ? updates.googleMapsApiKey.trim()
        : current.googleMapsApiKey,
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
