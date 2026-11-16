'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  Search,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatTimeBR,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import { getStoreAvailability } from '@/lib/store-hours';
import { ProductCustomizeModal } from '@/components/ProductCustomizeModal';
import { CartCheckoutDrawer, type OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';
import type {
  DeliveryStoreState,
  MenuItem,
  Order,
  OrderItem,
} from '@/types/delivery';

interface DigitalMenuSectionProps {
  state: DeliveryStoreState;
  onOrderCreated: (order: Order, sideEffects?: OrderCreatedSideEffects) => void;
}

export function DigitalMenuSection({
  state,
  onOrderCreated,
}: DigitalMenuSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [trackOpen, setTrackOpen] = useState(false);
  const [trackInput, setTrackInput] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [trackError, setTrackError] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const availability = useMemo(
    () => getStoreAvailability(state.store, new Date(nowTick)),
    [state.store, nowTick],
  );

  const activeCategories = useMemo(
    () =>
      state.categories
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [state.categories],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.menuItems.filter((item) => {
      if (selectedCategory !== 'todas' && item.categoryId !== selectedCategory) {
        return false;
      }
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    });
  }, [state.menuItems, selectedCategory, search]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.totalPrice, 0);

  const handleAddToCart = (newItem: OrderItem) => {
    setCart((prev) => [...prev, newItem]);
  };

  const handleUpdateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...item,
            quantity: nextQty,
            totalPrice: Number((item.unitPrice * nextQty).toFixed(2)),
          };
        })
        .filter((x): x is OrderItem => Boolean(x)),
    );
  };

  const handleTrackOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError('');
    const num = Number(trackInput.replace(/\D/g, ''));
    const found = state.orders.find((o) => o.orderNumber === num);
    if (!found) {
      setTrackedOrder(null);
      setTrackError('Pedido não encontrado. Verifique o número (ex.: 1041).');
      return;
    }
    setTrackedOrder(found);
  };

  return (
    <div className="space-y-6">
      {/* Storefront Hero Banner */}
      <section className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
        <div className="aspect-[16/6] min-h-[210px] max-h-[290px] w-full relative">
          {failedImages[state.store.heroImage] || !state.store.heroImage ? (
            <div className="w-full h-full bg-slate-800" />
          ) : (
            <img
              src={state.store.heroImage}
              alt={state.store.name}
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedImages((prev) => ({
                  ...prev,
                  [state.store.heroImage]: true,
                }))
              }
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex flex-col md:flex-row md:items-end justify-between gap-4 text-white">
            <div className="flex items-end gap-3.5 max-w-2xl">
              {state.store.logoImage && !failedImages[state.store.logoImage] && (
                <img
                  src={state.store.logoImage}
                  alt={state.store.name}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImages((prev) => ({
                      ...prev,
                      [state.store.logoImage ?? '']: true,
                    }))
                  }
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border-2 border-white/80 shadow-sm shrink-0 bg-white"
                />
              )}
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${
                      availability.isOpen ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{availability.statusLabel}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{state.store.openingHours}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono-tabular">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>~{state.store.estimatedMinutes} min</span>
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                  {state.store.name}
                </h1>
                <p className="text-xs sm:text-sm text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {state.store.address} · {state.store.neighborhood} · Frete grátis acima de{' '}
                    {formatCurrencyBRL(state.store.freeDeliveryMin)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setTrackOpen((v) => !v)}
                className="px-3.5 py-2 text-xs font-medium bg-white/15 hover:bg-white/25 backdrop-blur-xs border border-white/25 rounded-lg whitespace-nowrap transition-colors"
              >
                Acompanhar Pedido
              </button>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg whitespace-nowrap transition-colors font-mono-tabular"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Sacola ({cartCount}) · {formatCurrencyBRL(cartTotal)}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {!availability.isOpen && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs sm:text-sm text-red-800 dark:text-red-300 font-medium">
          {availability.closedReason} Você pode navegar pelo cardápio, mas novos pedidos estão pausados até a reabertura.
        </div>
      )}

      {/* Optional Order Tracker Panel */}
      {trackOpen && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Consultar Status do Pedido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe o número do pedido (ex.: 1041, 1040, 1038) para acompanhar em tempo real.
              </p>
            </div>
            <form onSubmit={handleTrackOrder} className="flex gap-2">
              <input
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                placeholder="Nº do pedido"
                className="w-36 px-3 py-1.5 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 rounded-lg"
              >
                Buscar
              </button>
            </form>
          </div>

          {trackError && (
            <p className="text-xs text-red-600 dark:text-red-400">{trackError}</p>
          )}

          {trackedOrder && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div>
                <p className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                  Pedido #{trackedOrder.orderNumber} · {trackedOrder.customerName}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  {PAYMENT_METHOD_LABEL[trackedOrder.paymentMethod]} · Total{' '}
                  {formatCurrencyBRL(trackedOrder.total)} · Feito às{' '}
                  {formatTimeBR(trackedOrder.createdAt)}
                </p>
              </div>
              <span
                className={`font-semibold ${ORDER_STATUS_META[trackedOrder.status].textClass}`}
              >
                {ORDER_STATUS_META[trackedOrder.status].label}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Search & Category Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative w-full lg:max-w-xs">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar marmita, prato ou bebida..."
            aria-label="Buscar no cardápio"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-2 focus:outline-brand-600"
          />
        </div>

        <div
          role="tablist"
          aria-label="Categorias do cardápio"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'todas'}
            onClick={() => setSelectedCategory('todas')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === 'todas'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Todas
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Uniform 3-Column Dish Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-6 text-center">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            Nenhum prato encontrado
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Limpe a busca ou selecione outra categoria para visualizar o cardápio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const effectivePrice = item.promoPrice ?? item.price;
            const imgBroken = failedImages[item.image] || !item.image;
            return (
              <article
                key={item.id}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col transition-transform duration-150 ${
                  item.available ? 'hover:-translate-y-0.5' : 'opacity-70'
                }`}
              >
                <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  {imgBroken ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <UtensilsCrossed className="w-8 h-8 mb-2" aria-hidden="true" />
                      <span className="text-xs font-medium">{item.name}</span>
                    </div>
                  ) : (
                    <img
                      src={item.image}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({
                          ...prev,
                          [item.image]: true,
                        }))
                      }
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Prep. ~{item.prepMinutes} min · {item.serves}
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                      {item.name}
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2 font-mono-tabular">
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(effectivePrice)}
                      </span>
                      {item.promoPrice && (
                        <span className="text-xs line-through text-slate-400">
                          {formatCurrencyBRL(item.price)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!item.available}
                      onClick={() => setCustomizingItem(item)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 whitespace-nowrap shrink-0"
                    >
                      {item.available ? 'Adicionar' : 'Esgotado'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ProductCustomizeModal
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onAddToCart={handleAddToCart}
      />

      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateItemQty={handleUpdateQty}
        onRemoveItem={(id) => setCart((prev) => prev.filter((i) => i.id !== id))}
        onClearCart={() => setCart([])}
        store={state.store}
        coupons={state.coupons}
        onOrderCreated={onOrderCreated}
      />
    </div>
  );
}
