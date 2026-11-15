'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Save, Store } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/formatters';
import type { DeliveryModuleId, DeliveryStoreState, StoreSettings } from '@/types/delivery';

interface StageOneBaseProps {
  state: DeliveryStoreState;
  onUpdateStore: (updates: Partial<StoreSettings>) => Promise<void>;
  onToggleStoreOpen: () => Promise<void>;
  onSelectModule: (moduleId: DeliveryModuleId) => void;
}

const ROADMAP_MODULES: Array<{
  id: DeliveryModuleId;
  stage: string;
  title: string;
  summary: string;
  ready: boolean;
}> = [
  {
    id: 'visao_base',
    stage: 'Etapa 1',
    title: 'Base do Sistema, Dados e Identidade da Loja',
    summary: 'Modelos TypeScript, catálogo inicial de marmitaria, APIs Next.js e configurações da loja.',
    ready: true,
  },
  {
    id: 'cardapio_digital',
    stage: 'Etapa 2',
    title: 'Cardápio Digital do Cliente',
    summary: 'Vitrine pública, adicionais/complementos, sacola, cupons, checkout e acompanhamento.',
    ready: true,
  },
  {
    id: 'gestor_pedidos',
    stage: 'Etapa 3',
    title: 'Gestor de Pedidos e PDV',
    summary: 'Fluxo de status em tempo real, pedido manual balcão/telefone e impressão de comanda.',
    ready: true,
  },
  {
    id: 'whatsapp_evolution',
    stage: 'Etapa 4',
    title: 'Integração WhatsApp + Evolution API v2',
    summary: 'Instância, QR Code, webhook MESSAGES_UPSERT, bot OpenAI estilo Brendi e disparo por status.',
    ready: true,
  },
  {
    id: 'entregadores_relatorios',
    stage: 'Etapa 5',
    title: 'Entregadores, Cardápio/Cupons e Relatórios',
    summary: 'Painel de motoboys, ativação rápida de pratos, cupons promocionais e faturamento.',
    ready: true,
  },
];

export function StageOneBase({
  state,
  onUpdateStore,
  onToggleStoreOpen,
  onSelectModule,
}: StageOneBaseProps) {
  const [name, setName] = useState(state.store.name);
  const [openingHours, setOpeningHours] = useState(state.store.openingHours);
  const [phone, setPhone] = useState(state.store.phone);
  const [address, setAddress] = useState(state.store.address);
  const [neighborhood, setNeighborhood] = useState(state.store.neighborhood);
  const [deliveryFee, setDeliveryFee] = useState(String(state.store.deliveryFee));
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(
    String(state.store.freeDeliveryMin),
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    String(state.store.estimatedMinutes),
  );
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    setName(state.store.name);
    setOpeningHours(state.store.openingHours);
    setPhone(state.store.phone);
    setAddress(state.store.address);
    setNeighborhood(state.store.neighborhood);
    setDeliveryFee(String(state.store.deliveryFee));
    setFreeDeliveryMin(String(state.store.freeDeliveryMin));
    setEstimatedMinutes(String(state.store.estimatedMinutes));
  }, [state.store]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedFeedback(false);
    await onUpdateStore({
      name: name.trim() || state.store.name,
      openingHours: openingHours.trim(),
      phone: phone.trim(),
      address: address.trim(),
      neighborhood: neighborhood.trim(),
      deliveryFee: Math.max(0, Number(deliveryFee) || 0),
      freeDeliveryMin: Math.max(0, Number(freeDeliveryMin) || 0),
      estimatedMinutes: Math.max(5, Number(estimatedMinutes) || 30),
    });
    setSaving(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 3000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Base da Loja e Estrutura Inicial
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Etapa 1 ativa: parâmetros operacionais, cardápio semente de marmitaria executiva e estado compartilhado.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleStoreOpen}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto ${
            state.store.isOpen
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
          }`}
        >
          <Store className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{state.store.isOpen ? 'Loja Aberta para Pedidos' : 'Loja Fechada'}</span>
        </button>
      </div>

      {/* Unified Store Summary Strip */}
      <section
        aria-label="Resumo da base de dados"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pratos e Itens Base
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white font-mono-tabular">
            {state.menuItems.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {state.categories.length} categorias configuradas
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pedidos Iniciais
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white font-mono-tabular">
            {state.orders.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cardápio, WhatsApp e Balcão
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Taxa / Frete Grátis
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white font-mono-tabular">
            {formatCurrencyBRL(state.store.deliveryFee)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Grátis acima de {formatCurrencyBRL(state.store.freeDeliveryMin)}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Instância Evolution API
          </p>
          <p className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white font-mono-tabular truncate">
            {state.store.evolution.instanceName}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Modo: Simulador + Proxy API
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Editable Store Identity Form */}
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Dados Operacionais da Loja
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alterações refletem no cardápio digital e nas notificações automáticas.
              </p>
            </div>
            {savedFeedback && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Salvo</span>
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="store-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Nome do Estabelecimento
              </label>
              <input
                id="store-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-hours"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Horário de Atendimento
                </label>
                <input
                  id="store-hours"
                  value={openingHours}
                  onChange={(e) => setOpeningHours(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
                />
              </div>

              <div>
                <label
                  htmlFor="store-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  WhatsApp Principal
                </label>
                <input
                  id="store-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="store-address"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Endereço da Cozinha
                </label>
                <input
                  id="store-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
                />
              </div>

              <div>
                <label
                  htmlFor="store-neighborhood"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Bairro / Cidade
                </label>
                <input
                  id="store-neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-brand-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="store-fee"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Taxa de Entrega (R$)
                </label>
                <input
                  id="store-fee"
                  type="number"
                  step="0.5"
                  min="0"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="store-free-min"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Frete Grátis a partir (R$)
                </label>
                <input
                  id="store-free-min"
                  type="number"
                  step="1"
                  min="0"
                  value={freeDeliveryMin}
                  onChange={(e) => setFreeDeliveryMin(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="store-eta"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Previsão Média (min)
                </label>
                <input
                  id="store-eta"
                  type="number"
                  min="5"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>{saving ? 'Salvando...' : 'Salvar Dados da Loja'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Visual Store Preview & Stage Roadmap */}
        <section className="xl:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="aspect-video w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
              {heroImgFailed ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 p-4 text-center">
                  <Store className="w-8 h-8 mb-2" aria-hidden="true" />
                  <span className="text-sm font-medium">{state.store.name}</span>
                </div>
              ) : (
                <img
                  src={state.store.heroImage}
                  alt={state.store.name}
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="p-5 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {state.store.segment} · {state.store.neighborhood}
              </p>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {state.store.name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {state.store.description}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Progresso das Etapas do Projeto
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cada módulo seguinte só será construído após sua confirmação.
            </p>

            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {ROADMAP_MODULES.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onSelectModule(mod.id)}
                  className="w-full py-3 flex items-start justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {mod.stage} · {mod.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {mod.summary}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                      mod.ready
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {mod.ready ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ativa</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Aguardando</span>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
