import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import { applyWasteStockDeduction } from '@/lib/stock-engine';
import type {
  StockUnit,
  WasteReason,
  WasteTargetType,
} from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    wasteLogs: db.wasteLogs,
    ingredients: db.ingredients,
    stockMovements: db.stockMovements,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      targetType: WasteTargetType;
      targetId: string;
      quantity: number;
      unit?: StockUnit;
      reason: WasteReason;
      employeeName: string;
      notes?: string;
    };

    if (
      !body.targetType ||
      !body.targetId ||
      !Number.isFinite(Number(body.quantity)) ||
      Number(body.quantity) <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: 'Dados inválidos para registro de desperdício.' },
        { status: 400 },
      );
    }

    const db = getDeliveryStore();
    const result = applyWasteStockDeduction({
      targetType: body.targetType,
      targetId: body.targetId,
      quantity: Number(body.quantity),
      unit: body.unit,
      reason: body.reason || 'outros',
      employeeName: body.employeeName || 'Cozinheira',
      notes: body.notes,
      menuItems: db.menuItems,
      ingredients: db.ingredients,
    });

    db.ingredients = result.ingredients;
    if (result.newMovements.length > 0) {
      db.stockMovements = [...result.newMovements, ...db.stockMovements];
    }
    db.wasteLogs = [result.wasteLog, ...db.wasteLogs];

    return NextResponse.json(
      {
        ok: true,
        wasteLog: result.wasteLog,
        deducted: result.deducted,
        ingredients: db.ingredients,
        stockMovements: db.stockMovements,
        wasteLogs: db.wasteLogs,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao registrar desperdício.' },
      { status: 400 },
    );
  }
}
