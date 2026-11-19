import { NextRequest } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import {
  getActivePriorityOrders,
  subscribeOrderEvents,
  type OrderRealtimeEvent,
} from '@/lib/realtime-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const sendChunk = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          cleanup?.();
        }
      };

      const sendEvent = (event: OrderRealtimeEvent) => {
        const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        sendChunk(payload);
      };

      const db = getDeliveryStore();
      const now = new Date().toISOString();
      sendEvent({
        id: `conn-${Date.now()}`,
        type: 'connected',
        timestamp: now,
        activePriorityOrders: getActivePriorityOrders(db.orders),
      });

      const unsubscribe = subscribeOrderEvents((event) => {
        sendEvent(event);
      });

      const keepaliveTimer = setInterval(() => {
        sendChunk(`: keepalive ${Date.now()}\n\n`);
      }, 20000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepaliveTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      request.signal.addEventListener('abort', () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
