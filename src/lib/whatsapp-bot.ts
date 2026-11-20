import { formatCurrencyBRL, ORDER_STATUS_META } from '@/lib/formatters';
import {
  computeRewardDiscountOnOrder,
  findCustomerByPhone,
  getAvailableRewardsForCustomer,
  getCustomerOrders,
  upsertCustomerAndAwardOrderPoints,
} from '@/lib/crm-engine';
import { getRuntimeApiCredentials } from '@/lib/server-store';
import { applyOrderStockDeduction } from '@/lib/stock-engine';
import {
  formatMenuItemDaysLabel,
  getStoreAvailability,
  getWeekdayLabel,
  isMenuItemAvailableOnDay,
} from '@/lib/store-hours';
import type {
  DeliveryMode,
  DeliveryStoreState,
  Order,
  OrderItem,
  PaymentMethod,
  StockMovement,
  WhatsappSessionMessage,
} from '@/types/delivery';

interface OrderDraftState {
  items: Array<{ menuItemId: string; quantity: number }>;
  deliveryMode?: DeliveryMode;
  address?: string;
  neighborhood?: string;
  paymentMethod?: PaymentMethod;
  couponCode?: string;
  loyaltyRewardId?: string;
  offeredSavedAddress?: boolean;
}

declare global {
  var __whatsappSessionMemory:
    | Record<string, WhatsappSessionMessage[]>
    | undefined;
  var __whatsappOrderDrafts: Record<string, OrderDraftState> | undefined;
}

function getSessionMemory(): Record<string, WhatsappSessionMessage[]> {
  if (!globalThis.__whatsappSessionMemory) {
    globalThis.__whatsappSessionMemory = {};
  }
  return globalThis.__whatsappSessionMemory;
}

function getOrderDrafts(): Record<string, OrderDraftState> {
  if (!globalThis.__whatsappOrderDrafts) {
    globalThis.__whatsappOrderDrafts = {};
  }
  return globalThis.__whatsappOrderDrafts;
}

export function getOpenAiRuntimeConfig(): {
  apiKey: string;
  model: string;
  isConfigured: boolean;
} {
  const creds = getRuntimeApiCredentials();
  const apiKey = creds.openAiApiKey.trim();
  const model = creds.openAiModel.trim() || 'gpt-4o-mini';
  const isConfigured = Boolean(apiKey) && apiKey !== 'MY_OPENAI_API_KEY';
  return { apiKey, model, isConfigured };
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiRuntimeConfig().isConfigured;
}

interface CreateWhatsappOrderArgs {
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
  deliveryMode: DeliveryMode;
  address?: string;
  neighborhood?: string;
  useSavedAddress?: boolean;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  couponCode?: string;
  loyaltyRewardId?: string;
  notes?: string;
}

function createOrderFromBot(params: {
  state: DeliveryStoreState;
  customerPhone: string;
  customerName: string;
  args: CreateWhatsappOrderArgs;
}): {
  ok: boolean;
  order?: Order;
  stockMovements: StockMovement[];
  pointsEarned?: number;
  newPointsBalance?: number;
  error?: string;
} {
  const { state, customerPhone, customerName, args } = params;

  const availability = getStoreAvailability(state.store);
  if (!availability.isOpen) {
    return {
      ok: false,
      stockMovements: [],
      error:
        availability.closedReason ||
        `A loja está fechada no momento. Horário: ${state.store.openingHours}.`,
    };
  }

  const crmCustomer = findCustomerByPhone(state.customers, customerPhone);
  const resolvedName = crmCustomer?.name || customerName.trim() || 'Cliente WhatsApp';

  const orderItems: OrderItem[] = [];
  const offDayRejectedNames: string[] = [];
  for (const reqItem of args.items) {
    const found = state.menuItems.find(
      (m) =>
        m.id === reqItem.menuItemId ||
        m.name.toLowerCase().includes(reqItem.menuItemId.toLowerCase()),
    );
    if (!found || !found.available) continue;
    if (!isMenuItemAvailableOnDay(found, availability.currentDayIndex)) {
      offDayRejectedNames.push(
        `${found.name} (disponível apenas: ${formatMenuItemDaysLabel(found.availableDays)})`,
      );
      continue;
    }
    const qty = Math.max(1, Math.round(reqItem.quantity || 1));
    const unitPrice = found.promoPrice ?? found.price;
    orderItems.push({
      id: `wa-item-${Date.now()}-${orderItems.length + 1}`,
      menuItemId: found.id,
      name: found.name,
      quantity: qty,
      unitPrice,
      totalPrice: Number((unitPrice * qty).toFixed(2)),
      notes: reqItem.notes,
      selectedAddons: [],
    });
  }

  if (orderItems.length === 0) {
    return {
      ok: false,
      stockMovements: [],
      error:
        offDayRejectedNames.length > 0
          ? `Os itens solicitados não estão no cardápio de hoje: ${offDayRejectedNames.join('; ')}.`
          : 'Nenhum prato disponível foi identificado no pedido.',
    };
  }

  const subtotal = Number(
    orderItems.reduce((sum, i) => sum + i.totalPrice, 0).toFixed(2),
  );

  let discount = 0;
  let appliedCoupon: string | undefined;
  if (args.couponCode?.trim()) {
    const normalized = args.couponCode.trim().toUpperCase();
    const coupon = state.coupons.find(
      (c) => c.code.toUpperCase() === normalized && c.active,
    );
    if (coupon && subtotal >= coupon.minOrderValue) {
      discount =
        coupon.type === 'percent'
          ? Number(((subtotal * coupon.value) / 100).toFixed(2))
          : Math.min(subtotal, coupon.value);
      appliedCoupon = coupon.code;
      coupon.usageCount += 1;
    }
  }

  const deliveryMode: DeliveryMode =
    args.deliveryMode === 'retirada' ? 'retirada' : 'entrega';
  let deliveryFee =
    deliveryMode === 'retirada'
      ? 0
      : subtotal >= state.store.freeDeliveryMin
        ? 0
        : state.store.deliveryFee;

  let appliedRewardId: string | undefined;
  let appliedRewardTitle: string | undefined;
  if (args.loyaltyRewardId && crmCustomer) {
    const reward = (state.loyaltyRewards ?? []).find(
      (r) => r.id === args.loyaltyRewardId && r.active,
    );
    if (reward && crmCustomer.pointsBalance >= reward.pointsCost) {
      const rewardEffect = computeRewardDiscountOnOrder({
        reward,
        subtotal,
        deliveryFee,
      });
      if (rewardEffect.freeDelivery) {
        deliveryFee = 0;
      } else if (rewardEffect.discount > 0) {
        discount = Math.min(subtotal, Number((discount + rewardEffect.discount).toFixed(2)));
      }
      appliedRewardId = reward.id;
      appliedRewardTitle = reward.title;
    }
  }

  const total = Math.max(
    0,
    Number((subtotal + deliveryFee - discount).toFixed(2)),
  );
  const maxOrderNum = state.orders.reduce(
    (max, o) => Math.max(max, o.orderNumber),
    1040,
  );
  const nextNumber = maxOrderNum + 1;
  const now = new Date().toISOString();

  const resolvedAddress =
    deliveryMode === 'retirada'
      ? 'Retirada no Balcão'
      : args.useSavedAddress && crmCustomer?.address
        ? crmCustomer.address
        : args.address?.trim() || crmCustomer?.address || 'Endereço informado via WhatsApp';

  const resolvedNeighborhood =
    deliveryMode === 'retirada'
      ? state.store.neighborhood
      : args.neighborhood?.trim() || crmCustomer?.neighborhood || state.store.neighborhood;

  const rewardNote = appliedRewardTitle
    ? `Prêmio fidelidade resgatado: ${appliedRewardTitle}`
    : '';
  const mergedNotes = [
    args.notes?.trim() || 'Pedido fechado pelo Atendimento Virtual IA',
    rewardNote,
  ]
    .filter(Boolean)
    .join(' · ');

  const newOrder: Order = {
    id: `ord-${nextNumber}-${Date.now()}`,
    orderNumber: nextNumber,
    source: 'whatsapp',
    customerId: crmCustomer?.id,
    customerName: resolvedName,
    customerPhone: customerPhone.replace(/\D/g, ''),
    address: resolvedAddress,
    neighborhood: resolvedNeighborhood,
    complement: crmCustomer?.complement,
    deliveryMode,
    paymentMethod: args.paymentMethod || 'pix',
    changeFor: args.changeFor,
    couponCode: appliedCoupon,
    loyaltyRewardId: appliedRewardId,
    loyaltyRewardTitle: appliedRewardTitle,
    subtotal,
    deliveryFee,
    discount,
    total,
    status: 'pendente',
    notes: mergedNotes,
    items: orderItems,
    createdAt: now,
    updatedAt: now,
    history: [{ status: 'pendente', at: now }],
  };

  const stockResult = applyOrderStockDeduction({
    order: newOrder,
    menuItems: state.menuItems,
    ingredients: state.ingredients,
    nowIso: now,
  });

  if (stockResult.deducted) {
    newOrder.stockDeducted = true;
    state.ingredients = stockResult.ingredients;
    state.stockMovements = [
      ...stockResult.newMovements,
      ...state.stockMovements,
    ];
  }

  const crmResult = upsertCustomerAndAwardOrderPoints({
    customers: state.customers ?? [],
    loyaltyConfig: state.loyaltyConfig,
    loyaltyPromotions: state.loyaltyPromotions ?? [],
    loyaltyRewards: state.loyaltyRewards ?? [],
    loyaltyTransactions: state.loyaltyTransactions ?? [],
    order: newOrder,
    autoCreate: true,
    redeemedRewardId: appliedRewardId,
  });

  state.customers = crmResult.customers;
  state.loyaltyRewards = crmResult.loyaltyRewards;
  state.loyaltyTransactions = crmResult.loyaltyTransactions;
  if (crmResult.customer) newOrder.customerId = crmResult.customer.id;
  if (crmResult.pointsEarned > 0) newOrder.loyaltyPointsEarned = crmResult.pointsEarned;
  if (crmResult.pointsRedeemed > 0) newOrder.loyaltyPointsRedeemed = crmResult.pointsRedeemed;

  state.orders = [newOrder, ...state.orders];

  return {
    ok: true,
    order: newOrder,
    stockMovements: stockResult.newMovements,
    pointsEarned: crmResult.pointsEarned,
    newPointsBalance: crmResult.customer?.pointsBalance,
  };
}

