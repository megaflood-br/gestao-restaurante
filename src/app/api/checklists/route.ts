import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import type { ChecklistRun, ChecklistTemplate } from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    checklistTemplates: db.checklistTemplates,
    checklistRuns: db.checklistRuns,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'create_template' | 'submit_run';
      template?: ChecklistTemplate;
      run?: ChecklistRun;
    };

    const db = getDeliveryStore();

    if (body.action === 'create_template' && body.template) {
      const exists = db.checklistTemplates.some(
        (t) => t.id === body.template!.id,
      );
      if (exists) {
        db.checklistTemplates = db.checklistTemplates.map((t) =>
          t.id === body.template!.id ? body.template! : t,
        );
      } else {
        db.checklistTemplates = [body.template, ...db.checklistTemplates];
      }
      return NextResponse.json(
        {
          ok: true,
          template: body.template,
          checklistTemplates: db.checklistTemplates,
        },
        { status: 201 },
      );
    }

    if (body.action === 'submit_run' && body.run) {
      const exists = db.checklistRuns.some((r) => r.id === body.run!.id);
      if (exists) {
        db.checklistRuns = db.checklistRuns.map((r) =>
          r.id === body.run!.id ? body.run! : r,
        );
      } else {
        db.checklistRuns = [body.run, ...db.checklistRuns];
      }
      return NextResponse.json(
        {
          ok: true,
          run: body.run,
          checklistRuns: db.checklistRuns,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Ação ou payload inválido.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar checklist.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: 'update_template' | 'update_run';
      templateId?: string;
      runId?: string;
      updates?: Partial<ChecklistTemplate> | Partial<ChecklistRun>;
    };

    const db = getDeliveryStore();

    if (
      body.action === 'update_template' &&
      body.templateId &&
      body.updates
    ) {
      db.checklistTemplates = db.checklistTemplates.map((t) =>
        t.id === body.templateId
          ? {
              ...t,
              ...(body.updates as Partial<ChecklistTemplate>),
              updatedAt: new Date().toISOString(),
            }
          : t,
      );
      return NextResponse.json({
        ok: true,
        checklistTemplates: db.checklistTemplates,
      });
    }

    if (body.action === 'update_run' && body.runId && body.updates) {
      db.checklistRuns = db.checklistRuns.map((r) =>
        r.id === body.runId
          ? { ...r, ...(body.updates as Partial<ChecklistRun>) }
          : r,
      );
      return NextResponse.json({
        ok: true,
        checklistRuns: db.checklistRuns,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao atualizar checklist.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const queryId = url.searchParams.get('templateId');
    let bodyId: string | undefined;
    if (!queryId) {
      const body = (await request.json().catch(() => ({}))) as {
        templateId?: string;
      };
      bodyId = body.templateId;
    }
    const targetId = queryId || bodyId;
    if (!targetId) {
      return NextResponse.json(
        { ok: false, error: 'Informe o ID do modelo.' },
        { status: 400 },
      );
    }

    const db = getDeliveryStore();
    db.checklistTemplates = db.checklistTemplates.filter(
      (t) => t.id !== targetId,
    );
    return NextResponse.json({
      ok: true,
      checklistTemplates: db.checklistTemplates,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao excluir checklist.' },
      { status: 400 },
    );
  }
}
