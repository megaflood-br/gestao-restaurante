import type {
  CourierStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
} from '@/types/delivery';

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTimeBR(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeBR(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; textClass: string; nextStatus?: OrderStatus; nextLabel?: string }
> = {
  pendente: {
    label: 'Pendente',
    textClass: 'text-amber-700 dark:text-amber-400',
    nextStatus: 'preparo',
    nextLabel: 'Aceitar e Preparar',
  },
  preparo: {
    label: 'Em Preparo',
    textClass: 'text-blue-700 dark:text-blue-400',
    nextStatus: 'pronto',
    nextLabel: 'Marcar Pronto',
  },
  pronto: {
    label: 'Pronto',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    nextStatus: 'entrega',
    nextLabel: 'Enviar p/ Entrega',
  },
  entrega: {
    label: 'Em Rota',
    textClass: 'text-indigo-700 dark:text-indigo-400',
    nextStatus: 'finalizado',
    nextLabel: 'Concluir Entrega',
  },
  finalizado: {
    label: 'Finalizado',
    textClass: 'text-slate-600 dark:text-slate-400',
  },
  cancelado: {
    label: 'Cancelado',
    textClass: 'text-red-700 dark:text-red-400',
  },
};

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  cardapio: 'Cardápio Digital',
  whatsapp: 'WhatsApp Bot',
  balcao: 'Balcão / Telefone',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix (Copia e Cola)',
  cartao_entrega: 'Cartão na Entrega',
  dinheiro: 'Dinheiro',
  pagamento_online: 'Pagamento Online',
};

export const COURIER_STATUS_LABEL: Record<CourierStatus, string> = {
  disponivel: 'Disponível',
  em_rota: 'Em Rota',
  offline: 'Offline',
};
