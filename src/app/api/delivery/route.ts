import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import type { StoreSettings } from '@/types/delivery';

export async function GET() {
  return NextResponse.json(getDeliveryStore());
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'toggle_store' | 'update_store';
      updates?: Partial<StoreSettings>;
    };

    const db = getDeliveryStore();

    if (body.action === 'toggle_store') {
      db.store.isOpen = !db.store.isOpen;
      return NextResponse.json({ ok: true, store: db.store });
    }

    if (body.action === 'update_store' && body.updates) {
      db.store = {
        ...db.store,
        ...body.updates,
        evolution: body.updates.evolution
          ? { ...db.store.evolution, ...body.updates.evolution }
          : db.store.evolution,
      };
      return NextResponse.json({ ok: true, store: db.store });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar loja.' },
      { status: 400 },
    );
  }
}
