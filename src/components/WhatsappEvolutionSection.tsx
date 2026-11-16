'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCheck,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { formatCurrencyBRL, formatTimeBR } from '@/lib/formatters';
import type { SettingsTabId } from '@/components/SettingsSection';
import type {
  BotTone,
  DeliveryStoreState,
  EvolutionConfig,
  Order,
  StockIngredient,
  StockMovement,
  WhatsappLog,
} from '@/types/delivery';

interface WhatsappEvolutionSectionProps {
  state: DeliveryStoreState;
  onUpdateEvolution: (evolution: EvolutionConfig) => void;
  onAppendLogs: (logs: WhatsappLog[]) => void;
  onOrderCreatedFromBot?: (
    order: Order,
    stockMovements: StockMovement[],
    ingredients?: StockIngredient[],
  ) => void;
  onOpenOrders?: () => void;
  onOpenSettings?: (tab?: SettingsTabId) => void;
}

type LeftPanelMode = 'conversas' | 'ajustes_rapidos';

interface ConversationThreadSummary {
  key: string;
  phone: string;
  customerName: string;
  lastMessage: string;
  lastTimestamp: string;
  messageCount: number;
  isHumanHandoff: boolean;
}

const BRENDA_AVATAR_URL = '/images/avatar_brenda_atendente_1794784551375.jpg';

const SIMULATED_PRESETS = [
  'Oi, tudo bem?',
  'Pode me mandar o cardápio de hoje?',
  'Quero 1 Strogonoff de Carne',
  'Para entregar na Rua Vergueiro, 900',
  'Vou pagar no Pix',
  'Quero falar com um atendente humano',
];

const TONE_OPTIONS: Array<{
  id: BotTone;
  label: string;
}> = [
  { id: 'acolhedor', label: 'Acolhedor' },
  { id: 'descontraido', label: 'Descontraído' },
  { id: 'objetivo', label: 'Objetivo' },
];