function buildStoreContextPrompt(
  state: DeliveryStoreState,
  customerPhone: string,
  customerName: string,
): string {
  const evo = state.store.evolution;
  const assistantName = evo.assistantName?.trim() || 'Brenda';
  const tone = evo.tone || 'acolhedor';
  const toneInstruction =
    tone === 'descontraido'
      ? 'Use um tom leve, simpático e natural, como uma atendente real no WhatsApp.'
      : tone === 'objetivo'
        ? 'Use um tom direto, educado e curto, sem enrolação.'
        : 'Use um tom acolhedor, gentil e humano, típico de atendimento conversacional natural.';

  const crmCustomer = findCustomerByPhone(state.customers, customerPhone);
  const resolvedName = crmCustomer?.name || customerName;
  const customerOrders = getCustomerOrders(
    state.orders,
    crmCustomer,
    customerPhone,
  ).slice(0, 5);

  const storeAvailability = getStoreAvailability(state.store);
  const todayLabel = getWeekdayLabel(storeAvailability.currentDayIndex);

  const menuSummary = state.menuItems
    .map((item) => {
      const price = item.promoPrice ?? item.price;
      const availableToday = isMenuItemAvailableOnDay(
        item,
        storeAvailability.currentDayIndex,
      );
      const status = !item.available
        ? 'Esgotado'
        : availableToday
          ? 'Disponível hoje'
          : `Indisponível hoje — servido somente: ${formatMenuItemDaysLabel(item.availableDays)}`;
      const addons = item.addonGroups
        .map(
          (g) =>
            `${g.title} (${g.required ? 'obrigatório' : 'opcional'}): ${g.options
              .map(
                (o) =>
                  `${o.name}${o.price > 0 ? ` +${formatCurrencyBRL(o.price)}` : ''}`,
              )
              .join(', ')}`,
        )
        .join(' | ');
      return `- [ID: ${item.id}] ${item.name} (${status}) — ${formatCurrencyBRL(price)} (${item.serves}). ${item.description}${addons ? ` Adicionais: ${addons}` : ''}`;
    })
    .join('\n');

  const couponsSummary = state.coupons
    .filter((c) => c.active)
    .map(
      (c) =>
        `- ${c.code}: ${
          c.type === 'percent' ? `${c.value}%` : formatCurrencyBRL(c.value)
        } (mínimo ${formatCurrencyBRL(c.minOrderValue)})`,
    )
    .join('\n');

  const ordersSummary =
    customerOrders.length > 0
      ? customerOrders
          .map((o) => {
            const itemsDesc = o.items
              .map((i) => `${i.quantity}x ${i.name}`)
              .join(', ');
            return `- Pedido #${o.orderNumber} (${ORDER_STATUS_META[o.status].label}): ${itemsDesc} — Total ${formatCurrencyBRL(o.total)}, ${o.deliveryMode}.`;
          })
          .join('\n')
      : 'Nenhum pedido recente encontrado para este telefone.';

  const loyaltyConfig = state.loyaltyConfig;
  const activePromosSummary = (state.loyaltyPromotions ?? [])
    .filter((p) => p.active)
    .map((p) => `- ${p.title}: ${p.description}`)
    .join('\n');

  const redeemableRewards = crmCustomer
    ? getAvailableRewardsForCustomer(
        crmCustomer.pointsBalance,
        state.loyaltyRewards,
      )
    : [];
  const allActiveRewards = (state.loyaltyRewards ?? []).filter((r) => r.active);

  const crmBlock = crmCustomer
    ? [
        `=== FICHA CRM DO CLIENTE IDENTIFICADO ===`,
        `- Nome completo: ${crmCustomer.name}`,
        `- WhatsApp: ${crmCustomer.phone}`,
        `- Endereço cadastrado: ${
          crmCustomer.address
            ? `${crmCustomer.address}${crmCustomer.complement ? ` (${crmCustomer.complement})` : ''} - ${crmCustomer.neighborhood}`
            : 'Não cadastrado ainda'
        }`,
        `- Total de pedidos: ${crmCustomer.ordersCount} | Total gasto: ${formatCurrencyBRL(crmCustomer.totalSpent)}`,
        crmCustomer.notes
          ? `- Preferências / Observações CRM: ${crmCustomer.notes}`
          : '',
        loyaltyConfig?.enabled
          ? `- Saldo Clube Fidelidade: ${crmCustomer.pointsBalance} pontos`
          : '',
        redeemableRewards.length > 0
          ? `- PRÊMIOS QUE O CLIENTE JÁ PODE RESGATAR AGORA: ${redeemableRewards
              .map((r) => `[ID: ${r.id}] ${r.title} (${r.pointsCost} pts)`)
              .join(' | ')}`
          : loyaltyConfig?.enabled
            ? `- Próximos prêmios do clube: ${allActiveRewards
                .map((r) => `${r.title} (${r.pointsCost} pts)`)
                .join(' | ')}`
            : '',
      ]
        .filter(Boolean)
        .join('\n')
    : `Cliente ainda não cadastrado no CRM: ${resolvedName} (${customerPhone}).`;

  const rawBaseUrl = (process.env.APP_URL ?? 'https://pedidofacil.local')
    .trim()
    .replace(/\/+$/, '');
  const appUrl = rawBaseUrl.endsWith('/cardapio')
    ? rawBaseUrl
    : `${rawBaseUrl}/cardapio`;

  return [
    `Você é ${assistantName}, atendente virtual humana e natural no WhatsApp do restaurante "${state.store.name}" (${state.store.segment}).`,
    toneInstruction,
    `Regras obrigatórias de conversa:`,
    `1. Responda sempre em português do Brasil, em mensagens curtas e naturais de WhatsApp (1 a 3 frases curtas por vez).`,
    `2. NUNCA envie lista de pratos, destaques do dia, preços ou links logo na saudação ("oi", "olá", "bom dia", "tudo bem"). Cumprimente pelo primeiro nome (${resolvedName.split(' ')[0]}) naturalmente e pergunte como pode ajudar.`,
    `3. SÓ envie o cardápio (lista de pratos disponíveis e link ${appUrl}) quando o cliente pedir explicitamente para ver o cardápio, as opções ou os preços.`,
    `4. Conduza a conversa passo a passo: quando o cliente falar o que quer pedir, confirme o item e pergunte apenas a próxima informação que falta (entrega/retirada, endereço ou pagamento), sem despejar textos longos.`,
    `5. Você JÁ CONHECE o histórico, endereço salvo e saldo de fidelidade deste cliente na Ficha CRM abaixo. Se for entrega e o cliente já tiver endereço cadastrado, pergunte se pode entregar no endereço salvo ("${crmCustomer?.address || 'cadastrado'}") em vez de pedir tudo do zero.`,
    `6. Se o cliente tiver prêmios disponíveis para resgate ou perguntar sobre pontos/fidelidade/promoções, informe o saldo atual e ofereça os prêmios compatíveis. Se ele aceitar resgatar um prêmio no pedido, envie o loyaltyRewardId na chamada da função.`,
    `7. Nunca invente pratos, preços ou promoções que não estejam nos dados abaixo.`,
    evo.allowAiOrderCreation !== false
      ? `8. Assim que o cliente informar os pratos desejados, modalidade (entrega com endereço ou retirada) e forma de pagamento (pix, cartao_entrega, dinheiro ou pagamento_online), chame a função "create_whatsapp_order" para registrar o pedido real na cozinha e informe o número do pedido.`
      : `8. Quando o cliente quiser finalizar um pedido, envie o link do cardápio digital (${appUrl}).`,
    evo.upsellEnabled !== false
      ? `9. Durante o pedido (sem ser repetitivo), sugira de forma sutil uma bebida ou acompanhamento se o cliente ainda não tiver pedido.`
      : `9. Mantenha o foco apenas nos itens solicitados pelo cliente.`,
    evo.humanHandoffEnabled !== false
      ? `10. Se o cliente pedir para falar com um atendente humano, gerente ou relatar um problema urgente, chame a função "request_human_handoff" imediatamente.`
      : `10. Responda todas as dúvidas diretamente.`,
    evo.customInstructions
      ? `11. Instruções específicas da loja: ${evo.customInstructions}`
      : ``,
    ``,
    `Dados atuais da loja (hoje é ${todayLabel}):`,
    `- Nome: ${state.store.name}`,
    `- Status agora: ${storeAvailability.isOpen ? 'ABERTA recebendo pedidos' : `FECHADA no momento (${storeAvailability.closedReason})`}`,
    `- Horário: ${state.store.openingHours}`,
    `- Endereço para retirada: ${state.store.address}, ${state.store.neighborhood}`,
    `- Taxa de entrega: ${formatCurrencyBRL(state.store.deliveryFee)} (grátis acima de ${formatCurrencyBRL(state.store.freeDeliveryMin)})`,
    `- Previsão média: ${state.store.estimatedMinutes} minutos`,
    `- Pagamentos: Pix, Cartão na entrega, Dinheiro e Pagamento Online.`,
    ``,
    `Cardápio atual (consulte internamente; só liste ao cliente pratos marcados como "Disponível hoje" e avise os dias corretos se o cliente pedir algo indisponível hoje):`,
    menuSummary,
    ``,
    `Cupons ativos:`,
    couponsSummary || 'Nenhum cupom ativo no momento.',
    ``,
    `Programa e Promoções de Fidelidade:`,
    loyaltyConfig?.enabled
      ? `Regra base: ${
          loyaltyConfig.earnMode === 'por_pedido'
            ? `${loyaltyConfig.pointsPerStep} ponto(s) por pedido`
            : `${loyaltyConfig.pointsPerStep} ponto(s) a cada ${formatCurrencyBRL(loyaltyConfig.amountStepBrl)}`
        } (mín. ${formatCurrencyBRL(loyaltyConfig.minOrderValueToEarn)}).`
      : 'Programa de fidelidade pausado.',
    activePromosSummary || 'Sem promoções de fidelidade ativas.',
    ``,
    crmBlock,
    `Histórico de pedidos deste cliente:`,
    ordersSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function extractItemsFromMessage(
  state: DeliveryStoreState,
  userMessage: string,
): Array<{ menuItemId: string; quantity: number }> {
  const msg = userMessage.toLowerCase();
  const matchedItems: Array<{ menuItemId: string; quantity: number }> = [];
  const itemMatchers: Array<{ id: string; keywords: string[] }> = [
    { id: 'item-frango-brasa', keywords: ['frango', 'grelhado', 'brasa'] },
    { id: 'item-bife-acebolado', keywords: ['bife', 'acebolado', 'contrafil'] },
    { id: 'item-strogonoff', keywords: ['strogonoff', 'estrogonofe'] },
    { id: 'item-tilapia-limao', keywords: ['tilapia', 'tilápia', 'peixe'] },
    { id: 'item-feijoada', keywords: ['feijoada'] },
    { id: 'item-tropeiro', keywords: ['tropeiro'] },
    { id: 'item-suco-laranja', keywords: ['suco', 'laranja'] },
  ];

  for (const matcher of itemMatchers) {
    const foundKw = matcher.keywords.find((kw) => msg.includes(kw));
    if (foundKw) {
      const qtyRegex = new RegExp(
        `(\\d+)\\s*(?:x|marmitas?|unidades?|de)?\\s*[^,.]*${foundKw}`,
        'i',
      );
      const qtyMatch = msg.match(qtyRegex);
      const qty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
      matchedItems.push({ menuItemId: matcher.id, quantity: qty });
    }
  }

  for (const item of state.menuItems) {
    if (matchedItems.some((m) => m.menuItemId === item.id)) continue;
    const words = item.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    if (words.some((w) => msg.includes(w))) {
      matchedItems.push({ menuItemId: item.id, quantity: 1 });
    }
  }

  return matchedItems;
}

function extractDeliveryAndPayment(
  state: DeliveryStoreState,
  userMessage: string,
): {
  deliveryMode?: DeliveryMode;
  address?: string;
  paymentMethod?: PaymentMethod;
  couponCode?: string;
} {
  const msg = userMessage.toLowerCase();
  const isPickup =
    msg.includes('retirada') ||
    msg.includes('retirar') ||
    msg.includes('balcão') ||
    msg.includes('balcao') ||
    msg.includes('buscar aí') ||
    msg.includes('buscar ai');
  const isDelivery =
    msg.includes('entregar') ||
    msg.includes('entrega') ||
    msg.includes('delivery') ||
    msg.includes('rua ') ||
    msg.includes('av ') ||
    msg.includes('av.') ||
    msg.includes('avenida ');

  let deliveryMode: DeliveryMode | undefined;
  if (isPickup) deliveryMode = 'retirada';
  else if (isDelivery) deliveryMode = 'entrega';

  let address: string | undefined;
  const addrMatch = userMessage.match(
    /(?:rua|av\.?|avenida|travessa|alameda)\s+[^;\n]+?(?=(?:,\s*pag|\s+pag|\s+no\s+pix|\s+em\s+dinheiro|\s+no\s+cart|$))/i,
  );
  if (addrMatch) {
    address = addrMatch[0].replace(/,\s*$/, '').trim();
  }

  let paymentMethod: PaymentMethod | undefined;
  if (msg.includes('pix')) {
    paymentMethod = 'pix';
  } else if (
    msg.includes('cartão') ||
    msg.includes('cartao') ||
    msg.includes('crédito') ||
    msg.includes('credito') ||
    msg.includes('débito') ||
    msg.includes('debito') ||
    msg.includes('maquininha')
  ) {
    paymentMethod = 'cartao_entrega';
  } else if (msg.includes('dinheiro')) {
    paymentMethod = 'dinheiro';
  } else if (msg.includes('online')) {
    paymentMethod = 'pagamento_online';
  }

  const couponMatch = state.coupons.find(
    (c) => c.active && msg.includes(c.code.toLowerCase()),
  );

  return {
    deliveryMode,
    address,
    paymentMethod,
    couponCode: couponMatch?.code,
  };
}

function generateLocalBrendiFallback(params: {
  state: DeliveryStoreState;
  customerPhone: string;
  customerName: string;
  userMessage: string;
}): {
  reply: string;
  createdOrder?: Order;
  stockMovements?: StockMovement[];
  handoffTriggered?: boolean;
} {
  const { state, customerPhone, customerName, userMessage } = params;
  const msg = userMessage.toLowerCase().trim();
  const evo = state.store.evolution;
  const assistantName = evo.assistantName?.trim() || 'Brenda';
  const tone = evo.tone || 'acolhedor';
  const rawBaseUrl = (process.env.APP_URL ?? 'https://pedidofacil.local')
    .trim()
    .replace(/\/+$/, '');
  const appUrl = rawBaseUrl.endsWith('/cardapio')
    ? rawBaseUrl
    : `${rawBaseUrl}/cardapio`;
  const cleanPhone = customerPhone.replace(/\D/g, '') || 'anonimo';
  const drafts = getOrderDrafts();

  const crmCustomer = findCustomerByPhone(state.customers, customerPhone);
  const resolvedName = crmCustomer?.name || customerName;
  const firstName = resolvedName.split(' ')[0] || resolvedName || 'cliente';
  const customerOrders = getCustomerOrders(
    state.orders,
    crmCustomer,
    customerPhone,
  );
  const redeemableRewards = crmCustomer
    ? getAvailableRewardsForCustomer(
        crmCustomer.pointsBalance,
        state.loyaltyRewards,
      )
    : [];

  // 1. Human Handoff detection
  if (
    evo.humanHandoffEnabled !== false &&
    (msg.includes('atendente') ||
      msg.includes('humano') ||
      msg.includes('falar com algu') ||
      msg.includes('gerente') ||
      msg.includes('reclama'))
  ) {
    return {
      handoffTriggered: true,
      reply: `Claro, ${firstName}! Já chamei um atendente da nossa equipe para continuar com você por aqui. Em instantes alguém já te responde.`,
    };
  }

  // 2. Closed store handling
  const availability = getStoreAvailability(state.store);
  if (!availability.isOpen) {
    return {
      reply: `Oi, ${firstName}! Aqui é a ${assistantName}, da ${state.store.name}. No momento estamos fechados (funcionamos ${state.store.openingHours}). Assim que abrirmos, te atendo por aqui!`,
    };
  }

  // 3. Explicit Menu request (ONLY send menu when customer asks for it!)
  const askedForMenu =
    msg.includes('cardapio') ||
    msg.includes('cardápio') ||
    msg.includes('menu') ||
    msg.includes('o que tem') ||
    msg.includes('quais pratos') ||
    msg.includes('quais os pratos') ||
    msg.includes('quais opções') ||
    msg.includes('quais opcoes') ||
    msg.includes('opções de hoje') ||
    msg.includes('opcoes de hoje') ||
    msg.includes('manda as opções') ||
    msg.includes('manda as opcoes');

  if (askedForMenu) {
    const availableDishes = state.menuItems
      .filter(
        (i) =>
          i.available &&
          isMenuItemAvailableOnDay(i, availability.currentDayIndex),
      )
      .map(
        (i) => `• *${i.name}* — ${formatCurrencyBRL(i.promoPrice ?? i.price)}`,
      )
      .join('\n');

    return {
      reply: availableDishes
        ? `Claro, ${firstName}! Aqui estão as opções disponíveis hoje (${getWeekdayLabel(availability.currentDayIndex)}):\n\n${availableDishes}\n\nSe preferir ver fotos e montar adicionais, acesse: ${appUrl}\nOu me diga aqui o que vai querer que eu já anoto pra você!`
        : `Oi, ${firstName}! No momento não há pratos ativos no cardápio de hoje. Confira mais detalhes em: ${appUrl}`,
    };
  }

  // 4. Loyalty points, promotions & prizes check (CRM)
  const askedLoyalty =
    msg.includes('ponto') ||
    msg.includes('fidelidade') ||
    msg.includes('prêmio') ||
    msg.includes('premio') ||
    msg.includes('recompensa') ||
    msg.includes('clube') ||
    msg.includes('brinde');

  const askedRedeemWord =
    msg.includes('resgatar') ||
    msg.includes('usar meu prêmio') ||
    msg.includes('usar meu premio') ||
    msg.includes('usar prêmio') ||
    msg.includes('usar premio');

  if (askedLoyalty && !askedRedeemWord) {
    const activePromos = (state.loyaltyPromotions ?? []).filter((p) => p.active);
    const promoLine =
      activePromos.length > 0
        ? `\n\nPromoções de fidelidade ativas:\n${activePromos
            .map((p) => `• *${p.title}*: ${p.description}`)
            .join('\n')}`
        : '';

    if (crmCustomer) {
      if (redeemableRewards.length > 0) {
        const prizesList = redeemableRewards
          .map((r) => `• *${r.title}* (${r.pointsCost} pts)`)
          .join('\n');
        return {
          reply: `${firstName}, você está com *${crmCustomer.pointsBalance} pontos* no nosso Clube Fidelidade!\n\nVocê já pode resgatar agora:\n${prizesList}${promoLine}\n\nSe quiser usar algum prêmio no seu pedido hoje, é só me dizer qual!`,
        };
      }
      const nextReward = (state.loyaltyRewards ?? [])
        .filter((r) => r.active)
        .sort((a, b) => a.pointsCost - b.pointsCost)[0];
      const nextHint = nextReward
        ? ` Faltam apenas *${Math.max(0, nextReward.pointsCost - crmCustomer.pointsBalance)} pts* para liberar *${nextReward.title}* (${nextReward.pointsCost} pts).`
        : '';
      return {
        reply: `${firstName}, seu saldo atual é de *${crmCustomer.pointsBalance} pontos* no Clube Fidelidade.${nextHint}${promoLine}`,
      };
    }

    const activeRewards = (state.loyaltyRewards ?? []).filter((r) => r.active);
    return {
      reply: `No nosso Clube Fidelidade você acumula pontos a cada compra e troca por prêmios como ${
        activeRewards.length > 0
          ? activeRewards
              .slice(0, 3)
              .map((r) => `${r.title} (${r.pointsCost} pts)`)
              .join(', ')
          : 'descontos e brindes'
      }.${promoLine} Assim que fechar seu pedido por aqui já começamos a somar seus pontos!`,
    };
  }

  // 5. Order history / repeat last order check
  const askedHistory =
    msg.includes('último pedido') ||
    msg.includes('ultimo pedido') ||
    msg.includes('histórico') ||
    msg.includes('historico') ||
    msg.includes('o que costumo pedir') ||
    msg.includes('pedi da última') ||
    msg.includes('pedi da ultima');

  const wantsRepeatLast =
    msg.includes('repetir') ||
    msg.includes('o de sempre') ||
    msg.includes('mesmo pedido');

  if (askedHistory && !wantsRepeatLast) {
    if (customerOrders.length === 0) {
      return {
        reply: `Ainda não encontrei pedidos anteriores no seu cadastro, ${firstName}. Quer que eu te mande o cardápio de hoje para fazermos o primeiro?`,
      };
    }
    const last = customerOrders[0];
    const itemsText = last.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
    return {
      reply: `Seu último pedido por aqui foi o *#${last.orderNumber}*: ${itemsText} (${formatCurrencyBRL(last.total)})${
        crmCustomer?.address
          ? `, entrega em *${crmCustomer.address} - ${crmCustomer.neighborhood}*`
          : ''
      }. Quer repetir esse pedido hoje?`,
    };
  }

  // 6. Order status check
  const orderMatch = msg.match(/#?(\d{4})/);
  if (
    orderMatch ||
    msg.includes('status') ||
    msg.includes('meu pedido') ||
    msg.includes('cadê') ||
    msg.includes('cade') ||
    msg.includes('demora') ||
    msg.includes('saiu')
  ) {
    const targetNum = orderMatch ? Number(orderMatch[1]) : null;
    const foundOrder = targetNum
      ? state.orders.find((o) => o.orderNumber === targetNum)
      : customerOrders[0];

    if (foundOrder) {
      const courier = foundOrder.courierId
        ? state.couriers.find((c) => c.id === foundOrder.courierId)?.name
        : null;
      return {
        reply: `Seu pedido *#${foundOrder.orderNumber}* está *${ORDER_STATUS_META[foundOrder.status].label}*${courier ? ` com o entregador ${courier}` : ''}. Previsão média de ${state.store.estimatedMinutes} min.`,
      };
    }
    return {
      reply: `Não encontrei um pedido recente no seu número, ${firstName}. Me passa o número do pedido (ex.: #1041) que eu consulto na hora!`,
    };
  }

  // 7. Multi-turn conversational order flow (items + CRM saved address + reward redemption + payment)
  let mentionedItems = extractItemsFromMessage(state, userMessage);
  if (wantsRepeatLast && customerOrders.length > 0 && mentionedItems.length === 0) {
    mentionedItems = customerOrders[0].items
      .filter((i) => {
        const menu = state.menuItems.find((m) => m.id === i.menuItemId);
        return (
          menu &&
          menu.available &&
          isMenuItemAvailableOnDay(menu, availability.currentDayIndex)
        );
      })
      .map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }));
  }

  const offDayMentioned = mentionedItems.find((mi) => {
    const dish = state.menuItems.find((m) => m.id === mi.menuItemId);
    return dish && !isMenuItemAvailableOnDay(dish, availability.currentDayIndex);
  });
  if (offDayMentioned) {
    const dish = state.menuItems.find((m) => m.id === offDayMentioned.menuItemId);
    if (dish) {
      return {
        reply: `Poxa, ${firstName}, o *${dish.name}* não entra no cardápio de hoje (${getWeekdayLabel(availability.currentDayIndex)}). Ele é servido apenas: *${formatMenuItemDaysLabel(dish.availableDays)}*! Quer que eu te passe as opções de hoje?`,
      };
    }
  }

  const details = extractDeliveryAndPayment(state, userMessage);
  const existingDraft = drafts[cleanPhone];

  // Detect saved CRM address confirmation
  const confirmedSavedAddressPhrase =
    msg.includes('meu endereço') ||
    msg.includes('meu endereco') ||
    msg.includes('mesmo endereço') ||
    msg.includes('mesmo endereco') ||
    msg.includes('endereço de sempre') ||
    msg.includes('endereco de sempre') ||
    msg.includes('endereço cadastrado') ||
    msg.includes('endereco cadastrado') ||
    (Boolean(existingDraft?.offeredSavedAddress) &&
      (msg === 'sim' ||
        msg.startsWith('sim,') ||
        msg.startsWith('sim ') ||
        msg.includes('pode ser') ||
        msg.includes('esse mesmo') ||
        msg.includes('nesse mesmo')));

  // Detect reward redemption request
  let matchedReward =
    redeemableRewards.find((r) => {
      const titleLower = r.title.toLowerCase();
      if (msg.includes(titleLower)) return true;
      if (
        (msg.includes('frete') || msg.includes('entrega grátis') || msg.includes('entrega gratis')) &&
        r.type === 'frete_gratis'
      ) {
        return true;
      }
      if (msg.includes('suco') && r.type === 'brinde_item') return true;
      if (
        (askedRedeemWord || msg.includes('desconto') || msg.includes('prêmio') || msg.includes('premio')) &&
        (r.type === 'desconto_valor' || r.type === 'desconto_percentual')
      ) {
        return true;
      }
      return false;
    }) ?? undefined;

  if (askedRedeemWord && !matchedReward && redeemableRewards.length > 0) {
    matchedReward = redeemableRewards[0];
  }

  // Check if customer is asking price/info about a single dish without ordering intent yet
  const isPureQuestion =
    (msg.includes('qual') ||
      msg.includes('quanto') ||
      msg.includes('valor') ||
      msg.includes('preço') ||
      msg.includes('preco') ||
      msg.includes('vem o que') ||
      msg.includes('tem ')) &&
    !msg.includes('quero') &&
    !msg.includes('manda') &&
    !msg.includes('fechar') &&
    !msg.includes('pedir') &&
    !existingDraft;

  if (isPureQuestion && mentionedItems.length > 0) {
    const item = state.menuItems.find((m) => m.id === mentionedItems[0].menuItemId);
    if (item) {
      const price = item.promoPrice ?? item.price;
      return item.available
        ? {
            reply: `O *${item.name}* está saindo por *${formatCurrencyBRL(price)}* (${item.serves}) e vai com ${item.description.toLowerCase()} Quer que eu anote um pra você?`,
          }
        : {
            reply: `Poxa, o *${item.name}* esgotou agora há pouco. Quer que eu te passe as outras opções disponíveis hoje?`,
          };
    }
  }

  if (
    mentionedItems.length > 0 ||
    (existingDraft &&
      (details.deliveryMode ||
        details.address ||
        details.paymentMethod ||
        details.couponCode ||
        confirmedSavedAddressPhrase ||
        Boolean(matchedReward)))
  ) {
    const draft: OrderDraftState = existingDraft
      ? {
          items: [...existingDraft.items],
          deliveryMode: existingDraft.deliveryMode,
          address: existingDraft.address,
          neighborhood: existingDraft.neighborhood,
          paymentMethod: existingDraft.paymentMethod,
          couponCode: existingDraft.couponCode,
          loyaltyRewardId: existingDraft.loyaltyRewardId,
          offeredSavedAddress: existingDraft.offeredSavedAddress,
        }
      : { items: [] };

    for (const mi of mentionedItems) {
      const idx = draft.items.findIndex((x) => x.menuItemId === mi.menuItemId);
      if (idx >= 0) {
        draft.items[idx] = {
          ...draft.items[idx],
          quantity: draft.items[idx].quantity + mi.quantity,
        };
      } else {
        draft.items.push(mi);
      }
    }

    if (details.deliveryMode) draft.deliveryMode = details.deliveryMode;
    if (confirmedSavedAddressPhrase && crmCustomer?.address) {
      draft.address = crmCustomer.address;
      draft.neighborhood = crmCustomer.neighborhood || state.store.neighborhood;
      if (!draft.deliveryMode) draft.deliveryMode = 'entrega';
    } else if (details.address) {
      draft.address = details.address;
      if (!draft.deliveryMode) draft.deliveryMode = 'entrega';
    }
    if (details.paymentMethod) draft.paymentMethod = details.paymentMethod;
    if (details.couponCode) draft.couponCode = details.couponCode;
    if (matchedReward) draft.loyaltyRewardId = matchedReward.id;

    drafts[cleanPhone] = draft;

    const itemNames = draft.items
      .map((i) => {
        const dish = state.menuItems.find((m) => m.id === i.menuItemId);
        return dish ? `${i.quantity}x ${dish.name}` : null;
      })
      .filter(Boolean)
      .join(', ');

    if (evo.allowAiOrderCreation !== false && draft.items.length > 0) {
      if (!draft.deliveryMode) {
        const hasDrink = draft.items.some((i) => i.menuItemId === 'item-suco-laranja');
        const upsell =
          evo.upsellEnabled !== false && !hasDrink
            ? ' Se quiser incluir um *Suco Natural de Laranja*, é só me falar!'
            : '';
        const rewardHint =
          !draft.loyaltyRewardId && redeemableRewards.length > 0
            ? ` Aliás, você tem *${crmCustomer?.pointsBalance} pontos* e já pode resgatar *${redeemableRewards[0].title}* se quiser!`
            : '';
        return {
          reply: `Anotado, ${firstName}: *${itemNames}*! Vai ser para *entrega* ou *retirada no balcão*?${upsell}${rewardHint}`,
        };
      }

      if (draft.deliveryMode === 'entrega' && !draft.address) {
        if (crmCustomer?.address && !draft.offeredSavedAddress) {
          draft.offeredSavedAddress = true;
          drafts[cleanPhone] = draft;
          return {
            reply: `Perfeito, ${firstName}! Mando no seu endereço cadastrado (*${crmCustomer.address}${
              crmCustomer.complement ? `, ${crmCustomer.complement}` : ''
            } - ${crmCustomer.neighborhood}*) ou prefere outro endereço?`,
          };
        }
        return {
          reply: `Perfeito, vamos entregar! Qual é o *endereço completo* (rua e número) para a entrega?`,
        };
      }

      if (!draft.paymentMethod) {
        const appliedRewardNotice = draft.loyaltyRewardId
          ? ` (com resgate de *${
              redeemableRewards.find((r) => r.id === draft.loyaltyRewardId)?.title ||
              'prêmio fidelidade'
            }*)`
          : '';
        return {
          reply: `Combinado (${
            draft.deliveryMode === 'retirada'
              ? 'retirada no balcão'
              : `entrega em ${draft.address}`
          })${appliedRewardNotice}! E como você prefere pagar: *Pix*, *cartão na entrega* ou *dinheiro*?`,
        };
      }

      // All fields complete -> create real order in kitchen + award CRM points!
      const created = createOrderFromBot({
        state,
        customerPhone,
        customerName: resolvedName,
        args: {
          items: draft.items,
          deliveryMode: draft.deliveryMode,
          address: draft.address,
          neighborhood:
            draft.neighborhood ||
            crmCustomer?.neighborhood ||
            state.store.neighborhood,
          paymentMethod: draft.paymentMethod,
          couponCode: draft.couponCode,
          loyaltyRewardId: draft.loyaltyRewardId,
        },
      });

      if (created.ok && created.order) {
        delete drafts[cleanPhone];
        const paymentLine =
          created.order.paymentMethod === 'pix'
            ? 'Pagamento via *Pix* (chave: casadotempero@pix.com.br).'
            : `Pagamento: *${created.order.paymentMethod.replace('_', ' ')}*.`;

        const rewardLine = created.order.loyaltyRewardTitle
          ? `\n• Prêmio aplicado: *${created.order.loyaltyRewardTitle}*`
          : '';
        const pointsLine =
          created.pointsEarned && created.pointsEarned > 0
            ? `\n• Clube Fidelidade: *+${created.pointsEarned} pontos ganhos* (saldo atual: *${created.newPointsBalance ?? 0} pts*)`
            : '';

        return {
          createdOrder: created.order,
          stockMovements: created.stockMovements,
          reply: `Prontinho, ${firstName}! Pedido *#${created.order.orderNumber}* enviado para a cozinha.\n• Itens: ${itemNames}\n• ${
            created.order.deliveryMode === 'retirada'
              ? 'Retirada no Balcão'
              : `Entrega: ${created.order.address}`
          }${rewardLine}\n• Total: *${formatCurrencyBRL(created.order.total)}*\n• ${paymentLine}${pointsLine}\n\nPrevisão média de *${state.store.estimatedMinutes} min*. Te aviso por aqui quando sair!`,
        };
      }
    } else if (matchedReward) {
      return {
        reply: `Anotado, ${firstName}! Vou aplicar o prêmio *${matchedReward.title}* no seu pedido. Qual prato você vai querer hoje?`,
      };
    }
  }

  // 8. Coupons / promos question
  if (msg.includes('cupom') || msg.includes('desconto') || msg.includes('promo')) {
    const activeCoupons = state.coupons.filter((c) => c.active);
    const activeLoyaltyPromos = (state.loyaltyPromotions ?? []).filter((p) => p.active);
    const loyaltyPart =
      activeLoyaltyPromos.length > 0
        ? `\n\nE no Clube Fidelidade temos:\n${activeLoyaltyPromos
            .map((p) => `• *${p.title}*: ${p.description}`)
            .join('\n')}`
        : '';
    if (activeCoupons.length === 0) {
      return {
        reply: `Hoje estamos sem cupom ativo, mas pedidos acima de *${formatCurrencyBRL(state.store.freeDeliveryMin)}* têm *entrega grátis*!${loyaltyPart}`,
      };
    }
    const list = activeCoupons
      .map(
        (c) =>
          `• *${c.code}*: ${c.type === 'percent' ? `${c.value}% OFF` : `${formatCurrencyBRL(c.value)} OFF`} (mín. ${formatCurrencyBRL(c.minOrderValue)})`,
      )
      .join('\n');
    return {
      reply: `Temos estes cupons ativos hoje:\n${list}${loyaltyPart}\n\nÉ só me dizer o nome do cupom quando for fechar seu pedido!`,
    };
  }

  // 9. Delivery fee / hours / payment info
  if (
    msg.includes('entrega') ||
    msg.includes('taxa') ||
    msg.includes('frete') ||
    msg.includes('horário') ||
    msg.includes('horario') ||
    msg.includes('pagamento') ||
    msg.includes('pix')
  ) {
    return {
      reply: `Atendemos *${state.store.openingHours}*. A taxa de entrega é *${formatCurrencyBRL(state.store.deliveryFee)}* (grátis acima de *${formatCurrencyBRL(state.store.freeDeliveryMin)}*) com previsão média de *${state.store.estimatedMinutes} min*. Aceitamos Pix, Cartão, Dinheiro e Pagamento Online. Posso anotar seu pedido ou te mandar o cardápio?`,
    };
  }

  // 10. Generic "want to order" without specifying dish yet -> natural reply, no giant menu dump
  if (
    msg.includes('fazer um pedido') ||
    msg.includes('quero pedir') ||
    msg.includes('pedir almoço') ||
    msg.includes('pedir almoco') ||
    msg.includes('quero uma marmita')
  ) {
    const lastOrderHint =
      customerOrders.length > 0
        ? ` Quer repetir o último (*${customerOrders[0].items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}*) ou prefere ver o cardápio de hoje?`
        : ' Você já sabe qual prato vai querer hoje ou prefere que eu te mande o cardápio?';
    return {
      reply: `Com certeza, ${firstName}!${lastOrderHint}`,
    };
  }

  // 11. Natural, short greeting (NO menu dump, NO giant text!) — recognizes CRM customer!
  const isGreeting =
    msg.includes('oi') ||
    msg.includes('olá') ||
    msg.includes('ola') ||
    msg.includes('bom dia') ||
    msg.includes('boa tarde') ||
    msg.includes('boa noite') ||
    msg.includes('tudo bem') ||
    msg.includes('opa') ||
    msg.includes('e ai') ||
    msg.includes('e aí') ||
    msg.includes('alo') ||
    msg.includes('alô');

  if (isGreeting) {
    const loyaltyGreetingHint =
      crmCustomer && redeemableRewards.length > 0
        ? ` Vi aqui que você já tem *${crmCustomer.pointsBalance} pontos* no Clube Fidelidade e pode resgatar *${redeemableRewards[0].title}* hoje!`
        : '';

    if (tone === 'descontraido') {
      return {
        reply: `Oi, ${firstName}! Tudo ótimo por aqui e com você? Sou a ${assistantName}, da ${state.store.name}.${loyaltyGreetingHint} Como posso te ajudar hoje?`,
      };
    }
    if (tone === 'objetivo') {
      return {
        reply: `Olá, ${firstName}! Aqui é a ${assistantName}, da ${state.store.name}.${loyaltyGreetingHint} Como posso te ajudar agora?`,
      };
    }
    return {
      reply: `Oi, ${firstName}! Tudo bem? Aqui é a ${assistantName}, da ${state.store.name}.${loyaltyGreetingHint} Como posso te ajudar hoje?`,
    };
  }

  // 12. Polite acknowledgements / closing
  if (
    msg.includes('obrigad') ||
    msg.includes('valeu') ||
    msg.includes('perfeito') ||
    msg === 'ok' ||
    msg === 'beleza' ||
    msg === 'show'
  ) {
    return {
      reply: `Imagina, ${firstName}! Qualquer coisa que precisar, é só me chamar por aqui.`,
    };
  }

  // 13. Conversational fallback without dumping menu
  return {
    reply: `Entendi, ${firstName}! Se quiser ver o cardápio de hoje, consultar seus pontos de fidelidade ou já fazer seu pedido, é só me falar por aqui.`,
  };
}

