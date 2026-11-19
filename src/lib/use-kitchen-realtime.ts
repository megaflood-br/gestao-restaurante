'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrderRealtimeEvent } from '@/lib/realtime-bus';
import type { Order } from '@/types/delivery';

const SOUND_STORAGE_KEY = 'casa-tempero-kitchen-priority-sound';

export type RealtimeConnectionStatus =
  | 'conectando'
  | 'conectado'
  | 'reconectando';

export function playPriorityAlertChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [
      { freq: 880, start: 0, dur: 0.13 },
      { freq: 1174.66, start: 0.14, dur: 0.15 },
      { freq: 880, start: 0.34, dur: 0.13 },
      { freq: 1318.5, start: 0.48, dur: 0.24 },
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.start);
      gain.gain.setValueAtTime(0.11, ctx.currentTime + note.start);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + note.start + note.dur,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + note.start);
      osc.stop(ctx.currentTime + note.start + note.dur + 0.02);
    }
  } catch {
    // AudioContext blocked until first user gesture
  }
}

export interface UseKitchenRealtimeOptions {
  enabled?: boolean;
  ordersSnapshot?: Order[];
  actorName?: string;
  onOrderEvent?: (event: OrderRealtimeEvent) => void;
}

export function useKitchenRealtime(options: UseKitchenRealtimeOptions = {}) {
  const {
    enabled = true,
    ordersSnapshot,
    actorName = 'Cozinha',
    onOrderEvent,
  } = options;

  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeConnectionStatus>('conectando');
  const [serverPriorityOrders, setServerPriorityOrders] = useState<Order[]>([]);
  const [freshAlertIds, setFreshAlertIds] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  const onOrderEventRef = useRef(onOrderEvent);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    onOrderEventRef.current = onOrderEvent;
  }, [onOrderEvent]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_STORAGE_KEY);
      if (saved === 'off') setSoundEnabled(false);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    } else {
      setNotifPermission('unsupported');
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // ignore
      }
      if (next) playPriorityAlertChime();
      return next;
    });
  }, []);

  const requestBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource('/api/orders/events');

    const handleConnected = (raw: MessageEvent) => {
      try {
        const parsed = JSON.parse(raw.data) as OrderRealtimeEvent;
        setConnectionStatus('conectado');
        if (Array.isArray(parsed.activePriorityOrders)) {
          setServerPriorityOrders(parsed.activePriorityOrders);
        }
      } catch {
        setConnectionStatus('conectado');
      }
    };

    const handlePriorityAlert = (raw: MessageEvent) => {
      try {
        const parsed = JSON.parse(raw.data) as OrderRealtimeEvent;
        if (seenEventIdsRef.current.has(parsed.id)) return;
        seenEventIdsRef.current.add(parsed.id);

        if (Array.isArray(parsed.activePriorityOrders)) {
          setServerPriorityOrders(parsed.activePriorityOrders);
        } else if (parsed.order) {
          setServerPriorityOrders((prev) => {
            const without = prev.filter((o) => o.id !== parsed.order!.id);
            return [parsed.order!, ...without];
          });
        }

        if (parsed.order) {
          const ord = parsed.order;
          setFreshAlertIds((prev) =>
            prev.includes(ord.id) ? prev : [ord.id, ...prev],
          );

          if (soundEnabledRef.current) {
            playPriorityAlertChime();
          }

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              const itemsPreview = ord.items
                .map((i) => `${i.quantity}x ${i.name}`)
                .join(', ');
              new Notification(
                `PRIORITÁRIO #${ord.orderNumber} · ${ord.customerName}`,
                {
                  body: `${ord.priorityReason || 'Preparo imediato solicitado'} · ${itemsPreview}`,
                  tag: `priority-order-${ord.id}`,
                },
              );
            } catch {
              // ignore notification error
            }
          }
        }

        onOrderEventRef.current?.(parsed);
      } catch {
        // ignore invalid event payload
      }
    };

    const handleOrderLifecycle = (raw: MessageEvent) => {
      try {
        const parsed = JSON.parse(raw.data) as OrderRealtimeEvent;
        if (seenEventIdsRef.current.has(parsed.id)) return;
        seenEventIdsRef.current.add(parsed.id);

        if (Array.isArray(parsed.activePriorityOrders)) {
          setServerPriorityOrders(parsed.activePriorityOrders);
        }
        if (
          parsed.order &&
          (parsed.order.priorityAcknowledgedAt ||
            parsed.order.status !== 'pendente' ||
            parsed.order.priority !== 'prioritario')
        ) {
          setFreshAlertIds((prev) =>
            prev.filter((id) => id !== parsed.order!.id),
          );
        }

        onOrderEventRef.current?.(parsed);
      } catch {
        // ignore
      }
    };

    es.onopen = () => {
      setConnectionStatus('conectado');
    };

    es.onerror = () => {
      setConnectionStatus('reconectando');
    };

    es.addEventListener('connected', handleConnected as EventListener);
    es.addEventListener('order:priority_alert', handlePriorityAlert as EventListener);
    es.addEventListener('order:created', handleOrderLifecycle as EventListener);
    es.addEventListener('order:updated', handleOrderLifecycle as EventListener);

    return () => {
      es.removeEventListener('connected', handleConnected as EventListener);
      es.removeEventListener(
        'order:priority_alert',
        handlePriorityAlert as EventListener,
      );
      es.removeEventListener('order:created', handleOrderLifecycle as EventListener);
      es.removeEventListener('order:updated', handleOrderLifecycle as EventListener);
      es.close();
    };
  }, [enabled]);

  // Merge server priority list with any local snapshot orders for consistency
  const activePriorityOrders = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of serverPriorityOrders) {
      if (
        o.priority === 'prioritario' &&
        (o.status === 'pendente' || o.status === 'preparo')
      ) {
        map.set(o.id, o);
      }
    }
    if (ordersSnapshot) {
      for (const o of ordersSnapshot) {
        if (
          o.priority === 'prioritario' &&
          (o.status === 'pendente' || o.status === 'preparo')
        ) {
          const existing = map.get(o.id);
          if (
            !existing ||
            new Date(o.updatedAt).getTime() >=
              new Date(existing.updatedAt).getTime()
          ) {
            map.set(o.id, o);
          }
        } else {
          // If local snapshot already moved it past preparo/cancelled, drop stale server copy
          const existing = map.get(o.id);
          if (
            existing &&
            new Date(o.updatedAt).getTime() >
              new Date(existing.updatedAt).getTime()
          ) {
            map.delete(o.id);
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const aUnack = a.priorityAcknowledgedAt ? 1 : 0;
      const bUnack = b.priorityAcknowledgedAt ? 1 : 0;
      if (aUnack !== bUnack) return aUnack - bUnack;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [serverPriorityOrders, ordersSnapshot]);

  const unacknowledgedPriorityOrders = useMemo(
    () =>
      activePriorityOrders.filter(
        (o) => !o.priorityAcknowledgedAt || freshAlertIds.includes(o.id),
      ),
    [activePriorityOrders, freshAlertIds],
  );

  const acknowledgePriorityOrder = useCallback(
    async (orderId: string, customActor?: string) => {
      setActionLoadingId(orderId);
      const now = new Date().toISOString();
      const by = (customActor ?? actorName).trim() || 'Cozinha';
      setFreshAlertIds((prev) => prev.filter((id) => id !== orderId));
      setServerPriorityOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                priorityAcknowledgedAt: now,
                priorityAcknowledgedBy: by,
                updatedAt: now,
              }
            : o,
        ),
      );
      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: orderId,
            acknowledgePriority: { by },
          }),
        });
      } catch {
        // Optimistic update remains; next SSE update will reconcile
      } finally {
        setActionLoadingId(null);
      }
    },
    [actorName],
  );

  const startPreparingOrder = useCallback(
    async (orderId: string, customActor?: string) => {
      setActionLoadingId(orderId);
      const now = new Date().toISOString();
      const by = (customActor ?? actorName).trim() || 'Cozinha';
      setFreshAlertIds((prev) => prev.filter((id) => id !== orderId));
      setServerPriorityOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'preparo',
                priorityAcknowledgedAt: o.priorityAcknowledgedAt ?? now,
                priorityAcknowledgedBy: o.priorityAcknowledgedBy ?? by,
                updatedAt: now,
              }
            : o,
        ),
      );
      try {
        await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: orderId,
            status: 'preparo',
            acknowledgePriority: { by },
          }),
        });
      } catch {
        // ignore
      } finally {
        setActionLoadingId(null);
      }
    },
    [actorName],
  );

  return {
    connectionStatus,
    activePriorityOrders,
    unacknowledgedPriorityOrders,
    freshAlertIds,
    soundEnabled,
    notifPermission,
    actionLoadingId,
    toggleSound,
    requestBrowserNotifications,
    playUrgentChime: playPriorityAlertChime,
    acknowledgePriorityOrder,
    startPreparingOrder,
  };
}
