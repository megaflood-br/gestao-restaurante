export type DeliveryModuleId =
  | 'pedidos'
  | 'atendimento'
  | 'entregadores'
  | 'cardapio'
  | 'promocoes'
  | 'estoque'
  | 'vitrine'
  | 'desempenho'
  | 'configuracoes';

export type OrderStatus =
  | 'pendente'
  | 'preparo'
  | 'pronto'
  | 'entrega'
  | 'finalizado'
  | 'cancelado';

export type OrderSource = 'cardapio' | 'whatsapp' | 'balcao';

export type PaymentMethod =
  | 'pix'
  | 'cartao_entrega'
  | 'dinheiro'
  | 'pagamento_online';

export type DeliveryMode = 'entrega' | 'retirada';

export type CourierStatus = 'disponivel' | 'em_rota' | 'offline';

export type EvolutionConnectionStatus =
  | 'desconectado'
  | 'aguardando_qr'
  | 'conectado'
  | 'simulador';

export interface EvolutionTemplates {
  boasVindas: string;
  pendente: string;
  preparo: string;
  pronto: string;
  entrega: string;
  finalizado: string;
}

export type BotTone = 'acolhedor' | 'descontraido' | 'objetivo';

export interface EvolutionConfig {
  instanceName: string;
  connectionStatus: EvolutionConnectionStatus;
  autoReplyEnabled: boolean;
  autoNotifyOnStatus: boolean;
  webhookUrl: string;
  lastSyncAt: string;
  assistantName?: string;
  tone?: BotTone;
  customInstructions?: string;
  allowAiOrderCreation?: boolean;
  upsellEnabled?: boolean;
  humanHandoffEnabled?: boolean;
  humanHandoffPhones?: string[];
  typingPresenceEnabled?: boolean;
  typingMinDelayMs?: number;
  typingMaxDelayMs?: number;
  antiBanPacingMs?: number;
  disableLinkPreview?: boolean;
  optOutEnabled?: boolean;
  optOutPhones?: string[];
  templates: EvolutionTemplates;
}

export interface StoreSettings {
  name: string;
  segment: string;
  description: string;
  isOpen: boolean;
  openingHours: string;
  phone: string;
  address: string;
  neighborhood: string;
  deliveryFee: number;
  freeDeliveryMin: number;
  estimatedMinutes: number;
  heroImage: string;
  evolution: EvolutionConfig;
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
}

export interface AddonOption {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface AddonGroup {
  id: string;
  title: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: AddonOption[];
}

export type StockUnit = 'kg' | 'g' | 'L' | 'ml' | 'un';

export interface StockIngredient {
  id: string;
  name: string;
  category: string;
  unit: StockUnit;
  currentQty: number;
  minQty: number;
  unitCost: number;
  updatedAt: string;
}

export interface TechnicalSheetIngredient {
  ingredientId: string;
  quantity: number;
  unit: StockUnit;
}

export type StockMovementType = 'entrada' | 'saida_pedido' | 'ajuste' | 'estorno';

export interface StockMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: StockMovementType;
  quantity: number;
  unit: StockUnit;
  previousQty: number;
  newQty: number;
  reason: string;
  orderNumber?: number;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  promoPrice?: number;
  image: string;
  available: boolean;
  prepMinutes: number;
  serves: string;
  addonGroups: AddonGroup[];
  technicalSheet?: TechnicalSheetIngredient[];
}

export interface SelectedAddon {
  groupId: string;
  groupTitle: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  selectedAddons: SelectedAddon[];
}

export interface StatusTimestamp {
  status: OrderStatus;
  at: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  source: OrderSource;
  customerName: string;
  customerPhone: string;
  address: string;
  neighborhood: string;
  complement?: string;
  deliveryMode: DeliveryMode;
  paymentMethod: PaymentMethod;
  changeFor?: number;
  couponCode?: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  courierId?: string;
  notes?: string;
  items: OrderItem[];
  stockDeducted?: boolean;
  createdAt: string;
  updatedAt: string;
  history: StatusTimestamp[];
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderValue: number;
  active: boolean;
  usageCount: number;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: CourierStatus;
  active: boolean;
  deliveriesToday: number;
}

export interface WhatsappLog {
  id: string;
  direction: 'inbound' | 'outbound';
  phone: string;
  customerName: string;
  message: string;
  event: string;
  status: 'enviada' | 'recebida' | 'simulada' | 'erro';
  engine?: 'openai' | 'assistente_local' | 'template';
  timestamp: string;
  orderNumber?: number;
  delayMs?: number;
}

export interface WhatsappSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface DeliveryStoreState {
  store: StoreSettings;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  orders: Order[];
  coupons: Coupon[];
  couriers: Courier[];
  whatsappLogs: WhatsappLog[];
  ingredients: StockIngredient[];
  stockMovements: StockMovement[];
}
