'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import {
  COURIER_STATUS_LABEL,
  formatCurrencyBRL,
  ORDER_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import { CourierProfileView } from '@/components/CourierProfileView';
import type {
  Courier,
  CourierSettlement,
  CourierStatus,
  DeliveryStoreState,
  FinancialEntry,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  WhatsappLog,
} from '@/types/delivery';

interface CouriersReportsSectionProps {
  mode?: 'entregadores' | 'desempenho';
  state: DeliveryStoreState;
  onAddCourier: (courier: Courier) => void;
  onUpdateCourier: (id: string, updates: Partial<Courier>) => void;
  onDeleteCourier?: (id: string) => void;
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    courierId?: string,
  ) => Promise<void>;
  onAddSettlement?: (settlement: CourierSettlement) => void;
  onUpdateSettlement?: (id: string, updates: Partial<CourierSettlement>) => void;
  onAddFinancialEntry?: (entry: FinancialEntry) => void;
  onAppendWhatsappLogs?: (logs: WhatsappLog[]) => void;
}

type ReportPeriod = 'hoje' | '7dias' | '30dias';

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  hoje: 'Hoje',
  '7dias': 'Últimos 7 dias',
  '30dias': 'Últimos 30 dias',
};

export function CouriersReportsSection({
  mode = 'desempenho',
  state,
  onAddCourier,
  onUpdateCourier,
  onDeleteCourier,
  onUpdateOrderStatus,
  onAddSettlement,
  onUpdateSettlement,
  onAddFinancialEntry,
  onAppendWhatsappLogs,
}: CouriersReportsSectionProps) {
  const activeTab = mode === 'entregadores' ? 'entregadores' : 'relatorios';
  const [period, setPeriod] = useState<ReportPeriod>('7dias');
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);

  const [courierName, setCourierName] = useState('');
  const [courierPhone, setCourierPhone] = useState('');
  const [courierVehicle, setCourierVehicle] = useState('');
  const [courierPlate, setCourierPlate] = useState('');
  const [courierPixKey, setCourierPixKey] = useState('');
  const [addingCourier, setAddingCourier] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const referenceTimestamp = useMemo(() => {
    const latest = state.orders.reduce((max, o) => {
      const t = new Date(o.createdAt).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    return Math.max(latest, Date.now());
  }, [state.orders]);

  const periodOrders = useMemo(() => {
    const validOrders = state.orders.filter((o) => o.status !== 'cancelado');
    const latestDayKey = new Date(referenceTimestamp).toISOString().slice(0, 10);

    if (period === 'hoje') {
      return validOrders.filter(
        (o) => new Date(o.createdAt).toISOString().slice(0, 10) === latestDayKey,
      );
    }

    const days = period === '7dias' ? 7 : 30;
    const cutoff = referenceTimestamp - days * 24 * 60 * 60 * 1000;
    return validOrders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  }, [state.orders, period, referenceTimestamp]);

  const metrics = useMemo(() => {
    const revenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
    const fees = periodOrders.reduce((sum, o) => sum + o.deliveryFee, 0);
    const discounts = periodOrders.reduce((sum, o) => sum + o.discount, 0);
    const count = periodOrders.length;
    const avgTicket = count > 0 ? revenue / count : 0;
    return { revenue, fees, discounts, count, avgTicket };
  }, [periodOrders]);

  const chartSeries = useMemo(() => {
    if (period === 'hoje') {
      const slots = [
        { label: '10h–12h', min: 10, max: 12 },
        { label: '12h–14h', min: 12, max: 14 },
        { label: '14h–18h', min: 14, max: 18 },
        { label: '18h–22h', min: 18, max: 23 },
      ];
      return slots.map((slot) => {
        const value = periodOrders
          .filter((o) => {
            const h = new Date(o.createdAt).getUTCHours();
            return h >= slot.min && h < slot.max;
          })
          .reduce((sum, o) => sum + o.total, 0);
        return { label: slot.label, value };
      });
    }

    if (period === '7dias') {
      const buckets: Array<{ key: string; label: string; value: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(referenceTimestamp - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        });
        const value = periodOrders
          .filter((o) => new Date(o.createdAt).toISOString().slice(0, 10) === key)
          .reduce((sum, o) => sum + o.total, 0);
        buckets.push({ key, label, value });
      }
      return buckets;
    }

    const weeks: Array<{ label: string; value: number }> = [];
    for (let w = 4; w >= 0; w--) {
      const end = referenceTimestamp - w * 6 * 24 * 60 * 60 * 1000;
      const start = end - 6 * 24 * 60 * 60 * 1000;
      const startLabel = new Date(start).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      const value = periodOrders
        .filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t > start && t <= end;
        })
        .reduce((sum, o) => sum + o.total, 0);
      weeks.push({ label: `Desde ${startLabel}`, value });
    }
    return weeks;
  }, [period, periodOrders, referenceTimestamp]);

  const maxChartValue = Math.max(
    1,
    ...chartSeries.map((point) => point.value),
  );

  const channelBreakdown = useMemo(() => {
    const channels: OrderSource[] = ['cardapio', 'whatsapp', 'balcao'];
    return channels.map((source) => {
      const list = periodOrders.filter((o) => o.source === source);
      const total = list.reduce((sum, o) => sum + o.total, 0);
      const share = metrics.revenue > 0 ? (total / metrics.revenue) * 100 : 0;
      return {
        source,
        label: ORDER_SOURCE_LABEL[source],
        count: list.length,
        total,
        share,
      };
    });
  }, [periodOrders, metrics.revenue]);

  const paymentBreakdown = useMemo(() => {
    const methods: PaymentMethod[] = [
      'pix',
      'cartao_entrega',
      'dinheiro',
      'pagamento_online',
    ];
    return methods.map((method) => {
      const list = periodOrders.filter((o) => o.paymentMethod === method);
      const total = list.reduce((sum, o) => sum + o.total, 0);
      return {
        method,
        label: PAYMENT_METHOD_LABEL[method],
        count: list.length,
        total,
      };
    });
  }, [periodOrders]);

  const topDishes = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const order of periodOrders) {
      for (const item of order.items) {
        const current = map.get(item.name) ?? {
          name: item.name,
          qty: 0,
          revenue: 0,
        };
        current.qty += item.quantity;
        current.revenue += item.totalPrice;
        map.set(item.name, current);
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [periodOrders]);

  const availableCouriersCount = state.couriers.filter(
    (c) => c.active && c.status === 'disponivel',
  ).length;
  const inRouteCouriersCount = state.couriers.filter(
    (c) => c.active && c.status === 'em_rota',
  ).length;
  const totalDeliveriesToday = state.couriers.reduce(
    (sum, c) => sum + c.deliveriesToday,
    0,
  );
  const estimatedFleetFees = totalDeliveriesToday * state.store.deliveryFee;

  const handleCreateCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierName.trim() || !courierPhone.trim()) return;
    setAddingCourier(true);
    try {
      const res = await fetch('/api/couriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: courierName.trim(),
          phone: courierPhone.trim(),
          vehicle: courierVehicle.trim() || 'Moto 160cc',
          plate: courierPlate.trim() || 'SEM-PLACA',
          pixKey: courierPixKey.trim() || undefined,
        }),
      }).catch(() => null);
      const data = res
        ? ((await res.json()) as { ok: boolean; courier?: Courier })
        : null;

      if (data?.ok && data.courier) {
        onAddCourier(data.courier);
      } else {
        onAddCourier({
          id: `cour-${Date.now()}`,
          name: courierName.trim(),
          phone: courierPhone.trim(),
          vehicle: courierVehicle.trim() || 'Moto 160cc',
          plate: courierPlate.trim().toUpperCase() || 'SEM-PLACA',
          status: 'disponivel',
          active: true,
          deliveriesToday: 0,
          pixKey: courierPixKey.trim() || undefined,
        });
      }
      setCourierName('');
      setCourierPhone('');
      setCourierVehicle('');
      setCourierPlate('');
      setCourierPixKey('');
    } finally {
      setAddingCourier(false);
    }
  };

  const selectedCourier =
    mode === 'entregadores' && selectedCourierId
      ? state.couriers.find((c) => c.id === selectedCourierId) ?? null
      : null;

  if (selectedCourier) {
    return (
      <CourierProfileView
        courier={selectedCourier}
        state={state}
        onBack={() => setSelectedCourierId(null)}
        onUpdateCourier={onUpdateCourier}
        onUpdateOrderStatus={onUpdateOrderStatus}
        onAddSettlement={onAddSettlement ?? (() => {})}
        onUpdateSettlement={onUpdateSettlement ?? (() => {})}
        onAddFinancialEntry={onAddFinancialEntry ?? (() => {})}
        onAppendWhatsappLogs={onAppendWhatsappLogs ?? (() => {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {mode === 'entregadores'
              ? 'Entregadores e Rotas'
              : 'Desempenho e Relatórios'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {mode === 'entregadores'
              ? 'Gerencie a frota de motoboys, acompanhe pedidos em rota e controle os repasses do turno.'
              : 'Acompanhe faturamento por período, ticket médio, desempenho por canal e pratos mais vendidos.'}
          </p>
        </div>
      </div>

      {activeTab === 'relatorios' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Exibindo pedidos válidos (exceto cancelados) ·{' '}
              <strong className="text-slate-900 dark:text-white">
                {PERIOD_LABEL[period]}
              </strong>
            </p>
            <div
              role="group"
              aria-label="Período do relatório"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              {(['hoje', '7dias', '30dias'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    period === key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {PERIOD_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Faturamento no Período
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                {formatCurrencyBRL(metrics.revenue)}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pedidos Válidos
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {metrics.count}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ticket Médio
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
                {formatCurrencyBRL(metrics.avgTicket)}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Taxas de Entrega
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatCurrencyBRL(metrics.fees)}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Evolução de Faturamento
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Receita bruta distribuída por faixa do período selecionado.
                  </p>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500">
                  Descontos: {formatCurrencyBRL(metrics.discounts)}
                </span>
              </div>

              <div className="h-56 flex items-end gap-3 pt-6 border-b border-slate-200 dark:border-slate-800 pb-2">
                {chartSeries.map((point) => {
                  const heightPct =
                    point.value > 0
                      ? Math.max(8, Math.round((point.value / maxChartValue) * 100))
                      : 2;
                  return (
                    <div
                      key={point.label}
                      className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0"
                    >
                      <span className="text-[11px] font-mono-tabular text-slate-600 dark:text-slate-300 truncate max-w-full">
                        {point.value > 0 ? formatCurrencyBRL(point.value) : '—'}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t-md transition-all ${
                            point.value > 0
                              ? 'bg-brand-600 dark:bg-brand-500'
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                        />
                      </div>
                      <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 truncate max-w-full">
                        {point.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Vendas por Canal
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Participação de Cardápio Digital, WhatsApp e Balcão.
                </p>
              </div>

              <div className="space-y-4">
                {channelBreakdown.map((ch) => (
                  <div key={ch.source} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {ch.label} ({ch.count})
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(ch.total)} · {ch.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                      <div
                        style={{ width: `${Math.round(ch.share)}%` }}
                        className="h-full bg-brand-600 dark:bg-brand-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Formas de Pagamento
                </h2>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-6">Modalidade</th>
                    <th className="py-2.5 px-4 text-right">Pedidos</th>
                    <th className="py-2.5 px-6 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {paymentBreakdown.map((pm) => (
                    <tr key={pm.method}>
                      <td className="py-3 px-6 font-medium text-slate-900 dark:text-white">
                        {pm.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {pm.count}
                      </td>
                      <td className="py-3 px-6 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatCurrencyBRL(pm.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Pratos Mais Vendidos
                </h2>
              </div>
              {topDishes.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">
                  Nenhum item registrado neste período.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-6">Prato</th>
                      <th className="py-2.5 px-4 text-right">Qtd.</th>
                      <th className="py-2.5 px-6 text-right">Receita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {topDishes.map((dish) => (
                      <tr key={dish.name}>
                        <td className="py-3 px-6 font-medium text-slate-900 dark:text-white">
                          {dish.name}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                          {dish.qty}
                        </td>
                        <td className="py-3 px-6 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                          {formatCurrencyBRL(dish.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Disponíveis Agora
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
                {availableCouriersCount}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Em Rota de Entrega
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
                {inRouteCouriersCount}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Entregas no Turno
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {totalDeliveriesToday}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Repasse Estimado (Taxas)
              </p>
              <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatCurrencyBRL(estimatedFleetFees)}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <span>Cadastrar Entregador</span>
              </h2>
              <form onSubmit={handleCreateCourier} className="mt-4 space-y-3.5">
                <div>
                  <label
                    htmlFor="cour-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nome Completo
                  </label>
                  <input
                    id="cour-name"
                    required
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    placeholder="Ex.: Lucas Ferreira"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cour-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    WhatsApp / Celular
                  </label>
                  <input
                    id="cour-phone"
                    required
                    value={courierPhone}
                    onChange={(e) => setCourierPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cour-vehicle"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Veículo
                    </label>
                    <input
                      id="cour-vehicle"
                      value={courierVehicle}
                      onChange={(e) => setCourierVehicle(e.target.value)}
                      placeholder="Honda CG 160"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cour-plate"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Placa / ID
                    </label>
                    <input
                      id="cour-plate"
                      value={courierPlate}
                      onChange={(e) => setCourierPlate(e.target.value.toUpperCase())}
                      placeholder="ABC-1D23"
                      className="w-full px-3 py-2 text-sm font-mono-tabular uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="cour-pix"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Chave Pix (para fechamento diário)
                  </label>
                  <input
                    id="cour-pix"
                    value={courierPixKey}
                    onChange={(e) => setCourierPixKey(e.target.value)}
                    placeholder="CPF, telefone ou e-mail Pix"
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingCourier}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                >
                  {addingCourier ? 'Cadastrando...' : 'Adicionar Entregador'}
                </button>
              </form>
            </section>

            <section className="xl:col-span-8 space-y-4">
              {state.couriers.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Nenhum entregador cadastrado
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Use o formulário ao lado para adicionar motoboys à sua frota.
                  </p>
                </div>
              ) : (
                state.couriers.map((courier) => {
                  const activeOrders = state.orders.filter(
                    (o) =>
                      o.courierId === courier.id &&
                      (o.status === 'entrega' || o.status === 'pronto'),
                  );
                  const unitFee = courier.feePerDelivery ?? state.store.deliveryFee;
                  const feePayout = courier.deliveriesToday * unitFee;
                  const confirmingDelete = confirmDeleteId === courier.id;

                  return (
                    <article
                      key={courier.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => setSelectedCourierId(courier.id)}
                              className="text-base font-bold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 text-left transition-colors"
                            >
                              {courier.name}
                            </button>
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
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                            {courier.phone} · {courier.vehicle} ({courier.plate})
                            {courier.pixKey ? ` · Pix: ${courier.pixKey}` : ''}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs text-right mr-1">
                            <span className="text-slate-500">Hoje: </span>
                            <strong className="font-mono-tabular text-slate-900 dark:text-white">
                              {courier.deliveriesToday} entregas · {formatCurrencyBRL(feePayout)}
                            </strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCourierId(courier.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg whitespace-nowrap"
                          >
                            <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Perfil e Fechamento</span>
                          </button>
                          <select
                            aria-label={`Status de ${courier.name}`}
                            value={courier.status}
                            onChange={(e) =>
                              onUpdateCourier(courier.id, {
                                status: e.target.value as CourierStatus,
                              })
                            }
                            className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            <option value="disponivel">Disponível</option>
                            <option value="em_rota">Em Rota</option>
                            <option value="offline">Offline</option>
                          </select>

                          {onDeleteCourier && (
                            confirmingDelete ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteCourier(courier.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(courier.id)}
                                aria-label={`Excluir entregador ${courier.name}`}
                                title="Excluir entregador"
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {activeOrders.length > 0 && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Pedidos atribuídos em rota ({activeOrders.length})
                          </p>
                          <div className="divide-y divide-slate-200 dark:divide-slate-800">
                            {activeOrders.map((order) => (
                              <div
                                key={order.id}
                                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                                    #{order.orderNumber}
                                  </span>{' '}
                                  · {order.customerName} · {order.address} ({order.neighborhood})
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateOrderStatus(
                                      order.id,
                                      'finalizado',
                                      courier.id,
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md self-start sm:self-auto whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Confirmar Entrega</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
