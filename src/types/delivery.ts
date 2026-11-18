export type DeliveryModuleId =
  | 'pedidos'
  | 'atendimento'
  | 'entregadores'
  | 'checklists'
  | 'desperdicios'
  | 'cardapio'
  | 'promocoes'
  | 'estoque'
  | 'vitrine'
  | 'desempenho'
  | 'custos'
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

export type DeliveryFeeMode = 'fixa' | 'distancia' | 'bairro';

export interface DistanceFeeTier {
  id: string;
  maxKm: number;
  fee: number;
  estimatedMinutes?: number;
}

export interface NeighborhoodFeeRule {
  id: string;
  neighborhood: string;
  fee: number;
  estimatedMinutes?: number;
}

export interface StoreHourShift {
  open: string;
  close: string;
}

export interface StoreWeeklySchedule {
  days: number[];
  shifts: StoreHourShift[];
}

export interface StoreSettings {
  name: string;
  segment: string;
  description: string;
  isOpen: boolean;
  openingHours: string;
  openingSchedule?: StoreWeeklySchedule;
  autoScheduleEnabled?: boolean;
  timezone?: string;
  phone: string;
  address: string;
  neighborhood: string;
  deliveryFee: number;
  deliveryFeeMode?: DeliveryFeeMode;
  distanceFeeTiers?: DistanceFeeTier[];
  neighborhoodFees?: NeighborhoodFeeRule[];
  maxDeliveryKm?: number;
  freeDeliveryMin: number;
  estimatedMinutes: number;
  heroImage: string;
  logoImage?: string;
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

export type StockMovementType =
  | 'entrada'
  | 'saida_pedido'
  | 'ajuste'
  | 'estorno'
  | 'desperdicio';

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
  distanceKm?: number;
  destinationLat?: number;
  destinationLng?: number;
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
  pixKey?: string;
  feePerDelivery?: number;
  fixedDailyPay?: number;
}

export interface CourierSettlement {
  id: string;
  courierId: string;
  courierName: string;
  date: string;
  deliveriesCount: number;
  orderNumbers: number[];
  deliveryFeesTotal: number;
  fixedDailyPay: number;
  bonusAmount: number;
  discountAmount: number;
  totalPaid: number;
  paymentMethod: string;
  pixKey?: string;
  notes?: string;
  whatsappSent?: boolean;
  whatsappStatus?: string;
  receiptText: string;
  createdAt: string;
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

export type FinancialEntryType = 'entrada' | 'custo';

export type FinancialCategory =
  | 'vendas_extras'
  | 'insumos_compras'
  | 'aluguel_infra'
  | 'utilidades'
  | 'equipe_entregas'
  | 'marketing_taxas'
  | 'outros';

export interface FinancialEntry {
  id: string;
  type: FinancialEntryType;
  category: FinancialCategory;
  description: string;
  amount: number;
  date: string;
  paymentMethod?: string;
  recurringExpenseId?: string;
  notes?: string;
  createdAt: string;
}

export type RecurringFrequency = 'mensal' | 'quinzenal' | 'semanal';

export interface RecurringExpense {
  id: string;
  name: string;
  category: FinancialCategory;
  amount: number;
  dueDay: number;
  frequency: RecurringFrequency;
  active: boolean;
  lastLaunchedMonth?: string;
}

export type ChecklistRole =
  | 'cozinha'
  | 'atendimento'
  | 'limpeza'
  | 'gerencia'
  | 'entregadores';

export type ChecklistShift =
  | 'abertura'
  | 'almoco'
  | 'jantar'
  | 'fechamento'
  | 'geral';

export type ChecklistFrequency = 'diario' | 'turno' | 'semanal';

export interface ChecklistItemTemplate {
  id: string;
  title: string;
  instruction?: string;
  critical?: boolean;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  description?: string;
  role: ChecklistRole;
  shift: ChecklistShift;
  frequency: ChecklistFrequency;
  active: boolean;
  items: ChecklistItemTemplate[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistRunItemStatus {
  itemId: string;
  title: string;
  instruction?: string;
  critical?: boolean;
  checked: boolean;
  checkedAt?: string;
  note?: string;
}

export interface ChecklistRun {
  id: string;
  templateId: string;
  templateTitle: string;
  role: ChecklistRole;
  shift: ChecklistShift;
  employeeName: string;
  status: 'em_andamento' | 'concluido';
  startedAt: string;
  completedAt?: string;
  items: ChecklistRunItemStatus[];
  notes?: string;
}

export type WasteTargetType = 'insumo' | 'prato';

export type WasteReason =
  | 'vencimento'
  | 'erro_preparo'
  | 'sobra_buffet'
  | 'avaria_embalagem'
  | 'qualidade'
  | 'outros';

export interface WasteAffectedIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: StockUnit;
  estimatedCost: number;
}

export interface WasteLog {
  id: string;
  targetType: WasteTargetType;
  targetId: string;
  targetName: string;
  quantity: number;
  unitLabel: string;
  reason: WasteReason;
  employeeName: string;
  notes?: string;
  estimatedCost: number;
  stockDeducted: boolean;
  affectedIngredients: WasteAffectedIngredient[];
  createdAt: string;
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
  financialEntries: FinancialEntry[];
  recurringExpenses: RecurringExpense[];
  courierSettlements: CourierSettlement[];
  checklistTemplates: ChecklistTemplate[];
  checklistRuns: ChecklistRun[];
  wasteLogs: WasteLog[];
}
