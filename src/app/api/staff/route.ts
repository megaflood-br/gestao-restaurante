import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore } from '@/lib/server-store';
import { normalizePhoneDigits } from '@/lib/crm-engine';
import {
  getEvolutionEnvConfig,
  isPhoneOptedOut,
  sendEvolutionText,
} from '@/lib/evolution-client';
import { buildEmployeeReceiptText } from '@/lib/staff-engine';
import type {
  Employee,
  EmployeeLedgerEntry,
  FinancialEntry,
  StaffTask,
  StaffTaskStatus,
} from '@/types/delivery';

export async function GET() {
  const db = getDeliveryStore();
  return NextResponse.json({
    employees: db.employees,
    staffTasks: db.staffTasks,
    employeeLedger: db.employeeLedger,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action:
        | 'upsert_employee'
        | 'upsert_task'
        | 'toggle_task_status'
        | 'toggle_checklist_link'
        | 'add_ledger_entry'
        | 'send_receipt_whatsapp';
      employee?: Employee;
      task?: StaffTask;
      taskId?: string;
      nextStatus?: StaffTaskStatus;
      employeeId?: string;
      templateId?: string;
      linked?: boolean;
      entry?: EmployeeLedgerEntry;
      markSettledIds?: string[];
      launchToFinance?: boolean;
      entryId?: string;
      customMessage?: string;
    };

    const db = getDeliveryStore();
    const now = new Date().toISOString();

    if (body.action === 'upsert_employee' && body.employee) {
      const cleanPhone = normalizePhoneDigits(body.employee.phone);
      const nextEmployee: Employee = {
        ...body.employee,
        phone: cleanPhone,
        updatedAt: now,
      };
      const exists = db.employees.some((e) => e.id === nextEmployee.id);
      db.employees = exists
        ? db.employees.map((e) => (e.id === nextEmployee.id ? nextEmployee : e))
        : [nextEmployee, ...db.employees];

      // Keep employeeName synced across tasks if renamed
      db.staffTasks = db.staffTasks.map((t) =>
        t.employeeId === nextEmployee.id
          ? { ...t, employeeName: nextEmployee.name }
          : t,
      );

      return NextResponse.json({
        ok: true,
        employee: nextEmployee,
        employees: db.employees,
      });
    }

    if (body.action === 'upsert_task' && body.task) {
      const exists = db.staffTasks.some((t) => t.id === body.task!.id);
      db.staffTasks = exists
        ? db.staffTasks.map((t) => (t.id === body.task!.id ? body.task! : t))
        : [body.task, ...db.staffTasks];
      return NextResponse.json({
        ok: true,
        task: body.task,
        staffTasks: db.staffTasks,
      });
    }

    if (
      body.action === 'toggle_task_status' &&
      body.taskId &&
      body.nextStatus
    ) {
      db.staffTasks = db.staffTasks.map((t) =>
        t.id === body.taskId
          ? {
              ...t,
              status: body.nextStatus!,
              completedAt:
                body.nextStatus === 'concluida' ? now : undefined,
            }
          : t,
      );
      return NextResponse.json({
        ok: true,
        staffTasks: db.staffTasks,
      });
    }

    if (
      body.action === 'toggle_checklist_link' &&
      body.employeeId &&
      body.templateId
    ) {
      db.checklistTemplates = db.checklistTemplates.map((tpl) => {
        if (tpl.id !== body.templateId) return tpl;
        const current = tpl.assignedEmployeeIds ?? [];
        const has = current.includes(body.employeeId!);
        const shouldLink =
          typeof body.linked === 'boolean' ? body.linked : !has;
        const nextIds = shouldLink
          ? Array.from(new Set([...current, body.employeeId!]))
          : current.filter((id) => id !== body.employeeId!);
        return {
          ...tpl,
          assignedEmployeeIds: nextIds,
          updatedAt: now,
        };
      });
      return NextResponse.json({
        ok: true,
        checklistTemplates: db.checklistTemplates,
      });
    }

    if (body.action === 'add_ledger_entry' && body.entry) {
      let nextEntry = { ...body.entry };
      let createdFinance: FinancialEntry | null = null;

      if (body.launchToFinance && nextEntry.amount > 0) {
        const finId = `fin-emp-${Date.now()}`;
        const labelPrefix =
          nextEntry.type === 'vale'
            ? 'Vale funcionário'
            : nextEntry.type === 'pagamento'
              ? 'Pagamento salário'
              : nextEntry.type === 'bonus'
                ? 'Bônus equipe'
                : 'Despesa funcionário';

        createdFinance = {
          id: finId,
          type: 'custo',
          category: 'equipe_entregas',
          description: `${labelPrefix} · ${nextEntry.employeeName} — ${nextEntry.description}`,
          amount: nextEntry.amount,
          date: nextEntry.date,
          paymentMethod: nextEntry.paymentMethod || 'Pix',
          notes: `Lançado via módulo Funcionários (${nextEntry.id})`,
          createdAt: now,
        };
        db.financialEntries = [createdFinance, ...db.financialEntries];
        nextEntry = { ...nextEntry, financialEntryId: finId };
      }

      if (
        nextEntry.type === 'pagamento' &&
        Array.isArray(body.markSettledIds) &&
        body.markSettledIds.length > 0
      ) {
        const settleSet = new Set(body.markSettledIds);
        db.employeeLedger = db.employeeLedger.map((item) =>
          settleSet.has(item.id)
            ? { ...item, settled: true, settlementRefId: nextEntry.id }
            : item,
        );
      }

      db.employeeLedger = [nextEntry, ...db.employeeLedger];

      return NextResponse.json(
        {
          ok: true,
          entry: nextEntry,
          employeeLedger: db.employeeLedger,
          financialEntry: createdFinance,
        },
        { status: 201 },
      );
    }

    if (body.action === 'send_receipt_whatsapp' && body.entryId) {
      const entry = db.employeeLedger.find((e) => e.id === body.entryId);
      if (!entry) {
        return NextResponse.json(
          { ok: false, error: 'Lançamento não encontrado.' },
          { status: 404 },
        );
      }
      const employee = db.employees.find((e) => e.id === entry.employeeId);
      if (!employee || !employee.phone) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Funcionário sem número de WhatsApp cadastrado.',
          },
          { status: 400 },
        );
      }
      if (isPhoneOptedOut(db.store.evolution, employee.phone)) {
        return NextResponse.json(
          { ok: false, error: 'Número marcado em opt-out no WhatsApp.' },
          { status: 400 },
        );
      }

      const text =
        body.customMessage?.trim() ||
        entry.receiptText ||
        buildEmployeeReceiptText({
          storeName: db.store.name,
          employee,
          entry,
        });

      const env = getEvolutionEnvConfig();
      let dispatchStatus: 'enviada' | 'simulada' | 'erro' = 'simulada';
      if (
        env.isConfigured &&
        db.store.evolution.connectionStatus === 'conectado'
      ) {
        const res = await sendEvolutionText(
          db.store.evolution.instanceName,
          employee.phone,
          text,
        );
        dispatchStatus = res.ok ? 'enviada' : 'erro';
      }

      const log = {
        id: `wlog-emp-${Date.now()}`,
        direction: 'outbound' as const,
        phone: employee.phone,
        customerName: employee.name,
        message: text,
        event:
          entry.type === 'vale'
            ? 'EMPLOYEE_VALE_RECEIPT'
            : 'EMPLOYEE_PAYROLL_RECEIPT',
        status: dispatchStatus,
        engine: 'template' as const,
        timestamp: now,
      };
      db.whatsappLogs = [log, ...db.whatsappLogs];
      db.employeeLedger = db.employeeLedger.map((e) =>
        e.id === entry.id
          ? { ...e, whatsappSent: true, receiptText: text }
          : e,
      );

      return NextResponse.json({
        ok: true,
        log,
        employeeLedger: db.employeeLedger,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Ação inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar operação de funcionários.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get('entity');
    const id = url.searchParams.get('id');
    if (!entity || !id) {
      return NextResponse.json(
        { ok: false, error: 'Parâmetros entity e id são obrigatórios.' },
        { status: 400 },
      );
    }

    const db = getDeliveryStore();
    if (entity === 'employee') {
      db.employees = db.employees.filter((e) => e.id !== id);
      db.staffTasks = db.staffTasks.filter((t) => t.employeeId !== id);
      db.employeeLedger = db.employeeLedger.filter((e) => e.employeeId !== id);
      db.checklistTemplates = db.checklistTemplates.map((tpl) => ({
        ...tpl,
        assignedEmployeeIds: (tpl.assignedEmployeeIds ?? []).filter(
          (empId) => empId !== id,
        ),
      }));
      return NextResponse.json({
        ok: true,
        employees: db.employees,
        staffTasks: db.staffTasks,
        employeeLedger: db.employeeLedger,
      });
    }

    if (entity === 'task') {
      db.staffTasks = db.staffTasks.filter((t) => t.id !== id);
      return NextResponse.json({ ok: true, staffTasks: db.staffTasks });
    }

    if (entity === 'ledger') {
      db.employeeLedger = db.employeeLedger.filter((e) => e.id !== id);
      return NextResponse.json({
        ok: true,
        employeeLedger: db.employeeLedger,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Entidade inválida.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao remover registro.' },
      { status: 400 },
    );
  }
}
