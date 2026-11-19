import type { Order } from '@/types/delivery';

export type OrderRealtimeEventType =
  | 'connected'
  | 'order:created'
  | 'order:priority_alert'
  | 'order:updated';

export interface OrderRealtimeEvent {
  id: string;
  type: OrderRealtimeEventType;
  timestamp: string;
  order?: Order;
  activePriorityOrders?: Order[];
  message?: string;
}

type OrderRealtimeListener = (event: OrderRealtimeEvent) => void;

interface OrderRealtimeBus {
  listeners: Set<OrderRealtimeListener>;
}

declare global {
  var __orderRealtimeBus: OrderRealtimeBus | undefined;
}

function getBus(): OrderRealtimeBus {
  if (!globalThis.__orderRealtimeBus) {
    globalThis.__orderRealtimeBus = {
      listeners: new Set(),
    };
  }
  return globalThis.__orderRealtimeBus;
}

export function getActivePriorityOrders(orders: Order[]): Order[] {
  return orders
    .filter(
      (order) =>
        order.priority === 'prioritario' &&
        (order.status === 'pendente' || order.status === 'preparo'),
    )
    .sort((a, b) => {
      const aUnack = a.priorityAcknowledgedAt ? 1 : 0;
      const bUnack = b.priorityAcknowledgedAt ? 1 : 0;
      if (aUnack !== bUnack) return aUnack - bUnack;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function subscribeOrderEvents(
  listener: OrderRealtimeListener,
): () => void {
  const bus = getBus();
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}

export function broadcastOrderEvent(event: OrderRealtimeEvent): void {
  const bus = getBus();
  for (const listener of Array.from(bus.listeners)) {
    try {
      listener(event);
    } catch {
      bus.listeners.delete(listener);
    }
  }
}

export function getRealtimeSubscriberCount(): number {
  return getBus().listeners.size;
}
