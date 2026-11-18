import type {
  ChecklistFrequency,
  ChecklistRole,
  ChecklistShift,
  CourierStatus,
  EmployeeLedgerType,
  EmployeePayType,
  EmployeeStatus,
  LoyaltyPromotionType,
  LoyaltyRewardType,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  StaffTaskPriority,
  StaffTaskStatus,
  WasteReason,
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

export const CHECKLIST_ROLE_LABEL: Record<ChecklistRole, string> = {
  cozinha: 'Cozinha',
  atendimento: 'Atendimento / Balcão',
  limpeza: 'Higienização / Limpeza',
  gerencia: 'Gerência / Caixa',
  entregadores: 'Despacho / Entregadores',
};

export const CHECKLIST_SHIFT_LABEL: Record<ChecklistShift, string> = {
  abertura: 'Abertura',
  almoco: 'Turno Almoço',
  jantar: 'Turno Jantar',
  fechamento: 'Fechamento',
  geral: 'Qualquer Turno',
};

export const CHECKLIST_FREQUENCY_LABEL: Record<ChecklistFrequency, string> = {
  diario: 'Diário',
  turno: 'Por Turno',
  semanal: 'Semanal',
};

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  vencimento: 'Validade vencida / Deterioração',
  erro_preparo: 'Erro no preparo / Queima',
  sobra_buffet: 'Sobra não aproveitável / Fim de turno',
  avaria_embalagem: 'Queda / Avaria na embalagem',
  qualidade: 'Fora do padrão de qualidade',
  outros: 'Outros motivos',
};

export const LOYALTY_PROMO_TYPE_LABEL: Record<LoyaltyPromotionType, string> = {
  multiplier: 'Pontos Multiplicados',
  bonus_points: 'Pontos Extras por Compra',
  milestone_bonus: 'Bônus por Meta de Pedidos',
};

export const LOYALTY_REWARD_TYPE_LABEL: Record<LoyaltyRewardType, string> = {
  desconto_valor: 'Desconto em R$',
  desconto_percentual: 'Desconto %',
  brinde_item: 'Prato / Bebida Grátis',
  frete_gratis: 'Entrega Grátis',
};

export const EMPLOYEE_PAY_TYPE_LABEL: Record<EmployeePayType, string> = {
  mensal: 'Salário Mensal',
  semanal: 'Pagamento Semanal',
  quinzenal: 'Pagamento Quinzenal',
  diaria: 'Por Diária',
  hora: 'Por Hora / Turno',
};

export const WEEKDAY_LABEL: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  ativo: 'Ativo',
  ferias: 'Férias / Afastado',
  inativo: 'Desligado',
};

export const LEDGER_TYPE_LABEL: Record<EmployeeLedgerType, string> = {
  vale: 'Vale / Adiantamento',
  consumo: 'Consumo Interno',
  pagamento: 'Pagamento Salarial',
  bonus: 'Bônus / Adicional',
};

export const TASK_PRIORITY_LABEL: Record<StaffTaskPriority, string> = {
  normal: 'Normal',
  alta: 'Prioritária',
};

export const TASK_STATUS_LABEL: Record<StaffTaskStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
};
