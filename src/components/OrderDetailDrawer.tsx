'use client';

import { useEffect, useState } from 'react';
import { Printer, X, Bike } from 'lucide-react';
import {
  formatCurrencyBRL,
  formatDateTimeBR,
  formatTimeBR,
  ORDER_SOURCE_LABEL,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import type {
  Courier,
  Order,
  OrderStatus,
  StoreSettings,
} from '@/types/delivery';

interface OrderDetailDrawerProps {
  order: Order | null;
  store: StoreSettings;
  couriers: Courier[];
  onClose: () => void;
  onUpdateStatus: (
    orderId: string,
    status: OrderStatus,
    courierId?: string,
  ) => Promise<void>;
}

export function OrderDetailDrawer({
  order,
  store,
  couriers,
  onClose,
  onUpdateStatus,
}: OrderDetailDrawerProps) {
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  useEffect(() => {
    if (order) {
      setSelectedCourierId(
        order.courierId ??
          couriers.find((c) => c.status === 'disponivel')?.id ??
          couriers[0]?.id ??
          '',
      );
      setConfirmCancel(false);
      setConfirmFinalize(false);
    }
  }, [order, couriers]);

  if (!order) return null;

  const statusMeta = ORDER_STATUS_META[order.status];
  const assignedCourier = couriers.find((c) => c.id === order.courierId);

  const handleAdvance = async () => {
    if (!statusMeta.nextStatus) return;
    const courierForNext =
      statusMeta.nextStatus === 'entrega' && order.deliveryMode === 'entrega'
        ? selectedCourierId
        : order.courierId;
    await onUpdateStatus(order.id, statusMeta.nextStatus, courierForNext);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-drawer-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/55"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
              Pedido #{order.orderNumber} · {ORDER_SOURCE_LABEL[order.source]} ·{' '}
              {formatTimeBR(order.createdAt)}
            </p>
            <h2
              id="order-drawer-title"
              className="mt-1 text-lg font-bold text-slate-900 dark:text-white"
            >
              {order.customerName}
            </h2>
            <p className={`mt-0.5 text-xs font-semibold ${statusMeta.textClass}`}>
              {statusMeta.label}
              {order.stockDeducted
                ? ' · Estoque baixado automaticamente'
                : order.status === 'cancelado'
                  ? ' · Estoque estornado'
                  : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Comanda 80mm</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes do pedido"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Customer & Logistics */}
          <div className="grid grid-cols-2 gap-4 text-xs pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-slate-500 dark:text-slate-400">WhatsApp</p>
              <p className="mt-0.5 font-mono-tabular font-medium text-slate-900 dark:text-white">
                {order.customerPhone}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Pagamento</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-white">
                {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                {order.changeFor
                  ? ` (Troco p/ ${formatCurrencyBRL(order.changeFor)})`
                  : ''}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-500 dark:text-slate-400">Endereço / Recebimento</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-white">
                {order.address}
                {order.complement ? ` — ${order.complement}` : ''} · {order.neighborhood}
              </p>
            </div>
            {order.notes && (
              <div className="col-span-2">
                <p className="text-slate-500 dark:text-slate-400">Observações</p>
                <p className="mt-0.5 font-medium text-amber-700 dark:text-amber-400">
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* Courier Assignment when applicable */}
          {order.deliveryMode === 'entrega' &&
            order.status !== 'finalizado' &&
            order.status !== 'cancelado' && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <Bike className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span>Entregador Responsável</span>
                </div>
                <select
                  aria-label="Selecionar entregador"
                  value={selectedCourierId}
                  onChange={(e) => setSelectedCourierId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.vehicle})
                    </option>
                  ))}
                </select>
                {assignedCourier && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Atribuído atualmente: {assignedCourier.name}
                  </p>
                )}
              </div>
            )}

          {/* Thermal 80mm Receipt Block (Visible in UI & Print-Ready) */}
          <div className="thermal-receipt-80mm p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono-tabular text-xs space-y-3">
            <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-2">
              <p className="font-bold uppercase">{store.name}</p>
              <p>{store.phone}</p>
              <p className="mt-1 font-bold">COMANDA #{order.orderNumber}</p>
              <p>{formatDateTimeBR(order.createdAt)}</p>
            </div>

            <div className="border-b border-dashed border-slate-300 dark:border-slate-700 pb-2 space-y-0.5">
              <p>CLIENTE: {order.customerName}</p>
              <p>FONE: {order.customerPhone}</p>
              <p>
                {order.deliveryMode === 'retirada'
                  ? 'RETIRADA NO BALCÃO'
                  : `END: ${order.address} - ${order.neighborhood}`}
              </p>
              {order.complement && <p>COMP: {order.complement}</p>}
            </div>

            <div className="border-b border-dashed border-slate-300 dark:border-slate-700 pb-2 space-y-2">
              {order.items.map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between font-semibold">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span>{formatCurrencyBRL(item.totalPrice)}</span>
                  </div>
                  {item.selectedAddons.map((addon) => (
                    <div
                      key={`${item.id}-${addon.optionId}`}
                      className="pl-3 text-[11px] text-slate-600 dark:text-slate-400"
                    >
                      + {addon.optionName}
                    </div>
                  ))}
                  {item.notes && (
                    <div className="pl-3 text-[11px]">Obs: {item.notes}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>SUBTOTAL</span>
                <span>{formatCurrencyBRL(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>TAXA ENTREGA</span>
                <span>{formatCurrencyBRL(order.deliveryFee)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <span>DESCONTO ({order.couponCode})</span>
                  <span>-{formatCurrencyBRL(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-slate-300 dark:border-slate-700">
                <span>TOTAL</span>
                <span>{formatCurrencyBRL(order.total)}</span>
              </div>
              <p className="pt-1">
                PGTO: {PAYMENT_METHOD_LABEL[order.paymentMethod]}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {order.status !== 'finalizado' && order.status !== 'cancelado' && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3">
            {confirmCancel ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateStatus(order.id, 'cancelado');
                    onClose();
                  }}
                  className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Confirmar Cancelamento
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="px-2 py-2 text-xs text-slate-500 hover:underline"
                >
                  Voltar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
              >
                Cancelar Pedido
              </button>
            )}

            {statusMeta.nextStatus && (
              statusMeta.nextStatus === 'finalizado' && order.status === 'entrega' ? (
                confirmFinalize ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAdvance}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                    >
                      Confirmar Entregue?
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmFinalize(false)}
                      className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 hover:underline"
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmFinalize(true)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
                  >
                    {statusMeta.nextLabel}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleAdvance}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap"
                >
                  {statusMeta.nextLabel}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
