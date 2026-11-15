'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import { calculateItemCmv } from '@/lib/stock-engine';
import type {
  AddonGroup,
  Coupon,
  DeliveryStoreState,
  MenuCategory,
  MenuItem,
} from '@/types/delivery';

interface CatalogCouponsSectionProps {
  state: DeliveryStoreState;
  onAddMenuItem: (item: MenuItem) => void;
  onUpdateMenuItem: (id: string, updates: Partial<MenuItem>) => void;
  onDeleteMenuItem: (id: string) => void;
  onAddCategory: (category: MenuCategory) => void;
  onToggleCategory: (id: string, active: boolean) => void;
  onAddCoupon: (coupon: Coupon) => void;
  onToggleCoupon: (id: string, active: boolean) => void;
  onDeleteCoupon: (id: string) => void;
  onOpenTechnicalSheet?: () => void;
}

const IMAGE_PRESETS = [
  {
    label: 'Frango Grelhado na Brasa',
    url: '/images/dish_frango_grelhado_1794779703159.jpg',
  },
  {
    label: 'Bife Acebolado da Casa',
    url: '/images/dish_bife_acebolado_1794779706518.jpg',
  },
  {
    label: 'Strogonoff Artesanal',
    url: '/images/dish_strogonoff_carne_1794779704740.jpg',
  },
  {
    label: 'Tilápia ao Molho de Limão',
    url: '/images/dish_tilapia_limao_1794779704941.jpg',
  },
  {
    label: 'Banner Marmitaria / Bebidas',
    url: '/images/hero_marmitaria_executiva_1794779703057.jpg',
  },
];

