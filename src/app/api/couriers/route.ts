import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import type { Courier, CourierStatus } from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({ ok: true, couriers: db.couriers });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name: string;
      phone: string;
      vehicle: string;
      plate: string;
      pixKey?: string;
      feePerDelivery?: number;
      fixedDailyPay?: number;
    };
    const db = getDeliveryStore();

    if (!body.name?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Informe nome e telefone do entregador.' },
        { status: 400 },
      );
    }

    const courier: Courier = {
      id: `cour-${Date.now()}`,
      name: body.name.trim(),
      phone: body.phone.trim(),
      vehicle: body.vehicle?.trim() || 'Moto 160cc',
      plate: body.plate?.trim().toUpperCase() || 'SEM-PLACA',
      status: 'disponivel',
      active: true,
      deliveriesToday: 0,
      pixKey: body.pixKey?.trim() || undefined,
      feePerDelivery:
        typeof body.feePerDelivery === 'number' && body.feePerDelivery >= 0
          ? body.feePerDelivery
          : undefined,
      fixedDailyPay:
        typeof body.fixedDailyPay === 'number' && body.fixedDailyPay >= 0
          ? body.fixedDailyPay
          : undefined,
    };

    db.couriers = [courier, ...db.couriers];
    return NextResponse.json({ ok: true, courier }, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Falha ao cadastrar entregador.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id: string;
      updates: {
        name?: string;
        phone?: string;
        vehicle?: string;
        plate?: string;
        status?: CourierStatus;
        active?: boolean;
      };
    };
    const db = getDeliveryStore();
    db.couriers = db.couriers.map((c) =>
      c.id === body.id ? { ...c, ...body.updates } : c,
    );
    return NextResponse.json({ ok: true, couriers: db.couriers });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar entregador.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    let id = url.searchParams.get('id') ?? '';
    if (!id) {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      id = body.id ?? '';
    }

    if (!id.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Informe o identificador do entregador.' },
        { status: 400 },
      );
    }

    const db = getDeliveryStore();
    const exists = db.couriers.some((c) => c.id === id);
    if (!exists) {
      return NextResponse.json(
        { ok: false, error: 'Entregador não encontrado.' },
        { status: 404 },
      );
    }

    db.couriers = db.couriers.filter((c) => c.id !== id);
    db.orders = db.orders.map((order) =>
      order.courierId === id ? { ...order, courierId: undefined } : order,
    );

    return NextResponse.json({ ok: true, couriers: db.couriers });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao excluir entregador.' },
      { status: 400 },
    );
  }
}

