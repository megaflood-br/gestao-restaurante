'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  ListChecks,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  Trash2,
  UserPlus,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import {
  CHECKLIST_FREQUENCY_LABEL,
  CHECKLIST_ROLE_LABEL,
  CHECKLIST_SHIFT_LABEL,
  EMPLOYEE_PAY_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  LEDGER_TYPE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  WEEKDAY_LABEL,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '@/lib/formatters';
import {
  buildEmployeeReceiptText,
  computeEmployeePayroll,
  countOpenTasksForEmployee,
  formatDateBRFromYMD,
  getLinkedChecklistsForEmployee,
} from '@/lib/staff-engine';
import type {
  ChecklistRole,
  ChecklistShift,
  DeliveryStoreState,
  Employee,
  EmployeeLedgerEntry,
  EmployeeLedgerType,
  EmployeePayType,
  EmployeeStatus,
  StaffTask,
  StaffTaskPriority,
  StaffTaskStatus,
} from '@/types/delivery';

export interface AddEmployeeLedgerPayload {
  entry: EmployeeLedgerEntry;
  markSettledIds?: string[];
  launchToFinance?: boolean;
  sendWhatsapp?: boolean;
}

interface FuncionariosSectionProps {
  state: DeliveryStoreState;
  onUpsertEmployee: (employee: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onUpsertTask: (task: StaffTask) => void;
  onToggleTaskStatus: (taskId: string, nextStatus: StaffTaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleChecklistLink: (employeeId: string, templateId: string) => void;
  onAddLedgerEntry: (
    payload: AddEmployeeLedgerPayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteLedgerEntry: (entryId: string) => void;
  onSendReceiptWhatsapp: (
    entryId: string,
    customMessage?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenChecklistsModule?: () => void;
}

type MainViewMode = 'equipe' | 'tarefas';
type ProfileTab = 'folha' | 'vinculos' | 'cadastro';
type LedgerActionModal = null | 'vale' | 'consumo' | 'pagamento' | 'bonus';

const ROLE_OPTIONS: ChecklistRole[] = [
  'cozinha',
  'atendimento',
  'limpeza',
  'gerencia',
  'entregadores',
];

const SHIFT_OPTIONS: ChecklistShift[] = [
  'abertura',
  'almoco',
  'jantar',
  'fechamento',
  'geral',
];

const PAY_TYPE_OPTIONS: EmployeePayType[] = [
  'mensal',
  'semanal',
  'quinzenal',
  'diaria',
  'hora',
];
const STATUS_OPTIONS: EmployeeStatus[] = ['ativo', 'ferias', 'inativo'];

const NEXT_TASK_STATUS: Record<StaffTaskStatus, StaffTaskStatus> = {
  pendente: 'em_andamento',
  em_andamento: 'concluida',
  concluida: 'pendente',
};

export function FuncionariosSection({
  state,
  onUpsertEmployee,
  onDeleteEmployee,
  onUpsertTask,
  onToggleTaskStatus,
  onDeleteTask,
  onToggleChecklistLink,
  onAddLedgerEntry,
  onDeleteLedgerEntry,
  onSendReceiptWhatsapp,
  onOpenChecklistsModule,
}: FuncionariosSectionProps) {
  const employees = state.employees ?? [];
  const tasks = state.staffTasks ?? [];
  const ledger = state.employeeLedger ?? [];
  const checklistTemplates = state.checklistTemplates ?? [];
  const checklistRuns = state.checklistRuns ?? [];

  const [mainView, setMainView] = useState<MainViewMode>('equipe');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    employees[0]?.id ?? '',
  );
  const [profileTab, setProfileTab] = useState<ProfileTab>('folha');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | ChecklistRole>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | EmployeeStatus>(
    'todos',
  );
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Confirmations (inline 2-step, zero window.confirm)
  const [confirmDeleteEmpId, setConfirmDeleteEmpId] = useState<string | null>(
    null,
  );
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<
    string | null
  >(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(
    null,
  );

  // Employee create/edit modal
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empRole, setEmpRole] = useState<ChecklistRole>('cozinha');
  const [empShift, setEmpShift] = useState<ChecklistShift>('abertura');
  const [empPayType, setEmpPayType] = useState<EmployeePayType>('mensal');
  const [empSalary, setEmpSalary] = useState('2200');
  const [empPayDay, setEmpPayDay] = useState('5');
  const [empPayWeekday, setEmpPayWeekday] = useState<number>(5);
  const [empPixKey, setEmpPixKey] = useState('');
  const [empAdmissionDate, setEmpAdmissionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [empStatus, setEmpStatus] = useState<EmployeeStatus>('ativo');
  const [empNotes, setEmpNotes] = useState('');

  // Ledger action modal (vale / consumo / pagamento / bonus)
  const [ledgerModal, setLedgerModal] = useState<LedgerActionModal>(null);
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerDate, setLedgerDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [ledgerDesc, setLedgerDesc] = useState('');
  const [ledgerMethod, setLedgerMethod] = useState('Pix');
  const [ledgerDeductFromPay, setLedgerDeductFromPay] = useState(true);
  const [ledgerLaunchToFinance, setLedgerLaunchToFinance] = useState(true);
  const [ledgerSendWhatsapp, setLedgerSendWhatsapp] = useState(true);
  const [ledgerMenuItemId, setLedgerMenuItemId] = useState<string>('');
  const [ledgerQuantity, setLedgerQuantity] = useState('1');
  const [ledgerDiscountPct, setLedgerDiscountPct] = useState('0');
  const [ledgerConsumoMode, setLedgerConsumoMode] = useState<'item' | 'livre'>(
    'item',
  );
  const [settleSelectedIds, setSettleSelectedIds] = useState<string[]>([]);
  const [submittingLedger, setSubmittingLedger] = useState(false);

  // Receipt preview modal
  const [receiptEntry, setReceiptEntry] = useState<EmployeeLedgerEntry | null>(
    null,
  );
  const [copiedReceipt, setCopiedReceipt] = useState(false);
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null);

  // Inline / Quick Task Form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskEmployeeId, setTaskEmployeeId] = useState('');
  const [taskChecklistId, setTaskChecklistId] = useState('');
  const [taskPriority, setTaskPriority] = useState<StaffTaskPriority>('normal');
  const [taskDueLabel, setTaskDueLabel] = useState('Hoje · Fim do turno');

  // Task board filters
  const [taskBoardStatus, setTaskBoardStatus] = useState<
    'todas' | StaffTaskStatus
  >('todas');
  const [taskBoardEmployee, setTaskBoardEmployee] = useState<string>('todos');

  // Ledger filter inside profile
  const [ledgerFilter, setLedgerFilter] = useState<'todos' | EmployeeLedgerType>(
    'todos',
  );

  // Keep selected employee valid
  useEffect(() => {
    if (
      employees.length > 0 &&
      !employees.some((e) => e.id === selectedEmployeeId)
    ) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEmpModalOpen(false);
        setLedgerModal(null);
        setReceiptEntry(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const selectedPayroll = useMemo(() => {
    if (!selectedEmployee) return null;
    return computeEmployeePayroll(selectedEmployee, ledger);
  }, [selectedEmployee, ledger]);

  const teamKpis = useMemo(() => {
    const activeEmployees = employees.filter((e) => e.status === 'ativo');
    const openValesAndConsumos = ledger
      .filter(
        (e) =>
          (e.type === 'vale' || e.type === 'consumo') &&
          !e.settled &&
          e.deductFromPay,
      )
      .reduce((sum, e) => sum + e.amount, 0);

    const netPayrollTotal = activeEmployees.reduce((sum, emp) => {
      return sum + computeEmployeePayroll(emp, ledger).netPayable;
    }, 0);

    const pendingTasksCount = tasks.filter(
      (t) => t.status !== 'concluida',
    ).length;

    return {
      activeCount: activeEmployees.length,
      totalCount: employees.length,
      openDeductionsTotal: Number(openValesAndConsumos.toFixed(2)),
      netPayrollTotal: Number(netPayrollTotal.toFixed(2)),
      pendingTasksCount,
    };
  }, [employees, ledger, tasks]);

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      if (roleFilter !== 'todos' && emp.role !== roleFilter) return false;
      if (statusFilter !== 'todos' && emp.status !== statusFilter) return false;
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.phone.toLowerCase().includes(q) ||
        CHECKLIST_ROLE_LABEL[emp.role].toLowerCase().includes(q)
      );
    });
  }, [employees, roleFilter, statusFilter, searchTerm]);

  const selectedEmployeeLedger = useMemo(() => {
    if (!selectedEmployee) return [];
    return ledger
      .filter(
        (item) =>
          item.employeeId === selectedEmployee.id &&
          (ledgerFilter === 'todos' || item.type === ledgerFilter),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [ledger, selectedEmployee, ledgerFilter]);

  const selectedEmployeeTasks = useMemo(() => {
    if (!selectedEmployee) return [];
    return tasks.filter((t) => t.employeeId === selectedEmployee.id);
  }, [tasks, selectedEmployee]);

  const selectedEmployeeChecklists = useMemo(() => {
    if (!selectedEmployee) return { direct: [], byRole: [], allMatched: [] };
    return getLinkedChecklistsForEmployee(selectedEmployee, checklistTemplates);
  }, [selectedEmployee, checklistTemplates]);

  const selectedEmployeeRuns = useMemo(() => {
    if (!selectedEmployee) return [];
    const lowerName = selectedEmployee.name.toLowerCase();
    return checklistRuns
      .filter(
        (run) =>
          run.employeeId === selectedEmployee.id ||
          run.employeeName.toLowerCase().includes(lowerName.split(' ')[0]),
      )
      .slice(0, 6);
  }, [selectedEmployee, checklistRuns]);

  const filteredBoardTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (taskBoardStatus !== 'todas' && t.status !== taskBoardStatus)
        return false;
      if (taskBoardEmployee !== 'todos' && t.employeeId !== taskBoardEmployee)
        return false;
      return true;
    });
  }, [tasks, taskBoardStatus, taskBoardEmployee]);

  // Handlers
  const openCreateEmployeeModal = () => {
    setEditingEmp(null);
    setEmpName('');
    setEmpPhone('');
    setEmpRole('cozinha');
    setEmpShift('abertura');
    setEmpPayType('mensal');
    setEmpSalary('2200');
    setEmpPayDay('5');
    setEmpPayWeekday(5);
    setEmpPixKey('');
    setEmpAdmissionDate(new Date().toISOString().slice(0, 10));
    setEmpStatus('ativo');
    setEmpNotes('');
    setEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpName(emp.name);
    setEmpPhone(emp.phone);
    setEmpRole(emp.role);
    setEmpShift(emp.defaultShift);
    setEmpPayType(emp.payType);
    setEmpSalary(String(emp.baseSalary));
    setEmpPayDay(String(emp.payDay));
    setEmpPayWeekday(typeof emp.payWeekday === 'number' ? emp.payWeekday : 5);
    setEmpPixKey(emp.pixKey ?? '');
    setEmpAdmissionDate(emp.admissionDate);
    setEmpStatus(emp.status);
    setEmpNotes(emp.notes ?? '');
    setEmpModalOpen(true);
  };

  const handleSaveEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = empName.trim();
    if (!cleanName) return;
    const nowIso = new Date().toISOString();
    const salaryNum = Math.max(
      0,
      Number(empSalary.replace(',', '.')) || 0,
    );
    const payDayNum = Math.min(31, Math.max(1, Number(empPayDay) || 5));

    const nextEmp: Employee = {
      id: editingEmp?.id ?? `emp-${Date.now()}`,
      name: cleanName,
      phone: empPhone.replace(/\D/g, ''),
      role: empRole,
      defaultShift: empShift,
      payType: empPayType,
      baseSalary: salaryNum,
      payDay: payDayNum,
      payWeekday: empPayType === 'semanal' ? empPayWeekday : undefined,
      pixKey: empPixKey.trim() || undefined,
      admissionDate: empAdmissionDate || nowIso.slice(0, 10),
      status: empStatus,
      notes: empNotes.trim() || undefined,
      createdAt: editingEmp?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    onUpsertEmployee(nextEmp);
    setSelectedEmployeeId(nextEmp.id);
    setEmpModalOpen(false);
    setFeedback({
      type: 'ok',
      text: editingEmp
        ? `Cadastro de ${nextEmp.name} atualizado.`
        : `Funcionário ${nextEmp.name} cadastrado com sucesso.`,
    });
  };

  const openLedgerAction = (mode: Exclude<LedgerActionModal, null>) => {
    if (!selectedEmployee || !selectedPayroll) return;
    const today = new Date().toISOString().slice(0, 10);
    setLedgerModal(mode);
    setLedgerDate(today);
    setLedgerMethod('Pix');

    if (mode === 'vale') {
      setLedgerAmount('100');
      setLedgerDesc('Vale / Adiantamento salarial');
      setLedgerDeductFromPay(true);
      setLedgerLaunchToFinance(true);
      setLedgerSendWhatsapp(Boolean(selectedEmployee.phone));
    } else if (mode === 'consumo') {
      const firstMenu = state.menuItems[0];
      setLedgerConsumoMode('item');
      setLedgerMenuItemId(firstMenu?.id ?? '');
      setLedgerQuantity('1');
      setLedgerDiscountPct('0');
      setLedgerAmount(firstMenu ? String(firstMenu.price.toFixed(2)) : '25');
      setLedgerDesc('');
      setLedgerDeductFromPay(true);
      setLedgerLaunchToFinance(false);
      setLedgerSendWhatsapp(false);
    } else if (mode === 'bonus') {
      setLedgerAmount('100');
      setLedgerDesc('Bonificação por metas / hora extra');
      setLedgerDeductFromPay(false);
      setLedgerLaunchToFinance(false);
      setLedgerSendWhatsapp(false);
    } else if (mode === 'pagamento') {
      const ids = [
        ...selectedPayroll.openDeductionIds,
        ...selectedPayroll.openBonusIds,
      ];
      setSettleSelectedIds(ids);
      setLedgerAmount(String(selectedPayroll.netPayable.toFixed(2)));
      let defaultPayDesc = `Pagamento ${EMPLOYEE_PAY_TYPE_LABEL[selectedEmployee.payType]} (${today.slice(0, 7)})`;
      if (selectedEmployee.payType === 'semanal') {
        const end = new Date();
        const start = new Date(end.getTime() - 6 * 86400000);
        const fmt = (d: Date) =>
          d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        defaultPayDesc = `Pagamento Semanal (${fmt(start)} a ${fmt(end)})`;
      }
      setLedgerDesc(defaultPayDesc);
      setLedgerDeductFromPay(false);
      setLedgerLaunchToFinance(true);
      setLedgerSendWhatsapp(Boolean(selectedEmployee.phone));
    }
  };

  // Auto-recompute consumo total when menu item / quantity / discount changes
  const computedConsumoValue = useMemo(() => {
    if (ledgerModal !== 'consumo' || ledgerConsumoMode !== 'item') return null;
    const item = state.menuItems.find((m) => m.id === ledgerMenuItemId);
    if (!item) return null;
    const qty = Math.max(1, Number(ledgerQuantity) || 1);
    const disc = Math.min(100, Math.max(0, Number(ledgerDiscountPct) || 0));
    const total = Number((item.price * qty * (1 - disc / 100)).toFixed(2));
    return { item, qty, total };
  }, [
    ledgerModal,
    ledgerConsumoMode,
    ledgerMenuItemId,
    ledgerQuantity,
    ledgerDiscountPct,
    state.menuItems,
  ]);

  // Dynamic payroll preview during pagamento modal based on checked items
  const paymentSettlementBreakdown = useMemo(() => {
    if (!selectedEmployee || ledgerModal !== 'pagamento') return null;
    const settleSet = new Set(settleSelectedIds);
    const empEntries = ledger.filter(
      (e) => e.employeeId === selectedEmployee.id && !e.settled,
    );
    const valesDeducted = empEntries
      .filter((e) => e.type === 'vale' && e.deductFromPay && settleSet.has(e.id))
      .reduce((s, e) => s + e.amount, 0);
    const consumosDeducted = empEntries
      .filter(
        (e) => e.type === 'consumo' && e.deductFromPay && settleSet.has(e.id),
      )
      .reduce((s, e) => s + e.amount, 0);
    const bonusAdded = empEntries
      .filter((e) => e.type === 'bonus' && settleSet.has(e.id))
      .reduce((s, e) => s + e.amount, 0);
    const suggestedNet = Number(
      Math.max(
        0,
        selectedEmployee.baseSalary +
          bonusAdded -
          valesDeducted -
          consumosDeducted,
      ).toFixed(2),
    );
    return {
      valesDeducted: Number(valesDeducted.toFixed(2)),
      consumosDeducted: Number(consumosDeducted.toFixed(2)),
      bonusAdded: Number(bonusAdded.toFixed(2)),
      suggestedNet,
      openItems: empEntries.filter(
        (e) =>
          e.type === 'bonus' ||
          ((e.type === 'vale' || e.type === 'consumo') && e.deductFromPay),
      ),
    };
  }, [selectedEmployee, ledgerModal, settleSelectedIds, ledger]);

  const handleToggleSettleItem = (id: string) => {
    setSettleSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];

      if (selectedEmployee) {
        const settleSet = new Set(next);
        const empEntries = ledger.filter(
          (e) => e.employeeId === selectedEmployee.id && !e.settled,
        );
        const deductions = empEntries
          .filter(
            (e) =>
              (e.type === 'vale' || e.type === 'consumo') &&
              e.deductFromPay &&
              settleSet.has(e.id),
          )
          .reduce((s, e) => s + e.amount, 0);
        const bonuses = empEntries
          .filter((e) => e.type === 'bonus' && settleSet.has(e.id))
          .reduce((s, e) => s + e.amount, 0);
        const recomputed = Math.max(
          0,
          selectedEmployee.baseSalary + bonuses - deductions,
        );
        setLedgerAmount(recomputed.toFixed(2));
      }
      return next;
    });
  };

  const handleSubmitLedgerModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !ledgerModal) return;
    setSubmittingLedger(true);

    const nowIso = new Date().toISOString();
    const numericAmount =
      ledgerModal === 'consumo' && ledgerConsumoMode === 'item' && computedConsumoValue
        ? ledgerDeductFromPay
          ? computedConsumoValue.total
          : 0
        : Math.max(0, Number(ledgerAmount.replace(',', '.')) || 0);

    const description =
      ledgerModal === 'consumo' && ledgerConsumoMode === 'item' && computedConsumoValue
        ? ledgerDesc.trim() ||
          `${computedConsumoValue.qty}x ${computedConsumoValue.item.name}${
            !ledgerDeductFromPay ? ' (cortesia/turno)' : ''
          }`
        : ledgerDesc.trim() || LEDGER_TYPE_LABEL[ledgerModal];

    const draftEntry: EmployeeLedgerEntry = {
      id: `eled-${Date.now()}`,
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      type: ledgerModal,
      amount: Number(numericAmount.toFixed(2)),
      date: ledgerDate || nowIso.slice(0, 10),
      description,
      menuItemId:
        ledgerModal === 'consumo' && ledgerConsumoMode === 'item'
          ? computedConsumoValue?.item.id
          : undefined,
      menuItemName:
        ledgerModal === 'consumo' && ledgerConsumoMode === 'item'
          ? computedConsumoValue?.item.name
          : undefined,
      quantity:
        ledgerModal === 'consumo' && ledgerConsumoMode === 'item'
          ? computedConsumoValue?.qty
          : undefined,
      deductFromPay:
        ledgerModal === 'vale' || ledgerModal === 'consumo'
          ? ledgerDeductFromPay
          : false,
      settled:
        ledgerModal === 'pagamento' ||
        (ledgerModal === 'consumo' && !ledgerDeductFromPay),
      paymentMethod:
        ledgerModal === 'vale' || ledgerModal === 'pagamento'
          ? ledgerMethod
          : undefined,
      createdAt: nowIso,
    };

    if (ledgerModal === 'vale' || ledgerModal === 'pagamento') {
      draftEntry.receiptText = buildEmployeeReceiptText({
        storeName: state.store.name,
        employee: selectedEmployee,
        entry: draftEntry,
        grossBase:
          ledgerModal === 'pagamento' ? selectedEmployee.baseSalary : undefined,
        bonusAdded: paymentSettlementBreakdown?.bonusAdded,
        valesDeducted: paymentSettlementBreakdown?.valesDeducted,
        consumosDeducted: paymentSettlementBreakdown?.consumosDeducted,
      });
    }

    const res = await onAddLedgerEntry({
      entry: draftEntry,
      markSettledIds:
        ledgerModal === 'pagamento' ? settleSelectedIds : undefined,
      launchToFinance:
        ledgerModal === 'vale' || ledgerModal === 'pagamento'
          ? ledgerLaunchToFinance
          : false,
      sendWhatsapp:
        (ledgerModal === 'vale' || ledgerModal === 'pagamento') &&
        ledgerSendWhatsapp,
    });

    setSubmittingLedger(false);
    setLedgerModal(null);

    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `${LEDGER_TYPE_LABEL[draftEntry.type]} registrado para ${selectedEmployee.name}.`,
      });
      if (draftEntry.type === 'vale' || draftEntry.type === 'pagamento') {
        setReceiptEntry(draftEntry);
      }
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Não foi possível registrar o lançamento.',
      });
    }
  };

  const handleCreateTask = (e: React.FormEvent, targetEmpId?: string) => {
    e.preventDefault();
    const cleanTitle = taskTitle.trim();
    const empId = targetEmpId || taskEmployeeId || selectedEmployee?.id;
    const emp = employees.find((item) => item.id === empId);
    if (!cleanTitle || !emp) return;

    const newTask: StaffTask = {
      id: `task-${Date.now()}`,
      title: cleanTitle,
      description: taskDesc.trim() || undefined,
      employeeId: emp.id,
      employeeName: emp.name,
      linkedChecklistId: taskChecklistId || undefined,
      priority: taskPriority,
      dueLabel: taskDueLabel.trim() || undefined,
      status: 'pendente',
      createdAt: new Date().toISOString(),
    };

    onUpsertTask(newTask);
    setTaskTitle('');
    setTaskDesc('');
    setTaskChecklistId('');
    setFeedback({
      type: 'ok',
      text: `Tarefa "${newTask.title}" atribuída para ${emp.name}.`,
    });
  };

  const handleCopyReceipt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2200);
    } catch {
      // clipboard blocked
    }
  };

  const handleSendWhatsappForEntry = async (entry: EmployeeLedgerEntry) => {
    setSendingReceiptId(entry.id);
    const res = await onSendReceiptWhatsapp(entry.id, entry.receiptText);
    setSendingReceiptId(null);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `Comprovante enviado via WhatsApp para ${entry.employeeName}.`,
      });
      if (receiptEntry?.id === entry.id) {
        setReceiptEntry({ ...entry, whatsappSent: true });
      }
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erro ao enviar comprovante no WhatsApp.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Funcionários, Vales e Folha
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cadastre a equipe, vincule checklists e tarefas, emita vales, lance consumos e feche pagamentos com recibo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/equipe"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Portal da Equipe (/equipe)</span>
          </a>
          <button
            type="button"
            onClick={openCreateEmployeeModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Cadastrar Funcionário</span>
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Colaboradores Ativos
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
            {teamKpis.activeCount}
            <span className="text-sm font-normal text-slate-400 ml-1">
              /{teamKpis.totalCount}
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Vales e Consumos em Aberto
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400 mt-1">
            {formatCurrencyBRL(teamKpis.openDeductionsTotal)}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Folha Líquida Prevista
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400 mt-1">
            {formatCurrencyBRL(teamKpis.netPayrollTotal)}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tarefas Pendentes
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
            {teamKpis.pendingTasksCount}
          </p>
        </div>
      </section>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main View Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMainView('equipe')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              mainView === 'equipe'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Equipe & Ficha Individual</span>
          </button>
          <button
            type="button"
            onClick={() => setMainView('tarefas')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              mainView === 'tarefas'
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Quadro de Tarefas ({teamKpis.pendingTasksCount} abertas)
            </span>
          </button>
        </div>

        {onOpenChecklistsModule && (
          <button
            type="button"
            onClick={onOpenChecklistsModule}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Gerenciar Modelos de Checklist</span>
          </button>
        )}
      </div>

      {/* VIEW 1: DIRECTORY + 360 PROFILE */}
      {mainView === 'equipe' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Directory */}
          <aside className="lg:col-span-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar nome, cargo ou WhatsApp..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as 'todos' | ChecklistRole)
                  }
                  aria-label="Filtrar por setor"
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="todos">Todos os setores</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {CHECKLIST_ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'todos' | EmployeeStatus)
                  }
                  aria-label="Filtrar por status"
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="todos">Todos os status</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {EMPLOYEE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Nenhum funcionário encontrado.
                </p>
                <button
                  type="button"
                  onClick={openCreateEmployeeModal}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Cadastrar primeiro colaborador
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[640px] overflow-y-auto">
                {filteredEmployees.map((emp) => {
                  const active = emp.id === selectedEmployee?.id;
                  const summary = computeEmployeePayroll(emp, ledger);
                  const openTasks = countOpenTasksForEmployee(emp.id, tasks);
                  const linkedCount = getLinkedChecklistsForEmployee(
                    emp,
                    checklistTemplates,
                  ).direct.length;

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`w-full text-left p-4 transition-colors ${
                        active
                          ? 'bg-brand-50/70 dark:bg-brand-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {emp.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {CHECKLIST_ROLE_LABEL[emp.role]} ·{' '}
                            {EMPLOYEE_PAY_TYPE_LABEL[emp.payType]}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            emp.status === 'ativo'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : emp.status === 'ferias'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-400'
                          }`}
                        >
                          {EMPLOYEE_STATUS_LABEL[emp.status]}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono-tabular text-slate-600 dark:text-slate-400">
                        <span>
                          {linkedCount} checklists · {openTasks} tarefas
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Líq. {formatCurrencyBRL(summary.netPayable)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right 360 Profile */}
          <section className="lg:col-span-8 space-y-5">
            {!selectedEmployee || !selectedPayroll ? (
              <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Selecione ou cadastre um funcionário para gerenciar vales, pagamentos e checklists.
                </p>
                <button
                  type="button"
                  onClick={openCreateEmployeeModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Cadastrar Funcionário</span>
                </button>
              </div>
            ) : (
              <>
                {/* Employee Header Card */}
                <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {CHECKLIST_ROLE_LABEL[selectedEmployee.role]}
                        </span>
                        <span>·</span>
                        <span>
                          {CHECKLIST_SHIFT_LABEL[selectedEmployee.defaultShift]}
                        </span>
                        <span>·</span>
                        <span>
                          {EMPLOYEE_PAY_TYPE_LABEL[selectedEmployee.payType]}
                        </span>
                        <span>·</span>
                        <span
                          className={
                            selectedEmployee.status === 'ativo'
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : selectedEmployee.status === 'ferias'
                                ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                : 'text-red-600 font-semibold'
                          }
                        >
                          {EMPLOYEE_STATUS_LABEL[selectedEmployee.status]}
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                        {selectedEmployee.name}
                      </h2>
                      <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                        WhatsApp: {selectedEmployee.phone || 'Não informado'}
                        {selectedEmployee.pixKey
                          ? ` · Pix: ${selectedEmployee.pixKey}`
                          : ''}
                        {selectedEmployee.payType === 'semanal'
                          ? ` · Pgto: Toda ${WEEKDAY_LABEL[selectedEmployee.payWeekday ?? 5]}`
                          : ` · Dia pgto: ${selectedEmployee.payDay}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditEmployeeModal(selectedEmployee)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                      {confirmDeleteEmpId === selectedEmployee.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const removedName = selectedEmployee.name;
                              onDeleteEmployee(selectedEmployee.id);
                              setConfirmDeleteEmpId(null);
                              setFeedback({
                                type: 'ok',
                                text: `Funcionário ${removedName} excluído com sucesso.`,
                              });
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                          >
                            Confirmar Exclusão
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEmpId(null)}
                            className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteEmpId(selectedEmployee.id)
                          }
                          aria-label={`Excluir ${selectedEmployee.name}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/60 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Operations Bar */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openLedgerAction('vale')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Emitir Vale</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLedgerAction('consumo')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Lançar Consumo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLedgerAction('bonus')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Lançar Bônus / Extra</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openLedgerAction('pagamento')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg ml-auto"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Fechar Pagamento</span>
                    </button>
                  </div>

                  {/* Profile Subtabs */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {(
                      [
                        {
                          id: 'folha',
                          label: 'Pagamentos, Vales e Consumos',
                          icon: Wallet,
                        },
                        {
                          id: 'vinculos',
                          label: `Checklists & Tarefas (${selectedEmployeeChecklists.direct.length} · ${countOpenTasksForEmployee(selectedEmployee.id, tasks)} abertas)`,
                          icon: ClipboardCheck,
                        },
                        {
                          id: 'cadastro',
                          label: 'Dados & Observações',
                          icon: FileText,
                        },
                      ] as const
                    ).map((tab) => {
                      const Icon = tab.icon;
                      const active = profileTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setProfileTab(tab.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                              : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PROFILE SUBTAB 1: PAYROLL, VALES, CONSUMOS */}
                {profileTab === 'folha' && (
                  <div className="space-y-4">
                    {/* Calculation Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {selectedEmployee.payType === 'mensal'
                            ? 'Salário Base'
                            : selectedEmployee.payType === 'semanal'
                              ? 'Valor Semanal'
                              : selectedEmployee.payType === 'quinzenal'
                                ? 'Valor Quinzenal'
                                : selectedEmployee.payType === 'diaria'
                                  ? 'Valor da Diária'
                                  : 'Valor Hora / Base'}
                        </p>
                        <p className="text-base font-bold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
                          {formatCurrencyBRL(selectedPayroll.grossBase)}
                        </p>
                        {selectedPayroll.openBonusTotal > 0 && (
                          <p className="text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400">
                            + {formatCurrencyBRL(selectedPayroll.openBonusTotal)}{' '}
                            bônus
                          </p>
                        )}
                      </div>

                      <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Vales em Aberto
                        </p>
                        <p className="text-base font-bold font-mono-tabular text-amber-700 dark:text-amber-400 mt-0.5">
                          - {formatCurrencyBRL(selectedPayroll.openValesTotal)}
                        </p>
                      </div>

                      <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Consumos a Descontar
                        </p>
                        <p className="text-base font-bold font-mono-tabular text-red-700 dark:text-red-400 mt-0.5">
                          -{' '}
                          {formatCurrencyBRL(
                            selectedPayroll.openDeductibleConsumosTotal,
                          )}
                        </p>
                      </div>

                      <div className="bg-white dark:bg-[#13151c] border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          Líquido a Pagar
                        </p>
                        <p className="text-lg font-extrabold font-mono-tabular text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {formatCurrencyBRL(selectedPayroll.netPayable)}
                        </p>
                      </div>
                    </div>

                    {/* Ledger Table */}
                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Extrato de Vales, Consumos e Pagamentos
                        </h3>
                        <div className="flex flex-wrap items-center gap-1">
                          {(
                            [
                              { id: 'todos', label: 'Todos' },
                              { id: 'vale', label: 'Vales' },
                              { id: 'consumo', label: 'Consumos' },
                              { id: 'pagamento', label: 'Pagamentos' },
                              { id: 'bonus', label: 'Bônus' },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setLedgerFilter(f.id)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border ${
                                ledgerFilter === f.id
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                                  : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {selectedEmployeeLedger.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                          Nenhum lançamento encontrado para este colaborador.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedEmployeeLedger.map((entry) => {
                            const isConfirming =
                              confirmDeleteEntryId === entry.id;
                            const hasReceipt =
                              entry.type === 'vale' ||
                              entry.type === 'pagamento';

                            return (
                              <div
                                key={entry.id}
                                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span
                                      className={`font-bold ${
                                        entry.type === 'pagamento' ||
                                        entry.type === 'bonus'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : entry.type === 'vale'
                                            ? 'text-amber-700 dark:text-amber-400'
                                            : 'text-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {LEDGER_TYPE_LABEL[entry.type]}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-mono-tabular text-slate-500">
                                      {formatDateBRFromYMD(entry.date)}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span
                                      className={
                                        entry.type === 'consumo' &&
                                        !entry.deductFromPay
                                          ? 'text-slate-500'
                                          : entry.settled
                                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                            : 'text-amber-700 dark:text-amber-400 font-medium'
                                      }
                                    >
                                      {entry.type === 'pagamento'
                                        ? `Pago (${entry.paymentMethod || 'Pix'})`
                                        : entry.type === 'consumo' &&
                                            !entry.deductFromPay
                                          ? 'Isento (Cortesia casa)'
                                          : entry.settled
                                            ? 'Quitado no fechamento'
                                            : 'Em aberto p/ descontar'}
                                    </span>
                                    {entry.whatsappSent && (
                                      <>
                                        <span className="text-slate-300">·</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                          WhatsApp enviado
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                    {entry.description}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-white mr-1">
                                    {entry.type === 'vale' ||
                                    (entry.type === 'consumo' &&
                                      entry.deductFromPay)
                                      ? `- ${formatCurrencyBRL(entry.amount)}`
                                      : formatCurrencyBRL(entry.amount)}
                                  </span>

                                  {hasReceipt && (
                                    <button
                                      type="button"
                                      onClick={() => setReceiptEntry(entry)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                    >
                                      <Printer className="w-3 h-3" />
                                      <span>Recibo</span>
                                    </button>
                                  )}

                                  {isConfirming ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onDeleteLedgerEntry(entry.id);
                                          setConfirmDeleteEntryId(null);
                                        }}
                                        className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded-md"
                                      >
                                        Excluir
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteEntryId(null)
                                        }
                                        className="px-2 py-1 text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-md"
                                      >
                                        Não
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDeleteEntryId(entry.id)
                                      }
                                      aria-label="Excluir lançamento"
                                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PROFILE SUBTAB 2: CHECKLISTS & TAREFAS VINCULADAS */}
                {profileTab === 'vinculos' && (
                  <div className="space-y-5">
                    {/* Linked Checklists */}
                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Checklists Vinculados a {selectedEmployee.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Marque quais checklists aparecem em destaque para este colaborador no portal /equipe.
                          </p>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {checklistTemplates.map((tpl) => {
                          const isDirect = (
                            tpl.assignedEmployeeIds ?? []
                          ).includes(selectedEmployee.id);
                          const sameRole = tpl.role === selectedEmployee.role;
                          return (
                            <div
                              key={tpl.id}
                              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white">
                                  {tpl.title}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {CHECKLIST_ROLE_LABEL[tpl.role]} ·{' '}
                                  {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                                  {CHECKLIST_FREQUENCY_LABEL[tpl.frequency]} ·{' '}
                                  <span className="font-mono-tabular">
                                    {tpl.items.length} etapas
                                  </span>
                                  {sameRole && !isDirect
                                    ? ' · Mesmo setor do colaborador'
                                    : ''}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  onToggleChecklistLink(
                                    selectedEmployee.id,
                                    tpl.id,
                                  )
                                }
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border shrink-0 transition-colors ${
                                  isDirect
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                {isDirect ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Vinculado</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Vincular</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Assigned Individual Tasks */}
                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Tarefas Atribuídas ({selectedEmployeeTasks.length})
                      </h3>

                      <form
                        onSubmit={(e) =>
                          handleCreateTask(e, selectedEmployee.id)
                        }
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            required
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            placeholder="Nova tarefa para este colaborador..."
                            className="sm:col-span-2 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                          <select
                            value={taskPriority}
                            onChange={(e) =>
                              setTaskPriority(
                                e.target.value as StaffTaskPriority,
                              )
                            }
                            aria-label="Prioridade da tarefa"
                            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            <option value="normal">Prioridade Normal</option>
                            <option value="alta">Alta Prioridade</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={taskChecklistId}
                            onChange={(e) => setTaskChecklistId(e.target.value)}
                            aria-label="Vincular checklist opcional"
                            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            <option value="">Sem checklist vinculado</option>
                            {checklistTemplates.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                Checklist: {tpl.title}
                              </option>
                            ))}
                          </select>
                          <input
                            value={taskDueLabel}
                            onChange={(e) => setTaskDueLabel(e.target.value)}
                            placeholder="Prazo (ex.: Hoje · 15:00)"
                            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Atribuir Tarefa</span>
                          </button>
                        </div>
                      </form>

                      {selectedEmployeeTasks.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          Nenhuma tarefa atribuída para {selectedEmployee.name}.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedEmployeeTasks.map((task) => {
                            const linkedTpl = checklistTemplates.find(
                              (t) => t.id === task.linkedChecklistId,
                            );
                            const isConfirming =
                              confirmDeleteTaskId === task.id;
                            return (
                              <div
                                key={task.id}
                                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span
                                      className={`font-semibold ${
                                        task.status === 'concluida'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : task.status === 'em_andamento'
                                            ? 'text-blue-700 dark:text-blue-400'
                                            : 'text-amber-700 dark:text-amber-400'
                                      }`}
                                    >
                                      {TASK_STATUS_LABEL[task.status]}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span
                                      className={
                                        task.priority === 'alta'
                                          ? 'text-red-600 dark:text-red-400 font-semibold'
                                          : 'text-slate-500'
                                      }
                                    >
                                      {TASK_PRIORITY_LABEL[task.priority]}
                                    </span>
                                    {task.dueLabel && (
                                      <>
                                        <span className="text-slate-300">·</span>
                                        <span className="font-mono-tabular text-slate-500">
                                          {task.dueLabel}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <p
                                    className={`text-xs font-semibold ${
                                      task.status === 'concluida'
                                        ? 'line-through text-slate-400'
                                        : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {task.title}
                                  </p>
                                  {linkedTpl && (
                                    <p className="text-[11px] text-brand-600 dark:text-brand-400">
                                      Vinculada ao checklist: {linkedTpl.title}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onToggleTaskStatus(
                                        task.id,
                                        NEXT_TASK_STATUS[task.status],
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>
                                      {task.status === 'pendente'
                                        ? 'Iniciar'
                                        : task.status === 'em_andamento'
                                          ? 'Concluir'
                                          : 'Reabrir'}
                                    </span>
                                  </button>

                                  {isConfirming ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onDeleteTask(task.id);
                                          setConfirmDeleteTaskId(null);
                                        }}
                                        className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded-md"
                                      >
                                        Excluir
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteTaskId(null)
                                        }
                                        className="px-2 py-1 text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-md"
                                      >
                                        Não
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDeleteTaskId(task.id)
                                      }
                                      aria-label="Excluir tarefa"
                                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Recent Checklist Runs */}
                    {selectedEmployeeRuns.length > 0 && (
                      <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Últimos Checklists Executados
                        </h3>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedEmployeeRuns.map((run) => (
                            <div
                              key={run.id}
                              className="py-2 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {run.templateTitle}
                                </p>
                                <p className="text-[11px] font-mono-tabular text-slate-500">
                                  {formatDateTimeBR(
                                    run.completedAt ?? run.startedAt,
                                  )}
                                </p>
                              </div>
                              <span
                                className={`font-mono-tabular font-semibold shrink-0 ${
                                  run.status === 'concluido'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {run.items.filter((i) => i.checked).length}/
                                {run.items.length} etapas
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PROFILE SUBTAB 3: REGISTRATION DETAILS */}
                {profileTab === 'cadastro' && (
                  <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Dados Contratuais & Observações
                      </h3>
                      <button
                        type="button"
                        onClick={() => openEditEmployeeModal(selectedEmployee)}
                        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Editar cadastro
                      </button>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <dt className="text-slate-500">Admissão</dt>
                        <dd className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                          {formatDateBRFromYMD(selectedEmployee.admissionDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Chave Pix</dt>
                        <dd className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                          {selectedEmployee.pixKey || 'Não cadastrada'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          Total Já Pago na Casa
                        </dt>
                        <dd className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {formatCurrencyBRL(selectedPayroll.totalPaidAllTime)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          Refeições / Cortesia Isentas
                        </dt>
                        <dd className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                          {selectedPayroll.exemptConsumosCount} lançamento(s)
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-slate-500">Observações</dt>
                        <dd className="text-slate-800 dark:text-slate-200 mt-0.5">
                          {selectedEmployee.notes ||
                            'Nenhuma observação registrada.'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      ) : (
        /* VIEW 2: TEAM TASK BOARD */
        <section className="space-y-4">
          <form
            onSubmit={(e) => handleCreateTask(e)}
            className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
          >
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Nova Tarefa Operacional para a Equipe
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <input
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Título da tarefa (ex.: Descongelar frango p/ almoço)"
                className="md:col-span-2 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <select
                value={taskEmployeeId || selectedEmployee?.id || ''}
                onChange={(e) => setTaskEmployeeId(e.target.value)}
                aria-label="Selecionar colaborador"
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({CHECKLIST_ROLE_LABEL[emp.role]})
                  </option>
                ))}
              </select>
              <select
                value={taskPriority}
                onChange={(e) =>
                  setTaskPriority(e.target.value as StaffTaskPriority)
                }
                aria-label="Prioridade"
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="normal">Prioridade Normal</option>
                <option value="alta">Alta Prioridade</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <select
                value={taskChecklistId}
                onChange={(e) => setTaskChecklistId(e.target.value)}
                aria-label="Checklist vinculado"
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="">Sem checklist vinculado</option>
                {checklistTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    Checklist: {tpl.title}
                  </option>
                ))}
              </select>
              <input
                value={taskDueLabel}
                onChange={(e) => setTaskDueLabel(e.target.value)}
                placeholder="Prazo (ex.: Hoje · 14:00)"
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <input
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Detalhe / observação (opcional)"
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar Tarefa</span>
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'todas', label: 'Todas' },
                    { id: 'pendente', label: 'Pendentes' },
                    { id: 'em_andamento', label: 'Em Andamento' },
                    { id: 'concluida', label: 'Concluídas' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setTaskBoardStatus(s.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      taskBoardStatus === s.id
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <select
                value={taskBoardEmployee}
                onChange={(e) => setTaskBoardEmployee(e.target.value)}
                aria-label="Filtrar tarefas por colaborador"
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="todos">Todos os colaboradores</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            {filteredBoardTasks.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Nenhuma tarefa cadastrada para este filtro.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBoardTasks.map((task) => {
                  const linkedTpl = checklistTemplates.find(
                    (t) => t.id === task.linkedChecklistId,
                  );
                  const isConfirming = confirmDeleteTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {task.employeeName}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={`font-semibold ${
                              task.status === 'concluida'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : task.status === 'em_andamento'
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {TASK_STATUS_LABEL[task.status]}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={
                              task.priority === 'alta'
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-slate-500'
                            }
                          >
                            {TASK_PRIORITY_LABEL[task.priority]}
                          </span>
                          {task.dueLabel && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono-tabular text-slate-500">
                                {task.dueLabel}
                              </span>
                            </>
                          )}
                        </div>
                        <p
                          className={`text-sm font-semibold ${
                            task.status === 'concluida'
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-slate-500">
                            {task.description}
                          </p>
                        )}
                        {linkedTpl && (
                          <p className="text-[11px] text-brand-600 dark:text-brand-400">
                            Checklist vinculado: {linkedTpl.title}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onToggleTaskStatus(
                              task.id,
                              NEXT_TASK_STATUS[task.status],
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {task.status === 'pendente'
                              ? 'Iniciar'
                              : task.status === 'em_andamento'
                                ? 'Marcar Concluída'
                                : 'Reabrir'}
                          </span>
                        </button>
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTask(task.id);
                                setConfirmDeleteTaskId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg"
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTaskId(null)}
                              className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTaskId(task.id)}
                            aria-label="Remover tarefa"
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* MODAL 1: CREATE / EDIT EMPLOYEE */}
      {empModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-modal-title"
        >
          <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="employee-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {editingEmp ? 'Editar Funcionário' : 'Cadastrar Funcionário'}
              </h2>
              <button
                type="button"
                onClick={() => setEmpModalOpen(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEmployeeSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo
                  </label>
                  <input
                    required
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="Ex.: Dona Maria Silva"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp / Celular (DDD + Número)
                  </label>
                  <input
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    placeholder="Ex.: 5511999998888"
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Usado para envio de comprovantes e login do funcionário em /equipe.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Setor / Função
                  </label>
                  <select
                    value={empRole}
                    onChange={(e) =>
                      setEmpRole(e.target.value as ChecklistRole)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {CHECKLIST_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Turno Padrão
                  </label>
                  <select
                    value={empShift}
                    onChange={(e) =>
                      setEmpShift(e.target.value as ChecklistShift)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {CHECKLIST_SHIFT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Situação
                  </label>
                  <select
                    value={empStatus}
                    onChange={(e) =>
                      setEmpStatus(e.target.value as EmployeeStatus)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {EMPLOYEE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Modelo Salarial
                  </label>
                  <select
                    value={empPayType}
                    onChange={(e) => {
                      const nextType = e.target.value as EmployeePayType;
                      setEmpPayType(nextType);
                      if (!editingEmp && empSalary === '2200' && nextType === 'semanal') {
                        setEmpSalary('600');
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {PAY_TYPE_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {EMPLOYEE_PAY_TYPE_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {empPayType === 'semanal'
                      ? 'Valor Semanal (R$)'
                      : empPayType === 'quinzenal'
                        ? 'Valor Quinzenal (R$)'
                        : empPayType === 'diaria'
                          ? 'Valor Diária (R$)'
                          : empPayType === 'hora'
                            ? 'Valor Hora (R$)'
                            : 'Salário Base (R$)'}
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={empSalary}
                    onChange={(e) => setEmpSalary(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  {empPayType === 'semanal' ? (
                    <>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Dia da Semana (Pgto)
                      </label>
                      <select
                        value={empPayWeekday}
                        onChange={(e) =>
                          setEmpPayWeekday(Number(e.target.value))
                        }
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      >
                        {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => (
                          <option key={dayNum} value={dayNum}>
                            {WEEKDAY_LABEL[dayNum]}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Dia Pagamento (Mês)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={empPayDay}
                        onChange={(e) => setEmpPayDay(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Chave Pix (opcional)
                  </label>
                  <input
                    value={empPixKey}
                    onChange={(e) => setEmpPixKey(e.target.value)}
                    placeholder="CPF, telefone ou e-mail"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    value={empAdmissionDate}
                    onChange={(e) => setEmpAdmissionDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Observações / Função detalhada
                </label>
                <input
                  value={empNotes}
                  onChange={(e) => setEmpNotes(e.target.value)}
                  placeholder="Ex.: Responsável pela abertura térmica e preparo"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  {editingEmp &&
                    (confirmDeleteEmpId === editingEmp.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const removedName = editingEmp.name;
                            onDeleteEmployee(editingEmp.id);
                            setConfirmDeleteEmpId(null);
                            setEmpModalOpen(false);
                            setFeedback({
                              type: 'ok',
                              text: `Funcionário ${removedName} excluído com sucesso.`,
                            });
                          }}
                          className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                        >
                          Confirmar Exclusão
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteEmpId(null)}
                          className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEmpId(editingEmp.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir Funcionário</span>
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setEmpModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                  >
                    {editingEmp ? 'Salvar Alterações' : 'Cadastrar Funcionário'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VALE / CONSUMO / BONUS / PAGAMENTO */}
      {ledgerModal && selectedEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-modal-title"
        >
          <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2
                  id="ledger-modal-title"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  {ledgerModal === 'vale'
                    ? 'Emitir Vale / Adiantamento'
                    : ledgerModal === 'consumo'
                      ? 'Lançar Consumo Interno'
                      : ledgerModal === 'bonus'
                        ? 'Lançar Bônus / Adicional'
                        : 'Fechar Pagamento Salarial'}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedEmployee.name} ·{' '}
                  {CHECKLIST_ROLE_LABEL[selectedEmployee.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLedgerModal(null)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitLedgerModal}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {/* Consumo Mode Switch */}
              {ledgerModal === 'consumo' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLedgerConsumoMode('item')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                        ledgerConsumoMode === 'item'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      Item do Cardápio
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerConsumoMode('livre')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                        ledgerConsumoMode === 'livre'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      Valor Avulso
                    </button>
                  </div>

                  {ledgerConsumoMode === 'item' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Prato / Bebida Consumida
                        </label>
                        <select
                          value={ledgerMenuItemId}
                          onChange={(e) => setLedgerMenuItemId(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        >
                          {state.menuItems.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({formatCurrencyBRL(m.price)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={ledgerQuantity}
                          onChange={(e) => setLedgerQuantity(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Desc. Equipe (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={ledgerDiscountPct}
                          onChange={(e) => setLedgerDiscountPct(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Total Calculado
                        </label>
                        <div className="px-3 py-2 text-xs font-mono-tabular font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                          {ledgerDeductFromPay
                            ? formatCurrencyBRL(computedConsumoValue?.total ?? 0)
                            : 'R$ 0,00 (Isento)'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payment open deductions checklist */}
              {ledgerModal === 'pagamento' && paymentSettlementBreakdown && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Provento Base:
                    </span>
                    <span className="font-mono-tabular font-bold">
                      {formatCurrencyBRL(selectedEmployee.baseSalary)}
                    </span>
                  </div>

                  {paymentSettlementBreakdown.openItems.length > 0 ? (
                    <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-500">
                        Itens em aberto a abater/quitar neste pagamento:
                      </p>
                      {paymentSettlementBreakdown.openItems.map((item) => {
                        const checked = settleSelectedIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex items-center justify-between gap-2 text-xs cursor-pointer"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleSettleItem(item.id)}
                                className="rounded border-slate-300 text-brand-600"
                              />
                              <span className="truncate">
                                {LEDGER_TYPE_LABEL[item.type]} ·{' '}
                                {item.description}
                              </span>
                            </span>
                            <span
                              className={`font-mono-tabular font-semibold shrink-0 ${
                                item.type === 'bonus'
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {item.type === 'bonus' ? '+' : '-'}{' '}
                              {formatCurrencyBRL(item.amount)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Nenhum vale ou consumo pendente para descontar.
                    </p>
                  )}
                </div>
              )}

              {/* Value & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(ledgerModal !== 'consumo' ||
                  ledgerConsumoMode === 'livre') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Valor (R$)
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={ledgerAmount}
                      onChange={(e) => setLedgerAmount(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data do Lançamento
                  </label>
                  <input
                    required
                    type="date"
                    value={ledgerDate}
                    onChange={(e) => setLedgerDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                {(ledgerModal === 'vale' || ledgerModal === 'pagamento') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={ledgerMethod}
                      onChange={(e) => setLedgerMethod(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <option value="Pix">Pix</option>
                      <option value="Dinheiro">Dinheiro (Caixa)</option>
                      <option value="Transferência">Transferência Bancária</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Motivo
                </label>
                <input
                  value={ledgerDesc}
                  onChange={(e) => setLedgerDesc(e.target.value)}
                  placeholder={
                    ledgerModal === 'vale'
                      ? 'Ex.: Adiantamento quinzenal'
                      : ledgerModal === 'consumo'
                        ? 'Opcional (usa o item do cardápio por padrão)'
                        : 'Ex.: Pagamento mensal referente ao período'
                  }
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              {/* Options */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                {(ledgerModal === 'vale' || ledgerModal === 'consumo') && (
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={ledgerDeductFromPay}
                      onChange={(e) => setLedgerDeductFromPay(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600"
                    />
                    <span>
                      {ledgerModal === 'vale'
                        ? 'Descontar este vale no próximo pagamento'
                        : 'Descontar este consumo no pagamento (desmarque para refeição cortesia)'}
                    </span>
                  </label>
                )}

                {(ledgerModal === 'vale' || ledgerModal === 'pagamento') && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={ledgerLaunchToFinance}
                        onChange={(e) =>
                          setLedgerLaunchToFinance(e.target.checked)
                        }
                        className="rounded border-slate-300 text-brand-600"
                      />
                      <span>
                        Lançar saída automática no Fluxo de Caixa (Custos)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={ledgerSendWhatsapp}
                        onChange={(e) =>
                          setLedgerSendWhatsapp(e.target.checked)
                        }
                        disabled={!selectedEmployee.phone}
                        className="rounded border-slate-300 text-brand-600 disabled:opacity-40"
                      />
                      <span>
                        Enviar recibo pelo WhatsApp do colaborador (
                        {selectedEmployee.phone || 'sem número'})
                      </span>
                    </label>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setLedgerModal(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingLedger}
                  className="px-5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
                >
                  {submittingLedger ? 'Registrando...' : 'Confirmar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PRINTABLE & WHATSAPP RECEIPT */}
      {receiptEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
        >
          <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="receipt-modal-title"
                className="text-sm font-bold text-slate-900 dark:text-white"
              >
                Comprovante · {LEDGER_TYPE_LABEL[receiptEntry.type]}
              </h2>
              <button
                type="button"
                onClick={() => setReceiptEntry(null)}
                aria-label="Fechar recibo"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 space-y-2.5 text-xs">
                <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-2.5">
                  <p className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {state.store.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {receiptEntry.type === 'vale'
                      ? 'COMPROVANTE DE VALE / ADIANTAMENTO'
                      : 'RECIBO DE PAGAMENTO AO COLABORADOR'}
                  </p>
                </div>

                <div className="space-y-1">
                  <p>
                    <span className="text-slate-500">Colaborador:</span>{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {receiptEntry.employeeName}
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Data:</span>{' '}
                    <span className="font-mono-tabular">
                      {formatDateBRFromYMD(receiptEntry.date)}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Descrição:</span>{' '}
                    {receiptEntry.description}
                  </p>
                  {receiptEntry.paymentMethod && (
                    <p>
                      <span className="text-slate-500">Forma:</span>{' '}
                      {receiptEntry.paymentMethod}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between text-sm font-extrabold text-slate-900 dark:text-white">
                  <span>VALOR TOTAL</span>
                  <span className="font-mono-tabular">
                    {formatCurrencyBRL(receiptEntry.amount)}
                  </span>
                </div>

                {receiptEntry.receiptText && (
                  <pre className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 whitespace-pre-wrap font-sans text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {receiptEntry.receiptText}
                  </pre>
                )}

                <div className="pt-4 text-center text-[11px] text-slate-400">
                  ________________________________________
                  <br />
                  Assinatura · {receiptEntry.employeeName}
                </div>
              </div>

              {!employees.find((e) => e.id === receiptEntry.employeeId)
                ?.phone && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Cadastre o WhatsApp deste colaborador para enviar pelo app.
                  </span>
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyReceipt(
                      receiptEntry.receiptText ||
                        `${receiptEntry.employeeName} - ${receiptEntry.description}: ${formatCurrencyBRL(receiptEntry.amount)}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  {copiedReceipt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  disabled={sendingReceiptId === receiptEntry.id}
                  onClick={() => handleSendWhatsappForEntry(receiptEntry)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {sendingReceiptId === receiptEntry.id ? (
                    <span>Enviando...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
