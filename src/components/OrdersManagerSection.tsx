'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  Columns3,
  List,
  Plus,
  Printer,
  Search,
  Volume2,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatTimeBR,
  ORDER_SOURCE_LABEL,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import { ManualOrderModal } from '@/components/ManualOrderModal';
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer';
import type { OrderCreatedSideEffects } from '@/components/CartCheckoutDrawer';
import type {
  DeliveryStoreState,
  Order,
  OrderStatus,
} from '@/types/delivery';

interface OrdersManagerSectionProps {
  state: DeliveryStoreState;
  onOrderCreated: (order: Order, sideEffects?: OrderCreatedSideEffects) => void;
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    courierId?: string,
  ) => Promise<void>;
}

const KANBAN_COLUMNS: Array<{ status: OrderStatus; title: string }> = [
  { status: 'pendente', title: 'Pendentes' },
  { status: 'preparo', title: 'Em Preparo' },
  { status: 'pronto', title: 'Prontos' },
  { status: 'entrega', title: 'Em Rota' },
  { status: 'finalizado', title: 'Finalizados' },
];

function playPendingChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio playback blocked before user gesture
  }
}

export function OrdersManagerSection({
  state,
  onOrderCreated,
  onUpdateOrderStatus,
}: OrdersManagerSectionProps) {
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | OrderStatus>('todos');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dispatchCouriers, setDispatchCouriers] = useState<Record<string, string>>({});
  const [confirmFinalizeOrderId, setConfirmFinalizeOrderId] = useState<string | null>(
    null,
  );

  const pendingCount = state.orders.filter((o) => o.status === 'pendente').length;
  const prevPendingRef = useRef(pendingCount);

  useEffect(() => {
    if (soundEnabled && pendingCount > prevPendingRef.current) {
      playPendingChime();
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount, soundEnabled]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.orders.filter((order) => {
      if (viewMode === 'lista' && statusFilter !== 'todos' && order.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return (
        String(order.orderNumber).includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.customerPhone.includes(query) ||
        order.neighborhood.toLowerCase().includes(query)
      );
    });
  }, [state.orders, viewMode, statusFilter, search]);

  const inPrepCount = state.orders.filter((o) => o.status === 'preparo').length;
  const inTransitCount = state.orders.filter(
    (o) => o.status === 'pronto' || o.status === 'entrega',
  ).length;
  const revenueToday = state.orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + o.total, 0);

  const defaultCourierId =
    state.couriers.find((c) => c.status === 'disponivel')?.id ??
    state.couriers[0]?.id ??
    '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Gestor de Pedidos
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Recebimento em tempo real, despacho para entregadores, comanda térmica 80mm e balcão.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playPendingChime();
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              soundEnabled
                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            {soundEnabled ? (
              <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <BellOff className="w-3.5 h-3.5" />
            )}
            <span>{soundEnabled ? 'Alerta Sonoro Ativo' : 'Som Silenciado'}</span>
          </button>

          <button
            type="button"
            onClick={playPendingChime}
            title="Testar som de novo pedido"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Testar Som</span>
          </button>

          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Pedido Manual</span>
          </button>
        </div>
      </div>

      {/* Pending Visual Alert Strip */}
      {pendingCount > 0 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <span className="font-semibold">
            {pendingCount === 1
              ? '1 pedido pendente aguardando aceite da cozinha.'
              : `${pendingCount} pedidos pendentes aguardando aceite da cozinha.`}
          </span>
          <span className="font-mono-tabular">
            Clique em &ldquo;Aceitar e Preparar&rdquo; para iniciar o preparo
          </span>
        </div>
      )}

      {/* Unified KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pendentes</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400">
            {pendingCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Em Preparo</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {inPrepCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Prontos / Em Rota</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {inTransitCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Faturamento do Turno</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {formatCurrencyBRL(revenueToday)}
          </p>
        </div>
      </section>

      {/* Toolbar: Search + Kanban/List Toggle */}
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
            placeholder="Buscar #pedido, cliente ou bairro..."
            aria-label="Buscar pedidos"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {viewMode === 'lista' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'pendente', label: 'Pendentes' },
                  { id: 'preparo', label: 'Preparo' },
                  { id: 'pronto', label: 'Prontos' },
                  { id: 'entrega', label: 'Em Rota' },
                  { id: 'finalizado', label: 'Finalizados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div
            role="group"
            aria-label="Modo de visualização"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                viewMode === 'lista'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Lista</span>
            </button>
          </div>
        </div>
      </div>

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const columnOrders = filteredOrders.filter(
              (o) => o.status === col.status,
            );
            return (
              <section
                key={col.status}
                className="bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-3 min-h-[260px]"
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {col.title}
                  </h2>
                  <span className="text-xs font-mono-tabular font-semibold text-slate-500 dark:text-slate-400">
                    {columnOrders.length}
                  </span>
                </div>

                {columnOrders.length === 0 ? (
                  <p className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                    Sem pedidos
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {columnOrders.map((order) => {
                      const meta = ORDER_STATUS_META[order.status];
                      const chosenCourierId =
                        dispatchCouriers[order.id] ??
                        order.courierId ??
                        defaultCourierId;
                      const assignedCourier = state.couriers.find(
                        (c) => c.id === order.courierId,
                      );

                      return (
                        <article
                          key={order.id}
                          className={`bg-white dark:bg-slate-900 border rounded-lg p-3.5 space-y-2.5 ${
                            order.status === 'pendente'
                              ? 'border-amber-300 dark:border-amber-700'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div
                            onClick={() => setSelectedOrder(order)}
                            className="cursor-pointer space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                                #{order.orderNumber}
                              </span>
                              <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                                {formatTimeBR(order.createdAt)}
                              </span>
                            </div>

                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {order.customerName}
                            </p>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {ORDER_SOURCE_LABEL[order.source]} ·{' '}
                              {order.deliveryMode === 'retirada'
                                ? 'Retirada'
                                : order.neighborhood}
                            </p>

                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                              {order.items
                                .map((i) => `${i.quantity}x ${i.name}`)
                                .join(', ')}
                            </p>

                            <div className="pt-1 flex items-center justify-between text-xs">
                              <span className="text-slate-500 dark:text-slate-400">
                                {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                              </span>
                              <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                                {formatCurrencyBRL(order.total)}
                              </span>
                            </div>
                          </div>

                          {order.status === 'pronto' &&
                            order.deliveryMode === 'entrega' && (
                              <select
                                aria-label={`Entregador pedido ${order.orderNumber}`}
                                value={chosenCourierId}
                                onChange={(e) =>
                                  setDispatchCouriers((prev) => ({
                                    ...prev,
                                    [order.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                              >
                                {state.couriers.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    Motoboy: {c.name}
                                  </option>
                                ))}
                              </select>
                            )}

                          {order.status === 'entrega' && assignedCourier && (
                            <p className="text-[11px] text-indigo-700 dark:text-indigo-400 truncate">
                              Com: {assignedCourier.name}
                            </p>
                          )}

                          {meta.nextStatus && (
                            meta.nextStatus === 'finalizado' && order.status === 'entrega' ? (
                              confirmFinalizeOrderId === order.id ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setConfirmFinalizeOrderId(null);
                                      await onUpdateOrderStatus(
                                        order.id,
                                        'finalizado',
                                        order.courierId,
                                      );
                                    }}
                                    className="py-1.5 px-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors"
                                  >
                                    Sim, Entregue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmFinalizeOrderId(null)}
                                    className="py-1.5 px-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmFinalizeOrderId(order.id)}
                                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors"
                                >
                                  {meta.nextLabel}
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateOrderStatus(
                                    order.id,
                                    meta.nextStatus!,
                                    meta.nextStatus === 'entrega' &&
                                      order.deliveryMode === 'entrega'
                                      ? chosenCourierId
                                      : order.courierId,
                                  )
                                }
                                className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors"
                              >
                                {meta.nextLabel}
                              </button>
                            )
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* COMPACT LIST VIEW */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="py-12 px-6 text-center text-sm text-slate-500">
              Nenhum pedido localizado com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Pedido</th>
                    <th className="py-3 px-4">Cliente / Origem</th>
                    <th className="py-3 px-4">Pagamento</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filteredOrders.map((order) => {
                    const meta = ORDER_STATUS_META[order.status];
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className="py-3 px-5 font-mono-tabular text-xs font-bold whitespace-nowrap">
                          #{order.orderNumber}
                          <div className="font-normal text-slate-500">
                            {formatTimeBR(order.createdAt)}
                          </div>
                        </td>
                        <td className="py-3 px-4 min-w-[200px]">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {order.customerName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {ORDER_SOURCE_LABEL[order.source]} ·{' '}
                            {order.deliveryMode === 'retirada'
                              ? 'Retirada'
                              : order.neighborhood}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                          <span className={meta.textClass}>{meta.label}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-bold whitespace-nowrap">
                          {formatCurrencyBRL(order.total)}
                        </td>
                        <td
                          className="py-3 px-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              aria-label={`Abrir comanda #${order.orderNumber}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {meta.nextStatus && (
                              meta.nextStatus === 'finalizado' && order.status === 'entrega' ? (
                                confirmFinalizeOrderId === order.id ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        setConfirmFinalizeOrderId(null);
                                        await onUpdateOrderStatus(
                                          order.id,
                                          'finalizado',
                                          order.courierId,
                                        );
                                      }}
                                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                                    >
                                      Confirmar Entregue?
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmFinalizeOrderId(null)}
                                      className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmFinalizeOrderId(order.id)}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md"
                                  >
                                    {meta.nextLabel}
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateOrderStatus(
                                      order.id,
                                      meta.nextStatus!,
                                      meta.nextStatus === 'entrega' &&
                                        order.deliveryMode === 'entrega'
                                        ? order.courierId ?? defaultCourierId
                                        : order.courierId,
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md"
                                >
                                  {meta.nextLabel}
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ManualOrderModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        state={state}
        onOrderCreated={onOrderCreated}
      />

      <OrderDetailDrawer
        order={selectedOrder}
        store={state.store}
        couriers={state.couriers}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={onUpdateOrderStatus}
      />
    </div>
  );
}
