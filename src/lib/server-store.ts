import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import type { DeliveryStoreState } from '@/types/delivery';

declare global {
  var __deliveryPlatformStore: DeliveryStoreState | undefined;
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
