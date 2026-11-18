'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  MapPin,
  Minus,
  Navigation,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatTimeBR,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import { getStoreAvailability } from '@/lib/store-hours';
import type {
  Coupon,
  CrmCustomer,
  DeliveryMode,
  LoyaltyReward,
  LoyaltyTransaction,
  Order,
  OrderItem,
  PaymentMethod,
  StockIngredient,
  StockMovement,
  StoreSettings,
  WhatsappLog,
} from '@/types/delivery';

export interface OrderCreatedSideEffects {
  whatsappLog?: WhatsappLog | null;
  stockMovements?: StockMovement[];
  ingredients?: StockIngredient[];
  customers?: CrmCustomer[];
  loyaltyRewards?: LoyaltyReward[];
  loyaltyTransactions?: LoyaltyTransaction[];
  customerPointsEarned?: number;
}

interface CartCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  cart: OrderItem[];
  onUpdateItemQty: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  store: StoreSettings;
  coupons: Coupon[];
  onOrderCreated: (order: Order, sideEffects?: OrderCreatedSideEffects) => void;
}

function buildPixPayload(orderNumber: number, amount: number, storeName: string): string {
  const cleanStore = storeName.slice(0, 20).toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const valStr = amount.toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136casadotempero@pix.com.br520400005303986540${valStr.length}${valStr}5802BR5916${cleanStore || 'CASA DO TEMPERO'}6009SAO PAULO62120508PED${orderNumber}6304A1B2`;
}

export function CartCheckoutDrawer({
  open,
  onClose,
  cart,
  onUpdateItemQty,
  onRemoveItem,
  onClearCart,
  store,
  coupons,
  onOrderCreated,
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'confirmed'>('cart');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('entrega');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const [notes, setNotes] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [cardBrandOnDelivery, setCardBrandOnDelivery] = useState('Crédito');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [onlineCardLast4, setOnlineCardLast4] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  // Distance-based delivery quote state
  const [calculatedDistanceKm, setCalculatedDistanceKm] = useState<number | null>(
    null,
  );
  const [calculatedDurationMin, setCalculatedDurationMin] = useState<
    number | null
  >(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [distanceNote, setDistanceNote] = useState<string | null>(null);
  const [distanceOutOfRange, setDistanceOutOfRange] = useState(false);

  const subtotal = useMemo(
    () => Number(cart.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)),
    [cart],
  );

  const discount = useMemo(() => {
    if (!appliedCoupon || subtotal < appliedCoupon.minOrderValue) return 0;
    if (appliedCoupon.type === 'percent') {
      return Number(((subtotal * appliedCoupon.value) / 100).toFixed(2));
    }
    return Math.min(subtotal, appliedCoupon.value);
  }, [appliedCoupon, subtotal]);

  const quote = useMemo(
    () =>
      calculateDeliveryQuote({
        store,
        subtotal,
        deliveryMode,
        neighborhood,
        distanceKm: calculatedDistanceKm,
      }),
    [store, subtotal, deliveryMode, neighborhood, calculatedDistanceKm],
  );

  const deliveryFee = quote.deliveryFee;

  const total = Math.max(0, Number((subtotal + deliveryFee - discount).toFixed(2)));
  const changeAmount =
    needsChange && Number(changeFor) > total
      ? Number((Number(changeFor) - total).toFixed(2))
      : 0;

  const availability = getStoreAvailability(store);
  const isStoreOpen = availability.isOpen;

  if (!open) return null;

  const handleCalculateDistanceFee = async () => {
    if (!address.trim()) return;
    setCalculatingDistance(true);
    setDistanceNote(null);
    setDistanceOutOfRange(false);
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
          storeOverride: store,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        if (typeof data.distanceKm === 'number') {
          setCalculatedDistanceKm(data.distanceKm);
          setCalculatedDurationMin(data.routeDurationMinutes ?? data.estimatedMinutes ?? null);
          setDistanceOutOfRange(Boolean(data.outOfRange));
          setDistanceNote(
            data.outOfRange
              ? `${data.distanceKm.toFixed(1)} km — acima do raio máximo (${store.maxDeliveryKm ?? 12} km).`
              : `${data.distanceKm.toFixed(1)} km (~${data.routeDurationMinutes ?? data.estimatedMinutes} min) · ${data.matchedRuleLabel}`,
          );
        } else {
          setCalculatedDistanceKm(null);
          setDistanceNote(
            data.apiError ||
              'Não foi possível obter a distância exata; aplicando taxa padrão.',
          );
        }
      }
    } catch {
      setDistanceNote('Falha ao consultar distância. Aplicando taxa padrão.');
    } finally {
      setCalculatingDistance(false);
    }
  };

  const handleApplyCoupon = () => {
    setCouponError('');
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const found = coupons.find((c) => c.code.toUpperCase() === code && c.active);
    if (!found) {
      setCouponError('Cupom inválido ou expirado.');
      return;
    }
    if (subtotal < found.minOrderValue) {
      setCouponError(
        `Válido para pedidos a partir de ${formatCurrencyBRL(found.minOrderValue)}.`,
      );
      return;
    }
    setAppliedCoupon(found);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!isStoreOpen) {
      setSubmitError(
        availability.closedReason || 'A loja está fechada no momento.',
      );
      return;
    }

    if (paymentMethod === 'dinheiro' && needsChange && Number(changeFor) < total) {
      setSubmitError('Informe um valor para troco maior que o total do pedido.');
      return;
    }

    setSubmitting(true);
    try {
      const extraNoteParts: string[] = [];
      if (notes.trim()) extraNoteParts.push(notes.trim());
      if (paymentMethod === 'cartao_entrega') {
        extraNoteParts.push(`Maquininha: ${cardBrandOnDelivery}`);
      }
      if (paymentMethod === 'pagamento_online') {
        extraNoteParts.push(
          `Pago online (Cartão final ${onlineCardLast4 || '4242'})`,
        );
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'cardapio',
          customerName,
          customerPhone,
          address: deliveryMode === 'retirada' ? 'Retirada no Balcão' : address,
          neighborhood:
            deliveryMode === 'retirada' ? store.neighborhood : neighborhood,
          complement,
          deliveryMode,
          paymentMethod,
          changeFor:
            paymentMethod === 'dinheiro' && needsChange
              ? Number(changeFor)
              : undefined,
          couponCode: appliedCoupon?.code,
          distanceKm:
            deliveryMode === 'entrega' && calculatedDistanceKm !== null
              ? calculatedDistanceKm
              : undefined,
          deliveryFee,
          notes: extraNoteParts.join(' · ') || undefined,
          items: cart,
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
        setSubmitError(payload.error ?? 'Não foi possível concluir o pedido.');
        setSubmitting(false);
        return;
      }

      setConfirmedOrder(payload.order);
      onOrderCreated(payload.order, {
        whatsappLog: payload.whatsappLog,
        stockMovements: payload.stockMovements,
        ingredients: payload.ingredients,
        customers: payload.customers,
        loyaltyRewards: payload.loyaltyRewards,
        loyaltyTransactions: payload.loyaltyTransactions,
        customerPointsEarned: payload.customerPointsEarned,
      });
      onClearCart();
      setStep('confirmed');
    } catch {
      setSubmitError('Falha de comunicação ao enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    if (step === 'confirmed') {
      setStep('cart');
      setConfirmedOrder(null);
    }
    onClose();
  };

  const pixCode = confirmedOrder
    ? buildPixPayload(confirmedOrder.orderNumber, confirmedOrder.total, store.name)
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/55"
        onClick={handleResetAndClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <h2
              id="cart-drawer-title"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              {step === 'cart'
                ? 'Sua Sacola'
                : step === 'checkout'
                  ? 'Finalizar Pedido'
                  : `Pedido #${confirmedOrder?.orderNumber} Recebido`}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleResetAndClose}
            aria-label="Fechar sacola"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: CART */}
        {step === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {cart.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Sua sacola está vazia
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Escolha pratos do cardápio digital para montar seu pedido.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {cart.map((item) => (
                      <div key={item.id} className="py-4 first:pt-0 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {item.name}
                            </p>
                            {item.selectedAddons.length > 0 && (
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {item.selectedAddons
                                  .map((a) => a.optionName)
                                  .join(' · ')}
                              </p>
                            )}
                            {item.notes && (
                              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                                Obs.: {item.notes}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-mono-tabular font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatCurrencyBRL(item.totalPrice)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg">
                            <button
                              type="button"
                              onClick={() => onUpdateItemQty(item.id, -1)}
                              aria-label="Remover uma unidade"
                              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2.5 text-xs font-mono-tabular font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateItemQty(item.id, 1)}
                              aria-label="Adicionar uma unidade"
                              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Remover</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coupon Box */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <label
                      htmlFor="coupon-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Cupom de desconto (ex.: BEMVINDO10 ou ALMOCO5)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="coupon-input"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Digite o código"
                        className="flex-1 px-3 py-2 text-sm font-mono-tabular uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                      {appliedCoupon ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponInput('');
                          }}
                          className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
                        >
                          Remover
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg"
                        >
                          Aplicar
                        </button>
                      )}
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{couponError}</p>
                    )}
                    {appliedCoupon && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Cupom {appliedCoupon.code} aplicado: -{formatCurrencyBRL(discount)}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-mono-tabular">{formatCurrencyBRL(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                      <span>Desconto ({appliedCoupon?.code})</span>
                      <span className="font-mono-tabular">-{formatCurrencyBRL(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{quote.matchedRuleLabel}</span>
                    <span className="font-mono-tabular">
                      {deliveryFee === 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
                    <span>Total</span>
                    <span className="font-mono-tabular">{formatCurrencyBRL(total)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isStoreOpen}
                  onClick={() => setStep('checkout')}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
                >
                  {isStoreOpen
                    ? 'Continuar para Pagamento'
                    : `Loja Fechada (${store.openingHours})`}
                </button>
              </div>
            )}
          </>
        )}

        {/* STEP 2: CHECKOUT */}
        {step === 'checkout' && (
          <form onSubmit={handleSubmitOrder} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Delivery Mode */}
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Como deseja receber seu pedido?
                </p>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('entrega')}
                    className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                      deliveryMode === 'entrega'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Entrega ({deliveryFee === 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('retirada')}
                    className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                      deliveryMode === 'retirada'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Retirada no Balcão (Grátis)
                  </button>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="chk-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Seu Nome
                  </label>
                  <input
                    id="chk-name"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex.: Mariana Alves"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="chk-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    WhatsApp (p/ atualizações)
                  </label>
                  <input
                    id="chk-phone"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              {deliveryMode === 'entrega' ? (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="chk-address"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Endereço e Número
                    </label>
                    <input
                      id="chk-address"
                      required
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        setCalculatedDistanceKm(null);
                        setDistanceNote(null);
                      }}
                      placeholder="Rua, Avenida e número"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="chk-neighborhood"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Bairro
                      </label>
                      <input
                        id="chk-neighborhood"
                        required
                        list="chk-neighborhood-options"
                        value={neighborhood}
                        onChange={(e) => {
                          setNeighborhood(e.target.value);
                          setCalculatedDistanceKm(null);
                          setDistanceNote(null);
                        }}
                        placeholder="Ex.: Vila Mariana"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                      {store.neighborhoodFees && store.neighborhoodFees.length > 0 && (
                        <datalist id="chk-neighborhood-options">
                          {store.neighborhoodFees.map((rule) => (
                            <option key={rule.id} value={rule.neighborhood} />
                          ))}
                        </datalist>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="chk-complement"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Complemento
                      </label>
                      <input
                        id="chk-complement"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        placeholder="Apto / Bloco"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Dynamic Distance / Neighborhood Fee Feedback */}
                  {store.deliveryFeeMode === 'distancia' && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                          <span>Frete calculado pela distância</span>
                        </span>
                        <button
                          type="button"
                          disabled={calculatingDistance || address.trim().length < 4}
                          onClick={handleCalculateDistanceFee}
                          className="px-3 py-1 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-md disabled:opacity-50 whitespace-nowrap"
                        >
                          {calculatingDistance ? 'Calculando...' : 'Calcular Frete'}
                        </button>
                      </div>
                      {distanceNote ? (
                        <p
                          className={`text-xs font-mono-tabular ${
                            distanceOutOfRange
                              ? 'text-amber-700 dark:text-amber-400 font-semibold'
                              : 'text-emerald-700 dark:text-emerald-400 font-medium'
                          }`}
                        >
                          {distanceNote} ·{' '}
                          <strong>
                            {deliveryFee === 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee)}
                          </strong>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Informe seu endereço e toque em Calcular Frete para obter a taxa exata em km ({calculatedDurationMin ? `~${calculatedDurationMin} min` : `taxa base ${formatCurrencyBRL(deliveryFee)}`}).
                        </p>
                      )}
                    </div>
                  )}

                  {store.deliveryFeeMode === 'bairro' && (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                        <span>{quote.matchedRuleLabel}</span>
                      </span>
                      <strong className="font-mono-tabular text-slate-900 dark:text-white">
                        {deliveryFee === 0 ? 'Grátis' : formatCurrencyBRL(deliveryFee)}
                      </strong>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Endereço para Retirada
                  </p>
                  <p className="mt-0.5">
                    {store.address} · {store.neighborhood} (previsão ~{store.estimatedMinutes} min)
                  </p>
                </div>
              )}

              {/* Payment Methods */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Forma de Pagamento
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'pix', label: 'Pix (Copia e Cola)' },
                      { id: 'cartao_entrega', label: 'Cartão na Entrega' },
                      { id: 'dinheiro', label: 'Dinheiro (Troco)' },
                      { id: 'pagamento_online', label: 'Pagamento Online' },
                    ] as const
                  ).map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`px-3 py-2.5 text-xs font-medium text-left rounded-lg border transition-colors ${
                        paymentMethod === method.id
                          ? 'bg-brand-50 border-brand-600 text-brand-800 dark:bg-brand-950/50 dark:border-brand-500 dark:text-brand-300'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'pix' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <QrCode className="w-4 h-4 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
                    <span>
                      Ao confirmar o pedido, exibiremos o código Pix Copia e Cola exato no valor de{' '}
                      <strong className="font-mono-tabular">{formatCurrencyBRL(total)}</strong>.
                    </span>
                  </div>
                )}

                {paymentMethod === 'cartao_entrega' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                    <label
                      htmlFor="card-brand"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Modalidade na maquininha
                    </label>
                    <select
                      id="card-brand"
                      value={cardBrandOnDelivery}
                      onChange={(e) => setCardBrandOnDelivery(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <option value="Crédito">Cartão de Crédito</option>
                      <option value="Débito">Cartão de Débito</option>
                      <option value="Vale-Refeição">Vale-Refeição (VR / Alelo / Sodexo)</option>
                    </select>
                  </div>
                )}

                {paymentMethod === 'dinheiro' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={needsChange}
                        onChange={(e) => setNeedsChange(e.target.checked)}
                        className="accent-brand-600 w-4 h-4"
                      />
                      <span>Preciso de troco</span>
                    </label>
                    {needsChange && (
                      <div className="space-y-1">
                        <label
                          htmlFor="change-for"
                          className="block text-xs text-slate-600 dark:text-slate-400"
                        >
                          Troco para quanto? (R$)
                        </label>
                        <input
                          id="change-for"
                          type="number"
                          min={total}
                          step="1"
                          required
                          value={changeFor}
                          onChange={(e) => setChangeFor(e.target.value)}
                          placeholder="Ex.: 100"
                          className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        {changeAmount > 0 && (
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 font-mono-tabular">
                            Entregador levará {formatCurrencyBRL(changeAmount)} de troco
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'pagamento_online' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                      <CreditCard className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                      <span>Checkout Online Simulado (Cartão de Crédito)</span>
                    </div>
                    <input
                      type="text"
                      maxLength={4}
                      value={onlineCardLast4}
                      onChange={(e) => setOnlineCardLast4(e.target.value.replace(/\D/g, ''))}
                      placeholder="4 últimos dígitos do cartão (ex.: 4242)"
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="chk-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Observações gerais do pedido
                </label>
                <input
                  id="chk-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Interfone 42, não tocar campainha..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              {submitError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {submitError}
                </p>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg font-mono-tabular disabled:opacity-60"
              >
                {submitting
                  ? 'Enviando Pedido...'
                  : `Confirmar · ${formatCurrencyBRL(total)}`}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: CONFIRMED & TRACKING */}
        {step === 'confirmed' && confirmedOrder && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Pedido #{confirmedOrder.orderNumber} enviado para a cozinha</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Previsão de preparo/entrega: ~{store.estimatedMinutes} min · Enviaremos atualizações no WhatsApp {confirmedOrder.customerPhone}.
              </p>
            </div>

            {confirmedOrder.paymentMethod === 'pix' && (
              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    Pagamento via Pix Copia e Cola
                  </span>
                  <span className="text-xs font-mono-tabular font-bold text-slate-900 dark:text-white">
                    {formatCurrencyBRL(confirmedOrder.total)}
                  </span>
                </div>
                <p className="text-[11px] font-mono-tabular break-all p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                  {pixCode}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(pixCode).catch(() => {});
                    setCopiedPix(true);
                    setTimeout(() => setCopiedPix(false), 2500);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedPix ? 'Código Pix Copiado!' : 'Copiar Código Pix'}</span>
                </button>
              </div>
            )}

            <div className="space-y-2 text-xs border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Status atual</span>
                <span className={`font-semibold ${ORDER_STATUS_META[confirmedOrder.status].textClass}`}>
                  {ORDER_STATUS_META[confirmedOrder.status].label} · {formatTimeBR(confirmedOrder.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pagamento</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {PAYMENT_METHOD_LABEL[confirmedOrder.paymentMethod]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recebimento</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {confirmedOrder.address}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetAndClose}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
            >
              Voltar ao Cardápio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
