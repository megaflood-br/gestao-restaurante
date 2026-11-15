import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import type {
  StockIngredient,
  StockMovement,
  StockUnit,
  TechnicalSheetIngredient,
} from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    ok: true,
    ingredients: db.ingredients,
    stockMovements: db.stockMovements,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'create_ingredient' | 'adjust_stock';
      name?: string;
      category?: string;
      unit?: StockUnit;
      currentQty?: number;
      minQty?: number;
      unitCost?: number;
      ingredientId?: string;
      movementType?: 'entrada' | 'ajuste';
      quantity?: number;
      reason?: string;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();

    if (body.action === 'create_ingredient') {
      if (!body.name?.trim()) {
        return NextResponse.json(
          { ok: false, error: 'Informe o nome do insumo.' },
          { status: 400 },
        );
      }

      const initialQty = Math.max(0, Number(body.currentQty) || 0);
      const unit: StockUnit = body.unit || 'kg';
      const ingredient: StockIngredient = {
        id: `ing-${Date.now()}`,
        name: body.name.trim(),
        category: body.category?.trim() || 'Insumos Gerais',
        unit,
        currentQty: initialQty,
        minQty: Math.max(0, Number(body.minQty) || 1),
        unitCost: Math.max(0, Number(body.unitCost) || 0),
        updatedAt: now,
      };

      db.ingredients = [ingredient, ...db.ingredients];

      let movement: StockMovement | null = null;
      if (initialQty > 0) {
        movement = {
          id: `mov-init-${Date.now()}`,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          type: 'entrada',
          quantity: initialQty,
          unit,
          previousQty: 0,
          newQty: initialQty,
          reason: 'Saldo inicial de cadastro',
          createdAt: now,
        };
        db.stockMovements = [movement, ...db.stockMovements];
      }

      return NextResponse.json(
        { ok: true, ingredient, movement },
        { status: 201 },
      );
    }

    if (body.action === 'adjust_stock') {
      const ing = db.ingredients.find((i) => i.id === body.ingredientId);
      if (!ing) {
        return NextResponse.json(
          { ok: false, error: 'Insumo não encontrado.' },
          { status: 404 },
        );
      }

      const qty = Number(body.quantity) || 0;
      const previousQty = Number(ing.currentQty.toFixed(4));
      let newQty = previousQty;
      let delta = qty;

      if (body.movementType === 'ajuste') {
        newQty = Math.max(0, Number(qty.toFixed(4)));
        delta = Number(Math.abs(newQty - previousQty).toFixed(4));
      } else {
        newQty = Math.max(0, Number((previousQty + qty).toFixed(4)));
        delta = Number(Math.abs(qty).toFixed(4));
      }

      ing.currentQty = newQty;
      ing.updatedAt = now;

      const movement: StockMovement = {
        id: `mov-adj-${Date.now()}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: body.movementType === 'ajuste' ? 'ajuste' : 'entrada',
        quantity: delta,
        unit: ing.unit,
        previousQty,
        newQty,
        reason:
          body.reason?.trim() ||
          (body.movementType === 'ajuste'
            ? 'Ajuste manual de inventário'
            : 'Entrada de estoque'),
        createdAt: now,
      };

      db.stockMovements = [movement, ...db.stockMovements];
      return NextResponse.json({ ok: true, ingredient: ing, movement });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar estoque.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'update_technical_sheet' | 'update_ingredient';
      menuItemId?: string;
      technicalSheet?: TechnicalSheetIngredient[];
      id?: string;
      updates?: Partial<StockIngredient>;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();

    if (body.action === 'update_technical_sheet' && body.menuItemId) {
      db.menuItems = db.menuItems.map((item) =>
        item.id === body.menuItemId
          ? { ...item, technicalSheet: body.technicalSheet ?? [] }
          : item,
      );
      return NextResponse.json({ ok: true, menuItems: db.menuItems });
    }

    if (body.action === 'update_ingredient' && body.id && body.updates) {
      db.ingredients = db.ingredients.map((ing) =>
        ing.id === body.id
          ? { ...ing, ...body.updates, updatedAt: now }
          : ing,
      );
      return NextResponse.json({ ok: true, ingredients: db.ingredients });
    }

    return NextResponse.json(
      { ok: false, error: 'Parâmetros inválidos.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar ficha técnica ou insumo.' },
      { status: 400 },
    );
  }
}