export function CatalogCouponsSection({
  state,
  onAddMenuItem,
  onUpdateMenuItem,
  onDeleteMenuItem,
  onAddCategory,
  onToggleCategory,
  onAddCoupon,
  onToggleCoupon,
  onDeleteCoupon,
  onOpenTechnicalSheet,
}: CatalogCouponsSectionProps) {
  const [activeTab, setActiveTab] = useState<'pratos' | 'cupons' | 'categorias'>('pratos');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('todas');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmDeleteCouponId, setConfirmDeleteCouponId] = useState<string | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState(state.categories[0]?.id || '');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemPromoPrice, setItemPromoPrice] = useState('');
  const [itemPrepMinutes, setItemPrepMinutes] = useState('20');
  const [itemServes, setItemServes] = useState('Serve 1 pessoa');
  const [itemImage, setItemImage] = useState(IMAGE_PRESETS[0].url);
  const [itemAddonGroups, setItemAddonGroups] = useState<AddonGroup[]>([]);
  const [savingItem, setSavingItem] = useState(false);

  const [couponCode, setCouponCode] = useState('');
  const [couponDesc, setCouponDesc] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponValue, setCouponValue] = useState('10');
  const [couponMinOrder, setCouponMinOrder] = useState('35');
  const [couponError, setCouponError] = useState('');

  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const availableCount = state.menuItems.filter((i) => i.available).length;
  const pausedCount = state.menuItems.length - availableCount;
  const activeCouponsCount = state.coupons.filter((c) => c.active).length;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.menuItems.filter((item) => {
      if (categoryFilter !== 'todas' && item.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [state.menuItems, categoryFilter, search]);

  const openCreateModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory(state.categories[0]?.id || 'cat-executivas');
    setItemDescription('');
    setItemPrice('');
    setItemPromoPrice('');
    setItemPrepMinutes('20');
    setItemServes('Serve 1 pessoa');
    setItemImage(IMAGE_PRESETS[0].url);
    setItemAddonGroups([]);
    setItemModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.categoryId);
    setItemDescription(item.description);
    setItemPrice(String(item.price));
    setItemPromoPrice(item.promoPrice ? String(item.promoPrice) : '');
    setItemPrepMinutes(String(item.prepMinutes));
    setItemServes(item.serves);
    setItemImage(item.image);
    setItemAddonGroups(structuredClone(item.addonGroups));
    setItemModalOpen(true);
  };

  const handleToggleAddonAvailability = (groupId: string, optionId: string) => {
    setItemAddonGroups((prev) =>
      prev.map((grp) =>
        grp.id !== groupId
          ? grp
          : {
              ...grp,
              options: grp.options.map((opt) =>
                opt.id === optionId ? { ...opt, available: !opt.available } : opt,
              ),
            },
      ),
    );
  };

  const handleAddQuickAddonGroup = () => {
    const newGroup: AddonGroup = {
      id: `grp-${Date.now()}`,
      title: 'Adicionais do Prato',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: `opt-${Date.now()}-1`, name: 'Porção extra', price: 5, available: true },
      ],
    };
    setItemAddonGroups((prev) => [...prev, newGroup]);
  };

  const handleAddOptionToGroup = (groupId: string) => {
    setItemAddonGroups((prev) =>
      prev.map((grp) =>
        grp.id !== groupId
          ? grp
          : {
              ...grp,
              options: [
                ...grp.options,
                {
                  id: `opt-${Date.now()}`,
                  name: 'Nova opção',
                  price: 0,
                  available: true,
                },
              ],
            },
      ),
    );
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    setSavingItem(true);

    const parsedPrice = Math.max(0, Number(itemPrice) || 0);
    const parsedPromo = Number(itemPromoPrice);
    const promoPrice =
      parsedPromo > 0 && parsedPromo < parsedPrice ? parsedPromo : undefined;

    const payload = {
      categoryId: itemCategory,
      name: itemName.trim(),
      description: itemDescription.trim(),
      price: parsedPrice,
      promoPrice,
      prepMinutes: Math.max(1, Number(itemPrepMinutes) || 20),
      serves: itemServes.trim() || 'Serve 1 pessoa',
      image: itemImage.trim() || IMAGE_PRESETS[0].url,
      addonGroups: itemAddonGroups,
    };

    try {
      if (editingItem) {
        onUpdateMenuItem(editingItem.id, payload);
        await fetch('/api/catalog', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity: 'menu_item',
            id: editingItem.id,
            updates: payload,
          }),
        }).catch(() => {});
      } else {
        const res = await fetch('/api/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: 'menu_item', data: payload }),
        });
        const data = (await res.json()) as { ok: boolean; item?: MenuItem };
        if (data.ok && data.item) {
          onAddMenuItem(data.item);
        } else {
          onAddMenuItem({
            id: `item-${Date.now()}`,
            available: true,
            ...payload,
          });
        }
      }
      setItemModalOpen(false);
    } finally {
      setSavingItem(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    const normalized = couponCode.trim().toUpperCase();
    if (!normalized) {
      setCouponError('Informe o código promocional.');
      return;
    }
    if (state.coupons.some((c) => c.code.toUpperCase() === normalized)) {
      setCouponError('Já existe um cupom cadastrado com este código.');
      return;
    }

    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'coupon',
        data: {
          code: normalized,
          description: couponDesc.trim() || `Desconto com cupom ${normalized}`,
          type: couponType,
          value: Math.max(1, Number(couponValue) || 5),
          minOrderValue: Math.max(0, Number(couponMinOrder) || 0),
        },
      }),
    }).catch(() => null);

    const data = res ? ((await res.json()) as { ok: boolean; coupon?: Coupon }) : null;
    if (data?.ok && data.coupon) {
      onAddCoupon(data.coupon);
    } else {
      onAddCoupon({
        id: `cup-${Date.now()}`,
        code: normalized,
        description: couponDesc.trim() || `Desconto com cupom ${normalized}`,
        type: couponType,
        value: Math.max(1, Number(couponValue) || 5),
        minOrderValue: Math.max(0, Number(couponMinOrder) || 0),
        active: true,
        usageCount: 0,
      });
    }
    setCouponCode('');
    setCouponDesc('');
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'category',
        data: { name: catName.trim(), description: catDesc.trim() },
      }),
    }).catch(() => null);
    const data = res
      ? ((await res.json()) as { ok: boolean; category?: MenuCategory })
      : null;

    if (data?.ok && data.category) {
      onAddCategory(data.category);
    } else {
      onAddCategory({
        id: `cat-${Date.now()}`,
        name: catName.trim(),
        description: catDesc.trim(),
        sortOrder: state.categories.length + 1,
        active: true,
      });
    }
    setCatName('');
    setCatDesc('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Gestão de Cardápio e Cupons
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Cadastre pratos, ajuste preços promocionais, pause itens esgotados em 1 clique e crie cupons de desconto.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Seções de catálogo"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg self-start sm:self-auto"
        >
          {(
            [
              { id: 'pratos', label: 'Pratos e Pausas' },
              { id: 'cupons', label: 'Cupons' },
              { id: 'categorias', label: 'Categorias' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section
        aria-label="Resumo do catálogo"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total de Pratos</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
            {state.menuItems.length}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Disponíveis no Cardápio</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400">
            {availableCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pausados / Esgotados</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-amber-700 dark:text-amber-400">
            {pausedCount}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cupons Ativos</p>
          <p className="mt-1 text-2xl font-bold font-mono-tabular text-brand-600 dark:text-brand-400">
            {activeCouponsCount}
          </p>
        </div>
      </section>

      {activeTab === 'pratos' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar prato..."
                  aria-label="Buscar prato no catálogo"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar por categoria"
                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="todas">Todas as categorias</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Novo Prato</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Prato</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Preço</th>
                    <th className="py-3 px-4">Ficha / CMV</th>
                    <th className="py-3 px-4">Adicionais</th>
                    <th className="py-3 px-4">Disponibilidade</th>
                    <th className="py-3 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filteredItems.map((item) => {
                    const cat = state.categories.find((c) => c.id === item.categoryId);
                    const broken = failedImages[item.id];
                    const sheetCount = item.technicalSheet?.length ?? 0;
                    const cmv = calculateItemCmv(item, state.ingredients);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-5 min-w-[260px]">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                              {broken ? (
                                <UtensilsCrossed className="w-5 h-5 text-slate-400" />
                              ) : (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setFailedImages((prev) => ({
                                      ...prev,
                                      [item.id]: true,
                                    }))
                                  }
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                ~{item.prepMinutes} min · {item.serves}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {cat?.name || 'Sem categoria'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs whitespace-nowrap">
                          {item.promoPrice ? (
                            <div>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {formatCurrencyBRL(item.promoPrice)}
                              </span>{' '}
                              <span className="line-through text-slate-400">
                                {formatCurrencyBRL(item.price)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatCurrencyBRL(item.price)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap font-mono-tabular">
                          {sheetCount > 0 ? (
                            <button
                              type="button"
                              onClick={onOpenTechnicalSheet}
                              className="text-left text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              {sheetCount} insumos · {formatCurrencyBRL(cmv)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={onOpenTechnicalSheet}
                              className="text-amber-700 dark:text-amber-400 hover:underline"
                            >
                              Vincular ficha
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono-tabular">
                          {item.addonGroups.length}{' '}
                          {item.addonGroups.length === 1 ? 'grupo' : 'grupos'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMenuItem(item.id, {
                                available: !item.available,
                              })
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                              item.available
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {item.available ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Disponível</span>
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Pausado</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              aria-label={`Editar ${item.name}`}
                              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {confirmDeleteItemId === item.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteMenuItem(item.id);
                                  setConfirmDeleteItemId(null);
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
                              >
                                Confirmar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteItemId(item.id)}
                                aria-label={`Excluir ${item.name}`}
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cupons' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Tags className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span>Criar Cupom Promocional</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cupons ativos funcionam imediatamente no checkout do Cardápio Digital e no Bot WhatsApp.
            </p>

            <form onSubmit={handleCreateCoupon} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="cup-code"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Código do Cupom
                </label>
                <input
                  id="cup-code"
                  required
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Ex.: EXECUTIVO15"
                  className="w-full px-3 py-2 text-sm font-mono-tabular uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="cup-desc"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Descrição da Regra
                </label>
                <input
                  id="cup-desc"
                  value={couponDesc}
                  onChange={(e) => setCouponDesc(e.target.value)}
                  placeholder="Ex.: 15% off no almoço executivo"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="cup-type"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Tipo
                  </label>
                  <select
                    id="cup-type"
                    value={couponType}
                    onChange={(e) =>
                      setCouponType(e.target.value as 'percent' | 'fixed')
                    }
                    className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="percent">% Percentual</option>
                    <option value="fixed">R$ Fixo</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="cup-val"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Desconto
                  </label>
                  <input
                    id="cup-val"
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={couponValue}
                    onChange={(e) => setCouponValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cup-min"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Pedido Mín.
                  </label>
                  <input
                    id="cup-min"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={couponMinOrder}
                    onChange={(e) => setCouponMinOrder(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              {couponError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {couponError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                Cadastrar Cupom
              </button>
            </form>
          </section>

          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Cupons Cadastrados
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-5">Código</th>
                    <th className="py-3 px-4">Regra</th>
                    <th className="py-3 px-4">Usos</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {state.coupons.map((coupon) => (
                    <tr
                      key={coupon.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3.5 px-5 font-mono-tabular font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {coupon.code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {coupon.type === 'percent'
                            ? `${coupon.value}% de desconto`
                            : `${formatCurrencyBRL(coupon.value)} de desconto`}{' '}
                          · mín. {formatCurrencyBRL(coupon.minOrderValue)}
                        </div>
                        <div className="text-slate-500">{coupon.description}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {coupon.usageCount}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onToggleCoupon(coupon.id, !coupon.active)}
                          className={`font-semibold ${
                            coupon.active
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {coupon.active ? 'Ativo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {confirmDeleteCouponId === coupon.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteCoupon(coupon.id);
                              setConfirmDeleteCouponId(null);
                            }}
                            className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded-md"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCouponId(coupon.id)}
                            aria-label={`Remover cupom ${coupon.code}`}
                            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'categorias' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Nova Categoria
            </h2>
            <form onSubmit={handleCreateCategory} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="cat-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome da Categoria
                </label>
                <input
                  id="cat-name"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex.: Sobremesas Caseiras"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="cat-desc"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Subtítulo
                </label>
                <input
                  id="cat-desc"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Descrição curta exibida ao cliente"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                Adicionar Categoria
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
            {state.categories.map((cat) => {
              const count = state.menuItems.filter(
                (i) => i.categoryId === cat.id,
              ).length;
              return (
                <div
                  key={cat.id}
                  className="p-4 sm:px-6 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {cat.name}{' '}
                      <span className="font-mono-tabular font-normal text-xs text-slate-500">
                        · {count} {count === 1 ? 'item' : 'itens'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {cat.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCategory(cat.id, !cat.active)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                      cat.active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {cat.active ? 'Visível' : 'Oculta'}
                  </button>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {itemModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-editor-title"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            onClick={() => setItemModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="item-editor-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {editingItem ? `Editar: ${editingItem.name}` : 'Novo Prato do Cardápio'}
              </h2>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                aria-label="Fechar editor de prato"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="ed-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Nome do Prato
                    </label>
                    <input
                      id="ed-name"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Ex.: Parmegiana de Frango"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-cat"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Categoria
                    </label>
                    <select
                      id="ed-cat"
                      value={itemCategory}
                      onChange={(e) => setItemCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      {state.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ed-desc"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Descrição e Acompanhamentos
                  </label>
                  <textarea
                    id="ed-desc"
                    rows={2}
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="Ingredientes, acompanhamentos e detalhes da marmita..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor="ed-price"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Preço (R$)
                    </label>
                    <input
                      id="ed-price"
                      type="number"
                      step="0.1"
                      min="1"
                      required
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-promo"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Promocional (R$)
                    </label>
                    <input
                      id="ed-promo"
                      type="number"
                      step="0.1"
                      min="0"
                      value={itemPromoPrice}
                      onChange={(e) => setItemPromoPrice(e.target.value)}
                      placeholder="Opcional"
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-prep"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Preparo (min)
                    </label>
                    <input
                      id="ed-prep"
                      type="number"
                      min="1"
                      value={itemPrepMinutes}
                      onChange={(e) => setItemPrepMinutes(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-serves"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Porção
                    </label>
                    <input
                      id="ed-serves"
                      value={itemServes}
                      onChange={(e) => setItemServes(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ed-img"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Imagem do Prato
                  </label>
                  <select
                    id="ed-img"
                    value={itemImage}
                    onChange={(e) => setItemImage(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    {IMAGE_PRESETS.map((preset) => (
                      <option key={preset.url} value={preset.url}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Grupos de Adicionais ({itemAddonGroups.length})
                    </p>
                    <button
                      type="button"
                      onClick={handleAddQuickAddonGroup}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Grupo</span>
                    </button>
                  </div>

                  {itemAddonGroups.map((grp) => (
                    <div
                      key={grp.id}
                      className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          value={grp.title}
                          onChange={(e) =>
                            setItemAddonGroups((prev) =>
                              prev.map((g) =>
                                g.id === grp.id ? { ...g, title: e.target.value } : g,
                              ),
                            )
                          }
                          className="flex-1 px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddOptionToGroup(grp.id)}
                          className="px-2 py-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          + Opção
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {grp.options.map((opt) => (
                          <div key={opt.id} className="flex items-center gap-2 text-xs">
                            <input
                              value={opt.name}
                              onChange={(e) =>
                                setItemAddonGroups((prev) =>
                                  prev.map((g) =>
                                    g.id !== grp.id
                                      ? g
                                      : {
                                          ...g,
                                          options: g.options.map((o) =>
                                            o.id === opt.id
                                              ? { ...o, name: e.target.value }
                                              : o,
                                          ),
                                        },
                                  ),
                                )
                              }
                              className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                            />
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={opt.price}
                              onChange={(e) =>
                                setItemAddonGroups((prev) =>
                                  prev.map((g) =>
                                    g.id !== grp.id
                                      ? g
                                      : {
                                          ...g,
                                          options: g.options.map((o) =>
                                            o.id === opt.id
                                              ? {
                                                  ...o,
                                                  price: Math.max(
                                                    0,
                                                    Number(e.target.value) || 0,
                                                  ),
                                                }
                                              : o,
                                          ),
                                        },
                                  ),
                                )
                              }
                              className="w-20 px-2 py-1 font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleAddonAvailability(grp.id, opt.id)
                              }
                              className={`px-2 py-1 rounded-md border text-[11px] font-medium ${
                                opt.available
                                  ? 'text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800'
                                  : 'text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800'
                              }`}
                            >
                              {opt.available ? 'Ativo' : 'Pausado'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                >
                  {savingItem ? 'Salvando...' : 'Salvar Prato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
