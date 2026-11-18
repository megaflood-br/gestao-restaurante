'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Moon,
  RefreshCw,
  Sun,
  UserCheck,
} from 'lucide-react';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  CHECKLIST_FREQUENCY_LABEL,
  CHECKLIST_ROLE_LABEL,
  CHECKLIST_SHIFT_LABEL,
  formatDateTimeBR,
  formatTimeBR,
} from '@/lib/formatters';
import type {
  ChecklistRole,
  ChecklistRun,
  ChecklistTemplate,
  DeliveryStoreState,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';
const STAFF_NAME_KEY = 'casa-tempero-staff-name';

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
    wasteLogs: Array.isArray(parsed.wasteLogs)
      ? parsed.wasteLogs
      : INITIAL_DELIVERY_STATE.wasteLogs,
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

export function StaffPortalPage() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [employeeName, setEmployeeName] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | ChecklistRole>('todos');
  const [activeRun, setActiveRun] = useState<ChecklistRun | null>(null);
  const [closingNote, setClosingNote] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const loadFromSources = useCallback(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeliveryStoreState;
        if (parsed.store) {
          setState(hydrateState(parsed));
          return;
        }
      }
    } catch {
      // fallback to server
    }

    try {
      const res = await fetch('/api/delivery');
      if (res.ok) {
        const data = (await res.json()) as DeliveryStoreState;
        setState(hydrateState(data));
      }
    } catch {
      // keep initial
    }
  }, []);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    try {
      const savedName = localStorage.getItem(STAFF_NAME_KEY);
      if (savedName) setEmployeeName(savedName);
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

  const handleEmployeeNameChange = (value: string) => {
    setEmployeeName(value);
    try {
      localStorage.setItem(STAFF_NAME_KEY, value);
    } catch {
      // ignore
    }
  };

  const activeTemplates = useMemo(
    () =>
      (state.checklistTemplates ?? []).filter(
        (t) => t.active && (roleFilter === 'todos' || t.role === roleFilter),
      ),
    [state.checklistTemplates, roleFilter],
  );

  const recentRuns = useMemo(
    () => (state.checklistRuns ?? []).slice(0, 6),
    [state.checklistRuns],
  );

  const handleStartChecklist = (tpl: ChecklistTemplate) => {
    const cleanName = employeeName.trim() || 'Funcionário do Turno';
    const existingInProgress = (state.checklistRuns ?? []).find(
      (r) =>
        r.templateId === tpl.id &&
        r.status === 'em_andamento' &&
        r.employeeName.toLowerCase() === cleanName.toLowerCase(),
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
      employeeName: cleanName,
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
    if (!activeRun) return;
    const completed: ChecklistRun = {
      ...activeRun,
      employeeName: employeeName.trim() || activeRun.employeeName,
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
                Portal da Equipe · Checklists
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Atualizar checklists"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
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

        {/* Employee identification */}
        <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <label
              htmlFor="staff-name-input"
              className="text-sm font-bold text-slate-900 dark:text-white"
            >
              Quem está executando o turno?
            </label>
          </div>
          <input
            id="staff-name-input"
            type="text"
            value={employeeName}
            onChange={(e) => handleEmployeeNameChange(e.target.value)}
            placeholder="Digite seu nome completo (ex.: Dona Maria, João Silva)"
            className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
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
                  <span>Voltar para lista de checklists</span>
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

              {activeTemplates.length === 0 ? (
                <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                  Nenhum checklist ativo disponível para este setor.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeTemplates.map((tpl) => (
                    <article
                      key={tpl.id}
                      className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {CHECKLIST_ROLE_LABEL[tpl.role]} ·{' '}
                          {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                          {CHECKLIST_FREQUENCY_LABEL[tpl.frequency]}
                        </p>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {tpl.title}
                        </h2>
                        {tpl.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {tpl.description}
                          </p>
                        )}
                        <p className="text-xs font-mono-tabular text-slate-500 pt-1">
                          {tpl.items.length} etapas ·{' '}
                          {tpl.items.filter((i) => i.critical).length} críticas
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
                  ))}
                </div>
              )}
            </section>

            {recentRuns.length > 0 && (
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Últimos Checklists Registrados
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {run.templateTitle}
                        </p>
                        <p className="text-slate-500 truncate">
                          {run.employeeName} ·{' '}
                          <span className="font-mono-tabular">
                            {formatDateTimeBR(run.completedAt ?? run.startedAt)}
                          </span>
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
        )}
      </main>
    </div>
  );
}
