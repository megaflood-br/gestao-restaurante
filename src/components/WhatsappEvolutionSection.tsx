'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCheck,
  CheckCircle2,
  Link2,
  MessageSquare,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { formatCurrencyBRL, formatTimeBR } from '@/lib/formatters';
import type {
  BotTone,
  DeliveryStoreState,
  EvolutionConfig,
  EvolutionTemplates,
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
}

type WhatsappTabId = 'inbox' | 'persona_regras' | 'conexao_eventos';
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
  'Oi! Quero fazer um pedido para o almoço',
  'Quero 1 Strogonoff e 1 Suco de Laranja para entregar na Rua Vergueiro 900, Vila Mariana, pago no Pix',
  'Vocês têm algum cupom de desconto hoje?',
  'Cadê meu pedido #1041?',
  'Quero falar com um atendente humano',
];

const TONE_OPTIONS: Array<{
  id: BotTone;
  label: string;
  description: string;
}> = [
  {
    id: 'acolhedor',
    label: 'Acolhedor',
    description: 'Gentil, próximo e focado em hospitalidade.',
  },
  {
    id: 'descontraido',
    label: 'Descontraído',
    description: 'Leve, simpático e animado na medida certa.',
  },
  {
    id: 'objetivo',
    label: 'Direto ao Ponto',
    description: 'Respostas rápidas, curtas e objetivas.',
  },
];

