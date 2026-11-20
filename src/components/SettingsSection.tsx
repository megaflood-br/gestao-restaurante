'use client';

import { useEffect, useState } from 'react';
import {
  Bike,
  Bot,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Link2,
  MapPin,
  MessageSquare,
  Navigation,
  Plus,
  Power,
  QrCode,
  Save,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { formatCurrencyBRL, formatTimeBR } from '@/lib/formatters';
import { readAndCompressImage } from '@/lib/image-upload';
import {
  formatOpeningScheduleLabel,
  getStoreAvailability,
  parseOpeningHoursString,
  WEEKDAY_OPTIONS,
} from '@/lib/store-hours';
import type {
  BotTone,
  DeliveryFeeMode,
  DeliveryStoreState,
  DistanceFeeTier,
  EvolutionConfig,
  EvolutionTemplates,
  NeighborhoodFeeRule,
  StoreHourShift,
  StoreSettings,
} from '@/types/delivery';

export type SettingsTabId =
  | 'loja'
  | 'horarios'
  | 'entrega'
  | 'visual'
  | 'links'
  | 'ia'
  | 'whatsapp'
  | 'apis';

interface SettingsSectionProps {
  state: DeliveryStoreState;
  initialTab?: SettingsTabId;
  onUpdateStore: (updates: Partial<StoreSettings>) => Promise<void>;
  onToggleStoreOpen: () => Promise<void>;
  onUpdateEvolution: (evolution: EvolutionConfig) => void;
  onOpenChatInbox?: () => void;
}

const BRENDA_AVATAR_URL = '/images/avatar_brenda_atendente_1794784551375.jpg';

const COVER_PRESETS = [
  {
    label: 'Capa Executiva Padrão',
    url: '/images/hero_marmitaria_executiva_1794779703057.jpg',
  },
  {
    label: 'Grelhados na Brasa',
    url: '/images/dish_frango_grelhado_1794779703159.jpg',
  },
  {
    label: 'Cortes & Acebolados',
    url: '/images/dish_bife_acebolado_1794779706518.jpg',
  },
  {
    label: 'Pratos Artesanais',
    url: '/images/dish_strogonoff_carne_1794779704740.jpg',
  },
];

const SETTINGS_TAB_GROUPS: Array<{
  groupLabel: string;
  tabs: Array<{
    id: SettingsTabId;
    label: string;
    description: string;
    icon: typeof Store;
  }>;
}> = [
  {
    groupLabel: 'Loja e Entrega',
    tabs: [
      {
        id: 'loja',
        label: 'Dados da Loja',
        description: 'Nome, endereço, contato e status',
        icon: Store,
      },
      {
        id: 'horarios',
        label: 'Horários',
        description: 'Dias, turnos e fechamento automático',
        icon: Clock,
      },
      {
        id: 'entrega',
        label: 'Taxas e Entrega',
        description: 'Frete grátis, km, bairros e simulador',
        icon: DollarSign,
      },
      {
        id: 'visual',
        label: 'Visual e Marca',
        description: 'Logo, capa do cardápio e prévia',
        icon: ImageIcon,
      },
      {
        id: 'links',
        label: 'Links e Portais',
        description: 'Cardápio do cliente e portais internos',
        icon: Link2,
      },
    ],
  },
  {
    groupLabel: 'IA, WhatsApp e APIs',
    tabs: [
      {
        id: 'ia',
        label: 'Atendente Virtual IA',
        description: 'Personalidade, tom de voz e regras',
        icon: Sparkles,
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp & Anti-Ban',
        description: 'QR Code, delay, opt-out e avisos',
        icon: Smartphone,
      },
      {
        id: 'apis',
        label: 'Credenciais e APIs',
        description: 'Chaves OpenAI, Maps e Evolution API',
        icon: KeyRound,
      },
    ],
  },
];

const TONE_OPTIONS: Array<{
  id: BotTone;
  label: string;
  description: string;
}> = [
  {
    id: 'acolhedor',
    label: 'Acolhedor',
    description: 'Gentil, próximo e focado em hospitalidade.',
  },
  {
    id: 'descontraido',
    label: 'Descontraído',
    description: 'Leve, simpático e animado na medida certa.',
  },
  {
    id: 'objetivo',
    label: 'Direto ao Ponto',
    description: 'Respostas rápidas, curtas e objetivas.',
  },
];

export function SettingsSection({
  state,
  initialTab = 'loja',
  onUpdateStore,
  onToggleStoreOpen,
  onUpdateEvolution,
  onOpenChatInbox,
}: SettingsSectionProps) {
  const { store } = state;
  const { evolution } = store;

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Store settings state
  const initialParsedHours = parseOpeningHoursString(store.openingHours);
  const initialDays =
    store.openingSchedule?.days ?? initialParsedHours?.days ?? [1, 2, 3, 4, 5, 6];
  const initialShifts = store.openingSchedule?.shifts ??
    initialParsedHours?.shifts.map((s) => ({ open: s.open, close: s.close })) ?? [
      { open: '11:00', close: '15:00' },
    ];

  const [name, setName] = useState(store.name);
  const [segment, setSegment] = useState(store.segment);
  const [description, setDescription] = useState(store.description);
  const [openingHours, setOpeningHours] = useState(store.openingHours);
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(
    store.autoScheduleEnabled !== false,
  );
  const [scheduleDays, setScheduleDays] = useState<number[]>(initialDays);
  const [shift1Open, setShift1Open] = useState(initialShifts[0]?.open ?? '11:00');
  const [shift1Close, setShift1Close] = useState(initialShifts[0]?.close ?? '15:00');
  const [shift2Enabled, setShift2Enabled] = useState(initialShifts.length > 1);
  const [shift2Open, setShift2Open] = useState(initialShifts[1]?.open ?? '18:00');
  const [shift2Close, setShift2Close] = useState(initialShifts[1]?.close ?? '22:00');
  const [phone, setPhone] = useState(store.phone);
  const [address, setAddress] = useState(store.address);
  const [neighborhood, setNeighborhood] = useState(store.neighborhood);
  const [deliveryFee, setDeliveryFee] = useState(String(store.deliveryFee));
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<DeliveryFeeMode>(
    store.deliveryFeeMode ?? 'distancia',
  );
  const [maxDeliveryKm, setMaxDeliveryKm] = useState(
    String(store.maxDeliveryKm ?? 12),
  );
  const [distanceFeeTiers, setDistanceFeeTiers] = useState<DistanceFeeTier[]>(
    store.distanceFeeTiers ?? [],
  );
  const [neighborhoodFees, setNeighborhoodFees] = useState<NeighborhoodFeeRule[]>(
    store.neighborhoodFees ?? [],
  );
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(
    String(store.freeDeliveryMin),
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    String(store.estimatedMinutes),
  );
  const [heroImage, setHeroImage] = useState(store.heroImage);
  const [logoImage, setLogoImage] = useState(store.logoImage ?? '');
  const [logoImgFailed, setLogoImgFailed] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [origin, setOrigin] = useState('');
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [savingStore, setSavingStore] = useState(false);

  // Distance fee simulator state
  const [simAddress, setSimAddress] = useState(
    'Av. Paulista, 1000, Bela Vista, São Paulo',
  );
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<{
    distanceKm: number | null;
    deliveryFee: number;
    estimatedMinutes: number;
    matchedRuleLabel: string;
    outOfRange: boolean;
    usedGoogleRoutes?: boolean;
    quotaExceeded?: boolean;
    apiError?: string;
  } | null>(null);

  // AI & Evolution config state
  const [instanceName, setInstanceName] = useState(evolution.instanceName);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(
    evolution.autoReplyEnabled,
  );
  const [autoNotifyOnStatus, setAutoNotifyOnStatus] = useState(
    evolution.autoNotifyOnStatus,
  );
  const [assistantName, setAssistantName] = useState(
    evolution.assistantName || 'Brenda',
  );
  const [tone, setTone] = useState<BotTone>(evolution.tone || 'acolhedor');
  const [customInstructions, setCustomInstructions] = useState(
    evolution.customInstructions || '',
  );
  const [allowAiOrderCreation, setAllowAiOrderCreation] = useState(
    evolution.allowAiOrderCreation !== false,
  );
  const [upsellEnabled, setUpsellEnabled] = useState(
    evolution.upsellEnabled !== false,
  );
  const [humanHandoffEnabled, setHumanHandoffEnabled] = useState(
    evolution.humanHandoffEnabled !== false,
  );
  const [typingPresenceEnabled, setTypingPresenceEnabled] = useState(
    evolution.typingPresenceEnabled !== false,
  );
  const [typingMinDelayMs, setTypingMinDelayMs] = useState(
    evolution.typingMinDelayMs ?? 1800,
  );
  const [typingMaxDelayMs, setTypingMaxDelayMs] = useState(
    evolution.typingMaxDelayMs ?? 4800,
  );
  const [antiBanPacingMs, setAntiBanPacingMs] = useState(
    evolution.antiBanPacingMs ?? 2200,
  );
  const [disableLinkPreview, setDisableLinkPreview] = useState(
    evolution.disableLinkPreview !== false,
  );
  const [optOutEnabled, setOptOutEnabled] = useState(
    evolution.optOutEnabled !== false,
  );
  const [templates, setTemplates] = useState<EvolutionTemplates>(
    evolution.templates,
  );

  // API credentials state
  const [envStatus, setEnvStatus] = useState({
    evolutionConfigured: false,
    evolutionApiUrl: '',
    evolutionKeyPreview: '',
    openAiConfigured: false,
    openAiModel: 'gpt-4o-mini',
    openAiKeyPreview: '',
    googleMapsConfigured: false,
    googleMapsKeyPreview: '',
  });
  const [evolutionApiUrlInput, setEvolutionApiUrlInput] = useState('');
  const [evolutionApiKeyInput, setEvolutionApiKeyInput] = useState('');
  const [openAiApiKeyInput, setOpenAiApiKeyInput] = useState('');
  const [openAiModelInput, setOpenAiModelInput] = useState('gpt-4o-mini');
  const [googleMapsApiKeyInput, setGoogleMapsApiKeyInput] = useState('');

  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setName(store.name);
    setSegment(store.segment);
    setDescription(store.description);
    setOpeningHours(store.openingHours);
    setAutoScheduleEnabled(store.autoScheduleEnabled !== false);
    const parsed = parseOpeningHoursString(store.openingHours);
    const nextDays =
      store.openingSchedule?.days ?? parsed?.days ?? [1, 2, 3, 4, 5, 6];
    const nextShifts = store.openingSchedule?.shifts ??
      parsed?.shifts.map((s) => ({ open: s.open, close: s.close })) ?? [
        { open: '11:00', close: '15:00' },
      ];
    setScheduleDays(nextDays);
    setShift1Open(nextShifts[0]?.open ?? '11:00');
    setShift1Close(nextShifts[0]?.close ?? '15:00');
    setShift2Enabled(nextShifts.length > 1);
    setShift2Open(nextShifts[1]?.open ?? '18:00');
    setShift2Close(nextShifts[1]?.close ?? '22:00');
    setPhone(store.phone);
    setAddress(store.address);
    setNeighborhood(store.neighborhood);
    setDeliveryFee(String(store.deliveryFee));
    setDeliveryFeeMode(store.deliveryFeeMode ?? 'distancia');
    setMaxDeliveryKm(String(store.maxDeliveryKm ?? 12));
    setDistanceFeeTiers(store.distanceFeeTiers ?? []);
    setNeighborhoodFees(store.neighborhoodFees ?? []);
    setFreeDeliveryMin(String(store.freeDeliveryMin));
    setEstimatedMinutes(String(store.estimatedMinutes));
    setHeroImage(store.heroImage);
    setLogoImage(store.logoImage ?? '');
    setHeroImgFailed(false);
    setLogoImgFailed(false);
  }, [store]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    setInstanceName(evolution.instanceName);
    setAutoReplyEnabled(evolution.autoReplyEnabled);
    setAutoNotifyOnStatus(evolution.autoNotifyOnStatus);
    setAssistantName(evolution.assistantName || 'Brenda');
    setTone(evolution.tone || 'acolhedor');
    setCustomInstructions(evolution.customInstructions || '');
    setAllowAiOrderCreation(evolution.allowAiOrderCreation !== false);
    setUpsellEnabled(evolution.upsellEnabled !== false);
    setHumanHandoffEnabled(evolution.humanHandoffEnabled !== false);
    setTypingPresenceEnabled(evolution.typingPresenceEnabled !== false);
    setTypingMinDelayMs(evolution.typingMinDelayMs ?? 1800);
    setTypingMaxDelayMs(evolution.typingMaxDelayMs ?? 4800);
    setAntiBanPacingMs(evolution.antiBanPacingMs ?? 2200);
    setDisableLinkPreview(evolution.disableLinkPreview !== false);
    setOptOutEnabled(evolution.optOutEnabled !== false);
    setTemplates(evolution.templates);
  }, [evolution]);

  useEffect(() => {
    fetch('/api/evolution/instance')
      .then((res) => res.json())
      .then((data) => {
        if (data?.envStatus) {
          setEnvStatus(data.envStatus);
          if (data.envStatus.evolutionApiUrl) {
            setEvolutionApiUrlInput(data.envStatus.evolutionApiUrl);
          }
          if (data.envStatus.openAiModel) {
            setOpenAiModelInput(data.envStatus.openAiModel);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveStore = async (
    e: React.FormEvent,
    sectorLabel = 'Loja e entrega',
  ) => {
    e.preventDefault();
    setSavingStore(true);
    setFeedback(null);
    const cleanedTiers = [...distanceFeeTiers]
      .filter((t) => Number(t.maxKm) > 0)
      .map((t) => ({
        ...t,
        maxKm: Number(t.maxKm),
        fee: Math.max(0, Number(t.fee) || 0),
        estimatedMinutes: Math.max(5, Number(t.estimatedMinutes) || 30),
      }))
      .sort((a, b) => a.maxKm - b.maxKm);

    const cleanedNeighborhoods = neighborhoodFees
      .filter((n) => n.neighborhood.trim().length > 0)
      .map((n) => ({
        ...n,
        neighborhood: n.neighborhood.trim(),
        fee: Math.max(0, Number(n.fee) || 0),
        estimatedMinutes: Math.max(5, Number(n.estimatedMinutes) || 30),
      }));

    const activeShifts: StoreHourShift[] = [{ open: shift1Open, close: shift1Close }];
    if (shift2Enabled && shift2Open && shift2Close) {
      activeShifts.push({ open: shift2Open, close: shift2Close });
    }

    try {
      await onUpdateStore({
        name: name.trim() || store.name,
        segment: segment.trim() || store.segment,
        description: description.trim() || store.description,
        openingHours: openingHours.trim(),
        autoScheduleEnabled,
        timezone: store.timezone || 'America/Sao_Paulo',
        openingSchedule: {
          days: scheduleDays,
          shifts: activeShifts,
        },
        phone: phone.trim(),
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        deliveryFee: Math.max(0, Number(deliveryFee) || 0),
        deliveryFeeMode,
        maxDeliveryKm: Math.max(1, Number(maxDeliveryKm) || 12),
        distanceFeeTiers: cleanedTiers,
        neighborhoodFees: cleanedNeighborhoods,
        freeDeliveryMin: Math.max(0, Number(freeDeliveryMin) || 0),
        estimatedMinutes: Math.max(5, Number(estimatedMinutes) || 30),
        heroImage: heroImage.trim() || COVER_PRESETS[0].url,
        logoImage: logoImage.trim(),
      });
      setDistanceFeeTiers(cleanedTiers);
      setNeighborhoodFees(cleanedNeighborhoods);
      setFeedback({
        type: 'ok',
        message: `Configurações de "${sectorLabel}" salvas com sucesso.`,
      });
    } finally {
      setSavingStore(false);
    }
  };

  const syncScheduleText = (
    nextDays: number[],
    s1Open: string,
    s1Close: string,
    s2On: boolean,
    s2Open: string,
    s2Close: string,
  ) => {
    const shifts: StoreHourShift[] = [{ open: s1Open, close: s1Close }];
    if (s2On && s2Open && s2Close) {
      shifts.push({ open: s2Open, close: s2Close });
    }
    setOpeningHours(formatOpeningScheduleLabel(nextDays, shifts));
  };

  const handleCoverFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    setFeedback(null);
    try {
      const dataUrl = await readAndCompressImage(file, {
        maxWidth: 1400,
        maxHeight: 700,
        quality: 0.84,
      });
      setHeroImage(dataUrl);
      setHeroImgFailed(false);
      await onUpdateStore({ heroImage: dataUrl });
      setFeedback({
        type: 'ok',
        message: 'Capa do Cardápio Online atualizada e publicada.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível processar a imagem da capa.',
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleLogoFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    setFeedback(null);
    try {
      const dataUrl = await readAndCompressImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.88,
      });
      setLogoImage(dataUrl);
      setLogoImgFailed(false);
      await onUpdateStore({ logoImage: dataUrl });
      setFeedback({
        type: 'ok',
        message: 'Logo da empresa atualizado em todo o sistema.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível processar a imagem do logo.',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAddDistanceTier = () => {
    const lastMax = distanceFeeTiers.reduce(
      (max, t) => Math.max(max, Number(t.maxKm) || 0),
      0,
    );
    const lastFee =
      distanceFeeTiers.length > 0
        ? distanceFeeTiers[distanceFeeTiers.length - 1].fee
        : Number(deliveryFee) || 5;
    setDistanceFeeTiers((prev) => [
      ...prev,
      {
        id: `dist-${Date.now()}`,
        maxKm: lastMax + 3,
        fee: Number((lastFee + 3).toFixed(2)),
        estimatedMinutes: 40,
      },
    ]);
  };

  const handleAddNeighborhoodRule = () => {
    setNeighborhoodFees((prev) => [
      ...prev,
      {
        id: `nb-${Date.now()}`,
        neighborhood: '',
        fee: Number(deliveryFee) || 7.5,
        estimatedMinutes: Number(estimatedMinutes) || 35,
      },
    ]);
  };

  const handleSimulateDistanceFee = async () => {
    if (!simAddress.trim()) return;
    setSimBusy(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/maps/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originAddress: `${address}, ${neighborhood}, Brasil`,
          destinationAddress: simAddress.trim(),
          subtotal: 35,
          deliveryMode: 'entrega',
          storeOverride: {
            ...store,
            deliveryFee: Math.max(0, Number(deliveryFee) || 0),
            deliveryFeeMode,
            maxDeliveryKm: Math.max(1, Number(maxDeliveryKm) || 12),
            distanceFeeTiers,
            neighborhoodFees,
            freeDeliveryMin: Math.max(0, Number(freeDeliveryMin) || 0),
            estimatedMinutes: Math.max(5, Number(estimatedMinutes) || 30),
          },
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setSimResult({
          distanceKm: data.distanceKm ?? null,
          deliveryFee: data.deliveryFee ?? 0,
          estimatedMinutes: data.routeDurationMinutes ?? data.estimatedMinutes ?? 35,
          matchedRuleLabel: data.matchedRuleLabel ?? '',
          outOfRange: Boolean(data.outOfRange),
          usedGoogleRoutes: Boolean(data.usedGoogleRoutes),
          quotaExceeded: Boolean(data.quotaExceeded),
          apiError: data.apiError,
        });
      }
    } catch {
      // Ignore network errors
    } finally {
      setSimBusy(false);
    }
  };

  const handleSelectCoverPreset = async (url: string) => {
    setHeroImage(url);
    setHeroImgFailed(false);
    await onUpdateStore({ heroImage: url });
    setFeedback({
      type: 'ok',
      message: 'Capa do Cardápio Online alterada.',
    });
  };

  const customerMenuUrl = origin ? `${origin}/cardapio` : '/cardapio';
  const courierPortalUrl = origin ? `${origin}/motoboy` : '/motoboy';
  const kitchenPortalUrl = origin ? `${origin}/cozinha` : '/cozinha';
  const staffPortalUrl = origin ? `${origin}/equipe` : '/equipe';

  const handleCopyPortalLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkKey(key);
      setTimeout(() => {
        setCopiedLinkKey((prev) => (prev === key ? null : prev));
      }, 2400);
    } catch {
      // Fallback ignored in restricted frames
    }
  };

  const handleSaveEvolutionConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('update_config');
    setFeedback(null);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          instanceName,
          autoReplyEnabled,
          autoNotifyOnStatus,
          assistantName,
          tone,
          customInstructions,
          allowAiOrderCreation,
          upsellEnabled,
          humanHandoffEnabled,
          typingPresenceEnabled,
          typingMinDelayMs,
          typingMaxDelayMs,
          antiBanPacingMs,
          disableLinkPreview,
          optOutEnabled,
          templates,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        evolution?: EvolutionConfig;
        error?: string;
      };
      if (data.ok && data.evolution) {
        onUpdateEvolution(data.evolution);
        setFeedback({
          type: 'ok',
          message: `Configurações da atendente ${assistantName || 'Brenda'}, WhatsApp e proteção anti-ban salvas.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Não foi possível salvar as configurações.',
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstanceAction = async (
    action: 'connect' | 'simulate_scan' | 'disconnect' | 'configure_webhook',
  ) => {
    setBusyAction(action);
    setFeedback(null);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instanceName }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        qrBase64?: string | null;
        evolution?: EvolutionConfig;
        webhookUrl?: string;
        warning?: string;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: data.error || 'Erro ao executar ação na Evolution API.',
        });
      } else {
        if (data.qrBase64) setQrBase64(data.qrBase64);
        if (action === 'simulate_scan' || action === 'disconnect') {
          setQrBase64(null);
        }
        if (data.evolution) onUpdateEvolution(data.evolution);
        if (data.webhookUrl) {
          setFeedback({
            type: 'ok',
            message: `Webhook registrado em ${data.webhookUrl}`,
          });
        } else if (data.warning) {
          setFeedback({ type: 'ok', message: data.warning });
        } else if (action === 'simulate_scan') {
          setFeedback({
            type: 'ok',
            message: 'Instância WhatsApp pareada e conectada.',
          });
        } else if (action === 'disconnect') {
          setFeedback({
            type: 'ok',
            message: 'Instância desconectada.',
          });
        }
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveOptOut = async (targetPhone: string) => {
    setBusyAction('remove_opt_out');
    setFeedback(null);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_opt_out', phone: targetPhone }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        evolution?: EvolutionConfig;
      };
      if (data.ok && data.evolution) {
        onUpdateEvolution(data.evolution);
        setFeedback({
          type: 'ok',
          message: `Número ${targetPhone} liberado da lista de opt-out.`,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveApiCredentials = async (
    e?: React.FormEvent,
    clearFlags?: {
      clearEvolutionKey?: boolean;
      clearOpenAiKey?: boolean;
      clearGoogleMapsKey?: boolean;
    },
  ) => {
    e?.preventDefault();
    setBusyAction('save_api_credentials');
    setFeedback(null);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_api_credentials',
          evolutionApiUrl: evolutionApiUrlInput,
          evolutionApiKey: evolutionApiKeyInput,
          openAiApiKey: openAiApiKeyInput,
          openAiModel: openAiModelInput,
          googleMapsApiKey: googleMapsApiKeyInput,
          clearEvolutionKey: clearFlags?.clearEvolutionKey,
          clearOpenAiKey: clearFlags?.clearOpenAiKey,
          clearGoogleMapsKey: clearFlags?.clearGoogleMapsKey,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        envStatus?: typeof envStatus;
        error?: string;
      };
      if (data.ok && data.envStatus) {
        setEnvStatus(data.envStatus);
        setEvolutionApiKeyInput('');
        setOpenAiApiKeyInput('');
        setGoogleMapsApiKeyInput('');
        setFeedback({
          type: 'ok',
          message: 'Credenciais salvas com segurança no servidor do painel.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Erro ao salvar credenciais.',
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestApiConnection = async (
    target: 'test_openai' | 'test_evolution',
  ) => {
    setBusyAction(target);
    setFeedback(null);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: target }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
      };
      setFeedback({
        type: data.ok ? 'ok' : 'error',
        message: data.ok
          ? data.message || 'Conexão validada.'
          : data.error || 'Falha ao validar conexão.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const statusText =
    evolution.connectionStatus === 'conectado'
      ? 'WhatsApp Conectado'
      : evolution.connectionStatus === 'aguardando_qr'
        ? 'Aguardando QR Code'
        : evolution.connectionStatus === 'simulador'
          ? 'Simulador Local Ativo'
          : 'Desconectado';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Configurações do Sistema
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Configure cada setor separadamente: dados da loja, horários, taxas de entrega, identidade visual, links, atendente IA e APIs.
          </p>
        </div>

        {onOpenChatInbox && (
          <button
            type="button"
            onClick={onOpenChatInbox}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>Ir para Atendimento IA</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Unified Settings Layout: Grouped Left Rail + Active Sector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Settings Navigation Rail */}
        <aside className="lg:col-span-3 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-2 flex lg:flex-col gap-1 lg:gap-3 overflow-x-auto">
          {SETTINGS_TAB_GROUPS.map((group, groupIdx) => (
            <div
              key={group.groupLabel}
              className={`flex lg:flex-col gap-1 shrink-0 lg:w-full ${
                groupIdx > 0
                  ? 'lg:pt-3 lg:border-t lg:border-slate-100 dark:lg:border-slate-800'
                  : ''
              }`}
            >
              <p className="hidden lg:block px-3 pt-1 pb-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {group.groupLabel}
              </p>
              {group.tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors shrink-0 lg:w-full ${
                      active
                        ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        active ? 'text-brand-600 dark:text-brand-400' : ''
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold whitespace-nowrap">{tab.label}</p>
                      <p className="hidden lg:block mt-0.5 text-[11px] opacity-80 leading-snug">
                        {tab.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Active Configuration Content */}
        <div className="lg:col-span-9 space-y-6">
          {/* SECTOR 1: DADOS DA LOJA */}
          {activeTab === 'loja' && (
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Dados Gerais da Loja
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Identificação, endereço de retirada e status operacional exibidos no Cardápio Online e pela {assistantName || 'Brenda'}.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onToggleStoreOpen}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    store.isOpen
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                  }`}
                >
                  {store.isOpen ? 'Operação Liberada' : 'Pausa Manual Ativa'}
                </button>
              </div>

              <form
                onSubmit={(e) => handleSaveStore(e, 'Dados da Loja')}
                className="p-6 space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="cfg-store-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Nome do Estabelecimento
                    </label>
                    <input
                      id="cfg-store-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-store-segment"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Especialidade / Segmento
                    </label>
                    <input
                      id="cfg-store-segment"
                      value={segment}
                      onChange={(e) => setSegment(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cfg-store-desc"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Descrição Curta da Vitrine
                  </label>
                  <textarea
                    id="cfg-store-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="cfg-store-phone"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      WhatsApp de Contato
                    </label>
                    <input
                      id="cfg-store-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-store-address"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Endereço da Cozinha (Retirada)
                    </label>
                    <input
                      id="cfg-store-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-store-neighborhood"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Bairro / Cidade
                    </label>
                    <input
                      id="cfg-store-neighborhood"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingStore}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{savingStore ? 'Salvando...' : 'Salvar Dados da Loja'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* SECTOR 2: HORÁRIOS DE FUNCIONAMENTO */}
          {activeTab === 'horarios' && (
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Horários e Turnos de Funcionamento
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Controle automático de abertura e fechamento no fuso de Brasília, dias de atendimento e texto exibido aos clientes.
                </p>
              </div>

              <form
                onSubmit={(e) => handleSaveStore(e, 'Horários')}
                className="p-6 space-y-5"
              >
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                  {(() => {
                    const previewShifts: StoreHourShift[] = [
                      { open: shift1Open, close: shift1Close },
                    ];
                    if (shift2Enabled && shift2Open && shift2Close) {
                      previewShifts.push({ open: shift2Open, close: shift2Close });
                    }
                    const livePreview = getStoreAvailability({
                      isOpen: store.isOpen,
                      openingHours,
                      autoScheduleEnabled,
                      timezone: store.timezone || 'America/Sao_Paulo',
                      openingSchedule: {
                        days: scheduleDays,
                        shifts: previewShifts,
                      },
                    });
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                            <span>Horário de Funcionamento Automático</span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Agora são <strong className="font-mono-tabular">{livePreview.currentTimeLabel}</strong> (Brasília) · Status no cardápio:{' '}
                            <strong
                              className={
                                livePreview.isOpen
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-700 dark:text-red-400'
                              }
                            >
                              {livePreview.statusLabel}
                            </strong>
                          </p>
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={autoScheduleEnabled}
                            onChange={(e) => setAutoScheduleEnabled(e.target.checked)}
                            className="accent-brand-600 w-4 h-4"
                          />
                          <span>Fechar fora do horário</span>
                        </label>
                      </div>
                    );
                  })()}

                  <div>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Dias de atendimento
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_OPTIONS.map((opt) => {
                        const active = scheduleDays.includes(opt.day);
                        return (
                          <button
                            key={opt.day}
                            type="button"
                            onClick={() => {
                              const nextDays = active
                                ? scheduleDays.filter((d) => d !== opt.day)
                                : [...scheduleDays, opt.day].sort((a, b) => a - b);
                              setScheduleDays(nextDays);
                              syncScheduleText(
                                nextDays,
                                shift1Open,
                                shift1Close,
                                shift2Enabled,
                                shift2Open,
                                shift2Close,
                              );
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                              active
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {opt.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <label
                        htmlFor="cfg-shift1-open"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Abre (1º Turno)
                      </label>
                      <input
                        id="cfg-shift1-open"
                        type="time"
                        value={shift1Open}
                        onChange={(e) => {
                          const v = e.target.value;
                          setShift1Open(v);
                          syncScheduleText(
                            scheduleDays,
                            v,
                            shift1Close,
                            shift2Enabled,
                            shift2Open,
                            shift2Close,
                          );
                        }}
                        className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="cfg-shift1-close"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Fecha (1º Turno)
                      </label>
                      <input
                        id="cfg-shift1-close"
                        type="time"
                        value={shift1Close}
                        onChange={(e) => {
                          const v = e.target.value;
                          setShift1Close(v);
                          syncScheduleText(
                            scheduleDays,
                            shift1Open,
                            v,
                            shift2Enabled,
                            shift2Open,
                            shift2Close,
                          );
                        }}
                        className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>

                    {shift2Enabled ? (
                      <>
                        <div>
                          <label
                            htmlFor="cfg-shift2-open"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                          >
                            Abre (2º Turno)
                          </label>
                          <input
                            id="cfg-shift2-open"
                            type="time"
                            value={shift2Open}
                            onChange={(e) => {
                              const v = e.target.value;
                              setShift2Open(v);
                              syncScheduleText(
                                scheduleDays,
                                shift1Open,
                                shift1Close,
                                true,
                                v,
                                shift2Close,
                              );
                            }}
                            className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label
                              htmlFor="cfg-shift2-close"
                              className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                            >
                              Fecha (2º Turno)
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setShift2Enabled(false);
                                syncScheduleText(
                                  scheduleDays,
                                  shift1Open,
                                  shift1Close,
                                  false,
                                  shift2Open,
                                  shift2Close,
                                );
                              }}
                              className="text-[10px] text-red-600 hover:underline"
                            >
                              Remover
                            </button>
                          </div>
                          <input
                            id="cfg-shift2-close"
                            type="time"
                            value={shift2Close}
                            onChange={(e) => {
                              const v = e.target.value;
                              setShift2Close(v);
                              syncScheduleText(
                                scheduleDays,
                                shift1Open,
                                shift1Close,
                                true,
                                shift2Open,
                                v,
                              );
                            }}
                            className="w-full px-2.5 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShift2Enabled(true);
                            syncScheduleText(
                              scheduleDays,
                              shift1Open,
                              shift1Close,
                              true,
                              shift2Open,
                              shift2Close,
                            );
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800 hover:bg-brand-50 rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Adicionar 2º turno (ex.: Jantar)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cfg-store-hours"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Texto Exibido no Cardápio
                  </label>
                  <input
                    id="cfg-store-hours"
                    value={openingHours}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOpeningHours(val);
                      const parsed = parseOpeningHoursString(val);
                      if (parsed) {
                        setScheduleDays(parsed.days);
                        setShift1Open(parsed.shifts[0]?.open ?? shift1Open);
                        setShift1Close(parsed.shifts[0]?.close ?? shift1Close);
                        if (parsed.shifts.length > 1) {
                          setShift2Enabled(true);
                          setShift2Open(parsed.shifts[1].open);
                          setShift2Close(parsed.shifts[1].close);
                        } else {
                          setShift2Enabled(false);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingStore}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{savingStore ? 'Salvando...' : 'Salvar Horários'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* SECTOR 3: TAXAS E ENTREGA */}
          {activeTab === 'entrega' && (
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Taxas, Prazos e Área de Entrega
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Defina a política de frete (distância, bairro ou taxa fixa), valor de frete grátis e simule entregas pelo endereço.
                </p>
              </div>

              <form
                onSubmit={(e) => handleSaveStore(e, 'Taxas e Entrega')}
                className="p-6 space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="cfg-store-fee"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Taxa Padrão / Fallback (R$)
                    </label>
                    <input
                      id="cfg-store-fee"
                      type="number"
                      step="0.5"
                      min="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-store-free"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Frete Grátis a partir (R$)
                    </label>
                    <input
                      id="cfg-store-free"
                      type="number"
                      step="1"
                      min="0"
                      value={freeDeliveryMin}
                      onChange={(e) => setFreeDeliveryMin(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-store-eta"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Previsão Média (min)
                    </label>
                    <input
                      id="cfg-store-eta"
                      type="number"
                      min="5"
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Regra de Cobrança da Taxa de Entrega
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Escolha como o frete é calculado no cardápio do cliente e nos pedidos do balcão.
                    </p>
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          {
                            id: 'distancia' as const,
                            label: 'Por Distância (km)',
                            desc: 'Google Maps calcula a rota',
                          },
                          {
                            id: 'bairro' as const,
                            label: 'Por Bairro / Região',
                            desc: 'Tabela por nome do bairro',
                          },
                          {
                            id: 'fixa' as const,
                            label: 'Taxa Fixa Única',
                            desc: 'Valor único p/ qualquer local',
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDeliveryFeeMode(opt.id)}
                          className={`p-3 text-left rounded-lg border transition-colors ${
                            deliveryFeeMode === opt.id
                              ? 'bg-brand-50 dark:bg-brand-950/50 border-brand-600 text-brand-900 dark:text-brand-200'
                              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <p className="text-xs font-bold">{opt.label}</p>
                          <p className="text-[11px] opacity-80 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {deliveryFeeMode === 'distancia' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div className="w-full sm:w-56">
                          <label
                            htmlFor="cfg-max-km"
                            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                          >
                            Raio Máximo de Entrega (km)
                          </label>
                          <input
                            id="cfg-max-km"
                            type="number"
                            min="1"
                            step="0.5"
                            value={maxDeliveryKm}
                            onChange={(e) => setMaxDeliveryKm(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddDistanceTier}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800 hover:bg-brand-50 rounded-lg whitespace-nowrap self-start sm:self-auto"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Adicionar Faixa de km</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {distanceFeeTiers.map((tier, idx) => (
                          <div
                            key={tier.id}
                            className="grid grid-cols-12 gap-2 items-center"
                          >
                            <div className="col-span-4">
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Até (km)
                              </label>
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={tier.maxKm}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDistanceFeeTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, maxKm: val } : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-4">
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Valor (R$)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={tier.fee}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setDistanceFeeTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, fee: val } : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="block text-[10px] text-slate-500 mb-0.5">
                                Prazo (min)
                              </label>
                              <input
                                type="number"
                                min="5"
                                step="5"
                                value={tier.estimatedMinutes ?? 35}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 35;
                                  setDistanceFeeTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, estimatedMinutes: val }
                                        : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-1 pt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  setDistanceFeeTiers((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                                aria-label="Remover faixa de distância"
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Live Google Maps Distance Simulator */}
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                          <span>Simulador de Frete por Endereço (Google Maps)</span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={simAddress}
                            onChange={(e) => setSimAddress(e.target.value)}
                            placeholder="Digite um endereço de cliente para simular..."
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                          <button
                            type="button"
                            disabled={simBusy}
                            onClick={handleSimulateDistanceFee}
                            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg whitespace-nowrap disabled:opacity-60"
                          >
                            {simBusy ? 'Calculando...' : 'Simular Frete'}
                          </button>
                        </div>

                        {simResult && (
                          <div
                            className={`p-3 rounded-lg border text-xs ${
                              simResult.outOfRange || simResult.quotaExceeded
                                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                            }`}
                          >
                            {simResult.distanceKm !== null ? (
                              <p className="font-mono-tabular">
                                Distância: <strong>{simResult.distanceKm.toFixed(1)} km</strong> ·{' '}
                                ~{simResult.estimatedMinutes} min ·{' '}
                                {simResult.matchedRuleLabel} · Taxa:{' '}
                                <strong>{formatCurrencyBRL(simResult.deliveryFee)}</strong>
                              </p>
                            ) : (
                              <p>
                                {simResult.apiError ||
                                  'Não foi possível medir a rota exata. Aplicada taxa padrão:'}{' '}
                                <strong className="font-mono-tabular">
                                  {formatCurrencyBRL(simResult.deliveryFee)}
                                </strong>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {deliveryFeeMode === 'bairro' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                          <span>Tabela de Taxas por Bairro</span>
                        </p>
                        <button
                          type="button"
                          onClick={handleAddNeighborhoodRule}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800 hover:bg-brand-50 rounded-lg whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Adicionar Bairro</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {neighborhoodFees.map((rule, idx) => (
                          <div
                            key={rule.id}
                            className="grid grid-cols-12 gap-2 items-center"
                          >
                            <div className="col-span-5">
                              <input
                                type="text"
                                value={rule.neighborhood}
                                placeholder="Nome do bairro"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNeighborhoodFees((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, neighborhood: val } : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={rule.fee}
                                aria-label="Taxa do bairro"
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setNeighborhoodFees((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, fee: val } : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="number"
                                min="5"
                                step="5"
                                value={rule.estimatedMinutes ?? 35}
                                aria-label="Prazo em minutos"
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 35;
                                  setNeighborhoodFees((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, estimatedMinutes: val }
                                        : item,
                                    ),
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                              />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  setNeighborhoodFees((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                                aria-label="Remover bairro"
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {deliveryFeeMode === 'fixa' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      Todas as entregas utilizarão a taxa única de{' '}
                      <strong className="font-mono-tabular text-slate-900 dark:text-white">
                        {formatCurrencyBRL(Number(deliveryFee) || 0)}
                      </strong>{' '}
                      com previsão média de{' '}
                      <strong className="font-mono-tabular text-slate-900 dark:text-white">
                        {estimatedMinutes || '30'} min
                      </strong>
                      {Number(freeDeliveryMin) > 0
                        ? ` (isenção automática em pedidos a partir de ${formatCurrencyBRL(Number(freeDeliveryMin))}).`
                        : '.'}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingStore}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{savingStore ? 'Salvando...' : 'Salvar Taxas e Entrega'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* SECTOR 4: VISUAL E MARCA */}
          {activeTab === 'visual' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <section className="xl:col-span-7 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Identidade Visual e Imagens
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gerencie o logo exibido nos painéis e a capa do Cardápio Online do cliente.
                  </p>
                </div>

                <form
                  onSubmit={(e) => handleSaveStore(e, 'Visual e Marca')}
                  className="p-6 space-y-6"
                >
                  {/* Company Logo Configuration */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Logo da Empresa
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Exibido no painel administrativo, no cardápio digital e nos portais da equipe.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {logoImage.trim() && (
                          <button
                            type="button"
                            onClick={async () => {
                              setLogoImage('');
                              setLogoImgFailed(false);
                              await onUpdateStore({ logoImage: '' });
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                          >
                            Remover
                          </button>
                        )}
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg cursor-pointer whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{uploadingLogo ? 'Enviando...' : 'Enviar Logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoFileUpload}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                        {logoImage.trim() && !logoImgFailed ? (
                          <img
                            src={logoImage}
                            alt={`Logo ${name}`}
                            referrerPolicy="no-referrer"
                            onError={() => setLogoImgFailed(true)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-extrabold text-brand-600 dark:text-brand-400">
                            {(name || 'P').trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <input
                        id="cfg-store-logo"
                        value={logoImage}
                        onChange={(e) => {
                          setLogoImage(e.target.value);
                          setLogoImgFailed(false);
                        }}
                        placeholder="Ou cole a URL do logo (https://...)"
                        className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Cover Image */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Capa do Cardápio Online
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Banner exibido no topo da página de pedidos do cliente.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg cursor-pointer whitespace-nowrap">
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{uploadingCover ? 'Enviando...' : 'Enviar Nova Capa'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCoverFileUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>

                    <div>
                      <label
                        htmlFor="cfg-store-hero"
                        className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Link (URL) da imagem de capa
                      </label>
                      <input
                        id="cfg-store-hero"
                        value={heroImage}
                        onChange={(e) => {
                          setHeroImage(e.target.value);
                          setHeroImgFailed(false);
                        }}
                        placeholder="https://... ou /images/..."
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Ou escolha uma capa pronta:
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {COVER_PRESETS.map((preset) => {
                          const selected = heroImage === preset.url;
                          return (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => handleSelectCoverPreset(preset.url)}
                              title={preset.label}
                              className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                                selected
                                  ? 'border-brand-600 ring-2 ring-brand-500/30'
                                  : 'border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={preset.url}
                                alt={preset.label}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingStore}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{savingStore ? 'Salvando...' : 'Salvar Visual e Marca'}</span>
                    </button>
                  </div>
                </form>
              </section>

              <aside className="xl:col-span-5 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Prévia da Vitrine do Cliente
                  </p>
                </div>
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                  {heroImgFailed || !heroImage.trim() ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                      <Store className="w-8 h-8 mb-2" aria-hidden="true" />
                      <span className="text-sm font-medium">{name || store.name}</span>
                    </div>
                  ) : (
                    <img
                      src={heroImage}
                      alt={name || store.name}
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-brand-600 text-white flex items-center justify-center shrink-0">
                      {logoImage.trim() && !logoImgFailed ? (
                        <img
                          src={logoImage}
                          alt={name || store.name}
                          referrerPolicy="no-referrer"
                          onError={() => setLogoImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-extrabold">
                          {(name || 'P').trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {segment || store.segment} · {neighborhood || store.neighborhood}
                      </p>
                      <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white truncate">
                        {name || store.name}
                      </h3>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cobrança de frete</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {deliveryFeeMode === 'distancia'
                          ? `Por distância (até ${maxDeliveryKm} km)`
                          : deliveryFeeMode === 'bairro'
                            ? `Por bairro (${neighborhoodFees.length})`
                            : `Fixa (${formatCurrencyBRL(Number(deliveryFee) || 0)})`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Frete grátis acima de</span>
                      <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrencyBRL(Number(freeDeliveryMin) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tempo médio</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {estimatedMinutes || store.estimatedMinutes} min
                      </span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* SECTOR 5: LINKS E PORTAIS */}
          {activeTab === 'links' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Menu Portal */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Cardápio Online do Cliente</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Envie este link no WhatsApp, Instagram ou QR Code para o cliente montar e acompanhar pedidos direto.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={customerMenuUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link público do cardápio para clientes"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyPortalLink('cliente', customerMenuUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {copiedLinkKey === 'cliente' ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="/cardapio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Cardápio</span>
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Peça pelo nosso cardápio digital (${store.name}): ${customerMenuUrl}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg whitespace-nowrap"
                  >
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Compartilhar WhatsApp</span>
                  </a>
                </div>
              </section>

              {/* Courier Portal */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bike className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Portal do Motoboy (GPS)</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Link exclusivo para entregadores visualizarem rotas GPS, concluírem entregas e consultarem repasses.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={courierPortalUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link exclusivo do portal do motoboy"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyPortalLink('motoboy', courierPortalUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {copiedLinkKey === 'motoboy' ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-1">
                  <a
                    href="/motoboy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 rounded-lg whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Portal do Motoboy</span>
                  </a>
                </div>
              </section>

              {/* Kitchen Portal */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Portal da Cozinha &amp; Desperdícios</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Tela do tablet da cozinha com alertas de pedidos prioritários em tempo real, checklists, baixa de desperdício e gráficos.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={kitchenPortalUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link exclusivo do portal da cozinha"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyPortalLink('cozinha', kitchenPortalUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {copiedLinkKey === 'cozinha' ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-1">
                  <a
                    href="/cozinha"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Portal da Cozinha</span>
                  </a>
                </div>
              </section>

              {/* Staff Portal */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Portal do Funcionário</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Acesso pelo celular para colaboradores acompanharem tarefas, checklists, descartes e extrato de vales e pagamentos.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={staffPortalUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Link exclusivo do portal do funcionário"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyPortalLink('equipe', staffPortalUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {copiedLinkKey === 'equipe' ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-1">
                  <a
                    href="/equipe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Portal do Funcionário</span>
                  </a>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: ATENDENTE VIRTUAL IA (BRENDA) */}
          {activeTab === 'ia' && (
            <form
              onSubmit={handleSaveEvolutionConfig}
              className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-brand-50 dark:bg-brand-950/50 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                    {avatarFailed ? (
                      <Bot className="w-6 h-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    ) : (
                      <img
                        src={BRENDA_AVATAR_URL}
                        alt={`Atendente ${assistantName || 'Brenda'}`}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Personalidade e Regras da {assistantName || 'Brenda'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Motor: {envStatus.openAiConfigured ? `OpenAI (${envStatus.openAiModel})` : 'Assistente Local Conversacional (configure OpenAI na aba Credenciais)'}
                    </p>
                  </div>
                </div>

                {onOpenChatInbox && (
                  <button
                    type="button"
                    onClick={onOpenChatInbox}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Testar Conversa Ao Vivo</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label
                    htmlFor="cfg-ai-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Nome da Atendente Virtual
                  </label>
                  <input
                    id="cfg-ai-name"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    placeholder="Ex.: Brenda"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tom de Voz no WhatsApp
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {TONE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTone(opt.id)}
                        className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                          tone === opt.id
                            ? 'bg-brand-50 dark:bg-brand-950/50 border-brand-500 text-brand-700 dark:text-brand-300'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cfg-ai-instructions"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Instruções Específicas do Restaurante
                </label>
                <textarea
                  id="cfg-ai-instructions"
                  rows={3}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Ex.: Responder de forma natural, só enviar o cardápio quando pedirem, sugerir Suco Natural de Laranja..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Atendimento automático 24h
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Responde mensagens recebidas no webhook da Evolution API.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoReplyEnabled}
                    onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Fechar pedidos direto no chat
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Cria pedidos no Gestor e baixa insumos da Ficha Técnica.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowAiOrderCreation}
                    onChange={(e) => setAllowAiOrderCreation(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Sugerir bebidas e extras (Upsell)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Oferece acompanhamentos no momento certo para elevar o ticket.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={upsellEnabled}
                    onChange={(e) => setUpsellEnabled(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Transbordo automático para humano
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Pausa a IA quando o cliente pedir para falar com a equipe.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={humanHandoffEnabled}
                    onChange={(e) => setHumanHandoffEnabled(e.target.checked)}
                    className="accent-brand-600 w-4 h-4 shrink-0"
                  />
                </label>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {busyAction === 'update_config'
                      ? 'Salvando...'
                      : 'Salvar Regras da Atendente'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: WHATSAPP, ANTI-BAN & MENSAGENS AUTOMÁTICAS */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-6">
              {/* Connection Card */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Conexão WhatsApp (Evolution API v2)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Situação:{' '}
                      <span
                        className={`font-semibold ${
                          evolution.connectionStatus === 'conectado'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : evolution.connectionStatus === 'desconectado'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {statusText}
                      </span>
                    </p>
                  </div>
                  <Smartphone className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cfg-evo-instance"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Nome da Instância
                    </label>
                    <input
                      id="cfg-evo-instance"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cfg-evo-webhook"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Endpoint Webhook (MESSAGES_UPSERT)
                    </label>
                    <input
                      id="cfg-evo-webhook"
                      readOnly
                      value={evolution.webhookUrl}
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleInstanceAction('connect')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {busyAction === 'connect' ? 'Gerando...' : 'Gerar QR Code / Conectar'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleInstanceAction('configure_webhook')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                  >
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Registrar Webhook</span>
                  </button>

                  {evolution.connectionStatus === 'conectado' && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => handleInstanceAction('disconnect')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                    >
                      <Power className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Desconectar</span>
                    </button>
                  )}
                </div>

                {evolution.connectionStatus === 'aguardando_qr' && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-center gap-5">
                    {qrBase64 ? (
                      <img
                        src={
                          qrBase64.startsWith('data:')
                            ? qrBase64
                            : `data:image/png;base64,${qrBase64}`
                        }
                        alt="QR Code WhatsApp Evolution API"
                        referrerPolicy="no-referrer"
                        className="w-36 h-36 rounded-lg border border-slate-200 bg-white p-1"
                      />
                    ) : (
                      <div className="w-36 h-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-3 flex flex-col items-center justify-center text-slate-900 shrink-0">
                        <QrCode className="w-24 h-24" aria-hidden="true" />
                        <span className="text-[10px] font-mono-tabular mt-1">
                          {instanceName}
                        </span>
                      </div>
                    )}
                    <div className="space-y-2.5 text-xs">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Escaneie no WhatsApp → Aparelhos Conectados
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Com a Evolution API configurada na aba Credenciais, o QR Code real aparece aqui. Para validar localmente, conclua o pareamento simulado:
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInstanceAction('simulate_scan')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Simular Pareamento Concluído</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Anti-Ban + Templates Form */}
              <form
                onSubmit={handleSaveEvolutionConfig}
                className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
              >
                <section className="xl:col-span-6 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Proteção Anti-Ban & Digitação Humana
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Emite presença <code className="font-mono-tabular">composing</code>, varia o tempo de escrita conforme o texto, espaça disparos e bloqueia grupos e opt-out.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Simular &ldquo;digitando...&rdquo; antes de responder
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Chama <code className="font-mono-tabular">/chat/sendPresence</code> antes do envio.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={typingPresenceEnabled}
                      onChange={(e) => setTypingPresenceEnabled(e.target.checked)}
                      className="accent-brand-600 w-4 h-4 shrink-0"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="cfg-typing-min"
                        className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Delay mínimo (ms)
                      </label>
                      <input
                        id="cfg-typing-min"
                        type="number"
                        min={600}
                        max={15000}
                        step={200}
                        value={typingMinDelayMs}
                        onChange={(e) =>
                          setTypingMinDelayMs(Math.max(600, Number(e.target.value) || 1800))
                        }
                        className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="cfg-typing-max"
                        className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Delay máximo (ms)
                      </label>
                      <input
                        id="cfg-typing-max"
                        type="number"
                        min={1200}
                        max={25000}
                        step={200}
                        value={typingMaxDelayMs}
                        onChange={(e) =>
                          setTypingMaxDelayMs(Math.max(1200, Number(e.target.value) || 4800))
                        }
                        className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="cfg-antiban-pacing"
                        className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Cadência anti-rajada (ms)
                      </label>
                      <input
                        id="cfg-antiban-pacing"
                        type="number"
                        min={0}
                        max={30000}
                        step={200}
                        value={antiBanPacingMs}
                        onChange={(e) =>
                          setAntiBanPacingMs(Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Desativar pré-visualização de links (linkPreview: false)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Reduz risco de filtro antispam ao enviar link do cardápio.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={disableLinkPreview}
                      onChange={(e) => setDisableLinkPreview(e.target.checked)}
                      className="accent-brand-600 w-4 h-4 shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Opt-out automático (&ldquo;PARAR&rdquo; / &ldquo;SAIR&rdquo;) + Filtro de grupos
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Bloqueia disparos para quem pedir saída e ignora grupos (@g.us).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={optOutEnabled}
                      onChange={(e) => setOptOutEnabled(e.target.checked)}
                      className="accent-brand-600 w-4 h-4 shrink-0"
                    />
                  </label>

                  {(evolution.optOutPhones ?? []).length > 0 && (
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Contatos em Opt-Out ({evolution.optOutPhones?.length ?? 0})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(evolution.optOutPhones ?? []).map((optPhone) => (
                          <div
                            key={optPhone}
                            className="inline-flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-md text-xs font-mono-tabular"
                          >
                            <span className="text-slate-800 dark:text-slate-200">
                              {optPhone}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOptOut(optPhone)}
                              className="text-brand-600 dark:text-brand-400 font-sans font-semibold hover:underline"
                            >
                              Liberar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="xl:col-span-6 bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Mensagens Automáticas por Status
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Variáveis: <code className="font-mono-tabular">{'{cliente}'}</code> ·{' '}
                      <code className="font-mono-tabular">{'{numero}'}</code> ·{' '}
                      <code className="font-mono-tabular">{'{total}'}</code> ·{' '}
                      <code className="font-mono-tabular">{'{entregador}'}</code>
                    </p>
                  </div>

                  <label className="flex items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Avisar cliente a cada atualização do pedido
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Disparo automático ao aceitar, preparar, finalizar ou despachar.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoNotifyOnStatus}
                      onChange={(e) => setAutoNotifyOnStatus(e.target.checked)}
                      className="accent-brand-600 w-4 h-4 shrink-0"
                    />
                  </label>

                  <div className="space-y-3">
                    {(
                      [
                        { key: 'pendente', label: 'Pedido Recebido (Pendente)' },
                        { key: 'preparo', label: 'Em Preparo na Cozinha' },
                        { key: 'pronto', label: 'Pronto p/ Retirada ou Coleta' },
                        { key: 'entrega', label: 'Saiu para Entrega' },
                        { key: 'finalizado', label: 'Pedido Entregue' },
                      ] as const
                    ).map((field) => (
                      <div key={field.key}>
                        <label
                          htmlFor={`cfg-tpl-${field.key}`}
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {field.label}
                        </label>
                        <textarea
                          id={`cfg-tpl-${field.key}`}
                          rows={2}
                          value={templates[field.key]}
                          onChange={(e) =>
                            setTemplates((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={busyAction !== null}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {busyAction === 'update_config'
                          ? 'Salvando...'
                          : 'Salvar Anti-Ban e Templates'}
                      </span>
                    </button>
                  </div>
                </section>
              </form>

              {/* Audit Logs */}
              <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Auditoria de Eventos e Disparos WhatsApp
                  </h2>
                  <span className="text-xs font-mono-tabular text-slate-500">
                    {state.whatsappLogs.length} registros
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-5">Hora</th>
                        <th className="py-2.5 px-4">Cliente / Telefone</th>
                        <th className="py-2.5 px-4">Evento</th>
                        <th className="py-2.5 px-4">Mensagem</th>
                        <th className="py-2.5 px-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {state.whatsappLogs.slice(0, 15).map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3 px-5 font-mono-tabular text-slate-500 whitespace-nowrap">
                            {formatTimeBR(log.timestamp)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {log.customerName}
                            </div>
                            <div className="font-mono-tabular text-slate-500">
                              {log.phone}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            <div>
                              {log.direction === 'inbound' ? 'Entrada' : 'Saída'} ·{' '}
                              {log.event}
                            </div>
                            {log.delayMs ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                <span>Digitação {(log.delayMs / 1000).toFixed(1)}s</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 max-w-md text-slate-700 dark:text-slate-300">
                            <p className="line-clamp-2">{log.message}</p>
                          </td>
                          <td className="py-3 px-5 text-right font-medium whitespace-nowrap">
                            <span
                              className={
                                log.status === 'enviada' || log.status === 'recebida'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : log.status === 'erro'
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-slate-600 dark:text-slate-400'
                              }
                            >
                              {log.status === 'enviada'
                                ? 'Enviada'
                                : log.status === 'recebida'
                                  ? 'Recebida'
                                  : log.status === 'erro'
                                    ? 'Erro'
                                    : 'Simulada'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: CREDENCIAIS & APIS (OPENAI, EVOLUTION API & GOOGLE MAPS) */}
          {activeTab === 'apis' && (
            <section className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <span>Credenciais de APIs (OpenAI, Evolution & Google Maps)</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Configure suas chaves diretamente pelo painel administrativo. Elas ficam armazenadas apenas no servidor, sem precisar editar arquivos .env.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs shrink-0">
                  <span
                    className={`font-semibold ${
                      envStatus.openAiConfigured
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    OpenAI: {envStatus.openAiConfigured ? 'Conectada' : 'Não configurada'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span
                    className={`font-semibold ${
                      envStatus.evolutionConfigured
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    Evolution: {envStatus.evolutionConfigured ? 'Configurada' : 'Simulador'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span
                    className={`font-semibold ${
                      envStatus.googleMapsConfigured
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    Maps: {envStatus.googleMapsConfigured ? 'Ativo' : 'Pendente'}
                  </span>
                </div>
              </div>

              <form
                onSubmit={handleSaveApiCredentials}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      OpenAI (Atendente {assistantName || 'Brenda'})
                    </h3>
                    {envStatus.openAiConfigured && (
                      <span className="text-[11px] font-mono-tabular text-emerald-700 dark:text-emerald-400">
                        Ativa: {envStatus.openAiKeyPreview}
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-openai-key"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      OpenAI API Key
                    </label>
                    <input
                      id="cfg-openai-key"
                      type="password"
                      value={openAiApiKeyInput}
                      onChange={(e) => setOpenAiApiKeyInput(e.target.value)}
                      placeholder={
                        envStatus.openAiConfigured
                          ? `Salva (${envStatus.openAiKeyPreview}) — digite para substituir`
                          : 'sk-proj-...'
                      }
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-openai-model"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Modelo OpenAI
                    </label>
                    <select
                      id="cfg-openai-model"
                      value={openAiModelInput}
                      onChange={(e) => setOpenAiModelInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Rápido e econômico)</option>
                      <option value="gpt-4o">gpt-4o (Máxima precisão)</option>
                      <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                      <option value="gpt-4.1">gpt-4.1</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => handleTestApiConnection('test_openai')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      {busyAction === 'test_openai' ? 'Testando...' : 'Testar OpenAI'}
                    </button>
                    {envStatus.openAiConfigured && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          handleSaveApiCredentials(undefined, { clearOpenAiKey: true })
                        }
                        className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                      >
                        Remover chave
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Servidor Evolution API v2
                    </h3>
                    {envStatus.evolutionConfigured && (
                      <span className="text-[11px] font-mono-tabular text-emerald-700 dark:text-emerald-400">
                        Chave: {envStatus.evolutionKeyPreview}
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-evo-url"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      URL Base da Evolution API
                    </label>
                    <input
                      id="cfg-evo-url"
                      type="url"
                      value={evolutionApiUrlInput}
                      onChange={(e) => setEvolutionApiUrlInput(e.target.value)}
                      placeholder="https://api.seudominio.com"
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-evo-key"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Global API Key (apikey)
                    </label>
                    <input
                      id="cfg-evo-key"
                      type="password"
                      value={evolutionApiKeyInput}
                      onChange={(e) => setEvolutionApiKeyInput(e.target.value)}
                      placeholder={
                        envStatus.evolutionKeyPreview
                          ? `Salva (${envStatus.evolutionKeyPreview}) — digite para substituir`
                          : 'Cole a Global API Key da sua Evolution API'
                      }
                      className="w-full px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => handleTestApiConnection('test_evolution')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      {busyAction === 'test_evolution'
                        ? 'Testando...'
                        : 'Testar Evolution API'}
                    </button>
                    {envStatus.evolutionKeyPreview && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          handleSaveApiCredentials(undefined, { clearEvolutionKey: true })
                        }
                        className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                      >
                        Remover chave
                      </button>
                    )}
                  </div>
                </div>

                {/* Google Maps Platform Card */}
                <div className="lg:col-span-2 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        Google Maps Platform (Cálculo de Distância & GPS do Motoboy)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Uma chave de demonstração já está ativa para cálculo de rotas e mapa GPS. Caso deseje usar sua própria chave Google Cloud, informe abaixo.
                      </p>
                    </div>
                    {envStatus.googleMapsConfigured && (
                      <span className="text-[11px] font-mono-tabular text-emerald-700 dark:text-emerald-400">
                        Ativa: {envStatus.googleMapsKeyPreview}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="cfg-gmaps-key"
                      type="password"
                      value={googleMapsApiKeyInput}
                      onChange={(e) => setGoogleMapsApiKeyInput(e.target.value)}
                      placeholder={
                        envStatus.googleMapsConfigured
                          ? `Chave em uso (${envStatus.googleMapsKeyPreview}) — opcional: cole sua chave própria`
                          : 'AIza...'
                      }
                      className="flex-1 px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                    {envStatus.googleMapsKeyPreview && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          handleSaveApiCredentials(undefined, {
                            clearGoogleMapsKey: true,
                          })
                        }
                        className="px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg whitespace-nowrap"
                      >
                        Voltar p/ Chave Padrão
                      </button>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {busyAction === 'save_api_credentials'
                        ? 'Salvando...'
                        : 'Salvar Credenciais das APIs'}
                    </span>
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
