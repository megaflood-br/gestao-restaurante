'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Printer,
  Receipt,
  Save,
  Send,
  UserCheck,
} from 'lucide-react';
import {
  COURIER_STATUS_LABEL,
  formatCurrencyBRL,
  formatDateTimeBR,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABEL,
} from '@/lib/formatters';
import type {
  Courier,
  CourierSettlement,
  CourierStatus,
  DeliveryStoreState,
  FinancialEntry,
  OrderStatus,
  WhatsappLog,
} from '@/types/delivery';

interface CourierProfileViewProps {
  courier: Courier;
  state: DeliveryStoreState;
  onBack: () => void;
  onUpdateCourier: (id: string, updates: Partial<Courier>) => void;
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    courierId?: string,
  ) => Promise<void>;
  onAddSettlement: (settlement: CourierSettlement) => void;
  onUpdateSettlement: (id: string, updates: Partial<CourierSettlement>) => void;
  onAddFinancialEntry: (entry: FinancialEntry) => void;
  onAppendWhatsappLogs: (logs: WhatsappLog[]) => void;
}

type ProfileTab = 'fechamento' | 'historico' | 'recibos';

export function CourierProfileView({
  courier,
  state,
  onBack,
  onUpdateCourier,
  onUpdateOrderStatus,
  onAddSettlement,
  onUpdateSettlement,
  onAddFinancialEntry,
  onAppendWhatsappLogs,
}: CourierProfileViewProps) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<ProfileTab>('fechamento');
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const courierOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.courierId === courier.id && o.status !== 'cancelado')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.orders, courier.id],
  );

  const deliveredOnDate = useMemo(
    () =>
      courierOrders.filter(
        (o) =>
          o.status === 'finalizado' &&
          o.createdAt.slice(0, 10) === selectedDate,
      ),
    [courierOrders, selectedDate],
  );

  const activeInRouteOrders = useMemo(
    () =>
      courierOrders.filter(
        (o) => o.status === 'entrega' || o.status === 'pronto',
      ),
    [courierOrders],
  );

  const defaultFee = courier.feePerDelivery ?? state.store.deliveryFee;
  const defaultFixedPay = courier.fixedDailyPay ?? 0;

  const isSelectedToday = selectedDate === todayIso;
  const suggestedDeliveriesCount = isSelectedToday
    ? Math.max(deliveredOnDate.length, courier.deliveriesToday)
    : deliveredOnDate.length;

  // Daily settlement form state
  const [deliveriesCountInput, setDeliveriesCountInput] = useState(
    String(suggestedDeliveriesCount),
  );
  const [feePerDeliveryInput, setFeePerDeliveryInput] = useState(
    String(defaultFee),
  );
  const [fixedDailyInput, setFixedDailyInput] = useState(
    String(defaultFixedPay),
  );
  const [bonusInput, setBonusInput] = useState('0');
  const [discountInput, setDiscountInput] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [notes, setNotes] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [recordInFinance, setRecordInFinance] = useState(true);
  const [closingBusy, setClosingBusy] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmDeliverOrderId, setConfirmDeliverOrderId] = useState<string | null>(
    null,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);

  // History filter
  const [historyFilter, setHistoryFilter] = useState<
    'todos' | 'finalizado' | 'em_rota' | 'dinheiro'
  >('todos');

  // Editable profile fields
  const [editName, setEditName] = useState(courier.name);
  const [editPhone, setEditPhone] = useState(courier.phone);
  const [editVehicle, setEditVehicle] = useState(courier.vehicle);
  const [editPlate, setEditPlate] = useState(courier.plate);
  const [editPixKey, setEditPixKey] = useState(courier.pixKey ?? '');
  const [editFeePerDelivery, setEditFeePerDelivery] = useState(
    String(defaultFee),
  );
  const [editFixedDaily, setEditFixedDaily] = useState(
    String(defaultFixedPay),
  );

  useEffect(() => {
    setDeliveriesCountInput(String(suggestedDeliveriesCount));
  }, [suggestedDeliveriesCount]);

  useEffect(() => {
    setFeePerDeliveryInput(String(courier.feePerDelivery ?? state.store.deliveryFee));
    setFixedDailyInput(String(courier.fixedDailyPay ?? 0));
    setEditName(courier.name);
    setEditPhone(courier.phone);
    setEditVehicle(courier.vehicle);
    setEditPlate(courier.plate);
    setEditPixKey(courier.pixKey ?? '');
    setEditFeePerDelivery(String(courier.feePerDelivery ?? state.store.deliveryFee));
    setEditFixedDaily(String(courier.fixedDailyPay ?? 0));
  }, [courier, state.store.deliveryFee]);

  const courierSettlements = useMemo(
    () =>
      state.courierSettlements
        .filter((s) => s.courierId === courier.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.courierSettlements, courier.id],
  );

  const alreadySettledOnDate = useMemo(
    () => courierSettlements.filter((s) => s.date === selectedDate),
    [courierSettlements, selectedDate],
  );

  const deliveriesQty = Math.max(0, Math.round(Number(deliveriesCountInput) || 0));
  const unitFee = Math.max(0, Number(feePerDeliveryInput) || 0);
  const deliveryFeesTotal = Number((deliveriesQty * unitFee).toFixed(2));
  const fixedDailyAmount = Math.max(0, Number(fixedDailyInput) || 0);
  const bonusAmount = Math.max(0, Number(bonusInput) || 0);
  const discountAmount = Math.max(0, Number(discountInput) || 0);
  const totalSettlementPay = Math.max(
    0,
    Number(
      (
        deliveryFeesTotal +
        fixedDailyAmount +
        bonusAmount -
        discountAmount
      ).toFixed(2),
    ),
  );

  // Cash collected in hand by the courier on selectedDate (for cash reconciliation)
  const cashCollectedOnDate = useMemo(
    () =>
      Number(
        deliveredOnDate
          .filter((o) => o.paymentMethod === 'dinheiro')
          .reduce((sum, o) => sum + o.total, 0)
          .toFixed(2),
      ),
    [deliveredOnDate],
  );

  const cardOnDeliveryOnDate = useMemo(
    () =>
      Number(
        deliveredOnDate
          .filter((o) => o.paymentMethod === 'cartao_entrega')
          .reduce((sum, o) => sum + o.total, 0)
          .toFixed(2),
      ),
    [deliveredOnDate],
  );

  const netCashDifference = Number(
    (totalSettlementPay - cashCollectedOnDate).toFixed(2),
  );

  const totalPaidHistory = useMemo(
    () =>
      Number(
        courierSettlements
          .reduce((sum, s) => sum + s.totalPaid, 0)
          .toFixed(2),
      ),
    [courierSettlements],
  );

  const receiptPreviewText = useMemo(() => {
    const formattedDate = selectedDate.split('-').reverse().join('/');
    const orderNums = deliveredOnDate.map((o) => o.orderNumber);
    return [
      `*RECIBO DE FECHAMENTO DIÁRIO — ${state.store.name}*`,
      `Data: ${formattedDate}`,
      `Entregador: ${courier.name} (${courier.vehicle} · ${courier.plate})`,
      ``,
      `• Entregas no dia: ${deliveriesQty}`,
      orderNums.length > 0
        ? `• Pedidos registrados: ${orderNums.map((n) => `#${n}`).join(', ')}`
        : null,
      `• Taxas (${deliveriesQty} × ${formatCurrencyBRL(unitFee)}): ${formatCurrencyBRL(deliveryFeesTotal)}`,
      fixedDailyAmount > 0
        ? `• Diária fixa: ${formatCurrencyBRL(fixedDailyAmount)}`
        : null,
      bonusAmount > 0
        ? `• Adicional / Bônus: +${formatCurrencyBRL(bonusAmount)}`
        : null,
      discountAmount > 0
        ? `• Descontos / Vales: -${formatCurrencyBRL(discountAmount)}`
        : null,
      ``,
      `*TOTAL PAGO: ${formatCurrencyBRL(totalSettlementPay)}*`,
      `Forma: ${paymentMethod}${
        courier.pixKey ? ` (Chave Pix: ${courier.pixKey})` : ''
      }`,
      notes.trim() ? `Obs.: ${notes.trim()}` : null,
      ``,
      `Obrigado pelo trabalho hoje!`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }, [
    selectedDate,
    deliveredOnDate,
    state.store.name,
    courier.name,
    courier.vehicle,
    courier.plate,
    courier.pixKey,
    deliveriesQty,
    unitFee,
    deliveryFeesTotal,
    fixedDailyAmount,
    bonusAmount,
    discountAmount,
    totalSettlementPay,
    paymentMethod,
    notes,
  ]);

  const filteredHistoryOrders = useMemo(() => {
    return courierOrders.filter((o) => {
      if (historyFilter === 'finalizado') return o.status === 'finalizado';
      if (historyFilter === 'em_rota') {
        return o.status === 'entrega' || o.status === 'pronto';
      }
      if (historyFilter === 'dinheiro') return o.paymentMethod === 'dinheiro';
      return true;
    });
  }, [courierOrders, historyFilter]);

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCloseDayAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setClosingBusy(true);
    setFeedback(null);
    try {
      const orderNumbers = deliveredOnDate.map((o) => o.orderNumber);
      const res = await fetch('/api/couriers/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_and_send',
          courierId: courier.id,
          courierName: courier.name,
          courierPhone: courier.phone,
          courierVehicle: courier.vehicle,
          courierPlate: courier.plate,
          date: selectedDate,
          deliveriesCount: deliveriesQty,
          orderNumbers,
          deliveryFeesTotal,
          fixedDailyPay: fixedDailyAmount,
          bonusAmount,
          discountAmount,
          totalPaid: totalSettlementPay,
          paymentMethod,
          pixKey: courier.pixKey,
          notes: notes.trim() || undefined,
          sendWhatsapp,
          recordInFinance,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        settlement?: CourierSettlement;
        financialEntry?: FinancialEntry | null;
        whatsappLog?: WhatsappLog | null;
        sentLive?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.settlement) {
        setFeedback({
          type: 'error',
          message: data.error || 'Erro ao fechar o dia e emitir recibo.',
        });
        return;
      }

      onAddSettlement(data.settlement);
      if (data.financialEntry) {
        onAddFinancialEntry(data.financialEntry);
      }
      if (data.whatsappLog) {
        onAppendWhatsappLogs([data.whatsappLog]);
      }

      setNotes('');
      setBonusInput('0');
      setDiscountInput('0');
      setFeedback({
        type: 'ok',
        message: sendWhatsapp
          ? data.sentLive
            ? `Fechamento salvo e recibo enviado via WhatsApp para ${courier.name}!`
            : `Fechamento salvo e recibo registrado (${data.settlement.whatsappStatus}).`
          : `Fechamento diário salvo no histórico (${formatCurrencyBRL(totalSettlementPay)}).`,
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Falha de comunicação ao emitir o recibo.',
      });
    } finally {
      setClosingBusy(false);
    }
  };

  const handleResendWhatsapp = async (settlement: CourierSettlement) => {
    setResendingId(settlement.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/couriers/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_whatsapp',
          settlementId: settlement.id,
          courierPhone: courier.phone,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        settlement?: CourierSettlement;
        whatsappLog?: WhatsappLog;
        sentLive?: boolean;
        error?: string;
      };
      if (data.ok && data.settlement) {
        onUpdateSettlement(settlement.id, data.settlement);
        if (data.whatsappLog) {
          onAppendWhatsappLogs([data.whatsappLog]);
        }
        setFeedback({
          type: 'ok',
          message: data.sentLive
            ? `Recibo reenviado no WhatsApp para ${courier.phone}.`
            : `Reenvio registrado (${data.settlement.whatsappStatus}).`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Não foi possível reenviar o recibo.',
        });
      }
    } finally {
      setResendingId(null);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCourier(courier.id, {
      name: editName.trim() || courier.name,
      phone: editPhone.trim() || courier.phone,
      vehicle: editVehicle.trim() || courier.vehicle,
      plate: editPlate.trim().toUpperCase() || courier.plate,
      pixKey: editPixKey.trim() || undefined,
      feePerDelivery: Math.max(0, Number(editFeePerDelivery) || 0),
      fixedDailyPay: Math.max(0, Number(editFixedDaily) || 0),
    });
    setFeedback({
      type: 'ok',
      message: `Perfil e regras de pagamento de ${editName.trim() || courier.name} atualizados.`,
    });
  };

  const cleanPhoneWa = courier.phone.replace(/\D/g, '');
  const waHref = `https://wa.me/${
    cleanPhoneWa.startsWith('55') ? cleanPhoneWa : `55${cleanPhoneWa}`
  }?text=${encodeURIComponent(receiptPreviewText)}`;

  return (
    <div className="space-y-6">
      {/* Top Profile Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Voltar para Lista de Entregadores</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {courier.name}
            </h1>
            <span
              className={`text-xs font-semibold ${
                courier.status === 'disponivel'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : courier.status === 'em_rota'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500'
              }`}
            >
              · {COURIER_STATUS_LABEL[courier.status]}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
            <span>{courier.phone}</span>
            <span aria-hidden="true">·</span>
            <span>
              {courier.vehicle} ({courier.plate})
            </span>
            {courier.pixKey && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => handleCopyText('pix-header', courier.pixKey || '')}
                  className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200 hover:underline"
                >
                  <span>Pix: {courier.pixKey}</span>
                  {copiedKey === 'pix-header' ? (
                    <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" aria-hidden="true" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label={`Status de ${courier.name}`}
            value={courier.status}
            onChange={(e) =>
              onUpdateCourier(courier.id, {
                status: e.target.value as CourierStatus,
              })
            }
            className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <option value="disponivel">Disponível</option>
            <option value="em_rota">Em Rota</option>
            <option value="offline">Offline</option>
          </select>

          <a
            href={`/motoboy?id=${courier.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 rounded-lg whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Portal GPS do Motoboy</span>
          </a>

          <button
            type="button"
            onClick={() =>
              handleCopyText(
                'portal-link',
                typeof window !== 'undefined'
                  ? `${window.location.origin}/motoboy?id=${courier.id}`
                  : `/motoboy?id=${courier.id}`,
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            {copiedKey === 'portal-link' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Link Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copiar Acesso GPS</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

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

      {/* 4-KPI Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Entregas ({selectedDate.split('-').reverse().join('/')})
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {deliveriesQty}
          </p>
          <p className="mt-1 text-[11px] font-mono-tabular text-slate-500">
            Taxa un.: {formatCurrencyBRL(unitFee)}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Valor do Fechamento (Dia)
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {formatCurrencyBRL(totalSettlementPay)}
          </p>
          <p className="mt-1 text-[11px] font-mono-tabular text-slate-500">
            Taxas {formatCurrencyBRL(deliveryFeesTotal)} + Diária {formatCurrencyBRL(fixedDailyAmount)}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dinheiro Recebido na Entrega
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400">
            {formatCurrencyBRL(cashCollectedOnDate)}
          </p>
          <p className="mt-1 text-[11px] font-mono-tabular text-slate-500">
            {netCashDifference >= 0
              ? `Loja paga líq. ${formatCurrencyBRL(netCashDifference)}`
              : `Motoboy devolve ${formatCurrencyBRL(Math.abs(netCashDifference))}`}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total Pago (Histórico)
          </p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {formatCurrencyBRL(totalPaidHistory)}
          </p>
          <p className="mt-1 text-[11px] font-mono-tabular text-slate-500">
            {courierSettlements.length}{' '}
            {courierSettlements.length === 1 ? 'recibo fechado' : 'recibos fechados'}
          </p>
        </div>
      </section>

      {/* Profile Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Seções do perfil do entregador"
        className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto max-w-full"
      >
        {(
          [
            { id: 'fechamento', label: 'Fechamento Diário & Recibo' },
            {
              id: 'historico',
              label: `Pedidos Entregues (${courierOrders.length})`,
            },
            {
              id: 'recibos',
              label: `Recibos & Cadastro (${courierSettlements.length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: FECHAMENTO DIÁRIO & RECIBO WHATSAPP */}
      {activeTab === 'fechamento' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulário de Fechamento */}
          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                  <span>Apuração do Dia e Pagamento</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Confira as taxas, ajuste bônus/vales e emita o recibo direto no WhatsApp do entregador.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  aria-label="Data do fechamento"
                  className="px-3 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
                {selectedDate !== todayIso && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayIso)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 rounded-lg"
                  >
                    Hoje
                  </button>
                )}
              </div>
            </div>

            {alreadySettledOnDate.length > 0 && (
              <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                Já existe {alreadySettledOnDate.length}{' '}
                {alreadySettledOnDate.length === 1
                  ? 'fechamento registrado'
                  : 'fechamentos registrados'}{' '}
                nesta data (total pago:{' '}
                <strong className="font-mono-tabular">
                  {formatCurrencyBRL(
                    alreadySettledOnDate.reduce((s, item) => s + item.totalPaid, 0),
                  )}
                </strong>
                ).
              </div>
            )}

            {/* Quick origin count helpers */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Pedidos finalizados na fila em {selectedDate.split('-').reverse().join('/')}:{' '}
                <strong className="font-mono-tabular text-slate-900 dark:text-white">
                  {deliveredOnDate.length}
                </strong>
                {isSelectedToday && (
                  <>
                    {' '}
                    · Contador do turno:{' '}
                    <strong className="font-mono-tabular text-slate-900 dark:text-white">
                      {courier.deliveriesToday}
                    </strong>
                  </>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDeliveriesCountInput(String(deliveredOnDate.length))
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Usar fila ({deliveredOnDate.length})
                </button>
                {isSelectedToday && (
                  <button
                    type="button"
                    onClick={() =>
                      setDeliveriesCountInput(String(courier.deliveriesToday))
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Usar turno ({courier.deliveriesToday})
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleCloseDayAndSend} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="set-qty"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Qtd. de Entregas
                  </label>
                  <input
                    id="set-qty"
                    type="number"
                    min="0"
                    value={deliveriesCountInput}
                    onChange={(e) => setDeliveriesCountInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-fee"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Taxa p/ Entrega (R$)
                  </label>
                  <input
                    id="set-fee"
                    type="number"
                    step="0.5"
                    min="0"
                    value={feePerDeliveryInput}
                    onChange={(e) => setFeePerDeliveryInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label
                    htmlFor="set-daily"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Diária Fixa (R$)
                  </label>
                  <input
                    id="set-daily"
                    type="number"
                    step="1"
                    min="0"
                    value={fixedDailyInput}
                    onChange={(e) => setFixedDailyInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="set-bonus"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Adicional / Bônus (R$)
                  </label>
                  <input
                    id="set-bonus"
                    type="number"
                    step="0.5"
                    min="0"
                    value={bonusInput}
                    onChange={(e) => setBonusInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-discount"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Desconto / Vale (R$)
                  </label>
                  <input
                    id="set-discount"
                    type="number"
                    step="0.5"
                    min="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-pay"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Forma de Pagamento
                  </label>
                  <select
                    id="set-pay"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro (Caixa)</option>
                    <option value="Transferência">Transferência</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="set-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Observações do Fechamento (opcional)
                </label>
                <input
                  id="set-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Adicional chuva, vale refeição ou acerto turno noite..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWhatsapp}
                    onChange={(e) => setSendWhatsapp(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600"
                  />
                  <span>
                    Enviar recibo automaticamente via WhatsApp para{' '}
                    <strong className="font-mono-tabular">{courier.phone}</strong>
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recordInFinance}
                    onChange={(e) => setRecordInFinance(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600"
                  />
                  <span>
                    Lançar pagamento automaticamente em <strong>Custos e Fluxo</strong> (Equipe e Entregadores)
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total Líquido do Recibo
                  </p>
                  <p className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                    {formatCurrencyBRL(totalSettlementPay)}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={closingBusy}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {closingBusy
                      ? 'Emitindo e enviando...'
                      : sendWhatsapp
                        ? 'Fechar Dia e Enviar Recibo no WhatsApp'
                        : 'Fechar Dia e Gerar Recibo'}
                  </span>
                </button>
              </div>
            </form>
          </section>

          {/* Coluna Direita: Conferência de Acerto + Prévia do Recibo */}
          <div className="xl:col-span-5 space-y-6">
            {/* Conferência de Acerto de Caixa */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Conferência de Acerto (Dinheiro & Maquininha)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Valores recebidos pelo entregador diretamente dos clientes em{' '}
                {selectedDate.split('-').reverse().join('/')}:
              </p>

              <div className="space-y-2 pt-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">
                    Recebido em Dinheiro (em mãos)
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {formatCurrencyBRL(cashCollectedOnDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">
                    Passado na Maquininha na Entrega
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {formatCurrencyBRL(cardOnDeliveryOnDate)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold">
                  <span className="text-slate-900 dark:text-white">
                    {netCashDifference >= 0
                      ? 'Saldo Líquido a Pagar ao Entregador'
                      : 'Troco / Saldo que o Entregador Devolve'}
                  </span>
                  <span
                    className={`font-mono-tabular ${
                      netCashDifference >= 0
                        ? 'text-brand-600 dark:text-brand-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {formatCurrencyBRL(Math.abs(netCashDifference))}
                  </span>
                </div>
              </div>
            </section>

            {/* Prévia do Recibo WhatsApp */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Prévia do Recibo WhatsApp</span>
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText('preview', receiptPreviewText)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                  >
                    {copiedKey === 'preview' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-md"
                  >
                    <span>WhatsApp Web</span>
                  </a>
                </div>
              </div>

              <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                {receiptPreviewText}
              </pre>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: HISTÓRICO DE PEDIDOS ENTREGUES */}
      {activeTab === 'historico' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Histórico de Pedidos de {courier.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeInRouteOrders.length > 0
                  ? `${activeInRouteOrders.length} em rota agora · ${courierOrders.length} pedidos atribuídos no total.`
                  : `${courierOrders.length} pedidos atribuídos no histórico.`}
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'finalizado', label: 'Entregues' },
                  { id: 'em_rota', label: 'Em Rota' },
                  { id: 'dinheiro', label: 'Dinheiro' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHistoryFilter(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    historyFilter === f.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredHistoryOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum pedido encontrado para este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Pedido</th>
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Cliente & Endereço</th>
                    <th className="py-3 px-4">Pagamento</th>
                    <th className="py-3 px-4 text-right">Total Pedido</th>
                    <th className="py-3 px-4 text-right">Taxa Motoboy</th>
                    <th className="py-3 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredHistoryOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3.5 px-5 font-mono-tabular font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        #{order.orderNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono-tabular text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTimeBR(order.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {order.customerName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {order.address} · {order.neighborhood}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrencyBRL(order.total)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatCurrencyBRL(unitFee)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {order.status === 'entrega' || order.status === 'pronto' ? (
                          confirmDeliverOrderId === order.id ? (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={async () => {
                                  setConfirmDeliverOrderId(null);
                                  await onUpdateOrderStatus(
                                    order.id,
                                    'finalizado',
                                    courier.id,
                                  );
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                              >
                                Confirmar?
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeliverOrderId(null)}
                                className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeliverOrderId(order.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              <span>Confirmar Entrega</span>
                            </button>
                          )
                        ) : (
                          <span
                            className={`font-semibold ${ORDER_STATUS_META[order.status].textClass}`}
                          >
                            {ORDER_STATUS_META[order.status].label}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: RECIBOS EMITIDOS & CADASTRO */}
      {activeTab === 'recibos' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <section className="xl:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Recibos e Fechamentos Emitidos ({courierSettlements.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consulte pagamentos diários concluídos, copie o comprovante ou reenvie para o WhatsApp do entregador.
              </p>
            </div>

            {courierSettlements.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
                Nenhum recibo fechado ainda para {courier.name}. Use a aba Fechamento Diário para gerar o primeiro.
              </div>
            ) : (
              courierSettlements.map((settlement) => (
                <article
                  key={settlement.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-mono-tabular">
                        Fechamento {settlement.date.split('-').reverse().join('/')} ·{' '}
                        {formatCurrencyBRL(settlement.totalPaid)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {settlement.deliveriesCount} entregas · {settlement.paymentMethod}
                        {settlement.whatsappStatus
                          ? ` · WhatsApp: ${settlement.whatsappStatus}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(settlement.id, settlement.receiptText)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                      >
                        {copiedKey === settlement.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copiar Recibo</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={resendingId === settlement.id}
                        onClick={() => handleResendWhatsapp(settlement)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {resendingId === settlement.id
                            ? 'Enviando...'
                            : 'Reenviar WhatsApp'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
                    {settlement.receiptText}
                  </pre>
                </article>
              ))
            )}
          </section>

          {/* Cadastro e Regras de Pagamento */}
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span>Dados e Regras do Entregador</span>
            </h2>

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label
                  htmlFor="prof-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome Completo
                </label>
                <input
                  id="prof-name"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  WhatsApp (para envio de recibos)
                </label>
                <input
                  id="prof-phone"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="prof-veh"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Veículo
                  </label>
                  <input
                    id="prof-veh"
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prof-plate"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Placa / ID
                  </label>
                  <input
                    id="prof-plate"
                    value={editPlate}
                    onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono-tabular uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="prof-pix"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Chave Pix do Entregador
                </label>
                <input
                  id="prof-pix"
                  value={editPixKey}
                  onChange={(e) => setEditPixKey(e.target.value)}
                  placeholder="CPF, telefone, e-mail ou chave aleatória"
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="prof-fee"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Taxa por Entrega (R$)
                  </label>
                  <input
                    id="prof-fee"
                    type="number"
                    step="0.5"
                    min="0"
                    value={editFeePerDelivery}
                    onChange={(e) => setEditFeePerDelivery(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prof-daily"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Diária Fixa Padrão (R$)
                  </label>
                  <input
                    id="prof-daily"
                    type="number"
                    step="1"
                    min="0"
                    value={editFixedDaily}
                    onChange={(e) => setEditFixedDaily(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Salvar Perfil e Regras</span>
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
