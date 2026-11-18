import {
  CHECKLIST_ROLE_LABEL,
  EMPLOYEE_PAY_TYPE_LABEL,
  formatCurrencyBRL,
} from '@/lib/formatters';
import type {
  ChecklistTemplate,
  Employee,
  EmployeeLedgerEntry,
  StaffTask,
} from '@/types/delivery';

export interface EmployeePayrollSummary {
  grossBase: number;
  openBonusTotal: number;
  openValesTotal: number;
  openDeductibleConsumosTotal: number;
  exemptConsumosCount: number;
  netPayable: number;
  openDeductionIds: string[];
  openBonusIds: string[];
  totalPaidAllTime: number;
}

export function computeEmployeePayroll(
  employee: Employee,
  ledger: EmployeeLedgerEntry[],
): EmployeePayrollSummary {
  const empEntries = ledger.filter((e) => e.employeeId === employee.id);

  const openVales = empEntries.filter(
    (e) => e.type === 'vale' && !e.settled && e.deductFromPay,
  );
  const openDeductibleConsumos = empEntries.filter(
    (e) => e.type === 'consumo' && !e.settled && e.deductFromPay,
  );
  const exemptConsumos = empEntries.filter(
    (e) => e.type === 'consumo' && !e.deductFromPay,
  );
  const openBonus = empEntries.filter((e) => e.type === 'bonus' && !e.settled);
  const payments = empEntries.filter((e) => e.type === 'pagamento');

  const openValesTotal = Number(
    openVales.reduce((s, e) => s + e.amount, 0).toFixed(2),
  );
  const openDeductibleConsumosTotal = Number(
    openDeductibleConsumos.reduce((s, e) => s + e.amount, 0).toFixed(2),
  );
  const openBonusTotal = Number(
    openBonus.reduce((s, e) => s + e.amount, 0).toFixed(2),
  );
  const grossBase = Number(employee.baseSalary.toFixed(2));
  const netPayable = Number(
    Math.max(
      0,
      grossBase + openBonusTotal - openValesTotal - openDeductibleConsumosTotal,
    ).toFixed(2),
  );
  const totalPaidAllTime = Number(
    payments.reduce((s, e) => s + e.amount, 0).toFixed(2),
  );

  return {
    grossBase,
    openBonusTotal,
    openValesTotal,
    openDeductibleConsumosTotal,
    exemptConsumosCount: exemptConsumos.length,
    netPayable,
    openDeductionIds: [
      ...openVales.map((v) => v.id),
      ...openDeductibleConsumos.map((c) => c.id),
    ],
    openBonusIds: openBonus.map((b) => b.id),
    totalPaidAllTime,
  };
}

export function formatDateBRFromYMD(ymd: string): string {
  if (!ymd) return '—';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function buildEmployeeReceiptText(params: {
  storeName: string;
  employee: Employee;
  entry: EmployeeLedgerEntry;
  grossBase?: number;
  bonusAdded?: number;
  valesDeducted?: number;
  consumosDeducted?: number;
}): string {
  const {
    storeName,
    employee,
    entry,
    grossBase,
    bonusAdded,
    valesDeducted,
    consumosDeducted,
  } = params;
  const roleLabel = CHECKLIST_ROLE_LABEL[employee.role];
  const dateLabel = formatDateBRFromYMD(entry.date);

  if (entry.type === 'vale') {
    return [
      `*COMPROVANTE DE VALE / ADIANTAMENTO — ${storeName}*`,
      `Colaborador(a): ${employee.name} (${roleLabel})`,
      `Data: ${dateLabel}`,
      `Motivo: ${entry.description}`,
      `Forma: ${entry.paymentMethod || 'Dinheiro / Pix'}`,
      `Valor emitido: *${formatCurrencyBRL(entry.amount)}*`,
      entry.deductFromPay
        ? 'Desconto previsto no fechamento do pagamento.'
        : 'Sem desconto em folha.',
    ].join('\n');
  }

  if (entry.type === 'pagamento') {
    const lines = [
      `*RECIBO DE PAGAMENTO — ${storeName}*`,
      `Colaborador(a): ${employee.name} (${roleLabel} · ${EMPLOYEE_PAY_TYPE_LABEL[employee.payType]})`,
      `Data: ${dateLabel}`,
      `Referência: ${entry.description}`,
    ];
    if (typeof grossBase === 'number') {
      lines.push(`Provento base: ${formatCurrencyBRL(grossBase)}`);
    }
    if (typeof bonusAdded === 'number' && bonusAdded > 0) {
      lines.push(`Bônus / Adicionais: + ${formatCurrencyBRL(bonusAdded)}`);
    }
    if (typeof valesDeducted === 'number' && valesDeducted > 0) {
      lines.push(`Vales descontados: - ${formatCurrencyBRL(valesDeducted)}`);
    }
    if (typeof consumosDeducted === 'number' && consumosDeducted > 0) {
      lines.push(
        `Consumos descontados: - ${formatCurrencyBRL(consumosDeducted)}`,
      );
    }
    lines.push(
      `Total Líquido Pago (${entry.paymentMethod || 'Pix'}${
        employee.pixKey ? ` · Chave: ${employee.pixKey}` : ''
      }): *${formatCurrencyBRL(entry.amount)}*`,
    );
    return lines.join('\n');
  }

  return [
    `*COMPROVANTE DE LANÇAMENTO — ${storeName}*`,
    `Colaborador(a): ${employee.name} (${roleLabel})`,
    `Data: ${dateLabel}`,
    `Descrição: ${entry.description}`,
    `Valor: *${formatCurrencyBRL(entry.amount)}*`,
  ].join('\n');
}

export function getLinkedChecklistsForEmployee(
  employee: Employee,
  templates: ChecklistTemplate[],
): {
  direct: ChecklistTemplate[];
  byRole: ChecklistTemplate[];
  allMatched: ChecklistTemplate[];
} {
  const direct = templates.filter((t) =>
    (t.assignedEmployeeIds ?? []).includes(employee.id),
  );
  const directIds = new Set(direct.map((t) => t.id));
  const byRole = templates.filter(
    (t) =>
      !directIds.has(t.id) &&
      t.role === employee.role &&
      (t.assignedEmployeeIds ?? []).length === 0,
  );
  return {
    direct,
    byRole,
    allMatched: [...direct, ...byRole],
  };
}

export function countOpenTasksForEmployee(
  employeeId: string,
  tasks: StaffTask[],
): number {
  return tasks.filter(
    (t) => t.employeeId === employeeId && t.status !== 'concluida',
  ).length;
}