export async function generateBrendiBotReply(params: {
  state: DeliveryStoreState;
  phone: string;
  customerName: string;
  userMessage: string;
}): Promise<{
  reply: string;
  engine: 'openai' | 'assistente_local';
  createdOrder?: Order;
  stockMovements?: StockMovement[];
  handoffTriggered?: boolean;
  pausedForHuman?: boolean;
  optOutTriggered?: boolean;
}> {
  const { state, phone, customerName, userMessage } = params;
  const cleanPhone = phone.replace(/\D/g, '') || 'anonimo';
  const evo = state.store.evolution;
  const normalizedMsg = userMessage.toLowerCase().trim();
  const crmCustomer = findCustomerByPhone(state.customers, phone);
  const resolvedCustomerName = crmCustomer?.name || customerName;

  // Anti-Ban Opt-Out compliance: immediately honor STOP/PARAR requests
  const optOutKeywords = [
    'parar',
    'sair',
    'stop',
    'descadastrar',
    'cancelar mensagens',
    'não quero receber',
    'nao quero receber',
    'pare de mandar',
  ];
  const isOptOutRequest =
    evo.optOutEnabled !== false &&
    optOutKeywords.some(
      (kw) =>
        normalizedMsg === kw ||
        (kw.length > 4 && normalizedMsg.includes(kw)),
    );

  if (isOptOutRequest) {
    const currentOptOut = evo.optOutPhones ?? [];
    if (
      cleanPhone.length >= 8 &&
      !currentOptOut.some((p) =>
        p.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)),
      )
    ) {
      evo.optOutPhones = [...currentOptOut, cleanPhone];
    }
    const firstName = resolvedCustomerName.split(' ')[0] || 'cliente';
    return {
      reply: `Tudo bem, ${firstName}! Removi seu número da nossa lista de mensagens automáticas. Você não receberá mais avisos ou ofertas por aqui.`,
      engine: 'assistente_local',
      optOutTriggered: true,
    };
  }

  const handoffList = evo.humanHandoffPhones ?? [];

  if (
    cleanPhone.length >= 8 &&
    handoffList.some((p) => p.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)))
  ) {
    return {
      reply: '',
      engine: 'assistente_local',
      pausedForHuman: true,
    };
  }

  const memory = getSessionMemory();
  const history = memory[cleanPhone] ?? [];
  const systemPrompt = buildStoreContextPrompt(state, phone, resolvedCustomerName);
  const recentTurns = history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let reply = '';
  let engine: 'openai' | 'assistente_local' = 'assistente_local';
  let createdOrder: Order | undefined;
  let stockMovements: StockMovement[] | undefined;
  let handoffTriggered = false;

  const openAiCfg = getOpenAiRuntimeConfig();

  if (openAiCfg.isConfigured) {
    try {
      const tools = [
        ...(state.store.evolution.allowAiOrderCreation !== false
          ? [
              {
                type: 'function',
                function: {
                  name: 'create_whatsapp_order',
                  description:
                    'Cria um pedido real na cozinha quando o cliente informou pratos, entrega/retirada e forma de pagamento. Pode usar o endereço salvo do CRM e resgatar prêmios de fidelidade.',
                  parameters: {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            menuItemId: { type: 'string' },
                            quantity: { type: 'number' },
                            notes: { type: 'string' },
                          },
                          required: ['menuItemId', 'quantity'],
                        },
                      },
                      deliveryMode: {
                        type: 'string',
                        enum: ['entrega', 'retirada'],
                      },
                      address: { type: 'string' },
                      neighborhood: { type: 'string' },
                      useSavedAddress: {
                        type: 'boolean',
                        description:
                          'Defina como true quando o cliente confirmar entrega no endereço cadastrado no CRM.',
                      },
                      paymentMethod: {
                        type: 'string',
                        enum: [
                          'pix',
                          'cartao_entrega',
                          'dinheiro',
                          'pagamento_online',
                        ],
                      },
                      changeFor: { type: 'number' },
                      couponCode: { type: 'string' },
                      loyaltyRewardId: {
                        type: 'string',
                        description:
                          'ID de um prêmio elegível da Ficha CRM caso o cliente peça ou aceite resgatar neste pedido.',
                      },
                      notes: { type: 'string' },
                    },
                    required: ['items', 'deliveryMode', 'paymentMethod'],
                  },
                },
              },
            ]
          : []),
        ...(state.store.evolution.humanHandoffEnabled !== false
          ? [
              {
                type: 'function',
                function: {
                  name: 'request_human_handoff',
                  description:
                    'Transfere o atendimento para um operador humano e pausa a IA para este cliente.',
                  parameters: {
                    type: 'object',
                    properties: {
                      reason: { type: 'string' },
                    },
                    required: ['reason'],
                  },
                },
              },
            ]
          : []),
      ];

      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...recentTurns,
        { role: 'user', content: userMessage },
      ];

      const firstRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiCfg.apiKey}`,
        },
        body: JSON.stringify({
          model: openAiCfg.model,
          temperature: 0.45,
          max_tokens: 340,
          messages: messagesPayload,
          tools: tools.length > 0 ? tools : undefined,
        }),
      });

      if (firstRes.ok) {
        const json = (await firstRes.json()) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id: string;
                function: { name: string; arguments: string };
              }>;
            };
          }>;
        };

        const msgChoice = json.choices?.[0]?.message;
        const toolCalls = msgChoice?.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          const toolResults: Array<{
            role: 'tool';
            tool_call_id: string;
            content: string;
          }> = [];

          for (const tc of toolCalls) {
            if (tc.function.name === 'create_whatsapp_order') {
              const args = JSON.parse(
                tc.function.arguments || '{}',
              ) as CreateWhatsappOrderArgs;
              const result = createOrderFromBot({
                state,
                customerPhone: phone,
                customerName: resolvedCustomerName,
                args,
              });
              if (result.ok && result.order) {
                createdOrder = result.order;
                stockMovements = result.stockMovements;
                toolResults.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    ok: true,
                    orderNumber: result.order.orderNumber,
                    total: result.order.total,
                    deliveryMode: result.order.deliveryMode,
                    estimatedMinutes: state.store.estimatedMinutes,
                    pointsEarned: result.pointsEarned ?? 0,
                    newPointsBalance: result.newPointsBalance ?? null,
                    appliedRewardTitle: result.order.loyaltyRewardTitle ?? null,
                  }),
                });
              } else {
                toolResults.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: JSON.stringify({ ok: false, error: result.error }),
                });
              }
            } else if (tc.function.name === 'request_human_handoff') {
              handoffTriggered = true;
              const currentList = state.store.evolution.humanHandoffPhones ?? [];
              if (!currentList.some((p) => p.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)))) {
                state.store.evolution.humanHandoffPhones = [
                  ...currentList,
                  cleanPhone,
                ];
              }
              toolResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ ok: true, transferred: true }),
              });
            }
          }

          const secondRes = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openAiCfg.apiKey}`,
              },
              body: JSON.stringify({
                model: openAiCfg.model,
                temperature: 0.45,
                max_tokens: 340,
                messages: [...messagesPayload, msgChoice, ...toolResults],
              }),
            },
          );

          if (secondRes.ok) {
            const secondJson = (await secondRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const finalContent = secondJson.choices?.[0]?.message?.content?.trim();
            if (finalContent) {
              reply = finalContent;
              engine = 'openai';
            }
          }
        } else if (msgChoice?.content?.trim()) {
          reply = msgChoice.content.trim();
          engine = 'openai';
        }
      }
    } catch {
      // Fall through to natural local Brendi assistant
    }
  }

  if (!reply) {
    const localRes = generateLocalBrendiFallback({
      state,
      customerPhone: phone,
      customerName: resolvedCustomerName,
      userMessage,
    });
    reply = localRes.reply;
    engine = 'assistente_local';
    if (localRes.createdOrder) {
      createdOrder = localRes.createdOrder;
      stockMovements = localRes.stockMovements;
    }
    if (localRes.handoffTriggered) {
      handoffTriggered = true;
      const currentList = state.store.evolution.humanHandoffPhones ?? [];
      if (!currentList.some((p) => p.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)))) {
        state.store.evolution.humanHandoffPhones = [...currentList, cleanPhone];
      }
    }
  }

  const now = new Date().toISOString();
  memory[cleanPhone] = [
    ...history.slice(-10),
    { role: 'user', content: userMessage, at: now },
    { role: 'assistant', content: reply, at: now },
  ];

  return {
    reply,
    engine,
    createdOrder,
    stockMovements,
    handoffTriggered,
  };
}
