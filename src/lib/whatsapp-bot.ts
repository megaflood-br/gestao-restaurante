import { formatCurrencyBRL, ORDER_STATUS_META } from '@/lib/formatters';
import { applyOrderStockDeduction } from '@/lib/stock-engine';
import type {
  DeliveryMode,
  DeliveryStoreState,
  Order,
  OrderItem,
  PaymentMethod,
  StockMovement,
  WhatsappSessionMessage,
} from '@/types/delivery';

declare global {
  var __whatsappSessionMemory:
    | Record<string, WhatsappSessionMessage[]>
    | undefined;
}

function getSessionMemory(): Record<string, WhatsappSessionMessage[]> {
  if (!globalThis.__whatsappSessionMemory) {
    globalThis.__whatsappSessionMemory = {};
  }
  return globalThis.__whatsappSessionMemory;
}

export function isOpenAiConfigured(): boolean {
  const key = (process.env.OPENAI_API_KEY ?? '').trim();
  return Boolean(key) && key !== 'MY_OPENAI_API_KEY';
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
  paymentMethod: PaymentMethod;
  changeFor?: number;
  couponCode?: string;
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
  error?: string;
} {
  const { state, customerPhone, customerName, args } = params;

  if (!state.store.isOpen) {
    return {
      ok: false,
      stockMovements: [],
      error: `A loja está fechada no momento. Horário: ${state.store.openingHours}.`,
    };
  }

  const orderItems: OrderItem[] = [];
  for (const reqItem of args.items) {
    const found = state.menuItems.find(
      (m) =>
        m.id === reqItem.menuItemId ||
        m.name.toLowerCase().includes(reqItem.menuItemId.toLowerCase()),
    );
    if (!found || !found.available) continue;
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
      error: 'Nenhum prato disponível foi identificado no pedido.',
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
  const deliveryFee =
    deliveryMode === 'retirada'
      ? 0
      : subtotal >= state.store.freeDeliveryMin
        ? 0
        : state.store.deliveryFee;

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

  const newOrder: Order = {
    id: `ord-${nextNumber}-${Date.now()}`,
    orderNumber: nextNumber,
    source: 'whatsapp',
    customerName: customerName.trim() || 'Cliente WhatsApp',
    customerPhone: customerPhone.replace(/\D/g, ''),
    address:
      deliveryMode === 'retirada'
        ? 'Retirada no Balcão'
        : args.address?.trim() || 'Endereço informado via WhatsApp',
    neighborhood:
      deliveryMode === 'retirada'
        ? state.store.neighborhood
        : args.neighborhood?.trim() || state.store.neighborhood,
    deliveryMode,
    paymentMethod: args.paymentMethod || 'pix',
    changeFor: args.changeFor,
    couponCode: appliedCoupon,
    subtotal,
    deliveryFee,
    discount,
    total,
    status: 'pendente',
    notes: args.notes?.trim() || 'Pedido fechado pelo Atendimento Virtual IA',
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

  state.orders = [newOrder, ...state.orders];

  return {
    ok: true,
    order: newOrder,
    stockMovements: stockResult.newMovements,
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
      ? 'Use um tom leve, simpático e próximo, com entusiasmo moderado e formatação clara para WhatsApp.'
      : tone === 'objetivo'
        ? 'Use um tom direto, educado e eficiente, focando em agilidade e clareza.'
        : 'Use um tom acolhedor, gentil e atencioso, típico de atendimento premium estilo Brendi.';

  const cleanPhone = customerPhone.replace(/\D/g, '');
  const customerOrders = state.orders
    .filter((o) =>
      o.customerPhone.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)),
    )
    .slice(0, 3);

  const menuSummary = state.menuItems
    .map((item) => {
      const price = item.promoPrice ?? item.price;
      const status = item.available ? 'Disponível' : 'Esgotado';
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
          .map(
            (o) =>
              `- Pedido #${o.orderNumber}: status "${ORDER_STATUS_META[o.status].label}", total ${formatCurrencyBRL(o.total)}, modalidade ${o.deliveryMode}.`,
          )
          .join('\n')
      : 'Nenhum pedido recente encontrado para este telefone.';

  const appUrl = (process.env.APP_URL ?? 'https://pedidofacil.local').trim();

  return [
    `Você é ${assistantName}, atendente virtual oficial de WhatsApp do restaurante "${state.store.name}" (${state.store.segment}), operando nos moldes da plataforma Brendi Atendimento Virtual.`,
    toneInstruction,
    `Regras de atendimento:`,
    `1. Responda sempre em português do Brasil, em mensagens curtas, bem escaneáveis para WhatsApp (*negrito* quando útil).`,
    `2. Nunca invente pratos, preços ou promoções que não estejam no cardápio abaixo.`,
    `3. Sempre que o cliente pedir o cardápio ou preferir montar os adicionais visualmente, envie também o link: ${appUrl}`,
    evo.allowAiOrderCreation !== false
      ? `4. Quando o cliente informar os pratos desejados, modalidade (entrega com endereço ou retirada) e forma de pagamento (pix, cartao_entrega, dinheiro ou pagamento_online), chame a função "create_whatsapp_order" para registrar o pedido real na cozinha e informe o número do pedido gerado.`
      : `4. Para finalizar pedidos, oriente o cliente a clicar no link do cardápio digital (${appUrl}).`,
    evo.upsellEnabled !== false
      ? `5. Antes de finalizar ou quando o cliente pedir apenas um prato, faça uma sugestão natural de bebida (ex.: Suco Natural de Laranja) ou acompanhamento (ex.: Feijão Tropeiro).`
      : `5. Mantenha o foco apenas nos itens solicitados pelo cliente.`,
    evo.humanHandoffEnabled !== false
      ? `6. Se o cliente pedir para falar com um atendente humano, gerente ou relatar um problema urgente, chame a função "request_human_handoff" imediatamente.`
      : `6. Responda todas as dúvidas diretamente.`,
    evo.customInstructions
      ? `7. Instruções específicas do restaurante: ${evo.customInstructions}`
      : ``,
    ``,
    `Dados atuais da loja:`,
    `- Nome: ${state.store.name}`,
    `- Status agora: ${state.store.isOpen ? 'ABERTA recebendo pedidos' : 'FECHADA no momento'}`,
    `- Horário: ${state.store.openingHours}`,
    `- Endereço para retirada: ${state.store.address}, ${state.store.neighborhood}`,
    `- Taxa de entrega padrão: ${formatCurrencyBRL(state.store.deliveryFee)} (frete grátis a partir de ${formatCurrencyBRL(state.store.freeDeliveryMin)})`,
    `- Previsão média: ${state.store.estimatedMinutes} minutos`,
    `- Formas de pagamento: Pix, Cartão na entrega, Dinheiro (com troco) e Pagamento Online.`,
    ``,
    `Cardápio atual:`,
    menuSummary,
    ``,
    `Cupons ativos:`,
    couponsSummary || 'Nenhum cupom ativo no momento.',
    ``,
    `Cliente atual: ${customerName} (${customerPhone})`,
    `Pedidos recentes deste cliente:`,
    ordersSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function tryParseLocalOrder(
  state: DeliveryStoreState,
  userMessage: string,
): CreateWhatsappOrderArgs | null {
  const msg = userMessage.toLowerCase();
  const wantsOrder =
    msg.includes('quero') ||
    msg.includes('manda') ||
    msg.includes('envia') ||
    msg.includes('pedir') ||
    msg.includes('fechar') ||
    msg.includes('entregar') ||
    msg.includes('retirar') ||
    msg.includes('retirada');

  if (!wantsOrder) return null;

  const matchedItems: Array<{ menuItemId: string; quantity: number }> = [];
  const itemMatchers: Array<{ id: string; keywords: string[] }> = [
    { id: 'item-frango-brasa', keywords: ['frango', 'grelhado', 'brasa'] },
    { id: 'item-bife-acebolado', keywords: ['bife', 'acebolado', 'contrafil'] },
    { id: 'item-strogonoff', keywords: ['strogonoff', 'estrogonofe'] },
    { id: 'item-tilapia-limao', keywords: ['tilapia', 'tilápia', 'peixe'] },
    { id: 'item-tropeiro', keywords: ['tropeiro'] },
    { id: 'item-suco-laranja', keywords: ['suco', 'laranja'] },
  ];

  for (const matcher of itemMatchers) {
    const foundKw = matcher.keywords.find((kw) => msg.includes(kw));
    if (foundKw) {
      const qtyRegex = new RegExp(`(\\d+)\\s*(?:x|marmitas?|unidades?|de)?\\s*[^,.]*${foundKw}`, 'i');
      const qtyMatch = msg.match(qtyRegex);
      const qty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
      matchedItems.push({ menuItemId: matcher.id, quantity: qty });
    }
  }

  // Also check dynamically added menu items by name words
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

  if (matchedItems.length === 0) return null;

  const isPickup =
    msg.includes('retirada') ||
    msg.includes('retirar') ||
    msg.includes('balcão') ||
    msg.includes('balcao');
  const isDelivery =
    msg.includes('entregar') ||
    msg.includes('entrega') ||
    msg.includes('rua ') ||
    msg.includes('av ') ||
    msg.includes('avenida ');

  const hasPayment =
    msg.includes('pix') ||
    msg.includes('cartão') ||
    msg.includes('cartao') ||
    msg.includes('dinheiro') ||
    msg.includes('online');

  if (!isPickup && !isDelivery && !hasPayment) {
    return null;
  }

  let paymentMethod: PaymentMethod = 'pix';
  if (msg.includes('cartão') || msg.includes('cartao') || msg.includes('maquininha')) {
    paymentMethod = 'cartao_entrega';
  } else if (msg.includes('dinheiro')) {
    paymentMethod = 'dinheiro';
  } else if (msg.includes('online')) {
    paymentMethod = 'pagamento_online';
  }

  let address = '';
  const addrMatch = userMessage.match(
    /(?:rua|av\.?|avenida|travessa|alameda)\s+[^,;\n]+(?:,\s*\d+)?/i,
  );
  if (addrMatch) {
    address = addrMatch[0].trim();
  }

  const couponMatch = state.coupons.find(
    (c) => c.active && msg.includes(c.code.toLowerCase()),
  );

  return {
    items: matchedItems,
    deliveryMode: isPickup ? 'retirada' : 'entrega',
    address: address || (isPickup ? 'Retirada no Balcão' : 'Endereço via WhatsApp'),
    neighborhood: state.store.neighborhood,
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
  const msg = userMessage.toLowerCase();
  const evo = state.store.evolution;
  const assistantName = evo.assistantName?.trim() || 'Brenda';
  const appUrl = (process.env.APP_URL ?? 'https://pedidofacil.local').trim();
  const cleanPhone = customerPhone.replace(/\D/g, '');

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
      reply: `Entendido, ${customerName}! Já transferi seu atendimento para a nossa equipe humana aqui da *${state.store.name}* e pausei minhas respostas automáticas nesta conversa. Em instantes um atendente continua com você por aqui.`,
    };
  }

  if (
    !state.store.isOpen &&
    (msg.includes('pedir') ||
      msg.includes('cardapio') ||
      msg.includes('cardápio') ||
      msg.includes('oi') ||
      msg.includes('olá') ||
      msg.includes('quero'))
  ) {
    return {
      reply: `Olá, ${customerName}! Aqui é a ${assistantName}, da *${state.store.name}*. No momento estamos fechados, mas nosso horário é *${state.store.openingHours}*. Assim que abrirmos, peça por aqui: ${appUrl}`,
    };
  }

  // 2. Direct order creation in chat (Brendi AI style)
  if (evo.allowAiOrderCreation !== false) {
    const parsedOrder = tryParseLocalOrder(state, userMessage);
    if (parsedOrder) {
      const created = createOrderFromBot({
        state,
        customerPhone,
        customerName,
        args: parsedOrder,
      });
      if (created.ok && created.order) {
        const itemsSummary = created.order.items
          .map((i) => `${i.quantity}x ${i.name}`)
          .join(', ');
        const paymentLine =
          created.order.paymentMethod === 'pix'
            ? `Pagamento via *Pix* (chave: casadotempero@pix.com.br).`
            : `Pagamento: *${created.order.paymentMethod.replace('_', ' ')}*.`;

        const upsellHint =
          evo.upsellEnabled !== false &&
          !created.order.items.some((i) => i.menuItemId === 'item-suco-laranja')
            ? `\n\nDica: na próxima, experimente nosso *Suco Natural de Laranja (400ml)* espremido na hora!`
            : '';

        return {
          createdOrder: created.order,
          stockMovements: created.stockMovements,
          reply: `Pedido *#${created.order.orderNumber}* confirmado na cozinha, ${customerName}! 🎉\n• Itens: ${itemsSummary}\n• Modalidade: ${created.order.deliveryMode === 'retirada' ? 'Retirada no Balcão' : `Entrega (${created.order.address})`}\n• Total: *${formatCurrencyBRL(created.order.total)}*\n• ${paymentLine}\n\nPrevisão média: *${state.store.estimatedMinutes} min*. Te aviso por aqui a cada atualização!${upsellHint}`,
        };
      }
    }
  }

  // 3. Order status check
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
      : state.orders.find((o) =>
          o.customerPhone.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)),
        );

    if (foundOrder) {
      const courier = foundOrder.courierId
        ? state.couriers.find((c) => c.id === foundOrder.courierId)?.name
        : null;
      return {
        reply: `Encontrei seu pedido *#${foundOrder.orderNumber}* (${formatCurrencyBRL(foundOrder.total)}): ele está *${ORDER_STATUS_META[foundOrder.status].label}*${courier ? ` com o entregador ${courier}` : ''}. Previsão média de ${state.store.estimatedMinutes} min.`,
      };
    }
    return {
      reply: `Não localizei um pedido recente vinculado a este número. Me informe o número do pedido (ex.: #1041) que verifico na hora!`,
    };
  }

  // 4. Coupons
  if (msg.includes('cupom') || msg.includes('desconto') || msg.includes('promo')) {
    const activeCoupons = state.coupons.filter((c) => c.active);
    if (activeCoupons.length === 0) {
      return {
        reply: `No momento não temos cupons ativos, mas pedidos acima de *${formatCurrencyBRL(state.store.freeDeliveryMin)}* têm *entrega grátis*! Confira o cardápio: ${appUrl}`,
      };
    }
    const list = activeCoupons
      .map(
        (c) =>
          `• *${c.code}*: ${c.type === 'percent' ? `${c.value}% OFF` : `${formatCurrencyBRL(c.value)} OFF`} (mín. ${formatCurrencyBRL(c.minOrderValue)})`,
      )
      .join('\n');
    return {
      reply: `Temos estes cupons ativos hoje:\n${list}\n\nVocê pode aplicar no cardápio (${appUrl}) ou me dizer qual prato quer pedir por aqui mesmo!`,
    };
  }

  // 5. Delivery fee / hours / payment
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
      reply: `Atendemos *${state.store.openingHours}*. A taxa de entrega é *${formatCurrencyBRL(state.store.deliveryFee)}* (grátis acima de *${formatCurrencyBRL(state.store.freeDeliveryMin)}*) e o tempo médio é de *${state.store.estimatedMinutes} min*. Aceitamos Pix, Cartão na entrega, Dinheiro e Pagamento Online. Quer pedir por aqui ou pelo cardápio (${appUrl})?`,
    };
  }

  // 6. Specific dish inquiry
  const matchedDish = state.menuItems.find((item) => {
    const tokens = item.name.toLowerCase().split(' ').filter((w) => w.length > 3);
    return tokens.some((token) => msg.includes(token));
  });

  if (matchedDish) {
    const price = matchedDish.promoPrice ?? matchedDish.price;
    if (!matchedDish.available) {
      return {
        reply: `Poxa, *${matchedDish.name}* está esgotado no momento. Veja outras opções disponíveis agora no nosso cardápio: ${appUrl}`,
      };
    }
    const orderHint =
      evo.allowAiOrderCreation !== false
        ? `Se quiser fechar por aqui, me diga seu *endereço (ou retirada)* e a *forma de pagamento* (Pix, Cartão ou Dinheiro)!`
        : `Personalize tamanho e adicionais direto no link: ${appUrl}`;
    return {
      reply: `Temos *${matchedDish.name}* por *${formatCurrencyBRL(price)}* (${matchedDish.serves})! ${matchedDish.description}\n\n${orderHint}`,
    };
  }

  // 7. Greeting / menu showcase
  const topDishes = state.menuItems
    .filter((i) => i.available)
    .slice(0, 4)
    .map((i) => `• *${i.name}* — ${formatCurrencyBRL(i.promoPrice ?? i.price)}`)
    .join('\n');

  return {
    reply: `Olá, ${customerName}! Aqui é a *${assistantName}*, atendente virtual da *${state.store.name}*.\n\nDestaques de hoje:\n${topDishes}\n\nVocê pode fazer seu pedido *direto aqui pelo chat* (só me dizer os pratos, endereço e pagamento) ou acessar o cardápio visual: ${appUrl}`,
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
}> {
  const { state, phone, customerName, userMessage } = params;
  const cleanPhone = phone.replace(/\D/g, '') || 'anonimo';
  const handoffList = state.store.evolution.humanHandoffPhones ?? [];

  if (handoffList.some((p) => p.endsWith(cleanPhone.slice(-8)))) {
    return {
      reply: '',
      engine: 'assistente_local',
      pausedForHuman: true,
    };
  }

  const memory = getSessionMemory();
  const history = memory[cleanPhone] ?? [];
  const systemPrompt = buildStoreContextPrompt(state, phone, customerName);
  const recentTurns = history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let reply = '';
  let engine: 'openai' | 'assistente_local' = 'assistente_local';
  let createdOrder: Order | undefined;
  let stockMovements: StockMovement[] | undefined;
  let handoffTriggered = false;

  if (isOpenAiConfigured()) {
    try {
      const model = (process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim();
      const tools = [
        ...(state.store.evolution.allowAiOrderCreation !== false
          ? [
              {
                type: 'function',
                function: {
                  name: 'create_whatsapp_order',
                  description:
                    'Cria um pedido real na cozinha quando o cliente informou pratos, entrega/retirada e forma de pagamento.',
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
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 360,
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
                customerName,
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
              if (!currentList.includes(cleanPhone)) {
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
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model,
                temperature: 0.4,
                max_tokens: 360,
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
      // Fall through to local Brendi assistant
    }
  }

  if (!reply) {
    const localRes = generateLocalBrendiFallback({
      state,
      customerPhone: phone,
      customerName,
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
      if (!currentList.some((p) => p.endsWith(cleanPhone.slice(-8)))) {
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
