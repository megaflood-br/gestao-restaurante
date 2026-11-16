'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import { CourierGpsMap, type LatLngPoint } from '@/components/CourierGpsMap';
import { INITIAL_DELIVERY_STATE } from '@/lib/delivery-seed';
import {
  COURIER_STATUS_LABEL,
  formatCurrencyBRL,
  formatTimeBR,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import type {
  Courier,
  CourierStatus,
  DeliveryStoreState,
  Order,
  OrderStatus,
} from '@/types/delivery';

const STORAGE_KEY = 'casa-tempero-delivery-v1';
const COURIER_SESSION_KEY = 'casa-tempero-courier-session';

type CourierTab = 'minhas_entregas' | 'disponiveis' | 'concluidas';

function hydrateDeliveryState(parsed: DeliveryStoreState): DeliveryStoreState {
  return {
    ...INITIAL_DELIVERY_STATE,
    ...parsed,
    store: {
      ...INITIAL_DELIVERY_STATE.store,
      ...parsed.store,
      evolution: {
        ...INITIAL_DELIVERY_STATE.store.evolution,
        ...(parsed.store?.evolution ?? {}),
        templates: {
          ...INITIAL_DELIVERY_STATE.store.evolution.templates,
          ...(parsed.store?.evolution?.templates ?? {}),
        },
      },
    },
  };
}

export function CourierAppPage() {
  const [state, setState] = useState<DeliveryStoreState>(INITIAL_DELIVERY_STATE);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<CourierTab>('minhas_entregas');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [mapsApiKey, setMapsApiKey] = useState<string>('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [gpsActive, setGpsActive] = useState(false);
  const [driverPosition, setDriverPosition] = useState<LatLngPoint | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (!confirmDeliveryOrder) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmDeliveryOrder(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDeliveryOrder]);

  // Two-Tier Demo Key Quota Defense (Tier 1: window.gm_authFailure + console.error tap)
  useEffect(() => {
    const win = window as unknown as { gm_authFailure?: () => void };
    const previousAuthFailure = win.gm_authFailure;
    win.gm_authFailure = () => {
      window.dispatchEvent(new Event('gmp-quota-exceeded'));
      if (typeof previousAuthFailure === 'function') {
        previousAuthFailure();
      }
    };

    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const joined = args.map((a) => String(a)).join(' ');
      if (
        joined.includes('OverQuotaMapError') ||
        joined.includes('QuotaExceededError') ||
        joined.includes('RESOURCE_EXHAUSTED')
      ) {
        window.dispatchEvent(new Event('gmp-quota-exceeded'));
      }
      origConsoleError.apply(console, args);
    };

    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);

    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuota);
      console.error = origConsoleError;
      win.gm_authFailure = previousAuthFailure;
    };
  }, []);

  const syncFromStorageOrServer = useCallback(async (forceServer = false) => {
    try {
      if (!forceServer) {
        const localRaw = localStorage.getItem(STORAGE_KEY);
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as DeliveryStoreState;
          if (parsed.store && parsed.orders && parsed.couriers) {
            setState(hydrateDeliveryState(parsed));
            return;
          }
        }
      }
      const res = await fetch('/api/delivery');
      if (res.ok) {
        const serverData = (await res.json()) as DeliveryStoreState;
        setState(hydrateDeliveryState(serverData));
      }
    } catch {
      // Keep current state
    }
  }, []);

  // Load initial state, courier session (?id= or localStorage), and Maps config
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    syncFromStorageOrServer(false);

    try {
      const params = new URLSearchParams(window.location.search);
      const idFromUrl = params.get('id');
      const idFromStorage = localStorage.getItem(COURIER_SESSION_KEY);
      if (idFromUrl) {
        setSelectedCourierId(idFromUrl);
        localStorage.setItem(COURIER_SESSION_KEY, idFromUrl);
      } else if (idFromStorage) {
        setSelectedCourierId(idFromStorage);
      }
    } catch {
      // Ignore query/storage access issues
    }

    fetch('/api/maps/config')
      .then((res) => res.json())
      .then((data: { ok?: boolean; apiKey?: string }) => {
        if (data?.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {});

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as DeliveryStoreState;
        if (parsed.store && parsed.orders) {
          setState(hydrateDeliveryState(parsed));
        }
      } catch {
        // Ignore invalid JSON
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [syncFromStorageOrServer]);

  // Browser GPS watcher when activated by courier
  useEffect(() => {
    if (!gpsActive) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocalização não suportada neste aparelho.');
      setGpsActive(false);
      return;
    }

    setGpsError(null);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGpsError(null);
      },
      () => {
        setGpsError(
          'Não foi possível obter sua localização GPS. Usando endereço da loja como origem.',
        );
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [gpsActive]);

  const persistState = (updater: (prev: DeliveryStoreState) => DeliveryStoreState) => {
    setState((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  const activeCourier: Courier | null = useMemo(
    () => state.couriers.find((c) => c.id === selectedCourierId) ?? null,
    [state.couriers, selectedCourierId],
  );

  const myActiveOrders = useMemo(
    () =>
      activeCourier
        ? state.orders
            .filter(
              (o) =>
                o.courierId === activeCourier.id &&
                (o.status === 'entrega' || o.status === 'pronto'),
            )
            .sort((a, b) => {
              if (a.status === 'entrega' && b.status !== 'entrega') return -1;
              if (b.status === 'entrega' && a.status !== 'entrega') return 1;
              return a.createdAt.localeCompare(b.createdAt);
            })
        : [],
    [state.orders, activeCourier],
  );

  const availablePoolOrders = useMemo(
    () =>
      state.orders
        .filter(
          (o) =>
            o.deliveryMode === 'entrega' &&
            !o.courierId &&
            (o.status === 'pronto' || o.status === 'preparo'),
        )
        .sort((a, b) => {
          if (a.status === 'pronto' && b.status !== 'pronto') return -1;
          if (b.status === 'pronto' && a.status !== 'pronto') return 1;
          return a.createdAt.localeCompare(b.createdAt);
        }),
    [state.orders],
  );

  const myCompletedOrders = useMemo(
    () =>
      activeCourier
        ? state.orders
            .filter(
              (o) => o.courierId === activeCourier.id && o.status === 'finalizado',
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [state.orders, activeCourier],
  );

  // Auto-select first active order when switching tabs or loading
  useEffect(() => {
    const visibleList =
      activeTab === 'minhas_entregas'
        ? myActiveOrders
        : activeTab === 'disponiveis'
          ? availablePoolOrders
          : myCompletedOrders;

    if (visibleList.length === 0) {
      setSelectedOrderId('');
      return;
    }

    if (!visibleList.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(visibleList[0].id);
    }
  }, [
    activeTab,
    myActiveOrders,
    availablePoolOrders,
    myCompletedOrders,
    selectedOrderId,
  ]);

  const selectedOrder: Order | null = useMemo(
    () => state.orders.find((o) => o.id === selectedOrderId) ?? null,
    [state.orders, selectedOrderId],
  );

  const handleSelectCourier = (courierId: string) => {
    setSelectedCourierId(courierId);
    setFeedback(null);
    try {
      localStorage.setItem(COURIER_SESSION_KEY, courierId);
    } catch {
      // Ignore storage failures
    }
  };

  const handleLogoutCourier = () => {
    setSelectedCourierId('');
    setSelectedOrderId('');
    setFeedback(null);
    try {
      localStorage.removeItem(COURIER_SESSION_KEY);
    } catch {
      // Ignore storage failures
    }
  };

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem('vertice-theme', nextDark ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncFromStorageOrServer(true);
    setRefreshing(false);
  };

  const handleChangeCourierStatus = async (status: CourierStatus) => {
    if (!activeCourier) return;
    persistState((prev) => ({
      ...prev,
      couriers: prev.couriers.map((c) =>
        c.id === activeCourier.id ? { ...c, status } : c,
      ),
    }));
    await fetch('/api/couriers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeCourier.id, updates: { status } }),
    }).catch(() => {});
  };

  const handleOrderTransition = async (
    order: Order,
    nextStatus: OrderStatus,
    assignToMe = true,
  ) => {
    if (!activeCourier) return;
    setBusyOrderId(order.id);
    setFeedback(null);
    const now = new Date().toISOString();
    const targetCourierId = assignToMe ? activeCourier.id : order.courierId;

    persistState((prev) => {
      const updatedOrders = prev.orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: nextStatus,
              courierId: targetCourierId,
              updatedAt: now,
              history: [...o.history, { status: nextStatus, at: now }],
            }
          : o,
      );

      return {
        ...prev,
        orders: updatedOrders,
        couriers: prev.couriers.map((c) => {
          if (c.id !== activeCourier.id) return c;
          if (nextStatus === 'entrega') {
            return { ...c, status: 'em_rota' as const };
          }
          if (nextStatus === 'finalizado') {
            const stillInRoute = updatedOrders.some(
              (o) =>
                o.courierId === activeCourier.id && o.status === 'entrega',
            );
            return {
              ...c,
              deliveriesToday: c.deliveriesToday + 1,
              status: stillInRoute ? ('em_rota' as const) : ('disponivel' as const),
            };
          }
          return c;
        }),
      };
    });

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          status: nextStatus,
          courierId: targetCourierId,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          whatsappLog?: DeliveryStoreState['whatsappLogs'][number] | null;
        };
        if (data.whatsappLog) {
          const log = data.whatsappLog;
          persistState((prev) => ({
            ...prev,
            whatsappLogs: [log, ...prev.whatsappLogs],
          }));
        }
      }
      setFeedback({
        type: 'ok',
        message:
          nextStatus === 'finalizado'
            ? `Pedido #${order.orderNumber} marcado como ENTREGUE!`
            : `Pedido #${order.orderNumber} assumido e em rota de entrega.`,
      });
      if (assignToMe && activeTab === 'disponiveis') {
        setActiveTab('minhas_entregas');
      }
    } catch {
      setFeedback({
        type: 'ok',
        message:
          nextStatus === 'finalizado'
            ? `Pedido #${order.orderNumber} concluído no painel do entregador.`
            : `Pedido #${order.orderNumber} em rota.`,
      });
    } finally {
      setBusyOrderId(null);
    }
  };

  const storeInitial = (state.store.name || 'P').trim().charAt(0).toUpperCase();
  const unitFee = activeCourier
    ? activeCourier.feePerDelivery ?? state.store.deliveryFee
    : state.store.deliveryFee;
  const estimatedTodayEarnings = activeCourier
    ? activeCourier.deliveriesToday * unitFee
    : 0;

  const visibleOrders =
    activeTab === 'minhas_entregas'
      ? myActiveOrders
      : activeTab === 'disponiveis'
        ? availablePoolOrders
        : myCompletedOrders;

  const storeFullOrigin = `${state.store.address}, ${state.store.neighborhood}`;

  return (
    <div className="min-h-screen bg-[#f7f7f9] dark:bg-[#0c0d11] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Mandatory Demo Key Quota Exceeded Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Mobile-First Header */}
      <header className="h-16 bg-white dark:bg-[#13151c] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          {state.store.logoImage && !logoFailed ? (
            <img
              src={state.store.logoImage}
              alt={state.store.name}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-brand-600 text-white text-sm font-extrabold flex items-center justify-center shrink-0">
              {storeInitial}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {state.store.name}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Portal Exclusivo do Motoboy · GPS e Rotas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Atualizar entregas"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {isDark ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {activeCourier && (
            <button
              type="button"
              onClick={handleLogoutCourier}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Trocar</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* COURIER SELECTION / LOGIN SCREEN */}
        {!activeCourier ? (
          <section className="max-w-2xl mx-auto py-6 sm:py-10 space-y-6">
            <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-2">
              <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                <Bike className="w-6 h-6" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Identifique-se para iniciar o turno
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Selecione seu perfil de entregador abaixo para visualizar suas entregas em aberto, abrir o trajeto GPS e dar baixa ao chegar no cliente.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {state.couriers.map((courier) => {
                const pendingCount = state.orders.filter(
                  (o) =>
                    o.courierId === courier.id &&
                    (o.status === 'entrega' || o.status === 'pronto'),
                ).length;

                return (
                  <button
                    key={courier.id}
                    type="button"
                    onClick={() => handleSelectCourier(courier.id)}
                    className="min-h-[88px] text-left bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-500 rounded-2xl p-5 transition-colors flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">
                          {courier.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular mt-0.5">
                          {courier.vehicle} · {courier.plate}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          courier.status === 'disponivel'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : courier.status === 'em_rota'
                              ? 'text-brand-600 dark:text-brand-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {COURIER_STATUS_LABEL[courier.status]}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-mono-tabular">
                        {pendingCount > 0
                          ? `${pendingCount} entrega(s) ativa(s)`
                          : 'Sem pedidos em rota'}
                      </span>
                      <span className="font-semibold text-brand-600 dark:text-brand-400">
                        Acessar →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {/* COURIER ACTIVE SUMMARY BAR */}
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                      Olá, {activeCourier.name}
                    </h1>
                    <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                      ({activeCourier.vehicle} · {activeCourier.plate})
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono-tabular mt-0.5">
                    Hoje: <strong className="text-slate-900 dark:text-white">{activeCourier.deliveriesToday}</strong> entregas · Taxa est.:{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {formatCurrencyBRL(estimatedTodayEarnings)}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Meu status de trabalho"
                  value={activeCourier.status}
                  onChange={(e) =>
                    handleChangeCourierStatus(e.target.value as CourierStatus)
                  }
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  <option value="disponivel">Status: Disponível</option>
                  <option value="em_rota">Status: Em Rota</option>
                  <option value="offline">Status: Offline / Pausa</option>
                </select>
              </div>
            </section>

            {feedback && (
              <div
                className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
                  feedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}
              >
                <span>{feedback.message}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="font-semibold hover:underline"
                >
                  Fechar
                </button>
              </div>
            )}

            {gpsError && (
              <div className="px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{gpsError}</span>
              </div>
            )}

            {/* TABS BAR (44px+ Touch Targets) */}
            <div
              role="tablist"
              aria-label="Categorias de entregas"
              className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
            >
              {(
                [
                  {
                    id: 'minhas_entregas' as const,
                    label: `Minhas Rotas (${myActiveOrders.length})`,
                  },
                  {
                    id: 'disponiveis' as const,
                    label: `Prontos p/ Pegar (${availablePoolOrders.length})`,
                  },
                  {
                    id: 'concluidas' as const,
                    label: `Entregues (${myCompletedOrders.length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[44px] px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-center ${
                    activeTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* MAIN CONTENT: ORDERS + INTEGRATED GPS MAP */}
            {visibleOrders.length === 0 ? (
              <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
                <Package className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {activeTab === 'minhas_entregas'
                    ? 'Nenhuma entrega ativa no momento'
                    : activeTab === 'disponiveis'
                      ? 'Nenhum pedido aguardando motoboy'
                      : 'Nenhuma entrega concluída registrada ainda'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {activeTab === 'minhas_entregas' && availablePoolOrders.length > 0
                    ? `Há ${availablePoolOrders.length} pedido(s) pronto(s) na aba "Prontos p/ Pegar".`
                    : 'Assim que a cozinha despachar um pedido para você, ele aparecerá automaticamente aqui com o trajeto GPS.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: DELIVERY CARDS */}
                <div className="lg:col-span-5 space-y-4">
                  {visibleOrders.map((order) => {
                    const isSelected = order.id === selectedOrder?.id;
                    const cleanCustomerPhone = order.customerPhone.replace(/\D/g, '');
                    const waPhone = cleanCustomerPhone.startsWith('55')
                      ? cleanCustomerPhone
                      : `55${cleanCustomerPhone}`;
                    const isBusy = busyOrderId === order.id;
                    const changeNeeded =
                      order.paymentMethod === 'dinheiro' &&
                      order.changeFor &&
                      order.changeFor > order.total
                        ? Number((order.changeFor - order.total).toFixed(2))
                        : 0;

                    return (
                      <article
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`bg-white dark:bg-[#13151c] border rounded-2xl p-5 space-y-4 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-brand-600 ring-2 ring-brand-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-extrabold font-mono-tabular text-slate-900 dark:text-white">
                                #{order.orderNumber}
                              </span>
                              <span className="text-xs font-mono-tabular text-slate-500">
                                · {formatTimeBR(order.createdAt)}
                              </span>
                              {typeof order.distanceKm === 'number' && (
                                <span className="text-xs font-mono-tabular font-semibold text-brand-600 dark:text-brand-400">
                                  · {order.distanceKm.toFixed(1)} km
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                              {order.customerName}
                            </p>
                          </div>

                          <span
                            className={`text-xs font-bold whitespace-nowrap ${
                              ORDER_STATUS_META[order.status].textClass
                            }`}
                          >
                            {ORDER_STATUS_META[order.status].label}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                          <div className="flex items-start gap-2 text-slate-900 dark:text-white font-semibold">
                            <MapPin
                              className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span>
                              {order.address} · {order.neighborhood}
                              {order.complement ? ` (${order.complement})` : ''}
                            </span>
                          </div>
                          {order.notes && (
                            <p className="text-amber-700 dark:text-amber-400 pl-6">
                              Obs.: {order.notes}
                            </p>
                          )}
                        </div>

                        {/* Payment / Collection Alert */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">
                              Pagamento:{' '}
                            </span>
                            <strong className="text-slate-900 dark:text-white">
                              {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                            </strong>
                            {order.paymentMethod === 'dinheiro' && (
                              <p className="text-amber-700 dark:text-amber-400 font-semibold mt-0.5 font-mono-tabular">
                                Cobrar {formatCurrencyBRL(order.total)}
                                {changeNeeded > 0
                                  ? ` · Levar ${formatCurrencyBRL(changeNeeded)} de troco (p/ ${formatCurrencyBRL(order.changeFor || 0)})`
                                  : ''}
                              </p>
                            )}
                            {order.paymentMethod === 'cartao_entrega' && (
                              <p className="text-brand-700 dark:text-brand-300 font-semibold mt-0.5 font-mono-tabular">
                                Levar maquininha · Cobrar {formatCurrencyBRL(order.total)}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-white">
                            {formatCurrencyBRL(order.total)}
                          </span>
                        </div>

                        {/* Items summary */}
                        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                          {order.items.map((item) => (
                            <p key={item.id} className="truncate">
                              <strong className="font-mono-tabular text-slate-800 dark:text-slate-200">
                                {item.quantity}x
                              </strong>{' '}
                              {item.name}
                            </p>
                          ))}
                        </div>

                        {/* Quick contact + Status Action Buttons (44px+ touch targets) */}
                        <div
                          className="pt-2 flex flex-col gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={`tel:${cleanCustomerPhone}`}
                              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
                            >
                              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Ligar Cliente</span>
                            </a>
                            <a
                              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                `Olá ${order.customerName}, sou ${activeCourier.name}, entregador da ${state.store.name}. Estou a caminho com seu pedido #${order.orderNumber}!`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-xl"
                            >
                              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>WhatsApp Cliente</span>
                            </a>
                          </div>

                          {activeTab === 'disponiveis' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleOrderTransition(order, 'entrega', true)
                              }
                              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-60"
                            >
                              <Truck className="w-4 h-4" aria-hidden="true" />
                              <span>
                                {isBusy
                                  ? 'Assumindo...'
                                  : 'Pegar Pedido e Sair para Entrega'}
                              </span>
                            </button>
                          )}

                          {activeTab === 'minhas_entregas' &&
                            order.status === 'pronto' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleOrderTransition(order, 'entrega', true)
                                }
                                className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-60"
                              >
                                <Navigation className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {isBusy ? 'Atualizando...' : 'Saí para Entregar'}
                                </span>
                              </button>
                            )}

                          {activeTab === 'minhas_entregas' &&
                            order.status === 'entrega' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeliveryOrder(order)}
                                className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl disabled:opacity-60"
                              >
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {isBusy
                                    ? 'Confirmando...'
                                    : 'Confirmar Entrega (Marcar Entregue)'}
                                </span>
                              </button>
                            )}

                          {activeTab === 'concluidas' && (
                            <div className="min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                Entregue às {formatTimeBR(order.updatedAt)}
                              </span>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* RIGHT COLUMN: INTEGRATED GOOGLE MAPS GPS & LIVE ROUTE */}
                <div className="lg:col-span-7 lg:sticky lg:top-20">
                  {selectedOrder ? (
                    <CourierGpsMap
                      apiKey={mapsApiKey}
                      storeName={state.store.name}
                      storeAddress={storeFullOrigin}
                      destinationLabel={selectedOrder.customerName}
                      destinationAddress={`${selectedOrder.address}, ${selectedOrder.neighborhood}, São Paulo, Brasil`}
                      orderNumber={selectedOrder.orderNumber}
                      driverPosition={driverPosition}
                      gpsActive={gpsActive}
                      onToggleGps={() => setGpsActive((v) => !v)}
                      onQuotaExceeded={() => setQuotaExceeded(true)}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Two-Step Delivery Confirmation Safety Lock Modal */}
      {confirmDeliveryOrder && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delivery-title"
        >
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setConfirmDeliveryOrder(null)}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="confirm-delivery-title"
                    className="text-base sm:text-lg font-bold text-slate-900 dark:text-white"
                  >
                    Deseja marcar como entregue?
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Confirme apenas quando o pedido já estiver em mãos do cliente.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirmDeliveryOrder(null)}
                aria-label="Fechar confirmação"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-tabular font-extrabold text-slate-900 dark:text-white">
                  Pedido #{confirmDeliveryOrder.orderNumber}
                </span>
                <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                  {formatCurrencyBRL(confirmDeliveryOrder.total)}
                </span>
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {confirmDeliveryOrder.customerName}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                {confirmDeliveryOrder.address} · {confirmDeliveryOrder.neighborhood}
                {confirmDeliveryOrder.complement
                  ? ` (${confirmDeliveryOrder.complement})`
                  : ''}
              </p>
              <p className="text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/80 dark:border-slate-800">
                Pagamento:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {PAYMENT_METHOD_LABEL[confirmDeliveryOrder.paymentMethod]}
                </strong>
              </p>
            </div>

            {(confirmDeliveryOrder.paymentMethod === 'dinheiro' ||
              confirmDeliveryOrder.paymentMethod === 'cartao_entrega') && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>
                  {confirmDeliveryOrder.paymentMethod === 'dinheiro'
                    ? `Confira se recebeu ${formatCurrencyBRL(confirmDeliveryOrder.total)} em dinheiro antes de concluir.`
                    : `Confira se o pagamento na maquininha (${formatCurrencyBRL(confirmDeliveryOrder.total)}) foi aprovado antes de concluir.`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeliveryOrder(null)}
                className="min-h-[48px] w-full px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Ainda Não (Voltar)
              </button>
              <button
                type="button"
                disabled={busyOrderId === confirmDeliveryOrder.id}
                onClick={async () => {
                  const target = confirmDeliveryOrder;
                  setConfirmDeliveryOrder(null);
                  await handleOrderTransition(target, 'finalizado', true);
                }}
                className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl disabled:opacity-60 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Sim, Marcar Entregue</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