export function WhatsappEvolutionSection({
  state,
  onUpdateEvolution,
  onAppendLogs,
  onOrderCreatedFromBot,
  onOpenOrders,
}: WhatsappEvolutionSectionProps) {
  const { evolution } = state.store;

  const [activeTab, setActiveTab] = useState<WhatsappTabId>('inbox');
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>('conversas');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Config & Persona state
  const [instanceName, setInstanceName] = useState(evolution.instanceName);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(
    evolution.autoReplyEnabled,
  );
  const [autoNotifyOnStatus, setAutoNotifyOnStatus] = useState(
    evolution.autoNotifyOnStatus,
  );
  const [assistantName, setAssistantName] = useState(
    evolution.assistantName || 'Brenda',
  );
  const [tone, setTone] = useState<BotTone>(evolution.tone || 'acolhedor');
  const [customInstructions, setCustomInstructions] = useState(
    evolution.customInstructions || '',
  );
  const [allowAiOrderCreation, setAllowAiOrderCreation] = useState(
    evolution.allowAiOrderCreation !== false,
  );
  const [upsellEnabled, setUpsellEnabled] = useState(
    evolution.upsellEnabled !== false,
  );
  const [humanHandoffEnabled, setHumanHandoffEnabled] = useState(
    evolution.humanHandoffEnabled !== false,
  );
  const [templates, setTemplates] = useState<EvolutionTemplates>(
    evolution.templates,
  );

  const [envStatus, setEnvStatus] = useState<{
    evolutionConfigured: boolean;
    openAiConfigured: boolean;
  }>({ evolutionConfigured: false, openAiConfigured: false });

  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);

  // Inbox / Simulator state
  const [selectedPhone, setSelectedPhone] = useState('5511988124401');
  const [selectedCustomerName, setSelectedCustomerName] =
    useState('Juliana Costa');
  const [composerMode, setComposerMode] = useState<
    'simulate_customer' | 'operator_reply'
  >('simulate_customer');
  const [composerText, setComposerText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // New conversation inline state
  const [showNewChatForm, setShowNewChatForm] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');

  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInstanceName(evolution.instanceName);
    setAutoReplyEnabled(evolution.autoReplyEnabled);
    setAutoNotifyOnStatus(evolution.autoNotifyOnStatus);
    setAssistantName(evolution.assistantName || 'Brenda');
    setTone(evolution.tone || 'acolhedor');
    setCustomInstructions(evolution.customInstructions || '');
    setAllowAiOrderCreation(evolution.allowAiOrderCreation !== false);
    setUpsellEnabled(evolution.upsellEnabled !== false);
    setHumanHandoffEnabled(evolution.humanHandoffEnabled !== false);
    setTemplates(evolution.templates);
  }, [evolution]);

  useEffect(() => {
    fetch('/api/evolution/instance')
      .then((res) => res.json())
      .then((data) => {
        if (data?.envStatus) {
          setEnvStatus(data.envStatus);
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
  }, [activeThread.length]);

  const activeIsHandoff = isPhoneUnderHumanHandoff(selectedPhone);

  const whatsappOrdersCount = useMemo(
    () => state.orders.filter((o) => o.source === 'whatsapp').length,
    [state.orders],
  );

  const persistQuickConfig = async (overrides?: {
    autoReplyEnabled?: boolean;
    allowAiOrderCreation?: boolean;
    upsellEnabled?: boolean;
    humanHandoffEnabled?: boolean;
    assistantName?: string;
    tone?: BotTone;
  }) => {
    setBusyAction('save');
    setStatusFeedback('');
    const nextAutoReply =
      overrides?.autoReplyEnabled ?? autoReplyEnabled;
    const nextAllowOrder =
      overrides?.allowAiOrderCreation ?? allowAiOrderCreation;
    const nextUpsell = overrides?.upsellEnabled ?? upsellEnabled;
    const nextHandoff = overrides?.humanHandoffEnabled ?? humanHandoffEnabled;
    const nextAssistant = overrides?.assistantName ?? assistantName;
    const nextTone = overrides?.tone ?? tone;

    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          instanceName,
          autoReplyEnabled: nextAutoReply,
          autoNotifyOnStatus,
          assistantName: nextAssistant,
          tone: nextTone,
          customInstructions,
          allowAiOrderCreation: nextAllowOrder,
          upsellEnabled: nextUpsell,
          humanHandoffEnabled: nextHandoff,
          templates,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        evolution?: EvolutionConfig;
      };
      if (data.ok && data.evolution) {
        onUpdateEvolution(data.evolution);
        setStatusFeedback(
          `Configurações da atendente ${nextAssistant || 'Brenda'} atualizadas.`,
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistQuickConfig();
  };

  const handleInstanceAction = async (
    action: 'connect' | 'simulate_scan' | 'disconnect' | 'configure_webhook',
  ) => {
    setBusyAction(action);
    setStatusFeedback('');
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instanceName }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        qrBase64?: string | null;
        evolution?: EvolutionConfig;
        webhookUrl?: string;
        warning?: string;
        error?: string;
      };

      if (!res.ok) {
        setStatusFeedback(data.error || 'Erro ao executar ação.');
      } else {
        if (data.qrBase64) setQrBase64(data.qrBase64);
        if (action === 'simulate_scan' || action === 'disconnect') {
          setQrBase64(null);
        }
        if (data.evolution) onUpdateEvolution(data.evolution);
        if (data.webhookUrl) {
          setStatusFeedback(`Webhook registrado em ${data.webhookUrl}`);
        } else if (data.warning) {
          setStatusFeedback(data.warning);
        } else if (action === 'simulate_scan') {
          setStatusFeedback('Instância pareada e conectada com sucesso.');
        }
      }
    } catch {
      setStatusFeedback('Falha de comunicação com o servidor.');
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
        pausedForHuman?: boolean;
        handoffTriggered?: boolean;
        createdOrder?: Order | null;
        stockMovements?: StockMovement[];
        ingredients?: StockIngredient[];
        evolution?: EvolutionConfig;
      };
      if (data.ok) {
        const added: WhatsappLog[] = [];
        if (data.outboundLog) added.push(data.outboundLog);
        if (data.inboundLog) added.push(data.inboundLog);
        if (added.length > 0) onAppendLogs(added);
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
        } else if (data.handoffTriggered) {
          setStatusFeedback(
            `Transbordo humano ativado para ${selectedCustomerName}. A IA foi pausada nesta conversa.`,
          );
          setComposerMode('operator_reply');
        }
      }
    } finally {
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
      const data = (await res.json()) as { ok: boolean; log?: WhatsappLog };
      if (data.ok && data.log) {
        onAppendLogs([data.log]);
        setStatusFeedback(
          `Mensagem de recuperação de venda enviada para ${customerName}.`,
        );
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
          ? 'Simulador Local Ativo'
          : 'Desconectado';

  return (
    <div className="space-y-6">
      {/* BRENDI-INSPIRED EDITORIAL HERO & PERSONA OVERVIEW */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left: Editorial Value Proposition (Brendi Style) */}
        <div className="xl:col-span-7 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">
              Atendimento Virtual Inteligente · WhatsApp 24 horas
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-[2.15rem] font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white text-balance">
              Atenda no WhatsApp como seu melhor vendedor e feche pedidos sozinho
            </h1>
            <p className="text-sm sm:text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              A <strong className="text-slate-900 dark:text-white">{displayName}</strong> conversa com seus clientes em linguagem natural, tira dúvidas de cardápio e cupons, sugere acompanhamentos para aumentar o ticket médio e envia o pedido pronto para a cozinha com baixa automática de estoque.
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('inbox');
                  setTimeout(() => composerInputRef.current?.focus(), 50);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                <span>Testar conversa com a {displayName}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('persona_regras')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                <span>Personalizar atendente</span>
              </button>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Pedidos dentro do chat
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Anota itens, endereço e pagamento direto na conversa e envia ao Gestor.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Sugestão de bebidas e extras
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Oferece sucos e acompanhamentos na hora certa para elevar o ticket médio.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Transbordo humano em 1 clique
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Pausa a IA para um contato específico sempre que sua equipe precisar assumir.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Brenda Persona Card & Live Metrics */}
        <div className="xl:col-span-5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between overflow-hidden">
          <div className="p-6 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-brand-50 dark:bg-brand-950/50 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                {avatarFailed ? (
                  <Bot
                    className="w-7 h-7 text-brand-600 dark:text-brand-400"
                    aria-hidden="true"
                  />
                ) : (
                  <img
                    src={BRENDA_AVATAR_URL}
                    alt={`Avatar da atendente virtual ${displayName}`}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {displayName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Atendente Virtual · {state.store.name}
                </p>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    evolution.autoReplyEnabled
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {evolution.autoReplyEnabled
                    ? 'Atendimento automático ligado'
                    : 'Atendimento automático pausado'}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => {
                const next = !autoReplyEnabled;
                setAutoReplyEnabled(next);
                persistQuickConfig({ autoReplyEnabled: next });
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                evolution.autoReplyEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
              }`}
            >
              {evolution.autoReplyEnabled ? 'Pausar IA' : 'Ligar IA'}
            </button>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 dark:divide-slate-800 flex-1">
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Conversas no Inbox
              </p>
              <p className="mt-1.5 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {conversations.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {state.whatsappLogs.length} mensagens trocadas
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Pedidos via WhatsApp
              </p>
              <p className="mt-1.5 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
                {whatsappOrdersCount}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Baixa automática ativa
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Transbordo Humano
              </p>
              <p className="mt-1.5 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {handoffPhones.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {handoffPhones.length > 0
                  ? 'Aguardando operador'
                  : 'Todos atendidos pela IA'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Canal Evolution v2
              </p>
              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                {statusText}
              </p>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {envStatus.openAiConfigured
                  ? 'OpenAI GPT ativo'
                  : 'Motor Brendi local ativo'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {(
          [
            {
              id: 'inbox',
              label: 'Atendimento & Simulador Ao Vivo',
              icon: MessageSquare,
            },
            {
              id: 'persona_regras',
              label: 'Personalidade & Mensagens',
              icon: Sparkles,
            },
            {
              id: 'conexao_eventos',
              label: 'Conexão WhatsApp & Eventos',
              icon: QrCode,
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
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
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
              ) criado pela {displayName} no WhatsApp e enviado à cozinha com baixa de estoque!
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

      {/* TAB 1: SPLIT-SCREEN ESTILO BRENDI (CONTROLES À ESQUERDA + WHATSAPP AO VIVO À DIREITA) */}
      {activeTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Switch between Live Conversations and Quick AI Tweaks */}
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    leftPanelMode === 'ajustes_rapidos'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Ajustes da {displayName}
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
                    Nome da Atendente Virtual
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
                  <span>Aplicar e Testar ao Lado</span>
                </button>
              </div>
            )}
          </aside>

          {/* Right Panel: Authentic WhatsApp Web / Mobile Simulator Frame */}
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
                    {activeIsHandoff
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

            {/* WhatsApp Chat Wallpaper Area */}
            <div
              ref={chatScrollRef}
              className="h-[360px] overflow-y-auto p-5 bg-[#efeae2] dark:bg-[#0d1418] space-y-3"
            >
              {activeThread.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-600 dark:text-slate-400 space-y-2">
                  <div className="px-4 py-3 bg-white/90 dark:bg-[#202c33] rounded-xl border border-black/5 dark:border-white/5 max-w-md">
                    Escolha uma pergunta pronta abaixo ou digite como o cliente para ver a{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {displayName}
                    </strong>{' '}
                    atender e fechar o pedido direto no WhatsApp.
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
                        <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] font-mono-tabular text-slate-500 dark:text-slate-300/70">
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
            </div>

            {/* Simulator Presets & Message Composer */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13151c] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Mensagens prontas para testar o fluxo da {displayName}:
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
                      ? 'Escreva como o cliente (ex.: Quero 1 Frango Grelhado para retirada pago no Pix)...'
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
      )}

      {/* TAB 2: PERSONALIDADE & MENSAGENS AUTOMÁTICAS */}
      {activeTab === 'persona_regras' && (
        <form
          onSubmit={handleSaveConfig}
          className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
          <section className="xl:col-span-6 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Identidade e Regras da {displayName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Defina o jeito que a IA atende, recomenda pratos e passa casos críticos para sua equipe.
              </p>
            </div>

            <div>
              <label
                htmlFor="assistant-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Nome da Atendente Virtual
              </label>
              <input
                id="assistant-name"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Ex.: Brenda"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Tom de Voz no WhatsApp
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTone(opt.id)}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      tone === opt.id
                        ? 'bg-brand-50 dark:bg-brand-950/50 border-brand-500 text-brand-900 dark:text-brand-100'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="mt-1 text-[11px] opacity-80 leading-snug">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="custom-instructions"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Instruções Específicas do Restaurante
              </label>
              <textarea
                id="custom-instructions"
                rows={3}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Ex.: Sempre sugerir Suco Natural de Laranja; destacar entrega em 35 min na Vila Mariana..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Atendimento automático 24h (Webhook MESSAGES_UPSERT)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Responde dúvidas sobre cardápio, cupons, taxas e acompanha pedidos.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoReplyEnabled}
                  onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                  className="accent-brand-600 w-4 h-4 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Fechar pedidos automaticamente no chat
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Cria o pedido direto no Gestor de Pedidos e baixa os insumos da Ficha Técnica.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowAiOrderCreation}
                  onChange={(e) => setAllowAiOrderCreation(e.target.checked)}
                  className="accent-brand-600 w-4 h-4 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Sugestão inteligente de bebidas e extras (Upsell)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Aumenta o valor médio dos pedidos sugerindo bebidas e guarnições.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={upsellEnabled}
                  onChange={(e) => setUpsellEnabled(e.target.checked)}
                  className="accent-brand-600 w-4 h-4 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Transbordo automático para atendente humano
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Pausa a IA quando o cliente solicitar falar com alguém da equipe.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={humanHandoffEnabled}
                  onChange={(e) => setHumanHandoffEnabled(e.target.checked)}
                  className="accent-brand-600 w-4 h-4 shrink-0"
                />
              </label>
            </div>
          </section>

          <section className="xl:col-span-6 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Notificações Automáticas por Status
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Variáveis: <code className="font-mono-tabular">{'{cliente}'}</code> ·{' '}
                <code className="font-mono-tabular">{'{numero}'}</code> ·{' '}
                <code className="font-mono-tabular">{'{total}'}</code> ·{' '}
                <code className="font-mono-tabular">{'{entregador}'}</code>
              </p>
            </div>

            <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Avisar cliente no WhatsApp a cada atualização do pedido
                </p>
                <p className="text-[11px] text-slate-500">
                  Disparo automático ao aceitar, preparar, finalizar ou sair para entrega.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoNotifyOnStatus}
                onChange={(e) => setAutoNotifyOnStatus(e.target.checked)}
                className="accent-brand-600 w-4 h-4 shrink-0"
              />
            </label>

            <div className="space-y-3">
              {(
                [
                  { key: 'boasVindas', label: 'Boas-vindas / Link do Cardápio' },
                  { key: 'pendente', label: 'Pedido Recebido (Pendente)' },
                  { key: 'preparo', label: 'Em Preparo na Cozinha' },
                  { key: 'pronto', label: 'Pronto p/ Retirada ou Coleta' },
                  { key: 'entrega', label: 'Saiu para Entrega' },
                  { key: 'finalizado', label: 'Pedido Entregue' },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`tpl-${field.key}`}
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {field.label}
                  </label>
                  <textarea
                    id={`tpl-${field.key}`}
                    rows={2}
                    value={templates[field.key]}
                    onChange={(e) =>
                      setTemplates((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={busyAction !== null}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Salvar Configurações e Templates</span>
              </button>
            </div>
          </section>
        </form>
      )}

      {/* TAB 3: CONEXÃO EVOLUTION API & EVENTOS */}
      {activeTab === 'conexao_eventos' && (
        <div className="space-y-6">
          <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Conexão WhatsApp (Evolution API v2)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Situação:{' '}
                  <span
                    className={`font-semibold ${
                      evolution.connectionStatus === 'conectado'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : evolution.connectionStatus === 'desconectado'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {statusText}
                  </span>
                </p>
              </div>
              <Smartphone className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evo-instance"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome da Instância
                </label>
                <input
                  id="evo-instance"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="evo-webhook"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Endpoint Webhook (MESSAGES_UPSERT)
                </label>
                <input
                  id="evo-webhook"
                  readOnly
                  value={evolution.webhookUrl}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleInstanceAction('connect')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {busyAction === 'connect' ? 'Gerando...' : 'Gerar QR Code / Conectar'}
                </span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleInstanceAction('configure_webhook')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Registrar Webhook</span>
              </button>

              {evolution.connectionStatus === 'conectado' && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleInstanceAction('disconnect')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                >
                  <Power className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Desconectar</span>
                </button>
              )}
            </div>

            {evolution.connectionStatus === 'aguardando_qr' && (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-center gap-5">
                {qrBase64 ? (
                  <img
                    src={
                      qrBase64.startsWith('data:')
                        ? qrBase64
                        : `data:image/png;base64,${qrBase64}`
                    }
                    alt="QR Code WhatsApp Evolution API"
                    referrerPolicy="no-referrer"
                    className="w-36 h-36 rounded-lg border border-slate-200 bg-white p-1"
                  />
                ) : (
                  <div className="w-36 h-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-3 flex flex-col items-center justify-center text-slate-900 shrink-0">
                    <QrCode className="w-24 h-24" aria-hidden="true" />
                    <span className="text-[10px] font-mono-tabular mt-1">
                      {instanceName}
                    </span>
                  </div>
                )}
                <div className="space-y-2.5 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Escaneie no WhatsApp → Aparelhos Conectados
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Com a Evolution API configurada no ambiente, o QR Code real aparece aqui. Para validar localmente, conclua o pareamento simulado:
                  </p>
                  <button
                    type="button"
                    onClick={() => handleInstanceAction('simulate_scan')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Simular Pareamento Concluído</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Histórico de Eventos e Disparos WhatsApp
              </h2>
              <span className="text-xs font-mono-tabular text-slate-500">
                {state.whatsappLogs.length} registros
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-5">Hora</th>
                    <th className="py-2.5 px-4">Cliente / Telefone</th>
                    <th className="py-2.5 px-4">Evento</th>
                    <th className="py-2.5 px-4">Mensagem</th>
                    <th className="py-2.5 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {state.whatsappLogs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-5 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {formatTimeBR(log.timestamp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {log.customerName}
                        </div>
                        <div className="font-mono-tabular text-slate-500">{log.phone}</div>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {log.direction === 'inbound' ? 'Entrada' : 'Saída'} · {log.event}
                      </td>
                      <td className="py-3 px-4 max-w-md text-slate-700 dark:text-slate-300">
                        <p className="line-clamp-2">{log.message}</p>
                      </td>
                      <td className="py-3 px-5 text-right font-medium whitespace-nowrap">
                        <span
                          className={
                            log.status === 'enviada' || log.status === 'recebida'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : log.status === 'erro'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {log.status === 'enviada'
                            ? 'Enviada'
                            : log.status === 'recebida'
                              ? 'Recebida'
                              : log.status === 'erro'
                                ? 'Erro'
                                : 'Simulada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
