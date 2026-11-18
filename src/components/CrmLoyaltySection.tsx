'use client';

import { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Edit3,
  Gift,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatTimeBR,
  LOYALTY_PROMO_TYPE_LABEL,
  LOYALTY_REWARD_TYPE_LABEL,
  ORDER_STATUS_META,
} from '@/lib/formatters';
import {
  formatPhoneBR,
  getAvailableRewardsForCustomer,
  getCustomerOrders,
  normalizePhoneDigits,
} from '@/lib/crm-engine';
import type {
  CrmCustomer,
  DeliveryStoreState,
  LoyaltyEarnMode,
  LoyaltyProgramConfig,
  LoyaltyPromotion,
  LoyaltyPromotionType,
  LoyaltyReward,
  LoyaltyRewardType,
} from '@/types/delivery';

interface CrmLoyaltySectionProps {
  state: DeliveryStoreState;
  onUpsertCustomer: (customer: CrmCustomer) => Promise<void> | void;
  onDeleteCustomer: (customerId: string) => Promise<void> | void;
  onAdjustPoints: (
    customerId: string,
    pointsDelta: number,
    reason: string,
  ) => Promise<void> | void;
  onRedeemReward: (customerId: string, rewardId: string) => Promise<void> | void;
  onSendRewardOffer: (
    customerId: string,
    rewardId: string,
    customMessage?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onSavePromotion: (promotion: LoyaltyPromotion) => Promise<void> | void;
  onDeletePromotion: (promotionId: string) => Promise<void> | void;
  onSaveReward: (reward: LoyaltyReward) => Promise<void> | void;
  onDeleteReward: (rewardId: string) => Promise<void> | void;
  onUpdateLoyaltyConfig: (
    updates: Partial<LoyaltyProgramConfig>,
  ) => Promise<void> | void;
  onLaunchOrderForCustomer: (customer: CrmCustomer) => void;
}

type CrmTab = 'clientes' | 'promocoes' | 'premios';

export function CrmLoyaltySection({
  state,
  onUpsertCustomer,
  onDeleteCustomer,
  onAdjustPoints,
  onRedeemReward,
  onSendRewardOffer,
  onSavePromotion,
  onDeletePromotion,
  onSaveReward,
  onDeleteReward,
  onUpdateLoyaltyConfig,
  onLaunchOrderForCustomer,
}: CrmLoyaltySectionProps) {
  const customers = state.customers ?? [];
  const loyaltyConfig = state.loyaltyConfig;
  const promotions = state.loyaltyPromotions ?? [];
  const rewards = state.loyaltyRewards ?? [];
  const transactions = state.loyaltyTransactions ?? [];

  const [activeTab, setActiveTab] = useState<CrmTab>('clientes');
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id ?? '',
  );
  const [feedback, setFeedback] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Customer modal/form state
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custNeighborhood, setCustNeighborhood] = useState('');
  const [custComplement, setCustComplement] = useState('');
  const [custNotes, setCustNotes] = useState('');
  const [custTagsText, setCustTagsText] = useState('');
  const [custInitialPoints, setCustInitialPoints] = useState('0');

  // Adjust points inline
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustReason, setAdjustReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Promotion form state
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDescription, setPromoDescription] = useState('');
  const [promoType, setPromoType] = useState<LoyaltyPromotionType>('bonus_points');
  const [promoMinOrder, setPromoMinOrder] = useState('40');
  const [promoMultiplier, setPromoMultiplier] = useState('2');
  const [promoBonusPoints, setPromoBonusPoints] = useState('15');
  const [promoMinOrdersCount, setPromoMinOrdersCount] = useState('5');

  // Reward form state
  const [rewardFormOpen, setRewardFormOpen] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardType, setRewardType] = useState<LoyaltyRewardType>('desconto_valor');
  const [rewardPointsCost, setRewardPointsCost] = useState('40');
  const [rewardDiscountValue, setRewardDiscountValue] = useState('15');
  const [rewardMenuItemId, setRewardMenuItemId] = useState('');

  // Loyalty program config local inputs
  const [cfgEnabled, setCfgEnabled] = useState(loyaltyConfig?.enabled ?? true);
  const [cfgEarnMode, setCfgEarnMode] = useState<LoyaltyEarnMode>(
    loyaltyConfig?.earnMode ?? 'por_valor',
  );
  const [cfgPointsPerStep, setCfgPointsPerStep] = useState(
    String(loyaltyConfig?.pointsPerStep ?? 1),
  );
  const [cfgAmountStepBrl, setCfgAmountStepBrl] = useState(
    String(loyaltyConfig?.amountStepBrl ?? 10),
  );
  const [cfgMinOrderValue, setCfgMinOrderValue] = useState(
    String(loyaltyConfig?.minOrderValueToEarn ?? 20),
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...customers].sort(
      (a, b) =>
        new Date(b.lastOrderAt ?? b.createdAt).getTime() -
        new Date(a.lastOrderAt ?? a.createdAt).getTime(),
    );
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q.replace(/\D/g, '') || q) ||
        c.neighborhood.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [customers, search]);

  const activeCustomer = useMemo(() => {
    return (
      customers.find((c) => c.id === selectedCustomerId) ??
      filteredCustomers[0] ??
      null
    );
  }, [customers, selectedCustomerId, filteredCustomers]);

  const activeCustomerOrders = useMemo(() => {
    if (!activeCustomer) return [];
    return getCustomerOrders(state.orders, activeCustomer, activeCustomer.phone);
  }, [state.orders, activeCustomer]);

  const activeCustomerTransactions = useMemo(() => {
    if (!activeCustomer) return [];
    return transactions.filter((tx) => tx.customerId === activeCustomer.id);
  }, [transactions, activeCustomer]);

  const activeCustomerRewards = useMemo(() => {
    if (!activeCustomer) return [];
    return getAvailableRewardsForCustomer(activeCustomer.pointsBalance, rewards);
  }, [activeCustomer, rewards]);

  const totalPointsCirculating = useMemo(
    () => customers.reduce((sum, c) => sum + c.pointsBalance, 0),
    [customers],
  );

  const avgTicketCrm = useMemo(() => {
    const totalOrders = customers.reduce((sum, c) => sum + c.ordersCount, 0);
    const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    return totalOrders > 0 ? totalSpent / totalOrders : 0;
  }, [customers]);

  const activePromosAndRewardsCount =
    promotions.filter((p) => p.active).length +
    rewards.filter((r) => r.active).length;

  const openNewCustomerModal = () => {
    setEditingCustomerId(null);
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    setCustNeighborhood('');
    setCustComplement('');
    setCustNotes('');
    setCustTagsText('');
    setCustInitialPoints('0');
    setCustomerModalOpen(true);
  };

  const openEditCustomerModal = (customer: CrmCustomer) => {
    setEditingCustomerId(customer.id);
    setCustName(customer.name);
    setCustPhone(customer.phone);
    setCustAddress(customer.address);
    setCustNeighborhood(customer.neighborhood);
    setCustComplement(customer.complement ?? '');
    setCustNotes(customer.notes ?? '');
    setCustTagsText((customer.tags ?? []).join(', '));
    setCustInitialPoints(String(customer.pointsBalance));
    setCustomerModalOpen(true);
  };

  const handleSubmitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizePhoneDigits(custPhone);
    if (!custName.trim() || !cleanPhone) return;

    const existing = editingCustomerId
      ? customers.find((c) => c.id === editingCustomerId)
      : undefined;
    const now = new Date().toISOString();
    const parsedPoints = Math.max(0, Math.round(Number(custInitialPoints) || 0));
    const parsedTags = custTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: CrmCustomer = {
      id: existing?.id ?? `cust-${Date.now()}`,
      name: custName.trim(),
      phone: cleanPhone,
      address: custAddress.trim(),
      neighborhood: custNeighborhood.trim(),
      complement: custComplement.trim() || undefined,
      notes: custNotes.trim() || undefined,
      tags: parsedTags,
      pointsBalance: existing ? existing.pointsBalance : parsedPoints,
      totalPointsEarned: existing ? existing.totalPointsEarned : parsedPoints,
      totalRedeemed: existing?.totalRedeemed ?? 0,
      ordersCount: existing?.ordersCount ?? 0,
      totalSpent: existing?.totalSpent ?? 0,
      lastOrderAt: existing?.lastOrderAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await onUpsertCustomer(payload);
    setSelectedCustomerId(payload.id);
    setCustomerModalOpen(false);
    setFeedback(
      existing
        ? `Ficha de ${payload.name} atualizada no CRM.`
        : `Cliente ${payload.name} cadastrado no CRM.`,
    );
  };

  const handleAdjustPointsSubmit = async (
    customer: CrmCustomer,
    sign: 1 | -1,
  ) => {
    const qty = Math.max(1, Math.round(Number(adjustDelta) || 0));
    if (!qty) return;
    setBusyId('adjust');
    try {
      await onAdjustPoints(
        customer.id,
        qty * sign,
        adjustReason.trim() ||
          (sign > 0
            ? 'Bonificação manual pelo restaurante'
            : 'Ajuste manual de saldo'),
      );
      setAdjustReason('');
      setFeedback(
        `${sign > 0 ? '+' : '-'}${qty} pontos aplicados para ${customer.name}.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRedeemNow = async (customer: CrmCustomer, reward: LoyaltyReward) => {
    setBusyId(`redeem-${reward.id}`);
    try {
      await onRedeemReward(customer.id, reward.id);
      setFeedback(
        `Prêmio "${reward.title}" resgatado para ${customer.name} (-${reward.pointsCost} pts).`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleOfferOnWhatsapp = async (
    customer: CrmCustomer,
    reward: LoyaltyReward,
  ) => {
    setBusyId(`offer-${reward.id}`);
    try {
      const res = await onSendRewardOffer(customer.id, reward.id);
      if (res.ok) {
        setFeedback(
          `Oferta do prêmio "${reward.title}" enviada pelo WhatsApp para ${customer.name}.`,
        );
      } else {
        setFeedback(res.error || 'Não foi possível enviar a oferta.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const openNewPromoForm = () => {
    setEditingPromoId(null);
    setPromoTitle('');
    setPromoDescription('');
    setPromoType('bonus_points');
    setPromoMinOrder('45');
    setPromoMultiplier('2');
    setPromoBonusPoints('15');
    setPromoMinOrdersCount('5');
    setPromoFormOpen(true);
  };

  const openEditPromoForm = (promo: LoyaltyPromotion) => {
    setEditingPromoId(promo.id);
    setPromoTitle(promo.title);
    setPromoDescription(promo.description);
    setPromoType(promo.type);
    setPromoMinOrder(String(promo.minOrderValue));
    setPromoMultiplier(String(promo.pointsMultiplier ?? 2));
    setPromoBonusPoints(String(promo.bonusPoints ?? 15));
    setPromoMinOrdersCount(String(promo.minOrdersCount ?? 5));
    setPromoFormOpen(true);
  };

  const handleSubmitPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoTitle.trim()) return;
    const existing = editingPromoId
      ? promotions.find((p) => p.id === editingPromoId)
      : undefined;

    const payload: LoyaltyPromotion = {
      id: existing?.id ?? `lpromo-${Date.now()}`,
      title: promoTitle.trim(),
      description:
        promoDescription.trim() ||
        'Promoção especial de acúmulo no Clube Fidelidade.',
      type: promoType,
      pointsMultiplier:
        promoType === 'multiplier'
          ? Math.max(1.5, Number(promoMultiplier) || 2)
          : undefined,
      bonusPoints:
        promoType !== 'multiplier'
          ? Math.max(1, Math.round(Number(promoBonusPoints) || 10))
          : undefined,
      minOrderValue: Math.max(0, Number(promoMinOrder) || 0),
      minOrdersCount:
        promoType === 'milestone_bonus'
          ? Math.max(2, Math.round(Number(promoMinOrdersCount) || 5))
          : undefined,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await onSavePromotion(payload);
    setPromoFormOpen(false);
    setFeedback(`Promoção "${payload.title}" salva no programa de fidelidade.`);
  };

  const openNewRewardForm = () => {
    setEditingRewardId(null);
    setRewardTitle('');
    setRewardDescription('');
    setRewardType('desconto_valor');
    setRewardPointsCost('40');
    setRewardDiscountValue('15');
    setRewardMenuItemId(state.menuItems[0]?.id ?? '');
    setRewardFormOpen(true);
  };

  const openEditRewardForm = (reward: LoyaltyReward) => {
    setEditingRewardId(reward.id);
    setRewardTitle(reward.title);
    setRewardDescription(reward.description);
    setRewardType(reward.type);
    setRewardPointsCost(String(reward.pointsCost));
    setRewardDiscountValue(String(reward.discountValue ?? 10));
    setRewardMenuItemId(reward.menuItemId ?? '');
    setRewardFormOpen(true);
  };

  const handleSubmitReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardTitle.trim()) return;
    const existing = editingRewardId
      ? rewards.find((r) => r.id === editingRewardId)
      : undefined;

    const payload: LoyaltyReward = {
      id: existing?.id ?? `lrew-${Date.now()}`,
      title: rewardTitle.trim(),
      description:
        rewardDescription.trim() ||
        'Prêmio resgatável por pontos acumulados nas compras.',
      pointsCost: Math.max(5, Math.round(Number(rewardPointsCost) || 30)),
      type: rewardType,
      discountValue:
        rewardType === 'desconto_valor' || rewardType === 'desconto_percentual'
          ? Math.max(1, Number(rewardDiscountValue) || 10)
          : undefined,
      menuItemId:
        rewardType === 'brinde_item'
          ? rewardMenuItemId || undefined
          : undefined,
      active: existing?.active ?? true,
      redemptionsCount: existing?.redemptionsCount ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await onSaveReward(payload);
    setRewardFormOpen(false);
    setFeedback(`Prêmio "${payload.title}" salvo no catálogo de recompensas.`);
  };

  const handleSaveConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateLoyaltyConfig({
      enabled: cfgEnabled,
      earnMode: cfgEarnMode,
      pointsPerStep: Math.max(1, Math.round(Number(cfgPointsPerStep) || 1)),
      amountStepBrl: Math.max(1, Number(cfgAmountStepBrl) || 10),
      minOrderValueToEarn: Math.max(0, Number(cfgMinOrderValue) || 0),
    });
    setFeedback('Regras do Clube Fidelidade atualizadas com sucesso.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            CRM de Clientes & Clube Fidelidade
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Cadastro unificado para lançar pedidos, contexto imediato para a IA no WhatsApp, promoções por compra e catálogo de prêmios.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewCustomerModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shrink-0 whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Unified KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Clientes no CRM
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {customers.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pontos Circulantes
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {totalPointsCirculating} pts
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Promoções & Prêmios Ativos
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {activePromosAndRewardsCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ticket Médio CRM
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {formatCurrencyBRL(avgTicketCrm)}
          </p>
        </div>
      </section>

      {feedback && (
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-xs font-medium text-emerald-900 dark:text-emerald-200">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{feedback}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            aria-label="Fechar aviso"
            className="text-emerald-700 dark:text-emerald-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Módulos CRM e Fidelidade"
        className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
      >
        {(
          [
            { id: 'clientes', label: 'Base de Clientes', icon: Users },
            { id: 'promocoes', label: 'Promoções de Fidelidade', icon: Sparkles },
            { id: 'premios', label: 'Prêmios & Regras', icon: Gift },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-[#13151c] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CLIENTES */}
      {activeTab === 'clientes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Customer Directory */}
          <aside className="lg:col-span-5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, WhatsApp ou bairro..."
                  aria-label="Buscar clientes no CRM"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhum cliente encontrado com esse filtro.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[640px] overflow-y-auto">
                {filteredCustomers.map((cust) => {
                  const isSelected = activeCustomer?.id === cust.id;
                  const unlocked = getAvailableRewardsForCustomer(
                    cust.pointsBalance,
                    rewards,
                  );
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className={`w-full text-left p-4 transition-colors ${
                        isSelected
                          ? 'bg-brand-50/70 dark:bg-brand-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {cust.name}
                        </p>
                        <span className="text-xs font-mono-tabular font-bold text-brand-600 dark:text-brand-400 shrink-0">
                          {cust.pointsBalance} pts
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                        {formatPhoneBR(cust.phone)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate">
                        {cust.address
                          ? `${cust.address} · ${cust.neighborhood}`
                          : 'Endereço não cadastrado'}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                        <span>
                          {cust.ordersCount}{' '}
                          {cust.ordersCount === 1 ? 'pedido' : 'pedidos'} ·{' '}
                          {formatCurrencyBRL(cust.totalSpent)}
                        </span>
                        {unlocked.length > 0 && (
                          <span className="font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                            {unlocked.length} prêmio(s) disponível(is)
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right: Customer 360 CRM Profile */}
          <section className="lg:col-span-7 space-y-5">
            {!activeCustomer ? (
              <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
                Selecione ou cadastre um cliente para ver a ficha completa.
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                        {activeCustomer.name}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5 font-mono-tabular">
                          <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                          {formatPhoneBR(activeCustomer.phone)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                          {activeCustomer.address
                            ? `${activeCustomer.address}${
                                activeCustomer.complement
                                  ? ` (${activeCustomer.complement})`
                                  : ''
                              } — ${activeCustomer.neighborhood}`
                            : 'Sem endereço salvo'}
                        </span>
                      </div>
                      {activeCustomer.notes && (
                        <p className="mt-2.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                          <strong>Preferências (IA conhece):</strong>{' '}
                          {activeCustomer.notes}
                        </p>
                      )}
                      {activeCustomer.tags && activeCustomer.tags.length > 0 && (
                        <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Perfil: {activeCustomer.tags.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLaunchOrderForCustomer(activeCustomer)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Lançar Pedido</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCustomerModal(activeCustomer)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Editar</span>
                      </button>
                      {confirmDeleteId === activeCustomer.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDeleteId(null);
                              await onDeleteCustomer(activeCustomer.id);
                              setFeedback(
                                `Cliente ${activeCustomer.name} removido do CRM.`,
                              );
                            }}
                            className="px-2.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(activeCustomer.id)}
                          aria-label={`Excluir cliente ${activeCustomer.name}`}
                          className="p-2 text-slate-500 hover:text-red-600 dark:hover:text-red-400 bg-slate-100 dark:bg-slate-800 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer Metrics Strip */}
                  <div className="grid grid-cols-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl divide-x divide-slate-200 dark:divide-slate-800">
                    <div className="p-3.5">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saldo Fidelidade
                      </p>
                      <p className="mt-0.5 text-lg font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
                        {activeCustomer.pointsBalance} pts
                      </p>
                    </div>
                    <div className="p-3.5">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Pedidos Feitos
                      </p>
                      <p className="mt-0.5 text-lg font-bold font-mono-tabular text-slate-900 dark:text-white">
                        {activeCustomer.ordersCount}
                      </p>
                    </div>
                    <div className="p-3.5">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Total Gasto
                      </p>
                      <p className="mt-0.5 text-lg font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                        {formatCurrencyBRL(activeCustomer.totalSpent)}
                      </p>
                    </div>
                  </div>

                  {/* Manual Point Adjustment */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      value={adjustDelta}
                      onChange={(e) => setAdjustDelta(e.target.value)}
                      aria-label="Quantidade de pontos para ajustar"
                      className="w-24 px-3 py-1.5 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                    <input
                      type="text"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="Motivo do ajuste manual (ex.: bonificação VIP)"
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleAdjustPointsSubmit(activeCustomer, 1)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
                      >
                        + Creditar
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleAdjustPointsSubmit(activeCustomer, -1)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
                      >
                        - Debitar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Available Rewards to Offer or Redeem */}
                <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-brand-600" aria-hidden="true" />
                      <span>Prêmios Elegíveis & Oferta no WhatsApp</span>
                    </h3>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {activeCustomerRewards.length} desbloqueado(s)
                    </span>
                  </div>

                  {rewards.filter((r) => r.active).length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nenhum prêmio ativo cadastrado no catálogo.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {rewards
                        .filter((r) => r.active)
                        .map((reward) => {
                          const canRedeem =
                            activeCustomer.pointsBalance >= reward.pointsCost;
                          const missing = Math.max(
                            0,
                            reward.pointsCost - activeCustomer.pointsBalance,
                          );
                          return (
                            <div
                              key={reward.id}
                              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white">
                                  {reward.title}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {reward.description} ·{' '}
                                  <span className="font-mono-tabular font-semibold">
                                    {reward.pointsCost} pts
                                  </span>
                                  {!canRedeem && (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {' '}
                                      (faltam {missing} pts)
                                    </span>
                                  )}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={!canRedeem || busyId !== null}
                                  onClick={() =>
                                    handleOfferOnWhatsapp(activeCustomer, reward)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg disabled:opacity-45"
                                >
                                  <MessageCircle
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Oferecer no WhatsApp</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canRedeem || busyId !== null}
                                  onClick={() =>
                                    handleRedeemNow(activeCustomer, reward)
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-45"
                                >
                                  Resgatar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Order History */}
                <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" aria-hidden="true" />
                      <span>Histórico de Pedidos ({activeCustomerOrders.length})</span>
                    </h3>
                  </div>

                  {activeCustomerOrders.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Este cliente ainda não possui pedidos registrados.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {activeCustomerOrders.slice(0, 8).map((order) => {
                        const meta = ORDER_STATUS_META[order.status];
                        return (
                          <div
                            key={order.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                                  #{order.orderNumber}
                                </span>
                                <span className={`font-semibold ${meta.textClass}`}>
                                  {meta.label}
                                </span>
                                <span className="font-mono-tabular text-slate-400">
                                  {formatTimeBR(order.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-600 dark:text-slate-300 truncate">
                                {order.items
                                  .map((i) => `${i.quantity}x ${i.name}`)
                                  .join(', ')}
                              </p>
                              {order.loyaltyRewardTitle && (
                                <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  Prêmio: {order.loyaltyRewardTitle}
                                </p>
                              )}
                            </div>
                            <div className="text-right font-mono-tabular shrink-0">
                              <p className="font-bold text-slate-900 dark:text-white">
                                {formatCurrencyBRL(order.total)}
                              </p>
                              {order.loyaltyPointsEarned ? (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                  +{order.loyaltyPointsEarned} pts
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Points Ledger */}
                {activeCustomerTransactions.length > 0 && (
                  <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Extrato de Pontos
                    </h3>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {activeCustomerTransactions.slice(0, 10).map((tx) => (
                        <div
                          key={tx.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {tx.description}
                            </p>
                            <p className="text-[11px] font-mono-tabular text-slate-400">
                              {new Date(tx.createdAt).toLocaleDateString('pt-BR')} ·{' '}
                              {formatTimeBR(tx.createdAt)}
                            </p>
                          </div>
                          <span
                            className={`font-mono-tabular font-bold shrink-0 ${
                              tx.pointsDelta >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {tx.pointsDelta >= 0
                              ? `+${tx.pointsDelta}`
                              : tx.pointsDelta}{' '}
                            pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: PROMOÇÕES DE FIDELIDADE */}
      {activeTab === 'promocoes' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Promoções de Acúmulo Baseadas nas Compras
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Regras automáticas aplicadas no fechamento dos pedidos (WhatsApp, Balcão ou Cardápio Online).
              </p>
            </div>
            <button
              type="button"
              onClick={openNewPromoForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Nova Promoção de Fidelidade</span>
            </button>
          </div>

          {promoFormOpen && (
            <form
              onSubmit={handleSubmitPromo}
              className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingPromoId
                    ? 'Editar Promoção de Fidelidade'
                    : 'Cadastrar Promoção de Fidelidade'}
                </h3>
                <button
                  type="button"
                  onClick={() => setPromoFormOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Título da Promoção
                  </label>
                  <input
                    required
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="Ex.: Pontos em Dobro acima de R$ 55"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Regra
                  </label>
                  <select
                    value={promoType}
                    onChange={(e) =>
                      setPromoType(e.target.value as LoyaltyPromotionType)
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="multiplier">Multiplicador de Pontos (2x, 3x)</option>
                    <option value="bonus_points">Bônus Fixo por Pedido Elegível</option>
                    <option value="milestone_bonus">Meta de Frequência (A cada X pedidos)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição para a IA e Cliente
                </label>
                <input
                  value={promoDescription}
                  onChange={(e) => setPromoDescription(e.target.value)}
                  placeholder="Explique como o cliente ganha os pontos extras"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valor Mínimo do Pedido (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={promoMinOrder}
                    onChange={(e) => setPromoMinOrder(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                {promoType === 'multiplier' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Multiplicador (x)
                    </label>
                    <input
                      type="number"
                      min={1.5}
                      step="0.5"
                      value={promoMultiplier}
                      onChange={(e) => setPromoMultiplier(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Pontos Extras
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={promoBonusPoints}
                      onChange={(e) => setPromoBonusPoints(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                )}
                {promoType === 'milestone_bonus' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      A cada quantos pedidos?
                    </label>
                    <input
                      type="number"
                      min={2}
                      value={promoMinOrdersCount}
                      onChange={(e) => setPromoMinOrdersCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPromoFormOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                >
                  Salvar Promoção
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promotions.map((promo) => (
              <article
                key={promo.id}
                className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                      {LOYALTY_PROMO_TYPE_LABEL[promo.type]}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onSavePromotion({ ...promo, active: !promo.active })
                      }
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                        promo.active
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}
                    >
                      {promo.active ? 'Ativa' : 'Pausada'}
                    </button>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {promo.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {promo.description}
                  </p>
                  <p className="text-xs font-mono-tabular text-slate-500">
                    Pedido mín.: {formatCurrencyBRL(promo.minOrderValue)} ·{' '}
                    {promo.type === 'multiplier'
                      ? `${promo.pointsMultiplier}x pontos`
                      : promo.type === 'milestone_bonus'
                        ? `+${promo.bonusPoints} pts a cada ${promo.minOrdersCount} pedidos`
                        : `+${promo.bonusPoints} pts extras`}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => openEditPromoForm(promo)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePromotion(promo.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PRÊMIOS & REGRAS */}
      {activeTab === 'premios' && (
        <div className="space-y-6">
          {/* Base Rules Form */}
          <form
            onSubmit={handleSaveConfigSubmit}
            className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Regra Geral de Acúmulo de Pontos
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Define quantos pontos o cliente ganha a cada compra finalizada.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgEnabled}
                  onChange={(e) => setCfgEnabled(e.target.checked)}
                  className="accent-brand-600 w-4 h-4"
                />
                <span>Clube Fidelidade Ativo</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Modo de Pontuação
                </label>
                <select
                  value={cfgEarnMode}
                  onChange={(e) => setCfgEarnMode(e.target.value as LoyaltyEarnMode)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="por_valor">Por Valor Gasto (R$)</option>
                  <option value="por_pedido">Fixo por Pedido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pontos Ganhos
                </label>
                <input
                  type="number"
                  min={1}
                  value={cfgPointsPerStep}
                  onChange={(e) => setCfgPointsPerStep(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              {cfgEarnMode === 'por_valor' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    A Cada (R$)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={cfgAmountStepBrl}
                    onChange={(e) => setCfgAmountStepBrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pedido Mínimo (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  value={cfgMinOrderValue}
                  onChange={(e) => setCfgMinOrderValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-brand-600 hover:bg-slate-800 dark:hover:bg-brand-700 rounded-lg"
              >
                Salvar Regras de Pontuação
              </button>
            </div>
          </form>

          {/* Rewards Catalog */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Catálogo de Prêmios Oferecidos
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Os prêmios ativos ficam visíveis para resgate em pedidos manuais, no CRM e nas conversas da IA no WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewRewardForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cadastrar Prêmio</span>
              </button>
            </div>

            {rewardFormOpen && (
              <form
                onSubmit={handleSubmitReward}
                className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingRewardId ? 'Editar Prêmio' : 'Novo Prêmio de Fidelidade'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setRewardFormOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Prêmio
                    </label>
                    <input
                      required
                      value={rewardTitle}
                      onChange={(e) => setRewardTitle(e.target.value)}
                      placeholder="Ex.: R$ 15 OFF no Pedido"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de Benefício
                    </label>
                    <select
                      value={rewardType}
                      onChange={(e) =>
                        setRewardType(e.target.value as LoyaltyRewardType)
                      }
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <option value="desconto_valor">Desconto Fixo (R$)</option>
                      <option value="desconto_percentual">Desconto Percentual (%)</option>
                      <option value="brinde_item">Item Brinde Grátis</option>
                      <option value="frete_gratis">Entrega Grátis</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Custo em Pontos
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={rewardPointsCost}
                      onChange={(e) => setRewardPointsCost(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>

                  {(rewardType === 'desconto_valor' ||
                    rewardType === 'desconto_percentual') && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {rewardType === 'desconto_valor'
                          ? 'Valor do Desconto (R$)'
                          : 'Percentual (%)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        step="0.5"
                        value={rewardDiscountValue}
                        onChange={(e) => setRewardDiscountValue(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  )}

                  {rewardType === 'brinde_item' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Item Brinde do Cardápio
                      </label>
                      <select
                        value={rewardMenuItemId}
                        onChange={(e) => setRewardMenuItemId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      >
                        <option value="">Selecionar item...</option>
                        {state.menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Descrição Curta
                    </label>
                    <input
                      value={rewardDescription}
                      onChange={(e) => setRewardDescription(e.target.value)}
                      placeholder="Como funciona o prêmio"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRewardFormOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                  >
                    Salvar Prêmio
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards.map((reward) => (
                <article
                  key={reward.id}
                  className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                        {LOYALTY_REWARD_TYPE_LABEL[reward.type]}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveReward({ ...reward, active: !reward.active })
                        }
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                          reward.active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}
                      >
                        {reward.active ? 'Ativo' : 'Pausado'}
                      </button>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {reward.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {reward.description}
                    </p>
                    <div className="flex items-center justify-between text-xs font-mono-tabular pt-1">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {reward.pointsCost} pts
                      </span>
                      <span className="text-slate-500">
                        {reward.redemptionsCount} resgates
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openEditRewardForm(reward)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReward(reward.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER CREATE / EDIT MODAL */}
      {customerModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-customer-modal-title"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            onClick={() => setCustomerModalOpen(false)}
            aria-hidden="true"
          />

          <form
            onSubmit={handleSubmitCustomer}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="crm-customer-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {editingCustomerId
                  ? 'Editar Cadastro do Cliente'
                  : 'Cadastrar Novo Cliente no CRM'}
              </h2>
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                aria-label="Fechar cadastro"
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Ex.: Juliana Costa"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp *
                  </label>
                  <input
                    required
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="5511999998888"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Endereço
                  </label>
                  <input
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    placeholder="Rua e número"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bairro
                  </label>
                  <input
                    value={custNeighborhood}
                    onChange={(e) => setCustNeighborhood(e.target.value)}
                    placeholder="Ex.: Vila Mariana"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Complemento
                  </label>
                  <input
                    value={custComplement}
                    onChange={(e) => setCustComplement(e.target.value)}
                    placeholder="Apto, bloco, ref."
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tags (separadas por vírgula)
                  </label>
                  <input
                    value={custTagsText}
                    onChange={(e) => setCustTagsText(e.target.value)}
                    placeholder="VIP, Almoço Semanal"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Observações / Preferências (Visível para a IA no WhatsApp)
                </label>
                <textarea
                  rows={2}
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  placeholder="Ex.: Gosta de suco sem gelo, pede sempre para entregar na portaria..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              {!editingCustomerId && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Pontos Iniciais de Boas-Vindas
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={custInitialPoints}
                    onChange={(e) => setCustInitialPoints(e.target.value)}
                    className="w-32 px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                {editingCustomerId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
