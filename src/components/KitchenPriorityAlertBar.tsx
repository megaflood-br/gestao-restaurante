'use client';

import {
  Bell,
  BellRing,
  CheckCheck,
  ChefHat,
  Flame,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { formatTimeBR, ORDER_SOURCE_LABEL } from '@/lib/formatters';
import type { RealtimeConnectionStatus } from '@/lib/use-kitchen-realtime';
import type { Order } from '@/types/delivery';

interface KitchenPriorityAlertBarProps {
  connectionStatus: RealtimeConnectionStatus;
  activePriorityOrders: Order[];
  unacknowledgedPriorityOrders: Order[];
  soundEnabled: boolean;
  notifPermission: NotificationPermission | 'unsupported';
  actionLoadingId: string | null;
  actorName?: string;
  onToggleSound: () => void;
  onTestSound: () => void;
  onRequestBrowserNotifications: () => void;
  onAcknowledge: (orderId: string, by?: string) => Promise<void>;
  onStartPrep: (orderId: string, by?: string) => Promise<void>;
  onSelectOrder?: (order: Order) => void;
  compactHeaderOnlyWhenEmpty?: boolean;
}

export function KitchenPriorityAlertBar({
  connectionStatus,
  activePriorityOrders,
  unacknowledgedPriorityOrders,
  soundEnabled,
  notifPermission,
  actionLoadingId,
  actorName = 'Cozinha',
  onToggleSound,
  onTestSound,
  onRequestBrowserNotifications,
  onAcknowledge,
  onStartPrep,
  onSelectOrder,
  compactHeaderOnlyWhenEmpty = false,
}: KitchenPriorityAlertBarProps) {
  const hasUrgent = unacknowledgedPriorityOrders.length > 0;
  const hasActiveQueue = activePriorityOrders.length > 0;

  if (compactHeaderOnlyWhenEmpty && !hasActiveQueue && !hasUrgent) {
    return (
      <div className="px-4 py-2.5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Wifi
            className={`w-3.5 h-3.5 shrink-0 ${
              connectionStatus === 'conectado'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
            aria-hidden="true"
          />
          <span className="font-medium">
            {connectionStatus === 'conectado'
              ? 'Alerta prioritário da cozinha conectado em tempo real'
              : connectionStatus === 'reconectando'
                ? 'Reconectando canal da cozinha em tempo real...'
                : 'Conectando canal da cozinha...'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={onRequestBrowserNotifications}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ativar avisos do navegador</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            {soundEnabled ? (
              <Volume2
                className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            )}
            <span>{soundEnabled ? 'Som Ativo' : 'Silenciado'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-live="assertive"
      className={`rounded-xl border overflow-hidden ${
        hasUrgent
          ? 'bg-red-50 dark:bg-red-950/35 border-red-300 dark:border-red-800'
          : 'bg-white dark:bg-[#13151c] border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Connection & Audio Toolbar */}
      <div
        className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs border-b ${
          hasUrgent
            ? 'border-red-200 dark:border-red-800/80 bg-red-100/70 dark:bg-red-950/60'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasUrgent ? (
            <BellRing
              className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0 animate-bounce"
              aria-hidden="true"
            />
          ) : (
            <Wifi
              className={`w-4 h-4 shrink-0 ${
                connectionStatus === 'conectado'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p
              className={`font-bold truncate ${
                hasUrgent
                  ? 'text-red-900 dark:text-red-100'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {hasUrgent
                ? `${unacknowledgedPriorityOrders.length} ${
                    unacknowledgedPriorityOrders.length === 1
                      ? 'PEDIDO PRIORITÁRIO AGUARDANDO COZINHA'
                      : 'PEDIDOS PRIORITÁRIOS AGUARDANDO COZINHA'
                  }`
                : hasActiveQueue
                  ? `Fila Prioritária da Cozinha (${activePriorityOrders.length} em preparo)`
                  : 'Canal da Cozinha · Tempo Real'}
            </p>
            <p
              className={`text-[11px] ${
                hasUrgent
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {connectionStatus === 'conectado'
                ? 'Conectado ao servidor · notificações instantâneas ativas'
                : connectionStatus === 'reconectando'
                  ? 'Reconectando transmissão em tempo real...'
                  : 'Estabelecendo transmissão em tempo real...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={onRequestBrowserNotifications}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Avisos do Navegador</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
              soundEnabled
                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>{soundEnabled ? 'Som Ativo' : 'Silenciado'}</span>
          </button>

          <button
            type="button"
            onClick={onTestSound}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            <span>Testar Alerta</span>
          </button>
        </div>
      </div>

      {/* Priority Queue List */}
      {hasActiveQueue ? (
        <div className="divide-y divide-red-200/80 dark:divide-red-900/60">
          {activePriorityOrders.map((order) => {
            const isAck =
              Boolean(order.priorityAcknowledgedAt) &&
              !unacknowledgedPriorityOrders.some((u) => u.id === order.id && !u.priorityAcknowledgedAt);
            const busy = actionLoadingId === order.id;

            return (
              <div
                key={order.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  !isAck
                    ? 'bg-red-50/70 dark:bg-red-950/20'
                    : 'bg-white dark:bg-[#13151c]'
                }`}
              >
                <div
                  className={`min-w-0 space-y-1 ${onSelectOrder ? 'cursor-pointer' : ''}`}
                  onClick={() => onSelectOrder?.(order)}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">
                      <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Prioritário</span>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                      #{order.orderNumber}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                      {formatTimeBR(order.createdAt)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {ORDER_SOURCE_LABEL[order.source]}
                    </span>
                    {order.status === 'preparo' && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          Em Preparo
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {order.customerName}
                    {order.priorityReason ? (
                      <span className="font-medium text-red-700 dark:text-red-300">
                        {' '}
                        — {order.priorityReason}
                      </span>
                    ) : null}
                  </p>

                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {order.items
                      .map(
                        (item) =>
                          `${item.quantity}x ${item.name}${
                            item.notes ? ` (${item.notes})` : ''
                          }`,
                      )
                      .join(', ')}
                  </p>

                  {order.notes && (
                    <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Obs.: {order.notes}
                    </p>
                  )}

                  {order.priorityAcknowledgedAt && (
                    <p className="text-[11px] font-mono-tabular text-emerald-700 dark:text-emerald-400">
                      Ciente às {formatTimeBR(order.priorityAcknowledgedAt)} por{' '}
                      {order.priorityAcknowledgedBy || 'Cozinha'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!order.priorityAcknowledgedAt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAcknowledge(order.id, actorName)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
                    >
                      <CheckCheck className="w-4 h-4 text-emerald-600" />
                      <span>Cozinha Ciente</span>
                    </button>
                  )}

                  {order.status === 'pendente' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onStartPrep(order.id, actorName)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <ChefHat className="w-4 h-4" />
                      <span>{busy ? 'Iniciando...' : 'Aceitar e Preparar'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          Nenhum pedido prioritário ativo no momento. Novos pedidos prioritários aparecerão aqui instantaneamente com alerta sonoro.
        </div>
      )}
    </section>
  );
}
