import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import type { Coupon, MenuCategory, MenuItem } from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    ok: true,
    categories: db.categories,
    menuItems: db.menuItems,
    coupons: db.coupons,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      entity: 'menu_item' | 'category' | 'coupon';
      data: Partial<MenuItem> & Partial<MenuCategory> & Partial<Coupon>;
    };
    const db = getDeliveryStore();

    if (body.entity === 'menu_item') {
      const item: MenuItem = {
        id: `item-${Date.now()}`,
        categoryId: body.data.categoryId || db.categories[0]?.id || 'cat-executivas',
        name: (body.data.name || 'Novo Prato').trim(),
        description: (body.data.description || '').trim(),
        price: Math.max(0, Number(body.data.price) || 0),
        promoPrice:
          body.data.promoPrice && Number(body.data.promoPrice) > 0
            ? Number(body.data.promoPrice)
            : undefined,
        image:
          body.data.image?.trim() ||
          '/images/dish_frango_grelhado_1794779703159.jpg',
        available: body.data.available ?? true,
        prepMinutes: Math.max(1, Number(body.data.prepMinutes) || 20),
        serves: (body.data.serves || 'Serve 1 pessoa').trim(),
        addonGroups: Array.isArray(body.data.addonGroups)
          ? body.data.addonGroups
          : [],
      };
      db.menuItems = [item, ...db.menuItems];
      return NextResponse.json({ ok: true, item }, { status: 201 });
    }

    if (body.entity === 'category') {
      const category: MenuCategory = {
        id: `cat-${Date.now()}`,
        name: (body.data.name || 'Nova Categoria').trim(),
        description: (body.data.description || '').trim(),
        sortOrder: db.categories.length + 1,
        active: body.data.active ?? true,
      };
      db.categories = [...db.categories, category];
      return NextResponse.json({ ok: true, category }, { status: 201 });
    }

    if (body.entity === 'coupon') {
      const code = (body.data.code || '').trim().toUpperCase();
      if (!code) {
        return NextResponse.json(
          { ok: false, error: 'Informe o código do cupom.' },
          { status: 400 },
        );
      }
      if (db.coupons.some((c) => c.code.toUpperCase() === code)) {
        return NextResponse.json(
          { ok: false, error: 'Já existe um cupom com este código.' },
          { status: 400 },
        );
      }
      const coupon: Coupon = {
        id: `cup-${Date.now()}`,
        code,
        description: (body.data.description || `Desconto ${code}`).trim(),
        type: body.data.type === 'fixed' ? 'fixed' : 'percent',
        value: Math.max(1, Number(body.data.value) || 5),
        minOrderValue: Math.max(0, Number(body.data.minOrderValue) || 0),
        active: body.data.active ?? true,
        usageCount: 0,
      };
      db.coupons = [coupon, ...db.coupons];
      return NextResponse.json({ ok: true, coupon }, { status: 201 });
    }

    return NextResponse.json(
      { ok: false, error: 'Entidade inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao criar item de catálogo.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      entity: 'menu_item' | 'category' | 'coupon';
      id: string;
      updates: Record<string, unknown>;
    };
    const db = getDeliveryStore();

    if (body.entity === 'menu_item') {
      db.menuItems = db.menuItems.map((item) =>
        item.id === body.id ? { ...item, ...body.updates } : item,
      );
      return NextResponse.json({ ok: true, menuItems: db.menuItems });
    }

    if (body.entity === 'category') {
      db.categories = db.categories.map((cat) =>
        cat.id === body.id ? { ...cat, ...body.updates } : cat,
      );
      return NextResponse.json({ ok: true, categories: db.categories });
    }

    if (body.entity === 'coupon') {
      db.coupons = db.coupons.map((c) =>
        c.id === body.id ? { ...c, ...body.updates } : c,
      );
      return NextResponse.json({ ok: true, coupons: db.coupons });
    }

    return NextResponse.json(
      { ok: false, error: 'Entidade inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar catálogo.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      entity: 'menu_item' | 'coupon';
      id: string;
    };
    const db = getDeliveryStore();

    if (body.entity === 'menu_item') {
      db.menuItems = db.menuItems.filter((item) => item.id !== body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.entity === 'coupon') {
      db.coupons = db.coupons.filter((c) => c.id !== body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: 'Entidade inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao remover item.' },
      { status: 400 },
    );
  }
}
