import type {
  DeliveryMode,
  DistanceFeeTier,
  NeighborhoodFeeRule,
  StoreSettings,
} from '@/types/delivery';

export interface DeliveryQuote {
  deliveryFee: number;
  freeDeliveryApplied: boolean;
  matchedRuleLabel: string;
  estimatedMinutes: number;
  outOfRange: boolean;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function sortDistanceTiers(tiers?: DistanceFeeTier[]): DistanceFeeTier[] {
  if (!Array.isArray(tiers)) return [];
  return [...tiers]
    .filter((t) => Number.isFinite(t.maxKm) && t.maxKm > 0 && Number.isFinite(t.fee))
    .sort((a, b) => a.maxKm - b.maxKm);
}

export function findNeighborhoodRule(
  rules: NeighborhoodFeeRule[] | undefined,
  neighborhood: string | undefined,
): NeighborhoodFeeRule | null {
  if (!Array.isArray(rules) || !neighborhood?.trim()) return null;
  const target = normalizeText(neighborhood);
  if (!target) return null;

  const exact = rules.find((r) => normalizeText(r.neighborhood) === target);
  if (exact) return exact;

  return (
    rules.find((r) => {
      const ruleNorm = normalizeText(r.neighborhood);
      return (
        ruleNorm.length >= 3 &&
        (target.includes(ruleNorm) || ruleNorm.includes(target))
      );
    }) ?? null
  );
}

export function calculateDeliveryQuote(params: {
  store: StoreSettings;
  subtotal: number;
  deliveryMode: DeliveryMode;
  neighborhood?: string;
  distanceKm?: number | null;
}): DeliveryQuote {
  const { store, subtotal, deliveryMode, neighborhood, distanceKm } = params;

  if (deliveryMode === 'retirada') {
    return {
      deliveryFee: 0,
      freeDeliveryApplied: false,
      matchedRuleLabel: 'Retirada no balcão (sem taxa)',
      estimatedMinutes: store.estimatedMinutes,
      outOfRange: false,
    };
  }

  const mode = store.deliveryFeeMode ?? 'fixa';
  const sortedTiers = sortDistanceTiers(store.distanceFeeTiers);
  const maxKmLimit =
    typeof store.maxDeliveryKm === 'number' && store.maxDeliveryKm > 0
      ? store.maxDeliveryKm
      : sortedTiers.length > 0
        ? sortedTiers[sortedTiers.length - 1].maxKm
        : 15;

  let baseFee = store.deliveryFee;
  let estimatedMinutes = store.estimatedMinutes;
  let matchedRuleLabel = `Taxa fixa padrão`;
  let outOfRange = false;

  if (mode === 'distancia') {
    if (typeof distanceKm === 'number' && Number.isFinite(distanceKm) && distanceKm >= 0) {
      if (distanceKm > maxKmLimit) {
        outOfRange = true;
        const lastTier = sortedTiers[sortedTiers.length - 1];
        baseFee = lastTier ? lastTier.fee : store.deliveryFee;
        estimatedMinutes = lastTier?.estimatedMinutes ?? store.estimatedMinutes;
        matchedRuleLabel = `${distanceKm.toFixed(1)} km (acima do raio máx. de ${maxKmLimit} km)`;
      } else {
        const tier = sortedTiers.find((t) => distanceKm <= t.maxKm);
        if (tier) {
          baseFee = tier.fee;
          estimatedMinutes = tier.estimatedMinutes ?? store.estimatedMinutes;
          matchedRuleLabel = `${distanceKm.toFixed(1)} km · Faixa até ${tier.maxKm} km`;
        } else if (sortedTiers.length > 0) {
          const fallbackTier = sortedTiers[sortedTiers.length - 1];
          baseFee = fallbackTier.fee;
          estimatedMinutes = fallbackTier.estimatedMinutes ?? store.estimatedMinutes;
          matchedRuleLabel = `${distanceKm.toFixed(1)} km · Faixa até ${fallbackTier.maxKm} km`;
        }
      }
    } else {
      // Fallback before address is calculated
      const firstTier = sortedTiers[0];
      baseFee = firstTier ? firstTier.fee : store.deliveryFee;
      matchedRuleLabel =
        sortedTiers.length > 0
          ? `Por distância (a partir de ${sortedTiers[0].maxKm} km)`
          : 'Taxa por distância';
    }
  } else if (mode === 'bairro') {
    const matched = findNeighborhoodRule(store.neighborhoodFees, neighborhood);
    if (matched) {
      baseFee = matched.fee;
      estimatedMinutes = matched.estimatedMinutes ?? store.estimatedMinutes;
      matchedRuleLabel = `Bairro ${matched.neighborhood}`;
    } else {
      matchedRuleLabel = neighborhood?.trim()
        ? `Bairro fora da lista (taxa padrão)`
        : `Taxa por bairro (padrão)`;
    }
  }

  const freeDeliveryApplied =
    store.freeDeliveryMin > 0 && subtotal >= store.freeDeliveryMin && !outOfRange;

  return {
    deliveryFee: freeDeliveryApplied ? 0 : Number(baseFee.toFixed(2)),
    freeDeliveryApplied,
    matchedRuleLabel: freeDeliveryApplied
      ? `Frete grátis (acima de R$ ${store.freeDeliveryMin.toFixed(2).replace('.', ',')})`
      : matchedRuleLabel,
    estimatedMinutes,
    outOfRange,
  };
}
