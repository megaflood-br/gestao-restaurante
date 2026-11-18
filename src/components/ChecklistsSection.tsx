'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Edit3,
  ExternalLink,
  ListChecks,
  Play,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CHECKLIST_FREQUENCY_LABEL,
  CHECKLIST_ROLE_LABEL,
  CHECKLIST_SHIFT_LABEL,
  formatDateTimeBR,
  formatTimeBR,
} from '@/lib/formatters';
import type {
  ChecklistFrequency,
  ChecklistItemTemplate,
  ChecklistRole,
  ChecklistRun,
  ChecklistShift,
  ChecklistTemplate,
  DeliveryStoreState,
} from '@/types/delivery';

interface ChecklistsSectionProps {
  state: DeliveryStoreState;
  onSaveTemplate: (template: ChecklistTemplate) => void;
  onToggleTemplateActive: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSubmitRun: (run: ChecklistRun) => void;
}

type ChecklistTab = 'modelos' | 'executar' | 'historico';

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

const FREQUENCY_OPTIONS: ChecklistFrequency[] = ['diario', 'turno', 'semanal'];

const EMPTY_STEP = (): ChecklistItemTemplate => ({
  id: `step-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  title: '',
  instruction: '',
  critical: false,
});

export function ChecklistsSection({
  state,
  onSaveTemplate,
  onToggleTemplateActive,
  onDeleteTemplate,
  onSubmitRun,
}: ChecklistsSectionProps) {
  const [activeTab, setActiveTab] = useState<ChecklistTab>('modelos');
  const [origin, setOrigin] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [roleFilter, setRoleFilter] = useState<'todos' | ChecklistRole>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Template modal / editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRole, setFormRole] = useState<ChecklistRole>('cozinha');
  const [formShift, setFormShift] = useState<ChecklistShift>('abertura');
  const [formFrequency, setFormFrequency] =
    useState<ChecklistFrequency>('diario');
  const [formAssignedEmployeeIds, setFormAssignedEmployeeIds] = useState<
    string[]
  >([]);
  const [formSteps, setFormSteps] = useState<ChecklistItemTemplate[]>([
    EMPTY_STEP(),
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Embedded execution state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    () => state.employees?.[0]?.id ?? 'outro',
  );
  const [employeeName, setEmployeeName] = useState(
    () => state.employees?.[0]?.name ?? 'Dona Maria Silva',
  );
  const [activeRun, setActiveRun] = useState<ChecklistRun | null>(null);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);

  // History state
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'todos' | 'concluido' | 'em_andamento'
  >('todos');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditorOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editorOpen]);

  const templates = state.checklistTemplates ?? [];
  const runs = state.checklistRuns ?? [];

  const staffPortalUrl = origin ? `${origin}/equipe` : '/equipe';

  const handleCopyStaffLink = async () => {
    try {
      await navigator.clipboard.writeText(staffPortalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Clipboard blocked
    }
  };

  const kpis = useMemo(() => {
    const activeTemplates = templates.filter((t) => t.active);
    const completedRuns = runs.filter((r) => r.status === 'concluido');
    const inProgressRuns = runs.filter((r) => r.status === 'em_andamento');
    const criticalSteps = activeTemplates.reduce(
      (sum, t) => sum + t.items.filter((i) => i.critical).length,
      0,
    );
    return {
      activeCount: activeTemplates.length,
      totalCount: templates.length,
      completedCount: completedRuns.length,
      inProgressCount: inProgressRuns.length,
      criticalSteps,
    };
  }, [templates, runs]);

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return templates.filter((t) => {
      if (roleFilter !== 'todos' && t.role !== roleFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        t.items.some((i) => i.title.toLowerCase().includes(q))
      );
    });
  }, [templates, roleFilter, searchTerm]);

  const filteredRuns = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return runs.filter((r) => {
      if (
        historyStatusFilter !== 'todos' &&
        r.status !== historyStatusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.templateTitle.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q) ||
        CHECKLIST_ROLE_LABEL[r.role].toLowerCase().includes(q)
      );
    });
  }, [runs, historySearch, historyStatusFilter]);

  const openNewTemplateModal = () => {
    setEditingTemplateId(null);
    setFormTitle('');
    setFormDescription('');
    setFormRole('cozinha');
    setFormShift('abertura');
    setFormFrequency('diario');
    setFormAssignedEmployeeIds([]);
    setFormSteps([EMPTY_STEP(), EMPTY_STEP()]);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditTemplateModal = (tpl: ChecklistTemplate) => {
    setEditingTemplateId(tpl.id);
    setFormTitle(tpl.title);
    setFormDescription(tpl.description ?? '');
    setFormRole(tpl.role);
    setFormShift(tpl.shift);
    setFormFrequency(tpl.frequency);
    setFormAssignedEmployeeIds(tpl.assignedEmployeeIds ?? []);
    setFormSteps(
      tpl.items.length > 0
        ? tpl.items.map((item) => ({ ...item }))
        : [EMPTY_STEP()],
    );
    setFormError(null);
    setEditorOpen(true);
  };

  const handleMoveStep = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= formSteps.length) return;
    const copy = [...formSteps];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setFormSteps(copy);
  };

  const handleSaveTemplateForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const validSteps = formSteps
      .map((s) => ({
        ...s,
        title: s.title.trim(),
        instruction: s.instruction?.trim() || undefined,
      }))
      .filter((s) => s.title.length > 0);

    if (!cleanTitle) {
      setFormError('Informe um título para o checklist.');
      return;
    }
    if (validSteps.length === 0) {
      setFormError('Adicione pelo menos uma etapa no checklist.');
      return;
    }

    const nowIso = new Date().toISOString();
    const existing = editingTemplateId
      ? templates.find((t) => t.id === editingTemplateId)
      : undefined;

    const template: ChecklistTemplate = {
      id: existing?.id ?? `chk-${Date.now()}`,
      title: cleanTitle,
      description: formDescription.trim() || undefined,
      role: formRole,
      shift: formShift,
      frequency: formFrequency,
      active: existing ? existing.active : true,
      assignedEmployeeIds:
        formAssignedEmployeeIds.length > 0
          ? formAssignedEmployeeIds
          : undefined,
      items: validSteps,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    onSaveTemplate(template);
    setEditorOpen(false);
  };

  const startExecutionForTemplate = (tpl: ChecklistTemplate) => {
    const matchedEmployee = (state.employees ?? []).find(
      (e) => e.id === selectedEmployeeId,
    );
    const cleanEmployee =
      matchedEmployee?.name ?? (employeeName.trim() || 'Funcionário');
    const nowIso = new Date().toISOString();
    const newRun: ChecklistRun = {
      id: `run-${Date.now()}`,
      templateId: tpl.id,
      templateTitle: tpl.title,
      role: tpl.role,
      shift: tpl.shift,
      employeeId: matchedEmployee?.id,
      employeeName: cleanEmployee,
      status: 'em_andamento',
      startedAt: nowIso,
      items: tpl.items.map((item) => ({
        itemId: item.id,
        title: item.title,
        instruction: item.instruction,
        critical: item.critical,
        checked: false,
      })),
    };
    setSelectedTemplateId(tpl.id);
    setActiveRun(newRun);
    setRunFeedback(null);
    setActiveTab('executar');
    onSubmitRun(newRun);
  };

  const handleToggleRunStep = (itemId: string) => {
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
    onSubmitRun(updated);
  };

  const handleUpdateStepNote = (itemId: string, note: string) => {
    if (!activeRun) return;
    const updated: ChecklistRun = {
      ...activeRun,
      items: activeRun.items.map((step) =>
        step.itemId === itemId ? { ...step, note } : step,
      ),
    };
    setActiveRun(updated);
  };

  const handleCompleteRun = () => {
    if (!activeRun) return;
    const nowIso = new Date().toISOString();
    const completed: ChecklistRun = {
      ...activeRun,
      status: 'concluido',
      completedAt: nowIso,
      employeeName: employeeName.trim() || activeRun.employeeName,
    };
    onSubmitRun(completed);
    setActiveRun(null);
    setRunFeedback(
      `Checklist "${completed.templateTitle}" finalizado por ${completed.employeeName}.`,
    );
    setActiveTab('historico');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Checklists Operacionais da Equipe
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Crie rotinas passo a passo para cozinha, limpeza, atendimento e
            entregadores seguirem em cada turno.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewTemplateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors self-start lg:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Novo Checklist</span>
        </button>
      </header>

      {/* Portal access link strip */}
      <section className="p-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">
              Link Exclusivo da Equipe (/equipe)
            </strong>{' '}
            — envie para celulares ou tablets dos funcionários acompanharem e
            marcarem cada etapa sem entrar no painel administrativo.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={staffPortalUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link do portal de checklists para funcionários"
            className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyStaffLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Link Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
            <a
              href="/equipe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Abrir Portal Funcionários</span>
            </a>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Modelos Ativos
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
            {kpis.activeCount}
            <span className="text-sm font-normal text-slate-400 ml-1">
              /{kpis.totalCount}
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Checklists Concluídos
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400 mt-1">
            {kpis.completedCount}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Em Andamento
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400 mt-1">
            {kpis.inProgressCount}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Etapas Críticas Ativas
          </p>
          <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white mt-1">
            {kpis.criticalSteps}
          </p>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {(
          [
            { id: 'modelos', label: 'Modelos de Checklist', icon: ListChecks },
            { id: 'executar', label: 'Executar Agora', icon: Play },
            {
              id: 'historico',
              label: `Registros Concluídos (${runs.length})`,
              icon: ClipboardCheck,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-[#13151c] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {runFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
          <span className="font-medium">{runFeedback}</span>
          <button
            type="button"
            onClick={() => setRunFeedback(null)}
            aria-label="Fechar aviso"
            className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'modelos' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter('todos')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  roleFilter === 'todos'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                Todos os Setores
              </button>
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    roleFilter === role
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'bg-white dark:bg-[#13151c] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {CHECKLIST_ROLE_LABEL[role]}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar checklist ou etapa..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Nenhum checklist encontrado para este filtro.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Crie um novo modelo operacional clicando em &ldquo;Novo
                Checklist&rdquo;.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTemplates.map((tpl) => {
                const criticalCount = tpl.items.filter(
                  (i) => i.critical,
                ).length;
                const isConfirmingDelete = confirmDeleteId === tpl.id;
                return (
                  <article
                    key={tpl.id}
                    className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {CHECKLIST_ROLE_LABEL[tpl.role]} ·{' '}
                            {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                            {CHECKLIST_FREQUENCY_LABEL[tpl.frequency]}
                          </p>
                          <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                            {tpl.title}
                          </h2>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleTemplateActive(tpl.id)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md border shrink-0 transition-colors ${
                            tpl.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}
                        >
                          {tpl.active ? 'Ativo' : 'Pausado'}
                        </button>
                      </div>

                      {tpl.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {tpl.description}
                        </p>
                      )}

                      {(tpl.assignedEmployeeIds ?? []).length > 0 && (
                        <p className="text-[11px] font-medium text-brand-700 dark:text-brand-400">
                          Vinculado a:{' '}
                          {(tpl.assignedEmployeeIds ?? [])
                            .map(
                              (empId) =>
                                (state.employees ?? []).find(
                                  (e) => e.id === empId,
                                )?.name,
                            )
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}

                      <ol className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {tpl.items.slice(0, 4).map((step, idx) => (
                          <li
                            key={step.id}
                            className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                          >
                            <span className="font-mono-tabular text-slate-400 w-4 shrink-0">
                              {idx + 1}.
                            </span>
                            <span className="flex-1 min-w-0">
                              {step.title}
                              {step.critical && (
                                <span className="ml-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                  · Crítico
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                        {tpl.items.length > 4 && (
                          <li className="text-xs text-slate-400 pl-6">
                            + {tpl.items.length - 4} etapa(s) adicional(is)
                          </li>
                        )}
                      </ol>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono-tabular text-slate-500">
                        {tpl.items.length} etapas · {criticalCount} críticas
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startExecutionForTemplate(tpl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Executar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditTemplateModal(tpl)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </button>

                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTemplate(tpl.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(tpl.id)}
                            aria-label={`Excluir checklist ${tpl.title}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EMBEDDED EXECUTION */}
      {activeTab === 'executar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 self-start">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Iniciar Checklist no Painel
            </h2>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Funcionário Responsável
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedEmployeeId(val);
                  const found = (state.employees ?? []).find(
                    (emp) => emp.id === val,
                  );
                  if (found) setEmployeeName(found.name);
                }}
                aria-label="Selecionar funcionário responsável"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {(state.employees ?? [])
                  .filter((emp) => emp.status !== 'inativo')
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({CHECKLIST_ROLE_LABEL[emp.role]})
                    </option>
                  ))}
                <option value="outro">Outro colaborador (digitar nome)</option>
              </select>
              {selectedEmployeeId === 'outro' && (
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Nome do funcionário"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Selecione o Modelo Ativo
              </p>
              {templates.filter((t) => t.active).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum modelo ativo disponível.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates
                    .filter((t) => t.active)
                    .map((tpl) => {
                      const isSelected = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => startExecutionForTemplate(tpl)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-300 dark:border-brand-700'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-brand-300'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            {tpl.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {CHECKLIST_ROLE_LABEL[tpl.role]} ·{' '}
                            {CHECKLIST_SHIFT_LABEL[tpl.shift]} ·{' '}
                            {tpl.items.length} etapas
                          </p>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-2 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            {!activeRun ? (
              <div className="py-12 text-center space-y-2">
                <UserCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Escolha um checklist ao lado para iniciar a execução
                </p>
                <p className="text-xs text-slate-500">
                  Ou compartilhe o link <strong className="font-mono-tabular">/equipe</strong> para os funcionários executarem direto do celular.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <p className="text-xs text-slate-500">
                      {CHECKLIST_ROLE_LABEL[activeRun.role]} ·{' '}
                      {CHECKLIST_SHIFT_LABEL[activeRun.shift]} · Responsável:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {activeRun.employeeName}
                      </strong>
                    </p>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {activeRun.templateTitle}
                    </h3>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono-tabular font-bold text-brand-600 dark:text-brand-400">
                      {activeRun.items.filter((i) => i.checked).length} /{' '}
                      {activeRun.items.length} concluídas
                    </p>
                    <p className="text-[11px] font-mono-tabular text-slate-400">
                      Início às {formatTimeBR(activeRun.startedAt)}
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
                          : 'bg-slate-50/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleRunStep(step.itemId)}
                        className="w-full flex items-start gap-3 text-left"
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            step.checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {step.checked && <Check className="w-3.5 h-3.5" />}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold ${
                              step.checked
                                ? 'line-through text-slate-500 dark:text-slate-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {idx + 1}. {step.title}
                          </p>
                          {step.instruction && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {step.instruction}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                            {step.critical && (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="w-3 h-3" />
                                Etapa Crítica
                              </span>
                            )}
                            {step.checkedAt && (
                              <span className="font-mono-tabular text-emerald-700 dark:text-emerald-400">
                                Marcado às {formatTimeBR(step.checkedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="mt-2.5 pl-8">
                        <input
                          type="text"
                          value={step.note ?? ''}
                          onChange={(e) =>
                            handleUpdateStepNote(step.itemId, e.target.value)
                          }
                          onBlur={() => onSubmitRun(activeRun)}
                          placeholder="Observação desta etapa (ex.: temperatura 3,5°C, item ok)..."
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {activeRun.items.some((i) => i.critical && !i.checked) && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Há etapa(s) crítica(s) ainda pendente(s) de conferência.
                    </span>
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveRun(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    Salvar e Pausar
                  </button>
                  <button
                    type="button"
                    onClick={handleCompleteRun}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Finalizar Checklist</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeTab === 'historico' && (
        <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por funcionário ou checklist..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'concluido', label: 'Concluídos' },
                  { id: 'em_andamento', label: 'Em Andamento' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHistoryStatusFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    historyStatusFilter === opt.id
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {filteredRuns.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhuma execução registrada até o momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRuns.map((run) => {
                const doneCount = run.items.filter((i) => i.checked).length;
                const isExpanded = expandedRunId === run.id;
                return (
                  <div key={run.id} className="p-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs text-slate-500 font-mono-tabular">
                          {formatDateTimeBR(run.completedAt ?? run.startedAt)} ·{' '}
                          {CHECKLIST_ROLE_LABEL[run.role]} ·{' '}
                          {CHECKLIST_SHIFT_LABEL[run.shift]}
                        </p>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {run.templateTitle}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Responsável:{' '}
                          <strong className="font-semibold">
                            {run.employeeName}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p
                            className={`text-xs font-semibold ${
                              run.status === 'concluido'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {run.status === 'concluido'
                              ? 'Concluído'
                              : 'Em andamento'}
                          </p>
                          <p className="text-xs font-mono-tabular text-slate-500">
                            {doneCount}/{run.items.length} etapas
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRunId(isExpanded ? null : run.id)
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                        >
                          {isExpanded ? 'Ocultar' : 'Ver Etapas'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        {run.items.map((item, idx) => (
                          <div
                            key={item.itemId}
                            className="flex items-start justify-between gap-3 text-xs py-1"
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`font-bold ${
                                  item.checked
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {item.checked ? '✓' : '○'}
                              </span>
                              <div>
                                <p className="text-slate-800 dark:text-slate-200 font-medium">
                                  {idx + 1}. {item.title}
                                </p>
                                {item.note && (
                                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                                    Obs.: {item.note}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="font-mono-tabular text-slate-400 shrink-0">
                              {item.checkedAt
                                ? formatTimeBR(item.checkedAt)
                                : 'Pendente'}
                            </span>
                          </div>
                        ))}
                        {run.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <strong>Resumo do turno:</strong> {run.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* CREATE / EDIT MODAL */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checklist-editor-title"
        >
          <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="checklist-editor-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {editingTemplateId
                  ? 'Editar Modelo de Checklist'
                  : 'Novo Checklist Operacional'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveTemplateForm}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Título do Checklist
                </label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex.: Abertura da Cozinha e Pré-Preparo"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Orientação Geral
                </label>
                <input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ex.: Seguir diariamente antes de abrir o cardápio."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Setor / Função
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) =>
                      setFormRole(e.target.value as ChecklistRole)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {CHECKLIST_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Turno
                  </label>
                  <select
                    value={formShift}
                    onChange={(e) =>
                      setFormShift(e.target.value as ChecklistShift)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {SHIFT_OPTIONS.map((shift) => (
                      <option key={shift} value={shift}>
                        {CHECKLIST_SHIFT_LABEL[shift]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Frequência
                  </label>
                  <select
                    value={formFrequency}
                    onChange={(e) =>
                      setFormFrequency(e.target.value as ChecklistFrequency)
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {FREQUENCY_OPTIONS.map((freq) => (
                      <option key={freq} value={freq}>
                        {CHECKLIST_FREQUENCY_LABEL[freq]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(state.employees ?? []).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Funcionários Vinculados (opcional)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Vincule colaboradores específicos para aparecer em destaque no portal /equipe.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(state.employees ?? [])
                      .filter((emp) => emp.status !== 'inativo')
                      .map((emp) => {
                        const checked = formAssignedEmployeeIds.includes(
                          emp.id,
                        );
                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-brand-50/70 dark:bg-brand-950/30 border-brand-300 dark:border-brand-700 text-slate-900 dark:text-white'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setFormAssignedEmployeeIds((prev) =>
                                  prev.includes(emp.id)
                                    ? prev.filter((id) => id !== emp.id)
                                    : [...prev, emp.id],
                                )
                              }
                              className="rounded border-slate-300 text-brand-600"
                            />
                            <span className="truncate font-medium">
                              {emp.name}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-auto shrink-0">
                              {CHECKLIST_ROLE_LABEL[emp.role]}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Etapas a Seguir ({formSteps.length})
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setFormSteps((prev) => [...prev, EMPTY_STEP()])
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Etapa</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formSteps.map((step, index) => (
                    <div
                      key={step.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono-tabular font-bold text-slate-500">
                          Etapa {index + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mr-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(step.critical)}
                              onChange={(e) =>
                                setFormSteps((prev) =>
                                  prev.map((s) =>
                                    s.id === step.id
                                      ? { ...s, critical: e.target.checked }
                                      : s,
                                  ),
                                )
                              }
                              className="rounded border-slate-300 text-brand-600"
                            />
                            <span>Crítica</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(index, -1)}
                            disabled={index === 0}
                            aria-label="Subir etapa"
                            className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(index, 1)}
                            disabled={index === formSteps.length - 1}
                            aria-label="Descer etapa"
                            className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {formSteps.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormSteps((prev) =>
                                  prev.filter((s) => s.id !== step.id),
                                )
                              }
                              aria-label="Remover etapa"
                              className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        value={step.title}
                        onChange={(e) =>
                          setFormSteps((prev) =>
                            prev.map((s) =>
                              s.id === step.id
                                ? { ...s, title: e.target.value }
                                : s,
                            ),
                          )
                        }
                        placeholder="O que o funcionário deve fazer nesta etapa?"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                      <input
                        value={step.instruction ?? ''}
                        onChange={(e) =>
                          setFormSteps((prev) =>
                            prev.map((s) =>
                              s.id === step.id
                                ? { ...s, instruction: e.target.value }
                                : s,
                            ),
                          )
                        }
                        placeholder="Instrução adicional ou critério de qualidade (opcional)"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                >
                  Salvar Checklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
