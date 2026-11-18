'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  Minus,
  Navigation,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import {
  computeRewardDiscountOnOrder,
  findCustomerByPhone,
  formatPhoneBR,
  getAvailableRewardsForCustomer,
  normalizePhoneDigits,
} from '@/lib/crm-engine';
import type {
  CrmCustomer,
  DeliveryMode,
  DeliveryStoreState,
  LoyaltyReward,
  LoyaltyTransaction,
  Order,
  OrderItem,
  OrderSource,
  PaymentMethod,
  StockIngredient,
  StockMovement,
  WhatsappLog,
} from '@/types/delivery';
import type { OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';

interface ManualOrderModalProps {
  open: boolean;
  onClose: () => void;
  state: DeliveryStoreState;
  preselectedCustomer?: CrmCustomer | null;
  onOrderCreated: (order: Order, sideEffects?: OrderCreatedSideEffects) => void;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function ManualOrderModal({
  open,
  onClose,
  state,
  preselectedCustomer,
  onOrderCreated,
}: ManualOrderModalProps) {
  const [source, setSource] = useState<OrderSource>('balcao');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('entrega');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [crmSearch, setCrmSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');
  const [selectedRewardId, setSelectedRewardId] = useState<string>('');
  const [saveToCrm, setSaveToCrm] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [calculatingDist, setCalculatingDist] = useState(false);
  const [distanceHint, setDistanceHint] = useState<string | null>(null);

  const applyCustomerToForm = (customer: CrmCustomer | null) => {
    setNameDropdownOpen(false);
    setPhoneDropdownOpen(false);
    setHighlightedIdx(0);
    if (!customer) {
      setSelectedCustomerId('');
      setSelectedRewardId('');
      return;
    }
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setAddress(customer.address || '');
    setNeighborhood(customer.neighborhood || '');
    setNotes(customer.notes || '');
    setSelectedRewardId('');
    setDistanceKm(null);
    setDistanceHint(null);
  };

  useEffect(() => {
    if (open && preselectedCustomer) {
      applyCustomerToForm(preselectedCustomer);
    }
  }, [open, preselectedCustomer]);

  const customers = state.customers ?? [];

  const filteredCrmCustomers = useMemo(() => {
    const q = normalizeSearchText(crmSearch);
    const digits = normalizePhoneDigits(crmSearch);
    if (!q) return customers;
    return customers.filter(
      (c) =>
        normalizeSearchText(c.name).includes(q) ||
        (digits.length >= 2 && normalizePhoneDigits(c.phone).includes(digits)) ||
        normalizeSearchText(c.neighborhood).includes(q),
    );
  }, [customers, crmSearch]);

  const nameSuggestions = useMemo(() => {
    const q = normalizeSearchText(customerName);
    const qDigits = normalizePhoneDigits(customerName);
    const base = !q
      ? customers.slice(0, 6)
      : customers.filter(
          (c) =>
            normalizeSearchText(c.name).includes(q) ||
            (qDigits.length >= 3 &&
              normalizePhoneDigits(c.phone).includes(qDigits)) ||
            normalizeSearchText(c.neighborhood).includes(q) ||
            normalizeSearchText(c.address).includes(q),
        );
    return base.slice(0, 7);
  }, [customers, customerName]);

  const phoneSuggestions = useMemo(() => {
    const digits = normalizePhoneDigits(customerPhone);
    if (digits.length < 2) return [];
    return customers
      .filter((c) => normalizePhoneDigits(c.phone).includes(digits))
      .slice(0, 6);
  }, [customers, customerPhone]);

  const matchedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((c) => c.id === selectedCustomerId) ?? null;
    }
    return findCustomerByPhone(customers, customerPhone) ?? null;
  }, [customers, selectedCustomerId, customerPhone]);

  const eligibleRewards = useMemo(() => {
    if (!matchedCustomer) return [];
    return getAvailableRewardsForCustomer(
      matchedCustomer.pointsBalance,
      state.loyaltyRewards,
    );
  }, [matchedCustomer, state.loyaltyRewards]);

  const selectedReward = useMemo(() => {
    if (!selectedRewardId) return undefined;
    return eligibleRewards.find((r) => r.id === selectedRewardId);
  }, [eligibleRewards, selectedRewardId]);

  const selectedItems: OrderItem[] = useMemo(() => {
    return state.menuItems
      .filter((item) => (quantities[item.id] ?? 0) > 0)
      .map((item) => {
        const qty = quantities[item.id] ?? 0;
        const unit = item.promoPrice ?? item.price;
        return {
          id: `manual-${item.id}-${Date.now()}`,
          menuItemId: item.id,
          name: item.name,
          quantity: qty,
          unitPrice: unit,
          totalPrice: Number((unit * qty).toFixed(2)),
          selectedAddons: [],
        };
      });
  }, [state.menuItems, quantities]);

  if (!open) return null;

  const subtotal = selectedItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const quote = calculateDeliveryQuote({
    store: state.store,
    subtotal,
    deliveryMode,
    neighborhood,
    distanceKm,
  });

  const rewardEffect = computeRewardDiscountOnOrder({
    reward: selectedReward,
    subtotal,
    deliveryFee: quote.deliveryFee,
  });

  const deliveryFee = rewardEffect.freeDelivery ? 0 : quote.deliveryFee;
  const rewardDiscount = rewardEffect.freeDelivery ? 0 : rewardEffect.discount;
  const total = Math.max(
    0,
    Number((subtotal + deliveryFee - rewardDiscount).toFixed(2)),
  );

  const updateQty = (itemId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      return { ...prev, [itemId]: next };
    });
  };

  const handleCalculateDistance = async () => {
    if (!address.trim()) return;
    setCalculatingDist(true);
    setDistanceHint(null);
    try {
      const fullDest = [address.trim(), neighborhood.trim(), 'São Paulo, Brasil']
        .filter(Boolean)
        .join(', ');
      const res = await fetch('/api/maps/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationAddress: fullDest,
          neighborhood: neighborhood.trim(),
          subtotal,
          deliveryMode: 'entrega',
          storeOverride: state.store,
        }),
      });
      const data = await res.json();
      if (data?.ok && typeof data.distanceKm === 'number') {
        setDistanceKm(data.distanceKm);
        setDistanceHint(`${data.distanceKm.toFixed(1)} km · ${data.matchedRuleLabel}`);
      } else {
        setDistanceHint(data?.apiError || 'Aplicando taxa padrão.');
      }
    } catch {
      setDistanceHint('Aplicando taxa padrão.');
    } finally {
      setCalculatingDist(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (selectedItems.length === 0) {
      setError('Adicione ao menos 1 prato para criar o pedido.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          customerId: matchedCustomer?.id,
          customerName,
          customerPhone,
          address: deliveryMode === 'retirada' ? 'Retirada no Balcão' : address,
          neighborhood:
            deliveryMode === 'retirada' ? state.store.neighborhood : neighborhood,
          deliveryMode,
          paymentMethod,
          distanceKm:
            deliveryMode === 'entrega' && distanceKm !== null ? distanceKm : undefined,
          deliveryFee,
          loyaltyRewardId: selectedReward?.id,
          saveToCrm,
          notes,
          items: selectedItems,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        order?: Order;
        whatsappLog?: WhatsappLog | null;
        stockMovements?: StockMovement[];
        ingredients?: StockIngredient[];
        customers?: CrmCustomer[];
        loyaltyRewards?: LoyaltyReward[];
        loyaltyTransactions?: LoyaltyTransaction[];
        customerPointsEarned?: number;
        error?: string;
      };
      if (!res.ok || !payload.order) {
        setError(payload.error ?? 'Erro ao registrar pedido manual.');
        setSubmitting(false);
        return;
      }

      onOrderCreated(payload.order, {
        whatsappLog: payload.whatsappLog,
        stockMovements: payload.stockMovements,
        ingredients: payload.ingredients,
        customers: payload.customers,
        loyaltyRewards: payload.loyaltyRewards,
        loyaltyTransactions: payload.loyaltyTransactions,
        customerPointsEarned: payload.customerPointsEarned,
      });
      setQuantities({});
      setSelectedCustomerId('');
      setSelectedRewardId('');
      setCrmSearch('');
      setCustomerName('');
      setCustomerPhone('');
      setAddress('');
      setNeighborhood('');
      setNotes('');
      onClose();
    } catch {
      setError('Falha ao salvar pedido manual.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-order-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/55"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2
              id="manual-order-title"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              Novo Pedido Manual (Balcão / CRM / WhatsApp)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecione um cliente cadastrado no CRM para preencher dados e resgatar prêmios, ou cadastre um novo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar pedido manual"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* CRM Customer Selector */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="man-crm-select"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
                  <span>Cliente Cadastrado (CRM)</span>
                </label>
                {matchedCustomer && (
                  <span className="text-[11px] font-mono-tabular font-semibold text-brand-600 dark:text-brand-400">
                    {matchedCustomer.pointsBalance} pts · {matchedCustomer.ordersCount} pedidos
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    placeholder="Filtrar cliente CRM..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <select
                  id="man-crm-select"
                  value={matchedCustomer?.id ?? ''}
                  onChange={(e) => {
                    const found =
                      customers.find((c) => c.id === e.target.value) ?? null;
                    applyCustomerToForm(found);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="">-- Novo cliente / digitar abaixo --</option>
                  {filteredCrmCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {formatPhoneBR(c.phone)} ({c.pointsBalance} pts)
                    </option>
                  ))}
                </select>
              </div>

              {matchedCustomer && eligibleRewards.length > 0 && (
                <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label
                    htmlFor="man-reward-select"
                    className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 shrink-0"
                  >
                    <Award className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Oferecer / Resgatar Prêmio:</span>
                  </label>
                  <select
                    id="man-reward-select"
                    value={selectedRewardId}
                    onChange={(e) => setSelectedRewardId(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-lg"
                  >
                    <option value="">Não resgatar prêmio agora</option>
                    {eligibleRewards.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} (-{r.pointsCost} pts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="man-source"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Origem do Pedido
                </label>
                <select
                  id="man-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value as OrderSource)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="balcao">Balcão / Telefone</option>
                  <option value="whatsapp">WhatsApp (Atendimento Manual)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="man-mode"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Modalidade
                </label>
                <select
                  id="man-mode"
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="entrega">Entrega Motoboy</option>
                  <option value="retirada">Retirada no Balcão</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="man-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Nome do Cliente
                  </label>
                  {matchedCustomer ? (
                    <button
                      type="button"
                      onClick={() => applyCustomerToForm(null)}
                      className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Desvincular CRM
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Autocompletar no CRM
                    </span>
                  )}
                </div>
                <input
                  id="man-name"
                  required
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={nameDropdownOpen && nameSuggestions.length > 0}
                  aria-autocomplete="list"
                  aria-controls="man-name-autocomplete"
                  value={customerName}
                  onFocus={() => {
                    if (customers.length > 0 && !selectedCustomerId) {
                      setNameDropdownOpen(true);
                      setHighlightedIdx(0);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setNameDropdownOpen(false), 120);
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerName(val);
                    if (selectedCustomerId) setSelectedCustomerId('');
                    setNameDropdownOpen(true);
                    setHighlightedIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (!nameDropdownOpen || nameSuggestions.length === 0) {
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedIdx((prev) =>
                        (prev + 1) % nameSuggestions.length,
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIdx((prev) =>
                        (prev - 1 + nameSuggestions.length) %
                        nameSuggestions.length,
                      );
                    } else if (e.key === 'Enter') {
                      const picked = nameSuggestions[highlightedIdx];
                      if (picked) {
                        e.preventDefault();
                        applyCustomerToForm(picked);
                      }
                    } else if (e.key === 'Escape') {
                      setNameDropdownOpen(false);
                    }
                  }}
                  placeholder="Digite o nome para buscar ou cadastrar..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />

                {nameDropdownOpen && nameSuggestions.length > 0 && (
                  <div
                    id="man-name-autocomplete"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
                  >
                    {nameSuggestions.map((c, idx) => {
                      const isActive = idx === highlightedIdx;
                      const isSelected = selectedCustomerId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyCustomerToForm(c)}
                          className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex items-start justify-between gap-2 ${
                            isActive
                              ? 'bg-slate-100 dark:bg-slate-800'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span>{c.name}</span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              <span className="font-mono-tabular">
                                {formatPhoneBR(c.phone)}
                              </span>
                              {c.neighborhood ? ` · ${c.neighborhood}` : ''}
                              {c.address ? ` · ${c.address}` : ''}
                            </p>
                          </div>
                          <span className="text-[11px] font-mono-tabular font-semibold text-brand-600 dark:text-brand-400 shrink-0">
                            {c.pointsBalance} pts
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative">
                <label
                  htmlFor="man-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Telefone / WhatsApp
                </label>
                <input
                  id="man-phone"
                  required
                  autoComplete="off"
                  value={customerPhone}
                  onFocus={() => {
                    if (phoneSuggestions.length > 0 && !selectedCustomerId) {
                      setPhoneDropdownOpen(true);
                      setHighlightedIdx(0);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setPhoneDropdownOpen(false), 120);
                  }}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId('');
                    setPhoneDropdownOpen(true);
                    setHighlightedIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (!phoneDropdownOpen || phoneSuggestions.length === 0) {
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedIdx((prev) =>
                        (prev + 1) % phoneSuggestions.length,
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIdx((prev) =>
                        (prev - 1 + phoneSuggestions.length) %
                        phoneSuggestions.length,
                      );
                    } else if (e.key === 'Enter') {
                      const picked = phoneSuggestions[highlightedIdx];
                      if (picked) {
                        e.preventDefault();
                        applyCustomerToForm(picked);
                      }
                    } else if (e.key === 'Escape') {
                      setPhoneDropdownOpen(false);
                    }
                  }}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />

                {phoneDropdownOpen && phoneSuggestions.length > 0 && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800"
                  >
                    {phoneSuggestions.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={selectedCustomerId === c.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyCustomerToForm(c)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                          idx === highlightedIdx
                            ? 'bg-slate-100 dark:bg-slate-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {c.name}
                          </p>
                          <p className="text-[11px] font-mono-tabular text-slate-500 truncate">
                            {formatPhoneBR(c.phone)}
                            {c.neighborhood ? ` · ${c.neighborhood}` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono-tabular font-semibold text-brand-600 dark:text-brand-400 shrink-0">
                          {c.pointsBalance} pts
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {deliveryMode === 'entrega' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="man-addr"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Endereço de Entrega
                    </label>
                    <input
                      id="man-addr"
                      required
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        setDistanceKm(null);
                        setDistanceHint(null);
                      }}
                      placeholder="Rua e número"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="man-neigh"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Bairro
                    </label>
                    <input
                      id="man-neigh"
                      required
                      list="man-neighborhood-options"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                    {state.store.neighborhoodFees && state.store.neighborhoodFees.length > 0 && (
                      <datalist id="man-neighborhood-options">
                        {state.store.neighborhoodFees.map((rule) => (
                          <option key={rule.id} value={rule.neighborhood} />
                        ))}
                      </datalist>
                    )}
                  </div>
                </div>

                {state.store.deliveryFeeMode === 'distancia' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-mono-tabular">
                      {distanceHint || quote.matchedRuleLabel} ·{' '}
                      <strong>
                        {deliveryFee === 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee)}
                      </strong>
                    </span>
                    <button
                      type="button"
                      disabled={calculatingDist || address.trim().length < 4}
                      onClick={handleCalculateDistance}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-md disabled:opacity-50"
                    >
                      <Navigation className="w-3 h-3" aria-hidden="true" />
                      <span>{calculatingDist ? 'Calculando...' : 'Calcular km'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Itens do Cardápio
              </p>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 max-h-52 overflow-y-auto">
                {state.menuItems.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const price = item.promoPrice ?? item.price;
                  return (
                    <div
                      key={item.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.name}
                        </p>
                        <p className="text-xs font-mono-tabular text-slate-500">
                          {formatCurrencyBRL(price)}
                        </p>
                      </div>
                      <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          aria-label={`Remover ${item.name}`}
                          className="p-1.5 text-slate-600 dark:text-slate-300"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-mono-tabular font-semibold">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          aria-label={`Adicionar ${item.name}`}
                          className="p-1.5 text-slate-600 dark:text-slate-300"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="man-pay"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Pagamento
                </label>
                <select
                  id="man-pay"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="pix">Pix</option>
                  <option value="cartao_entrega">Cartão na Entrega</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pagamento_online">Pagamento Online</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="man-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Observação
                </label>
                <input
                  id="man-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            {!matchedCustomer && (
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToCrm}
                  onChange={(e) => setSaveToCrm(e.target.checked)}
                  className="accent-brand-600 w-4 h-4"
                />
                <span>Cadastrar automaticamente este cliente no CRM e iniciar acúmulo de pontos</span>
              </label>
            )}

            {error && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <span className="text-slate-500">Total com taxa: </span>
              <span className="text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatCurrencyBRL(total)}
              </span>
              {rewardDiscount > 0 && (
                <span className="ml-2 font-mono-tabular text-emerald-700 dark:text-emerald-400">
                  (-{formatCurrencyBRL(rewardDiscount)} prêmio)
                </span>
              )}
              {rewardEffect.freeDelivery && (
                <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-400">
                  (Frete Grátis prêmio)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
              >
                {submitting ? 'Lançando...' : 'Criar Pedido'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

