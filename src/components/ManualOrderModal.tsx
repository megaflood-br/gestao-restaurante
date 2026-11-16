'use client';

import { useMemo, useState } from 'react';
import { Minus, Navigation, Plus, X } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import type {
  DeliveryMode,
  DeliveryStoreState,
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
  onOrderCreated: (order: Order, sideEffects?: OrderCreatedSideEffects) => void;
}

export function ManualOrderModal({
  open,
  onClose,
  state,
  onOrderCreated,
}: ManualOrderModalProps) {
  const [source, setSource] = useState<OrderSource>('balcao');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('entrega');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [calculatingDist, setCalculatingDist] = useState(false);
  const [distanceHint, setDistanceHint] = useState<string | null>(null);

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
  const deliveryFee = quote.deliveryFee;
  const total = Number((subtotal + deliveryFee).toFixed(2));

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
      });
      setQuantities({});
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
              Novo Pedido Manual (Balcão / Telefone)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Lançamento rápido diretamente na fila da cozinha.
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
              <div>
                <label
                  htmlFor="man-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome do Cliente
                </label>
                <input
                  id="man-name"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex.: Carlos Eduardo"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="man-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Telefone / WhatsApp
                </label>
                <input
                  id="man-phone"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
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
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 max-h-56 overflow-y-auto">
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

            {error && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-4">
            <div className="text-xs">
              <span className="text-slate-500">Total com taxa: </span>
              <span className="text-base font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatCurrencyBRL(total)}
              </span>
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