export function WhatsappEvolutionSection({
  state,
  onUpdateEvolution,
  onAppendLogs,
  onOrderCreatedFromBot,
  onOpenOrders,
  onOpenSettings,
}: WhatsappEvolutionSectionProps) {
  const { evolution } = state.store;

  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>('conversas');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Quick live-tweaks synced with evolution config
  const [assistantName, setAssistantName] = useState(
    evolution.assistantName || 'Brenda',
  );
  const [tone, setTone] = useState<BotTone>(evolution.tone || 'acolhedor');
  const [allowAiOrderCreation, setAllowAiOrderCreation] = useState(
    evolution.allowAiOrderCreation !== false,
  );
  const [upsellEnabled, setUpsellEnabled] = useState(
    evolution.upsellEnabled !== false,
  );
  const [humanHandoffEnabled, setHumanHandoffEnabled] = useState(
    evolution.humanHandoffEnabled !== false,
  );

  const [envStatus, setEnvStatus] = useState<{
    openAiConfigured: boolean;
    openAiModel: string;
    evolutionConfigured: boolean;
  }>({
    openAiConfigured: false,
    openAiModel: 'gpt-4o-mini',
    evolutionConfigured: false,
  });

  const [statusFeedback, setStatusFeedback] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);

  // Live Inbox / Simulator state
  const [selectedPhone, setSelectedPhone] = useState('5511988124401');
  const [selectedCustomerName, setSelectedCustomerName] =
    useState('Juliana Costa');
  const [composerMode, setComposerMode] = useState<
    'simulate_customer' | 'operator_reply'
  >('simulate_customer');
  const [composerText, setComposerText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);

  // New conversation inline state
  const [showNewChatForm, setShowNewChatForm] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');

  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAssistantName(evolution.assistantName || 'Brenda');
    setTone(evolution.tone || 'acolhedor');
    setAllowAiOrderCreation(evolution.allowAiOrderCreation !== false);
    setUpsellEnabled(evolution.upsellEnabled !== false);
    setHumanHandoffEnabled(evolution.humanHandoffEnabled !== false);
  }, [evolution]);

  useEffect(() => {
    fetch('/api/evolution/instance')
      .then((res) => res.json())
      .then((data) => {
        if (data?.envStatus) {
          setEnvStatus({
            openAiConfigured: Boolean(data.envStatus.openAiConfigured),
            openAiModel: data.envStatus.openAiModel || 'gpt-4o-mini',
            evolutionConfigured: Boolean(data.envStatus.evolutionConfigured),
          });
        }
      })
      .catch(() => {});
  }, []);

  const handoffPhones = useMemo(
    () => evolution.humanHandoffPhones ?? [],
    [evolution.humanHandoffPhones],
  );

  const isPhoneUnderHumanHandoff = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return false;
    const suffix = clean.slice(-8);
    return handoffPhones.some((p) => p.replace(/\D/g, '').endsWith(suffix));
  };

  const conversations = useMemo<ConversationThreadSummary[]>(() => {
    const map = new Map<string, ConversationThreadSummary>();
    for (const log of state.whatsappLogs) {
      const clean = log.phone.replace(/\D/g, '');
      if (!clean) continue;
      const key = clean.slice(-8);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          phone: clean,
          customerName: log.customerName || 'Cliente WhatsApp',
          lastMessage: log.message,
          lastTimestamp: log.timestamp,
          messageCount: 1,
          isHumanHandoff: isPhoneUnderHumanHandoff(clean),
        });
      } else {
        existing.messageCount += 1;
        if (
          existing.customerName === 'Cliente WhatsApp' &&
          log.customerName &&
          log.customerName !== 'Cliente WhatsApp'
        ) {
          existing.customerName = log.customerName;
        }
      }
    }

    const selectedClean = selectedPhone.replace(/\D/g, '');
    const selectedKey = selectedClean.slice(-8);
    if (selectedClean && !map.has(selectedKey)) {
      map.set(selectedKey, {
        key: selectedKey,
        phone: selectedClean,
        customerName: selectedCustomerName || 'Cliente Teste',
        lastMessage: 'Conversa pronta para simulação com a atendente',
        lastTimestamp: new Date().toISOString(),
        messageCount: 0,
        isHumanHandoff: isPhoneUnderHumanHandoff(selectedClean),
      });
    }

    return Array.from(map.values());
  }, [state.whatsappLogs, selectedPhone, selectedCustomerName, handoffPhones]);

  const activeThread = useMemo(() => {
    const suffix = selectedPhone.replace(/\D/g, '').slice(-8);
    if (!suffix) return [];
    return [...state.whatsappLogs]
      .filter((l) => l.phone.replace(/\D/g, '').endsWith(suffix))
      .slice(0, 30)
      .reverse();
  }, [state.whatsappLogs, selectedPhone]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeThread.length, isBotTyping]);

  const activeIsHandoff = isPhoneUnderHumanHandoff(selectedPhone);

  const whatsappOrdersCount = useMemo(
    () => state.orders.filter((o) => o.source === 'whatsapp').length,
    [state.orders],
  );

  const persistQuickConfig = async (overrides?: {
    autoReplyEnabled?: boolean;
  }) => {
    setBusyAction('save');
    setStatusFeedback('');
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          autoReplyEnabled:
            overrides?.autoReplyEnabled ?? evolution.autoReplyEnabled,
          assistantName,
          tone,
          allowAiOrderCreation,
          upsellEnabled,
          humanHandoffEnabled,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        evolution?: EvolutionConfig;
      };
      if (data.ok && data.evolution) {
        onUpdateEvolution(data.evolution);
        setStatusFeedback(
          `Ajustes rápidos da atendente ${assistantName || 'Brenda'} aplicados.`,
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSimulateInbound = async (textOverride?: string) => {
    const messageToSend = (textOverride ?? composerText).trim();
    if (!messageToSend) return;
    setSendingMsg(true);
    setStatusFeedback('');
    if (!textOverride) setComposerText('');

    try {
      const res = await fetch('/api/evolution/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulated: true,
          phone: selectedPhone,
          customerName: selectedCustomerName,
          message: messageToSend,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        inboundLog?: WhatsappLog;
        outboundLog?: WhatsappLog;
        typingDelayMs?: number;
        pausedForHuman?: boolean;
        handoffTriggered?: boolean;
        optOutTriggered?: boolean;
        createdOrder?: Order | null;
        stockMovements?: StockMovement[];
        ingredients?: StockIngredient[];
        evolution?: EvolutionConfig;
      };
      if (data.ok) {
        if (data.inboundLog) {
          onAppendLogs([data.inboundLog]);
        }

        if (data.outboundLog && !data.pausedForHuman) {
          const simulatedWaitMs =
            evolution.typingPresenceEnabled !== false
              ? Math.min(Math.max(data.typingDelayMs ?? 1800, 900), 4800)
              : 0;
          if (simulatedWaitMs > 0) {
            setIsBotTyping(true);
            await new Promise((resolve) => setTimeout(resolve, simulatedWaitMs));
            setIsBotTyping(false);
          }
          onAppendLogs([data.outboundLog]);
        }

        if (data.evolution) onUpdateEvolution(data.evolution);

        if (data.createdOrder) {
          setLastCreatedOrder(data.createdOrder);
          onOrderCreatedFromBot?.(
            data.createdOrder,
            data.stockMovements ?? [],
            data.ingredients,
          );
        }

        if (data.pausedForHuman) {
          setStatusFeedback(
            `IA pausada para ${selectedCustomerName}: atendimento em modo humano.`,
          );
          setComposerMode('operator_reply');
        } else if (data.optOutTriggered) {
          setStatusFeedback(
            `${selectedCustomerName} solicitou opt-out ("PARAR") e foi adicionado à lista de bloqueio automático.`,
          );
        } else if (data.handoffTriggered) {
          setStatusFeedback(
            `Transbordo humano ativado para ${selectedCustomerName}. A IA foi pausada nesta conversa.`,
          );
          setComposerMode('operator_reply');
        }
      }
    } finally {
      setIsBotTyping(false);
      setSendingMsg(false);
    }
  };

  const handleSendOperatorReply = async (textOverride?: string) => {
    const messageToSend = (textOverride ?? composerText).trim();
    if (!selectedPhone.trim() || !messageToSend) return;
    setSendingMsg(true);
    if (!textOverride) setComposerText('');

    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_manual',
          phone: selectedPhone,
          customerName: selectedCustomerName,
          message: messageToSend,
        }),
      });
      const data = (await res.json()) as { ok: boolean; log?: WhatsappLog };
      if (data.ok && data.log) {
        onAppendLogs([data.log]);
      }
    } finally {
      setSendingMsg(false);
    }
  };

  const handleToggleHandoff = async (phone: string) => {
    setBusyAction('toggle_handoff');
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_handoff', phone }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        activeHumanHandoff?: boolean;
        evolution?: EvolutionConfig;
      };
      if (data.ok && data.evolution) {
        onUpdateEvolution(data.evolution);
        setStatusFeedback(
          data.activeHumanHandoff
            ? 'Atendimento assumido por humano. IA pausada para este contato.'
            : `Atendente ${assistantName || 'Brenda'} reativada para este contato.`,
        );
        setComposerMode(
          data.activeHumanHandoff ? 'operator_reply' : 'simulate_customer',
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendRecovery = async (phone: string, customerName: string) => {
    setBusyAction('send_recovery');
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_recovery',
          phone,
          customerName,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        log?: WhatsappLog;
        error?: string;
      };
      if (data.ok && data.log) {
        onAppendLogs([data.log]);
        setStatusFeedback(
          `Mensagem de recuperação de venda enviada para ${customerName}.`,
        );
      } else if (!data.ok && data.error) {
        setStatusFeedback(data.error);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartNewConversation = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newChatPhone.replace(/\D/g, '');
    if (!clean) return;
    setSelectedPhone(clean);
    setSelectedCustomerName(newChatName.trim() || 'Novo Cliente');
    setShowNewChatForm(false);
    setNewChatName('');
    setNewChatPhone('');
    setComposerMode('simulate_customer');
  };

  const displayName = evolution.assistantName || 'Brenda';

  const statusText =
    evolution.connectionStatus === 'conectado'
      ? 'WhatsApp Conectado'
      : evolution.connectionStatus === 'aguardando_qr'
        ? 'Aguardando QR Code'
        : evolution.connectionStatus === 'simulador'
          ? 'Simulador Local'
          : 'Desconectado';

  return (
    <div className="space-y-6">
      {/* Focused Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-brand-50 dark:bg-brand-950/50 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
            {avatarFailed ? (
              <Bot
                className="w-6 h-6 text-brand-600 dark:text-brand-400"
                aria-hidden="true"
              />
            ) : (
              <img
                src={BRENDA_AVATAR_URL}
                alt={`Atendente virtual ${displayName}`}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Atendimento WhatsApp · {displayName}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">
              {statusText} ·{' '}
              {envStatus.openAiConfigured
                ? `OpenAI (${envStatus.openAiModel})`
                : 'Motor conversacional local'}{' '}
              · Delay humanizado{' '}
              {((evolution.typingMinDelayMs ?? 1800) / 1000).toFixed(1)}s–
              {((evolution.typingMaxDelayMs ?? 4800) / 1000).toFixed(1)}s
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              persistQuickConfig({
                autoReplyEnabled: !evolution.autoReplyEnabled,
              })
            }
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              evolution.autoReplyEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
            }`}
          >
            {evolution.autoReplyEnabled ? 'IA Ligada · Pausar' : 'IA Pausada · Ligar'}
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={() => onOpenSettings('ia')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Configurar IA, Anti-Ban e APIs</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact Live KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conversas Ativas
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {conversations.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pedidos Fechados no Chat
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {whatsappOrdersCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Em Transbordo Humano
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {handoffPhones.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proteção Anti-Ban
          </p>
          <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {evolution.typingPresenceEnabled !== false
              ? 'Digitação & Opt-Out Ativos'
              : 'Digitação Manual'}
          </p>
        </div>
      </section>

      {statusFeedback && (
        <div className="px-4 py-3 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 rounded-xl text-xs font-medium text-brand-900 dark:text-brand-200">
          {statusFeedback}
        </div>
      )}

      {lastCreatedOrder && (
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
            <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              Pedido <strong className="font-mono-tabular">#{lastCreatedOrder.orderNumber}</strong> (
              <strong className="font-mono-tabular">
                {formatCurrencyBRL(lastCreatedOrder.total)}
              </strong>
              ) criado pela {displayName} no WhatsApp e enviado à cozinha com baixa automática de estoque!
            </span>
          </div>
          {onOpenOrders && (
            <button
              type="button"
              onClick={onOpenOrders}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shrink-0 whitespace-nowrap"
            >
              Ver no Gestor de Pedidos
            </button>
          )}
        </div>
      )}

      {/* Split-Screen Atendimento Ao Vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Conversations & Quick Tweaks */}
        <aside className="lg:col-span-5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setLeftPanelMode('conversas')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  leftPanelMode === 'conversas'
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Conversas ({conversations.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelMode('ajustes_rapidos')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  leftPanelMode === 'ajustes_rapidos'
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                <span>Ajuste Rápido</span>
              </button>
            </div>

            {leftPanelMode === 'conversas' && (
              <button
                type="button"
                onClick={() => setShowNewChatForm((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 rounded-lg whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Novo Teste</span>
              </button>
            )}
          </div>

          {leftPanelMode === 'conversas' ? (
            <>
              {showNewChatForm && (
                <form
                  onSubmit={handleStartNewConversation}
                  className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <input
                    required
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    placeholder="Nome do cliente (ex.: Marcos)"
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                  />
                  <div className="flex gap-2">
                    <input
                      required
                      value={newChatPhone}
                      onChange={(e) => setNewChatPhone(e.target.value)}
                      placeholder="5511999998888"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-md"
                    >
                      Abrir
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
                {conversations.map((conv) => {
                  const isSelected = selectedPhone
                    .replace(/\D/g, '')
                    .endsWith(conv.key);
                  return (
                    <button
                      key={conv.key}
                      type="button"
                      onClick={() => {
                        setSelectedPhone(conv.phone);
                        setSelectedCustomerName(conv.customerName);
                        setComposerMode(
                          conv.isHumanHandoff
                            ? 'operator_reply'
                            : 'simulate_customer',
                        );
                      }}
                      className={`w-full text-left p-4 transition-colors ${
                        isSelected
                          ? 'bg-brand-50/70 dark:bg-brand-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {conv.customerName}
                        </p>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {formatTimeBR(conv.lastTimestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
                        {conv.phone}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {conv.lastMessage}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span
                          className={`font-semibold ${
                            conv.isHumanHandoff
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {conv.isHumanHandoff
                            ? 'Modo Humano Ativo'
                            : `IA ${displayName} Ativa`}
                        </span>
                        <span className="font-mono-tabular text-slate-400">
                          {conv.messageCount} msgs
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="quick-assistant-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome da Atendente
                </label>
                <input
                  id="quick-assistant-name"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tom de Voz
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTone(opt.id)}
                      className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        tone === opt.id
                          ? 'bg-brand-50 dark:bg-brand-950/50 border-brand-500 text-brand-700 dark:text-brand-300'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Fechar pedidos direto no chat
                  </span>
                  <input
                    type="checkbox"
                    checked={allowAiOrderCreation}
                    onChange={(e) => setAllowAiOrderCreation(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Sugerir bebidas e extras (Upsell)
                  </span>
                  <input
                    type="checkbox"
                    checked={upsellEnabled}
                    onChange={(e) => setUpsellEnabled(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Transbordo automático para humano
                  </span>
                  <input
                    type="checkbox"
                    checked={humanHandoffEnabled}
                    onChange={(e) => setHumanHandoffEnabled(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => persistQuickConfig()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Aplicar na Conversa</span>
              </button>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => onOpenSettings('whatsapp')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
                >
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Abrir Configurações Completas (QR, Anti-Ban e APIs)</span>
                </button>
              )}
            </div>
          )}
        </aside>

        {/* Right Panel: Authentic WhatsApp Web Simulator Frame */}
        <section className="lg:col-span-7 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          {/* WhatsApp Header */}
          <div className="px-5 py-3.5 bg-[#075E54] dark:bg-[#1f2c34] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                {avatarFailed ? (
                  <Bot className="w-5 h-5 text-white" aria-hidden="true" />
                ) : (
                  <img
                    src={BRENDA_AVATAR_URL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold truncate">
                    {selectedCustomerName}
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-emerald-200 shrink-0">
                    · {selectedPhone}
                  </span>
                </div>
                <p className="text-xs text-emerald-100/90 truncate">
                  {isBotTyping
                    ? 'digitando...'
                    : activeIsHandoff
                      ? 'Atendimento humano assumido (IA pausada)'
                      : `${displayName} · online respondendo pelo WhatsApp`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleToggleHandoff(selectedPhone)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeIsHandoff
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
              >
                {activeIsHandoff ? (
                  <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {activeIsHandoff ? `Reativar ${displayName}` : 'Assumir Humano'}
                </span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  handleSendRecovery(selectedPhone, selectedCustomerName)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Recuperar Venda</span>
              </button>
            </div>
          </div>

          {/* WhatsApp Chat Area */}
          <div
            ref={chatScrollRef}
            className="h-[380px] overflow-y-auto p-5 bg-[#efeae2] dark:bg-[#0d1418] space-y-3"
          >
            {activeThread.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <div className="px-4 py-3 bg-white/90 dark:bg-[#202c33] rounded-xl border border-black/5 dark:border-white/5 max-w-md">
                  <MessageSquare
                    className="w-5 h-5 mx-auto mb-1.5 text-brand-600 dark:text-brand-400"
                    aria-hidden="true"
                  />
                  Escolha uma mensagem pronta abaixo ou digite como o cliente para testar o atendimento natural da{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {displayName}
                  </strong>
                  .
                </div>
              </div>
            ) : (
              activeThread.map((item) => {
                const isCustomer = item.direction === 'inbound';
                const senderLabel = isCustomer
                  ? selectedCustomerName
                  : item.event === 'MANUAL_SEND_TEXT'
                    ? 'Operador Humano'
                    : item.event === 'RECOVERY_MESSAGE'
                      ? 'Recuperação de Venda'
                      : item.engine === 'openai'
                        ? `${displayName} · OpenAI`
                        : item.engine === 'assistente_local'
                          ? `${displayName} · IA`
                          : 'Status do Pedido';

                return (
                  <div
                    key={item.id}
                    className={`flex flex-col ${
                      isCustomer ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-line shadow-xs ${
                        isCustomer
                          ? 'bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-slate-100'
                          : 'bg-white text-slate-900 dark:bg-[#202c33] dark:text-slate-100'
                      }`}
                    >
                      <p className="text-[10px] font-bold mb-1 text-brand-600 dark:text-brand-400">
                        {senderLabel}
                        {item.orderNumber ? ` · Pedido #${item.orderNumber}` : ''}
                      </p>
                      {item.message}
                      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-mono-tabular text-slate-500 dark:text-slate-300/70">
                        {item.direction === 'outbound' && item.delayMs ? (
                          <span title="Delay humanizado de digitação">
                            {(item.delayMs / 1000).toFixed(1)}s ·
                          </span>
                        ) : null}
                        <span>{formatTimeBR(item.timestamp)}</span>
                        <CheckCheck
                          className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {isBotTyping && (
              <div className="flex flex-col items-start">
                <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#202c33] text-slate-700 dark:text-slate-200 text-xs shadow-xs flex items-center gap-2">
                  <span className="font-semibold text-brand-600 dark:text-brand-400">
                    {displayName}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    está digitando...
                  </span>
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-sm bg-brand-600 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-sm bg-brand-600 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-sm bg-brand-600 animate-pulse [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Simulator Presets & Message Composer */}
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13151c] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Testar conversa com a {displayName}:
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setComposerMode('simulate_customer')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    composerMode === 'simulate_customer'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Simular Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setComposerMode('operator_reply')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    composerMode === 'operator_reply'
                      ? 'bg-slate-900 dark:bg-slate-700 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Responder Operador
                </button>
              </div>
            </div>

            {composerMode === 'simulate_customer' && (
              <div className="flex flex-wrap gap-1.5">
                {SIMULATED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={sendingMsg}
                    onClick={() => handleSimulateInbound(preset)}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/50 dark:hover:text-brand-300 rounded-lg transition-colors text-left"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (composerMode === 'simulate_customer') {
                  handleSimulateInbound();
                } else {
                  handleSendOperatorReply();
                }
              }}
              className="flex gap-2"
            >
              <input
                ref={composerInputRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={
                  composerMode === 'simulate_customer'
                    ? 'Escreva como o cliente (ex.: Oi, ou Quero 1 Frango Grelhado)...'
                    : 'Escreva uma resposta manual do atendente humano para o cliente...'
                }
                className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-2 focus:outline-brand-600"
              />
              <button
                type="submit"
                disabled={sendingMsg || !composerText.trim()}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 ${
                  composerMode === 'simulate_customer'
                    ? 'bg-brand-600 hover:bg-brand-700'
                    : 'bg-slate-900 dark:bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {sendingMsg ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>
                  {composerMode === 'simulate_customer' ? 'Enviar Teste' : 'Enviar'}
                </span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
