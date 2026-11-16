import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import { getCurrentMonthKey } from '@/lib/finance-engine';
import type {
  FinancialCategory,
  FinancialEntry,
  FinancialEntryType,
  RecurringExpense,
  RecurringFrequency,
} from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    ok: true,
    financialEntries: db.financialEntries,
    recurringExpenses: db.recurringExpenses,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'add_entry' | 'add_recurring' | 'launch_recurring';
      type?: FinancialEntryType;
      category?: FinancialCategory;
      description?: string;
      name?: string;
      amount?: number;
      date?: string;
      paymentMethod?: string;
      notes?: string;
      dueDay?: number;
      frequency?: RecurringFrequency;
      recurringId?: string;
      launchAllPending?: boolean;
      monthKey?: string;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (body.action === 'add_entry') {
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!body.description?.trim() || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: 'Informe descrição e valor maior que zero.' },
          { status: 400 },
        );
      }

      const entry: FinancialEntry = {
        id: `fin-${Date.now()}`,
        type: body.type === 'entrada' ? 'entrada' : 'custo',
        category: body.category || (body.type === 'entrada' ? 'vendas_extras' : 'outros'),
        description: body.description.trim(),
        amount: Number(amount.toFixed(2)),
        date: body.date?.trim() || today,
        paymentMethod: body.paymentMethod?.trim() || 'Pix',
        notes: body.notes?.trim() || undefined,
        createdAt: now,
      };

      db.financialEntries = [entry, ...db.financialEntries];
      return NextResponse.json({ ok: true, entry }, { status: 201 });
    }

    if (body.action === 'add_recurring') {
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!body.name?.trim() || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: 'Informe o nome do gasto recorrente e um valor válido.' },
          { status: 400 },
        );
      }

      const recurring: RecurringExpense = {
        id: `rec-${Date.now()}`,
        name: body.name.trim(),
        category: body.category || 'utilidades',
        amount: Number(amount.toFixed(2)),
        dueDay: Math.min(31, Math.max(1, Math.round(Number(body.dueDay) || 10))),
        frequency: body.frequency || 'mensal',
        active: true,
      };

      db.recurringExpenses = [recurring, ...db.recurringExpenses];
      return NextResponse.json({ ok: true, recurring }, { status: 201 });
    }

    if (body.action === 'launch_recurring') {
      const monthKey = body.monthKey || getCurrentMonthKey();
      const targets = body.launchAllPending
        ? db.recurringExpenses.filter(
            (r) => r.active && r.lastLaunchedMonth !== monthKey,
          )
        : db.recurringExpenses.filter((r) => r.id === body.recurringId);

      if (targets.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'Nenhum gasto recorrente pendente encontrado para lançar.' },
          { status: 400 },
        );
      }

      const createdEntries: FinancialEntry[] = [];
      const launchedIds = new Set<string>();

      for (const rec of targets) {
        const entry: FinancialEntry = {
          id: `fin-rec-${rec.id}-${Date.now()}-${createdEntries.length}`,
          type: 'custo',
          category: rec.category,
          description: `${rec.name} (${monthKey})`,
          amount: rec.amount,
          date: today,
          paymentMethod: 'Débito / Pix',
          recurringExpenseId: rec.id,
          notes: `Lançado automaticamente a partir do gasto recorrente (venc. dia ${rec.dueDay})`,
          createdAt: now,
        };
        createdEntries.push(entry);
        launchedIds.add(rec.id);
      }

      db.financialEntries = [...createdEntries, ...db.financialEntries];
      db.recurringExpenses = db.recurringExpenses.map((r) =>
        launchedIds.has(r.id) ? { ...r, lastLaunchedMonth: monthKey } : r,
      );

      return NextResponse.json({
        ok: true,
        entries: createdEntries,
        recurringExpenses: db.recurringExpenses,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação financeira inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar lançamento financeiro.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id: string;
      updates: Partial<RecurringExpense>;
    };
    const db = getDeliveryStore();
    db.recurringExpenses = db.recurringExpenses.map((r) =>
      r.id === body.id ? { ...r, ...body.updates } : r,
    );
    return NextResponse.json({
      ok: true,
      recurringExpenses: db.recurringExpenses,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar gasto recorrente.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      entity: 'entry' | 'recurring';
      id: string;
    };
    const db = getDeliveryStore();

    if (body.entity === 'entry') {
      db.financialEntries = db.financialEntries.filter((e) => e.id !== body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.entity === 'recurring') {
      db.recurringExpenses = db.recurringExpenses.filter((r) => r.id !== body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: 'Entidade financeira inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao excluir registro financeiro.' },
      { status: 400 },
    );
  }
}
