'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  LogOut,
  Moon,
  Package,
  Phone,
  RefreshCw,
  Sun,
  Trash2,
  UserCheck,
  Utensils,
  Wallet,
} from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  formatPhoneBR,
  normalizePhoneDigits,
  phonesMatch,
} from '@/lib/crm-engine';
import {
  CHECKLIST_FREQUENCY_LABEL,
  CHECKLIST_ROLE_LABEL,
  CHECKLIST_SHIFT_LABEL,
  EMPLOYEE_PAY_TYPE_LABEL,
  LEDGER_TYPE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  WASTE_REASON_LABEL,
  formatCurrencyBRL,
  formatDateTimeBR,
  formatTimeBR,
} from '@/lib/formatters';
import {
  computeEmployeePayroll,
  formatDateBRFromYMD,
} from '@/lib/staff-engine';
import {
  applyWasteStockDeduction,
  formatStockQty,
  getCompatibleUnits,
  previewWasteDeduction,
} from '@/lib/stock-engine';
import type {
  ChecklistRole,
  ChecklistRun,
  ChecklistTemplate,
  DeliveryStoreState,
  Employee,
  EmployeeLedgerEntry,
  MenuItem,
  StaffTask,
  StaffTaskStatus,
  StockIngredient,
  StockMovement,
  StockUnit,
  WasteLog,
  WasteReason,
  WasteTargetType,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';
const STAFF_ID_KEY = 'casa-tempero-staff-id';
const STAFF_PHONE_KEY = 'casa-tempero-staff-phone';

function hydrateState(parsed: DeliveryStoreState): DeliveryStoreState {
  return {
    ...INITIAL_DELIVERY_STATE,
    ...parsed,
    store: {
      ...INITIAL_DELIVERY_STATE.store,
      ...parsed.store,
    },
    checklistTemplates:
      Array.isArray(parsed.checklistTemplates) &&
      parsed.checklistTemplates.length > 0
        ? parsed.checklistTemplates
        : INITIAL_DELIVERY_STATE.checklistTemplates,
    checklistRuns: Array.isArray(parsed.checklistRuns)
      ? parsed.checklistRuns
      : INITIAL_DELIVERY_STATE.checklistRuns,
    ingredients:
      Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
        ? parsed.ingredients
        : INITIAL_DELIVERY_STATE.ingredients,
    menuItems:
      Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0
        ? parsed.menuItems
        : INITIAL_DELIVERY_STATE.menuItems,
    stockMovements: Array.isArray(parsed.stockMovements)
      ? parsed.stockMovements
      : INITIAL_DELIVERY_STATE.stockMovements,
    wasteLogs: Array.isArray(parsed.wasteLogs)
      ? parsed.wasteLogs
      : INITIAL_DELIVERY_STATE.wasteLogs,
    employees: Array.isArray(parsed.employees)
      ? parsed.employees
      : INITIAL_DELIVERY_STATE.employees,
    staffTasks: Array.isArray(parsed.staffTasks)
      ? parsed.staffTasks
      : INITIAL_DELIVERY_STATE.staffTasks,
    employeeLedger: Array.isArray(parsed.employeeLedger)
      ? parsed.employeeLedger
      : INITIAL_DELIVERY_STATE.employeeLedger,
  };
}

const ROLE_FILTERS: Array<'todos' | ChecklistRole> = [
  'todos',
  'cozinha',
  'atendimento',
  'limpeza',
  'entregadores',
  'gerencia',
];

const WASTE_REASON_OPTIONS: WasteReason[] = [
  'vencimento',
  'erro_preparo',
  'sobra_buffet',
  'avaria_embalagem',
  'qualidade',
  'outros',
];

type PortalTab = 'checklists' | 'desperdicios' | 'financeiro';

export function StaffPortalPage() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [loggedEmployeeId, setLoggedEmployeeId] = useState('');
  const [loggedEmployeeFallback, setLoggedEmployeeFallback] =
    useState<Employee | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [portalTab, setPortalTab] = useState<PortalTab>('checklists');
  const [roleFilter, setRoleFilter] = useState<'todos' | ChecklistRole>('todos');
  const [activeRun, setActiveRun] = useState<ChecklistRun | null>(null);
  const [closingNote, setClosingNote] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Waste form state
  const [wasteTargetType, setWasteTargetType] =
    useState<WasteTargetType>('insumo');
  const [wasteTargetId, setWasteTargetId] = useState<string>(
    INITIAL_DELIVERY_STATE.ingredients[0]?.id ?? '',
  );
  const [wasteQtyStr, setWasteQtyStr] = useState('0.5');
  const [wasteUnit, setWasteUnit] = useState<StockUnit>(
    INITIAL_DELIVERY_STATE.ingredients[0]?.unit ?? 'kg',
  );
  const [wasteReason, setWasteReason] = useState<WasteReason>('vencimento');
  const [wasteNotes, setWasteNotes] = useState('');
  const [wasteConfirming, setWasteConfirming] = useState(false);
  const [submittingWaste, setSubmittingWaste] = useState(false);

  const verifySavedSessionWithServer = useCallback(async (phone: string) => {
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_by_phone', phone }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        employee?: Employee;
        staffTasks?: StaffTask[];
        employeeLedger?: EmployeeLedgerEntry[];
        checklistTemplates?: ChecklistTemplate[];
        checklistRuns?: ChecklistRun[];
        ingredients?: StockIngredient[];
        menuItems?: MenuItem[];
        stockMovements?: StockMovement[];
        wasteLogs?: WasteLog[];
      };
      if (data.ok && data.employee) {
        setLoggedEmployeeFallback(data.employee);
        setLoggedEmployeeId(data.employee.id);
        setState((prev) => ({
          ...prev,
          employees: prev.employees.some((e) => e.id === data.employee!.id)
            ? prev.employees.map((e) =>
                e.id === data.employee!.id ? data.employee! : e,
              )
            : [data.employee!, ...prev.employees],
          staffTasks: data.staffTasks ?? prev.staffTasks,
          employeeLedger: data.employeeLedger ?? prev.employeeLedger,
          checklistTemplates:
            data.checklistTemplates ?? prev.checklistTemplates,
          checklistRuns: data.checklistRuns ?? prev.checklistRuns,
          ingredients: data.ingredients ?? prev.ingredients,
          menuItems: data.menuItems ?? prev.menuItems,
          stockMovements: data.stockMovements ?? prev.stockMovements,
          wasteLogs: data.wasteLogs ?? prev.wasteLogs,
        }));
      }
    } catch {
      // keep existing state
    }
  }, []);

  const loadFromSources = useCallback(async () => {
    let loadedLocal = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeliveryStoreState;
        if (parsed.store) {
          setState(hydrateState(parsed));
          loadedLocal = true;
        }
      }
    } catch {
      // fallback to server
    }

    if (!loadedLocal) {
      try {
        const res = await fetch('/api/delivery');
        if (res.ok) {
          const data = (await res.json()) as DeliveryStoreState;
          setState(hydrateState(data));
        }
      } catch {
        // keep initial
      }
    }

    try {
      const savedPhone = localStorage.getItem(STAFF_PHONE_KEY);
      if (savedPhone) {
        await verifySavedSessionWithServer(savedPhone);
      }
    } catch {
      // ignore
    }
  }, [verifySavedSessionWithServer]);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    try {
      const savedId = localStorage.getItem(STAFF_ID_KEY);
      const savedPhone = localStorage.getItem(STAFF_PHONE_KEY);
      if (savedId) setLoggedEmployeeId(savedId);
      if (savedPhone) setPhoneInput(formatPhoneBR(savedPhone));
    } catch {
      // ignore
    }
    loadFromSources();

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as DeliveryStoreState;
        if (parsed.store) setState(hydrateState(parsed));
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [loadFromSources]);

  const loggedEmployee = useMemo(() => {
    if (!loggedEmployeeId) return null;
    const fromState = (state.employees ?? []).find(
      (e) => e.id === loggedEmployeeId,
    );
    const candidate = fromState ?? loggedEmployeeFallback;
    if (!candidate || candidate.status === 'inativo') return null;
    return candidate;
  }, [state.employees, loggedEmployeeId, loggedEmployeeFallback]);

  const handlePhoneLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const digits = normalizePhoneDigits(phoneInput);
    if (digits.length < 8) {
      setLoginError(
        'Informe seu número de celular com DDD (mínimo 8 dígitos).',
      );
      return;
    }

    setLoggingIn(true);
    try {
      // 1. Check local synced store first (reflects freshly added employees in same browser)
      const localEmployees = state.employees ?? [];
      const localActive = localEmployees.find(
        (emp) => emp.status !== 'inativo' && phonesMatch(emp.phone, digits),
      );
      const localAny =
        localActive ??
        localEmployees.find((emp) => phonesMatch(emp.phone, digits));

      if (localAny) {
        if (localAny.status === 'inativo') {
          setLoginError(
            'Cadastro inativo. Fale com a gerência para liberar seu acesso.',
          );
          setLoggingIn(false);
          return;
        }
        setLoggedEmployeeId(localAny.id);
        setLoggedEmployeeFallback(localAny);
        setRoleFilter('todos');
        setPortalTab('checklists');
        try {
          localStorage.setItem(STAFF_ID_KEY, localAny.id);
          localStorage.setItem(
            STAFF_PHONE_KEY,
            normalizePhoneDigits(localAny.phone) || digits,
          );
        } catch {
          // ignore
        }
        setLoggingIn(false);
        return;
      }

      // 2. Query server API (supports separate phone/device without admin localStorage)
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_by_phone', phone: digits }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        employee?: Employee;
        staffTasks?: StaffTask[];
        employeeLedger?: EmployeeLedgerEntry[];
        checklistTemplates?: ChecklistTemplate[];
        checklistRuns?: ChecklistRun[];
        ingredients?: StockIngredient[];
        menuItems?: MenuItem[];
        stockMovements?: StockMovement[];
        wasteLogs?: WasteLog[];
      };

      if (!res.ok || !data.ok || !data.employee) {
        setLoginError(
          data.error ||
            'Nenhum colaborador encontrado com este número de celular.',
        );
        setLoggingIn(false);
        return;
      }

      const found = data.employee;
      setLoggedEmployeeId(found.id);
      setLoggedEmployeeFallback(found);
      setRoleFilter('todos');
      setPortalTab('checklists');
      setState((prev) => ({
        ...prev,
        employees: prev.employees.some((item) => item.id === found.id)
          ? prev.employees.map((item) => (item.id === found.id ? found : item))
          : [found, ...prev.employees],
        staffTasks: data.staffTasks ?? prev.staffTasks,
        employeeLedger: data.employeeLedger ?? prev.employeeLedger,
        checklistTemplates: data.checklistTemplates ?? prev.checklistTemplates,
        checklistRuns: data.checklistRuns ?? prev.checklistRuns,
        ingredients: data.ingredients ?? prev.ingredients,
        menuItems: data.menuItems ?? prev.menuItems,
        stockMovements: data.stockMovements ?? prev.stockMovements,
        wasteLogs: data.wasteLogs ?? prev.wasteLogs,
      }));
      try {
        localStorage.setItem(STAFF_ID_KEY, found.id);
        localStorage.setItem(
          STAFF_PHONE_KEY,
          normalizePhoneDigits(found.phone) || digits,
        );
      } catch {
        // ignore
      }
    } catch {
      setLoginError(
        'Não foi possível validar o número agora. Tente novamente.',
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setLoggedEmployeeId('');
    setLoggedEmployeeFallback(null);
    setActiveRun(null);
    setClosingNote('');
    setFeedback(null);
    setLoginError(null);
    setPhoneInput('');
    try {
      localStorage.removeItem(STAFF_ID_KEY);
      localStorage.removeItem(STAFF_PHONE_KEY);
    } catch {
      // ignore
    }
  };

  const persistRun = async (run: ChecklistRun) => {
    setState((prev) => {
      const exists = prev.checklistRuns.some((r) => r.id === run.id);
      const nextRuns = exists
        ? prev.checklistRuns.map((r) => (r.id === run.id ? run : r))
        : [run, ...prev.checklistRuns];
      const next = { ...prev, checklistRuns: nextRuns };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_run', run }),
    }).catch(() => {});
  };

  const handleToggleTask = async (
    taskId: string,
    nextStatus: StaffTaskStatus,
  ) => {
    const nowIso = new Date().toISOString();
    setState((prev) => {
      const nextTasks = (prev.staffTasks ?? []).map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: nextStatus,
              completedAt: nextStatus === 'concluida' ? nowIso : undefined,
            }
          : t,
      );
      const next = { ...prev, staffTasks: nextTasks };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle_task_status',
        taskId,
        nextStatus,
      }),
    }).catch(() => {});
  };

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem('vertice-theme', nextDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };

  const activeTemplates = useMemo(() => {
    const list = (state.checklistTemplates ?? []).filter(
      (t) => t.active && (roleFilter === 'todos' || t.role === roleFilter),
    );
    if (!loggedEmployee) return list;
    return [...list].sort((a, b) => {
      const aDirect = (a.assignedEmployeeIds ?? []).includes(loggedEmployee.id)
        ? 2
        : a.role === loggedEmployee.role
          ? 1
          : 0;
      const bDirect = (b.assignedEmployeeIds ?? []).includes(loggedEmployee.id)
        ? 2
        : b.role === loggedEmployee.role
          ? 1
          : 0;
      return bDirect - aDirect;
    });
  }, [state.checklistTemplates, roleFilter, loggedEmployee]);

  const myTasks = useMemo(() => {
    if (!loggedEmployee) return [];
    return (state.staffTasks ?? []).filter(
      (t) => t.employeeId === loggedEmployee.id,
    );
  }, [state.staffTasks, loggedEmployee]);

  const myRuns = useMemo(() => {
    if (!loggedEmployee) return [];
    return (state.checklistRuns ?? [])
      .filter(
        (r) =>
          r.employeeId === loggedEmployee.id ||
          r.employeeName.toLowerCase() === loggedEmployee.name.toLowerCase(),
      )
      .slice(0, 8);
  }, [state.checklistRuns, loggedEmployee]);

  const myLedger = useMemo(() => {
    if (!loggedEmployee) return [];
    return (state.employeeLedger ?? []).filter(
      (entry) => entry.employeeId === loggedEmployee.id,
    );
  }, [state.employeeLedger, loggedEmployee]);

  const myPayroll = useMemo(() => {
    if (!loggedEmployee) return null;
    return computeEmployeePayroll(loggedEmployee, state.employeeLedger ?? []);
  }, [loggedEmployee, state.employeeLedger]);

  const selectedWasteIngredient = useMemo(
    () =>
      wasteTargetType === 'insumo'
        ? state.ingredients.find((i) => i.id === wasteTargetId)
        : undefined,
    [wasteTargetType, wasteTargetId, state.ingredients],
  );

  const wasteCompatibleUnits = useMemo<StockUnit[]>(() => {
    if (!selectedWasteIngredient) return ['un'];
    return getCompatibleUnits(selectedWasteIngredient.unit);
  }, [selectedWasteIngredient]);

  const parsedWasteQty = Number(wasteQtyStr.replace(',', '.'));

  const wasteDeductionPreview = useMemo(
    () =>
      previewWasteDeduction({
        targetType: wasteTargetType,
        targetId: wasteTargetId,
        quantity: Number.isFinite(parsedWasteQty) ? parsedWasteQty : 0,
        unit: wasteTargetType === 'insumo' ? wasteUnit : undefined,
        menuItems: state.menuItems,
        ingredients: state.ingredients,
      }),
    [
      wasteTargetType,
      wasteTargetId,
      parsedWasteQty,
      wasteUnit,
      state.menuItems,
      state.ingredients,
    ],
  );

  const canSubmitWaste =
    Boolean(loggedEmployee) &&
    Boolean(wasteTargetId) &&
    Number.isFinite(parsedWasteQty) &&
    parsedWasteQty > 0;

  const handleWasteTargetTypeSwitch = (next: WasteTargetType) => {
    setWasteTargetType(next);
    setWasteConfirming(false);
    if (next === 'insumo') {
      const firstIng = state.ingredients[0];
      setWasteTargetId(firstIng?.id ?? '');
      setWasteUnit(firstIng?.unit ?? 'kg');
      setWasteQtyStr('0.5');
    } else {
      const firstDish =
        state.menuItems.find((m) => (m.technicalSheet?.length ?? 0) > 0) ??
        state.menuItems[0];
      setWasteTargetId(firstDish?.id ?? '');
      setWasteQtyStr('1');
    }
  };

  const handleConfirmWaste = async () => {
    if (!canSubmitWaste || !loggedEmployee || submittingWaste) return;
    setSubmittingWaste(true);
    const result = applyWasteStockDeduction({
      targetType: wasteTargetType,
      targetId: wasteTargetId,
      quantity: parsedWasteQty,
      unit: wasteTargetType === 'insumo' ? wasteUnit : undefined,
      reason: wasteReason,
      employeeName: loggedEmployee.name,
      notes: wasteNotes.trim() || undefined,
      menuItems: state.menuItems,
      ingredients: state.ingredients,
    });

    setState((prev) => {
      const next: DeliveryStoreState = {
        ...prev,
        ingredients: result.ingredients,
        stockMovements:
          result.newMovements.length > 0
            ? [...result.newMovements, ...prev.stockMovements]
            : prev.stockMovements,
        wasteLogs: [result.wasteLog, ...(prev.wasteLogs ?? [])],
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    try {
      const res = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: wasteTargetType,
          targetId: wasteTargetId,
          quantity: parsedWasteQty,
          unit: wasteTargetType === 'insumo' ? wasteUnit : undefined,
          reason: wasteReason,
          employeeName: loggedEmployee.name,
          notes: wasteNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const apiData = (await res.json()) as {
          ok?: boolean;
          ingredients?: StockIngredient[];
          stockMovements?: StockMovement[];
          wasteLogs?: WasteLog[];
        };
        if (apiData.ok) {
          setState((prev) => {
            const synced: DeliveryStoreState = {
              ...prev,
              ingredients: apiData.ingredients ?? prev.ingredients,
              stockMovements: apiData.stockMovements ?? prev.stockMovements,
              wasteLogs: apiData.wasteLogs ?? prev.wasteLogs,
            };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
            } catch {
              // ignore
            }
            return synced;
          });
        }
      }
    } catch {
      // local state already updated
    } finally {
      setSubmittingWaste(false);
    }

    setWasteConfirming(false);
    setWasteNotes('');
    setFeedback(
      `Descarte de "${result.wasteLog.targetName}" lançado e baixado do estoque (${formatCurrencyBRL(
        result.wasteLog.estimatedCost,
      )}).`,
    );
  };

  const handleStartChecklist = (tpl: ChecklistTemplate) => {
    if (!loggedEmployee) return;
    const existingInProgress = (state.checklistRuns ?? []).find(
      (r) =>
        r.templateId === tpl.id &&
        r.status === 'em_andamento' &&
        (r.employeeId === loggedEmployee.id ||
          r.employeeName.toLowerCase() === loggedEmployee.name.toLowerCase()),
    );
    if (existingInProgress) {
      setActiveRun(existingInProgress);
      setClosingNote(existingInProgress.notes ?? '');
      setFeedback(null);
      return;
    }

    const newRun: ChecklistRun = {
      id: `run-${Date.now()}`,
      templateId: tpl.id,
      templateTitle: tpl.title,
      role: tpl.role,
      shift: tpl.shift,
      employeeId: loggedEmployee.id,
      employeeName: loggedEmployee.name,
      status: 'em_andamento',
      startedAt: new Date().toISOString(),
      items: tpl.items.map((item) => ({
        itemId: item.id,
        title: item.title,
        instruction: item.instruction,
        critical: item.critical,
        checked: false,
      })),
    };
    setActiveRun(newRun);
    setClosingNote('');
    setFeedback(null);
    persistRun(newRun);
  };

  const handleToggleStep = (itemId: string) => {
    if (!activeRun) return;
    const nowIso = new Date().toISOString();
    const updated: ChecklistRun = {
      ...activeRun,
      items: activeRun.items.map((step) =>
        step.itemId === itemId
          ? {
              ...step,
              checked: !step.checked,
              checkedAt: !step.checked ? nowIso : undefined,
            }
          : step,
      ),
    };
    setActiveRun(updated);
    persistRun(updated);
  };

  const handleStepNote = (itemId: string, note: string) => {
    if (!activeRun) return;
    const updated: ChecklistRun = {
      ...activeRun,
      items: activeRun.items.map((step) =>
        step.itemId === itemId ? { ...step, note } : step,
      ),
    };
    setActiveRun(updated);
  };

  const handleFinishRun = () => {
    if (!activeRun || !loggedEmployee) return;
    const completed: ChecklistRun = {
      ...activeRun,
      employeeId: loggedEmployee.id,
      employeeName: loggedEmployee.name,
      status: 'concluido',
      completedAt: new Date().toISOString(),
      notes: closingNote.trim() || undefined,
    };
    persistRun(completed);
    setActiveRun(null);
    setClosingNote('');
    setFeedback(
      `Checklist "${completed.templateTitle}" concluído por ${completed.employeeName}.`,
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFromSources();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] dark:bg-[#0c0d11] text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#13151c]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {state.store.logoImage && !logoFailed ? (
              <img
                src={state.store.logoImage}
                alt={state.store.name}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-brand-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-5 h-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {state.store.name}
              </p>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Portal do Funcionário
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loggedEmployee && (
              <button
                type="button"
                onClick={handleRefresh}
                aria-label="Atualizar dados"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label="Alternar tema"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            >
              {isDark ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        {!loggedEmployee ? (
          <section className="max-w-md mx-auto mt-4 sm:mt-8 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 space-y-5">
            <div className="space-y-1.5">
              <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                <Phone className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Entrar no seu Painel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Digite o número do seu celular / WhatsApp cadastrado pela gerência
                para acessar suas tarefas, checklists e comprovantes.
              </p>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handlePhoneLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="staff-phone-login"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Número do Celular (DDD + Número)
                </label>
                <input
                  id="staff-phone-login"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="(11) 99999-8888"
                  className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-xl transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {loggingIn ? 'Verificando número...' : 'Entrar com Celular'}
                </span>
              </button>
            </form>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
              Não conseguiu acessar? Peça à gerência para confirmar seu WhatsApp
              no cadastro de Funcionários.
            </p>
          </section>
        ) : (
          <>
            {feedback && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{feedback}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-xs underline shrink-0"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* Authenticated Employee Identity Card */}
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {CHECKLIST_ROLE_LABEL[loggedEmployee.role]} · Turno{' '}
                    {CHECKLIST_SHIFT_LABEL[loggedEmployee.defaultShift]} ·{' '}
                    {EMPLOYEE_PAY_TYPE_LABEL[loggedEmployee.payType]}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {loggedEmployee.name}
                </h2>
                <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  Celular: {formatPhoneBR(loggedEmployee.phone)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg shrink-0 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </section>

            {activeRun ? (
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 space-y-5">
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveRun(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar para meu painel</span>
                    </button>
                    <p className="text-xs text-slate-500">
                      {CHECKLIST_ROLE_LABEL[activeRun.role]} ·{' '}
                      {CHECKLIST_SHIFT_LABEL[activeRun.shift]}
                    </p>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {activeRun.templateTitle}
                    </h2>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono-tabular font-bold text-brand-600 dark:text-brand-400">
                      {activeRun.items.filter((i) => i.checked).length}/
                      {activeRun.items.length}
                    </p>
                    <p className="text-xs font-mono-tabular text-slate-400">
                      Início {formatTimeBR(activeRun.startedAt)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeRun.items.map((step, idx) => (
                    <div
                      key={step.itemId}
                      className={`p-4 rounded-xl border transition-colors ${
                        step.checked
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleStep(step.itemId)}
                        className="w-full min-h-[48px] flex items-start gap-3.5 text-left"
                      >
                        <span
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            step.checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {step.checked && <Check className="w-4 h-4" />}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold leading-snug ${
                              step.checked
                                ? 'line-through text-slate-500 dark:text-slate-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {idx + 1}. {step.title}
                          </p>
                          {step.instruction && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {step.instruction}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                            {step.critical && (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Obrigatório / Crítico
                              </span>
                            )}
                            {step.checkedAt && (
                              <span className="font-mono-tabular text-emerald-700 dark:text-emerald-400">
                                Feito às {formatTimeBR(step.checkedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="mt-3 pl-10">
                        <input
                          type="text"
                          value={step.note ?? ''}
                          onChange={(e) =>
                            handleStepNote(step.itemId, e.target.value)
                          }
                          onBlur={() => persistRun(activeRun)}
                          placeholder="Anotar observação desta etapa (opcional)..."
                          className="w-full min-h-[40px] px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Resumo / Observação Final do Turno (opcional)
                  </label>
                  <input
                    type="text"
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    placeholder="Ex.: Tudo conferido, geladeira operando a 3,5°C."
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFinishRun}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Concluir e Enviar Checklist</span>
                </button>
              </section>
            ) : (
              <>
                {/* Employee Panel Tabs */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <button
                    type="button"
                    onClick={() => setPortalTab('checklists')}
                    className={`min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      portalTab === 'checklists'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Tarefas e Checklists</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalTab('desperdicios')}
                    className={`min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      portalTab === 'desperdicios'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Desperdícios (Baixa Estoque)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalTab('financeiro')}
                    className={`min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      portalTab === 'financeiro'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Meus Vales e Pagamentos</span>
                  </button>
                </div>

                {portalTab === 'checklists' ? (
                  <>
                    <section className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {ROLE_FILTERS.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setRoleFilter(role)}
                            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                              roleFilter === role
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                                : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {role === 'todos'
                              ? 'Todos os Setores'
                              : CHECKLIST_ROLE_LABEL[role]}
                          </button>
                        ))}
                      </div>

                      <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Minhas Tarefas
                          </h3>
                          <span className="text-xs font-mono-tabular text-slate-500">
                            {
                              myTasks.filter((t) => t.status !== 'concluida')
                                .length
                            }{' '}
                            pendente(s)
                          </span>
                        </div>
                        {myTasks.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            Nenhuma tarefa atribuída para você no momento.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {myTasks.map((task) => {
                              const nextStatus: StaffTaskStatus =
                                task.status === 'pendente'
                                  ? 'em_andamento'
                                  : task.status === 'em_andamento'
                                    ? 'concluida'
                                    : 'pendente';
                              return (
                                <div
                                  key={task.id}
                                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                  <div className="min-w-0 space-y-0.5">
                                    <p className="text-[11px] font-medium text-slate-500">
                                      <span
                                        className={
                                          task.status === 'concluida'
                                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                            : task.status === 'em_andamento'
                                              ? 'text-blue-700 dark:text-blue-400 font-semibold'
                                              : 'text-amber-700 dark:text-amber-400 font-semibold'
                                        }
                                      >
                                        {TASK_STATUS_LABEL[task.status]}
                                      </span>
                                      {' · '}
                                      <span>
                                        {TASK_PRIORITY_LABEL[task.priority]}
                                      </span>
                                      {task.dueLabel
                                        ? ` · ${task.dueLabel}`
                                        : ''}
                                    </p>
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
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleTask(task.id, nextStatus)
                                    }
                                    className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg border shrink-0 transition-colors ${
                                      task.status === 'concluida'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                        : 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                                    }`}
                                  >
                                    {task.status === 'pendente'
                                      ? 'Iniciar Tarefa'
                                      : task.status === 'em_andamento'
                                        ? 'Concluir Tarefa'
                                        : 'Reabrir'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      {activeTemplates.length === 0 ? (
                        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                          Nenhum checklist ativo disponível para este setor.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeTemplates.map((tpl) => {
                            const isDirectlyLinked = (
                              tpl.assignedEmployeeIds ?? []
                            ).includes(loggedEmployee.id);
                            return (
                              <article
                                key={tpl.id}
                                className={`bg-white dark:bg-[#13151c] border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                                  isDirectlyLinked
                                    ? 'border-brand-300 dark:border-brand-700'
                                    : 'border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                <div className="space-y-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {isDirectlyLinked && (
                                      <span className="font-bold text-brand-600 dark:text-brand-400">
                                        Vinculado a você ·{' '}
                                      </span>
                                    )}
                                    {CHECKLIST_ROLE_LABEL[tpl.role]} ·{' '}
                                    {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                                    {CHECKLIST_FREQUENCY_LABEL[tpl.frequency]}
                                  </p>
                                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    {tpl.title}
                                  </h3>
                                  {tpl.description && (
                                    <p className="text-xs text-slate-600 dark:text-slate-400">
                                      {tpl.description}
                                    </p>
                                  )}
                                  <p className="text-xs font-mono-tabular text-slate-500 pt-1">
                                    {tpl.items.length} etapas ·{' '}
                                    {tpl.items.filter((i) => i.critical).length}{' '}
                                    críticas
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleStartChecklist(tpl)}
                                  className="min-h-[48px] px-5 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shrink-0 transition-colors"
                                >
                                  Seguir Checklist
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {myRuns.length > 0 && (
                      <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Meus Últimos Checklists
                          </h3>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {myRuns.map((run) => (
                            <div
                              key={run.id}
                              className="py-2.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {run.templateTitle}
                                </p>
                                <p className="text-slate-500 font-mono-tabular truncate">
                                  {formatDateTimeBR(
                                    run.completedAt ?? run.startedAt,
                                  )}
                                </p>
                              </div>
                              <span
                                className={`font-semibold shrink-0 ${
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
                      </section>
                    )}
                  </>
                ) : portalTab === 'desperdicios' ? (
                  <section className="space-y-5">
                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          Lançar Desperdício / Baixa do Estoque
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Registre insumos descartados ou pratos prontos perdidos
                          para dar baixa automática no estoque em nome de{' '}
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {loggedEmployee.name}
                          </span>
                          .
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleWasteTargetTypeSwitch('insumo')}
                          className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                            wasteTargetType === 'insumo'
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <Package className="w-4 h-4" />
                          <span>Insumo / Ingrediente</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWasteTargetTypeSwitch('prato')}
                          className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                            wasteTargetType === 'prato'
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <Utensils className="w-4 h-4" />
                          <span>Prato / Marmita</span>
                        </button>
                      </div>

                      {wasteTargetType === 'insumo' ? (
                        <div>
                          <label
                            htmlFor="staff-waste-ingredient"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            Qual insumo foi descartado?
                          </label>
                          <select
                            id="staff-waste-ingredient"
                            value={wasteTargetId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setWasteTargetId(id);
                              setWasteConfirming(false);
                              const found = state.ingredients.find(
                                (i) => i.id === id,
                              );
                              if (found) setWasteUnit(found.unit);
                            }}
                            className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                          >
                            {state.ingredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} — Saldo:{' '}
                                {formatStockQty(ing.currentQty, ing.unit)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor="staff-waste-dish"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            Qual prato / marmita pronta foi descartada?
                          </label>
                          <select
                            id="staff-waste-dish"
                            value={wasteTargetId}
                            onChange={(e) => {
                              setWasteTargetId(e.target.value);
                              setWasteConfirming(false);
                            }}
                            className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                          >
                            {state.menuItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="staff-waste-qty"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            {wasteTargetType === 'insumo'
                              ? 'Quantidade'
                              : 'Qtd. de Porções'}
                          </label>
                          <input
                            id="staff-waste-qty"
                            type="number"
                            step="any"
                            min="0.01"
                            value={wasteQtyStr}
                            onChange={(e) => {
                              setWasteQtyStr(e.target.value);
                              setWasteConfirming(false);
                            }}
                            className="w-full min-h-[46px] px-3 py-2.5 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                          />
                        </div>

                        {wasteTargetType === 'insumo' ? (
                          <div>
                            <label
                              htmlFor="staff-waste-unit"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                              Unidade
                            </label>
                            <select
                              id="staff-waste-unit"
                              value={wasteUnit}
                              onChange={(e) => {
                                setWasteUnit(e.target.value as StockUnit);
                                setWasteConfirming(false);
                              }}
                              className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                            >
                              {wasteCompatibleUnits.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                              Baixa Automática
                            </label>
                            <input
                              readOnly
                              value="Por Ficha Técnica"
                              className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="staff-waste-reason"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                          Motivo do Descarte
                        </label>
                        <select
                          id="staff-waste-reason"
                          value={wasteReason}
                          onChange={(e) =>
                            setWasteReason(e.target.value as WasteReason)
                          }
                          className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                        >
                          {WASTE_REASON_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {WASTE_REASON_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="staff-waste-notes"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                          Observação (opcional)
                        </label>
                        <input
                          id="staff-waste-notes"
                          type="text"
                          value={wasteNotes}
                          onChange={(e) => setWasteNotes(e.target.value)}
                          placeholder="Ex.: Queimou na chapa / lote fora da validade"
                          className="w-full min-h-[46px] px-3 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                        />
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            Será baixado do estoque:
                          </span>
                          <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
                            {formatCurrencyBRL(
                              wasteDeductionPreview.estimatedCost,
                            )}
                          </span>
                        </div>

                        {wasteDeductionPreview.affectedIngredients.length ===
                        0 ? (
                          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              {wasteTargetType === 'prato'
                                ? 'Prato sem ficha técnica configurada — o registro ficará salvo no histórico.'
                                : 'Informe uma quantidade válida para calcular a baixa.'}
                            </span>
                          </p>
                        ) : (
                          <ul className="space-y-1.5 text-xs">
                            {wasteDeductionPreview.affectedIngredients.map(
                              (item) => (
                                <li
                                  key={item.ingredientId}
                                  className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                                >
                                  <span>{item.ingredientName}</span>
                                  <span className="font-mono-tabular font-bold text-red-700 dark:text-red-400">
                                    -{formatStockQty(item.quantity, item.unit)}
                                  </span>
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>

                      {wasteConfirming ? (
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            Confirmar descarte e dar baixa automática no
                            estoque?
                          </p>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => setWasteConfirming(false)}
                              className="min-h-[46px] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={submittingWaste}
                              onClick={handleConfirmWaste}
                              className="min-h-[46px] px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl"
                            >
                              {submittingWaste
                                ? 'Registrando...'
                                : 'Confirmar Baixa'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canSubmitWaste}
                          onClick={() => setWasteConfirming(true)}
                          className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Lançar Desperdício e Dar Baixa</span>
                        </button>
                      )}
                    </div>

                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                      <div className="p-4 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Histórico de Desperdícios ({(state.wasteLogs ?? []).length})
                        </h3>
                        <span className="text-xs font-mono-tabular font-semibold text-red-700 dark:text-red-400">
                          {formatCurrencyBRL(
                            (state.wasteLogs ?? []).reduce(
                              (s, w) => s + w.estimatedCost,
                              0,
                            ),
                          )}
                        </span>
                      </div>
                      {(state.wasteLogs ?? []).length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Nenhum descarte lançado ainda.
                        </div>
                      ) : (
                        (state.wasteLogs ?? []).slice(0, 12).map((log) => (
                          <div key={log.id} className="p-4 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-mono-tabular text-slate-500">
                                  {formatDateTimeBR(log.createdAt)} ·{' '}
                                  {log.employeeName}
                                </p>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                  {log.targetName} (
                                  <span className="font-mono-tabular">
                                    {log.quantity} {log.unitLabel}
                                  </span>
                                  )
                                </h4>
                              </div>
                              <span className="text-sm font-mono-tabular font-bold text-red-700 dark:text-red-400 shrink-0">
                                {formatCurrencyBRL(log.estimatedCost)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Motivo: {WASTE_REASON_LABEL[log.reason]}
                              {log.notes ? ` · ${log.notes}` : ''}
                            </p>
                            {log.affectedIngredients.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {log.affectedIngredients.map((aff) => (
                                  <span
                                    key={aff.ingredientId}
                                    className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-red-700 dark:text-red-400"
                                  >
                                    <ArrowDownRight className="w-3 h-3" />
                                    {formatStockQty(aff.quantity, aff.unit)}{' '}
                                    {aff.ingredientName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                ) : (
                  <section className="space-y-4">
                    {myPayroll && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                          <p className="text-[11px] font-medium text-slate-500">
                            Valor Base (
                            {EMPLOYEE_PAY_TYPE_LABEL[loggedEmployee.payType]})
                          </p>
                          <p className="text-base font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
                            {formatCurrencyBRL(myPayroll.grossBase)}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                          <p className="text-[11px] font-medium text-slate-500">
                            Vales em Aberto
                          </p>
                          <p className="text-base font-bold font-mono-tabular text-amber-700 dark:text-amber-400 mt-1">
                            - {formatCurrencyBRL(myPayroll.openValesTotal)}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                          <p className="text-[11px] font-medium text-slate-500">
                            Consumos a Descontar
                          </p>
                          <p className="text-base font-bold font-mono-tabular text-red-700 dark:text-red-400 mt-1">
                            -{' '}
                            {formatCurrencyBRL(
                              myPayroll.openDeductibleConsumosTotal,
                            )}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                          <p className="text-[11px] font-medium text-slate-500">
                            Líquido Estimado
                          </p>
                          <p className="text-base font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400 mt-1">
                            {formatCurrencyBRL(myPayroll.netPayable)}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Histórico de Vales, Consumos e Pagamentos
                      </h3>
                      {myLedger.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3">
                          Nenhum vale, consumo ou pagamento registrado ainda.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {myLedger.map((entry) => (
                            <div
                              key={entry.id}
                              className="py-3 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {LEDGER_TYPE_LABEL[entry.type]} ·{' '}
                                  {entry.description}
                                </p>
                                <p className="text-slate-500 font-mono-tabular">
                                  {formatDateBRFromYMD(entry.date)}
                                  {entry.paymentMethod
                                    ? ` · ${entry.paymentMethod}`
                                    : ''}
                                  {entry.settled ? ' · Quitada na folha' : ''}
                                </p>
                              </div>
                              <span
                                className={`font-mono-tabular font-bold shrink-0 ${
                                  entry.type === 'pagamento' ||
                                  entry.type === 'bonus'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {entry.type === 'pagamento' ||
                                entry.type === 'bonus'
                                  ? '+ '
                                  : '- '}
                                {formatCurrencyBRL(entry.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
