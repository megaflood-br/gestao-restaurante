'use client';

import { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  Route as RouteIcon,
} from 'lucide-react';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

interface RouteStepSummary {
  instruction: string;
  distanceMeters: number;
}

interface ComputedRouteSummary {
  distanceKm: number;
  durationMinutes: number;
  originLatLng?: LatLngPoint;
  destinationLatLng?: LatLngPoint;
  steps: RouteStepSummary[];
}

interface CourierGpsMapProps {
  apiKey: string;
  storeName: string;
  storeAddress: string;
  destinationLabel: string;
  destinationAddress: string;
  orderNumber: number;
  driverPosition: LatLngPoint | null;
  gpsActive: boolean;
  onToggleGps: () => void;
  onQuotaExceeded?: () => void;
}

interface RouteEngineProps {
  origin: LatLngPoint | string;
  destination: string;
  onRouteComputed: (summary: ComputedRouteSummary | null) => void;
  onRouteError: (message: string | null) => void;
  onQuotaExceeded?: () => void;
}

interface MapsPolyline {
  setOptions: (opts: Record<string, unknown>) => void;
  setMap: (target: unknown) => void;
}

interface LatLngLiteralLike {
  lat: number;
  lng: number;
}

function toPlainLatLng(loc: unknown): LatLngPoint | undefined {
  if (!loc || typeof loc !== 'object') return undefined;
  const candidate = loc as {
    lat?: number | (() => number);
    lng?: number | (() => number);
    location?: { lat?: number | (() => number); lng?: number | (() => number) };
  };
  const source = candidate.location ?? candidate;
  const latVal = typeof source.lat === 'function' ? source.lat() : source.lat;
  const lngVal = typeof source.lng === 'function' ? source.lng() : source.lng;
  if (typeof latVal === 'number' && typeof lngVal === 'number') {
    return { lat: latVal, lng: lngVal };
  }
  return undefined;
}

function RoutePolylineLayer({
  origin,
  destination,
  onRouteComputed,
  onRouteError,
  onQuotaExceeded,
}: RouteEngineProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<MapsPolyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !destination) return;

    let cancelled = false;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    onRouteError(null);

    const routeClass = (
      routesLib as unknown as {
        Route?: {
          computeRoutes: (req: unknown) => Promise<{ routes?: unknown[] }>;
        };
      }
    ).Route;

    if (!routeClass || typeof routeClass.computeRoutes !== 'function') {
      onRouteError('Serviço de rotas do Google Maps indisponível no navegador.');
      return;
    }

    const request = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    routeClass
      .computeRoutes(request)
      .then((response) => {
        if (cancelled) return;
        const routes = response?.routes ?? [];
        if (routes.length === 0) {
          onRouteComputed(null);
          onRouteError('Nenhuma rota encontrada para o endereço informado.');
          return;
        }

        const primaryRoute = routes[0] as {
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: unknown;
          createPolylines?: () => MapsPolyline[];
          path?: LatLngLiteralLike[];
          legs?: Array<{
            startLocation?: unknown;
            endLocation?: unknown;
            steps?: Array<{
              distanceMeters?: number;
              instructions?: string;
              localizedValues?: { distance?: { text?: string } };
              navigationInstruction?: { instructions?: string };
            }>;
          }>;
        };

        let createdPolylines: MapsPolyline[] = [];
        if (typeof primaryRoute.createPolylines === 'function') {
          createdPolylines = primaryRoute.createPolylines();
          createdPolylines.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#ea580c',
              strokeOpacity: 0.92,
              strokeWeight: 6,
            });
            poly.setMap(map);
          });
        } else if (Array.isArray(primaryRoute.path) && primaryRoute.path.length > 0) {
          const PolylineCtor = (
            mapsLib as unknown as {
              Polyline?: new (opts: Record<string, unknown>) => MapsPolyline;
            }
          )?.Polyline;
          if (PolylineCtor) {
            const fallbackPoly = new PolylineCtor({
              path: primaryRoute.path,
              geodesic: true,
              strokeColor: '#ea580c',
              strokeOpacity: 0.92,
              strokeWeight: 6,
              map,
            });
            createdPolylines = [fallbackPoly];
          }
        }

        polylinesRef.current = createdPolylines;

        if (primaryRoute.viewport) {
          (
            map as unknown as {
              fitBounds?: (bounds: unknown, padding?: number) => void;
            }
          ).fitBounds?.(primaryRoute.viewport, 56);
        }

        const leg = primaryRoute.legs?.[0];
        const steps: RouteStepSummary[] = (leg?.steps ?? [])
          .map((s) => ({
            instruction:
              s.navigationInstruction?.instructions ||
              s.instructions ||
              'Seguir pela via indicada',
            distanceMeters: s.distanceMeters ?? 0,
          }))
          .filter((s) => Boolean(s.instruction))
          .slice(0, 12);

        onRouteComputed({
          distanceKm: Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(2)),
          durationMinutes: Math.max(
            1,
            Math.round((primaryRoute.durationMillis ?? 60000) / 60000),
          ),
          originLatLng: toPlainLatLng(leg?.startLocation),
          destinationLatLng: toPlainLatLng(leg?.endLocation),
          steps,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Quota')
        ) {
          onQuotaExceeded?.();
        }
        onRouteComputed(null);
        onRouteError(
          'Não foi possível traçar a rota no mapa agora. Use os botões de navegação externa abaixo.',
        );
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [
    routesLib,
    mapsLib,
    map,
    origin,
    destination,
    onRouteComputed,
    onRouteError,
    onQuotaExceeded,
  ]);

  return null;
}

function InteractiveMapMarkers({
  originPos,
  destinationPos,
  driverPosition,
  storeName,
  destinationLabel,
  destinationAddress,
  orderNumber,
}: {
  originPos?: LatLngPoint;
  destinationPos?: LatLngPoint;
  driverPosition: LatLngPoint | null;
  storeName: string;
  destinationLabel: string;
  destinationAddress: string;
  orderNumber: number;
}) {
  const [destMarkerRef, destMarker] = useAdvancedMarkerRef();
  const [openInfo, setOpenInfo] = useState(false);

  return (
    <>
      {originPos && (
        <AdvancedMarker position={originPos} title={`Loja: ${storeName}`}>
          <Pin
            background="#0f172a"
            borderColor="#020617"
            glyphColor="#ffffff"
            glyphText="L"
          />
        </AdvancedMarker>
      )}

      {driverPosition && (
        <AdvancedMarker position={driverPosition} title="Sua localização GPS atual">
          <Pin
            background="#2563eb"
            borderColor="#1d4ed8"
            glyphColor="#ffffff"
            glyphText="M"
            scale={1.15}
          />
        </AdvancedMarker>
      )}

      {destinationPos && (
        <>
          <AdvancedMarker
            ref={destMarkerRef}
            position={destinationPos}
            onClick={() => setOpenInfo((prev) => !prev)}
            title={`Pedido #${orderNumber} · ${destinationLabel}`}
          >
            <Pin
              background="#16a34a"
              borderColor="#15803d"
              glyphColor="#ffffff"
              glyphText={`#${orderNumber}`}
              scale={1.2}
            />
          </AdvancedMarker>
          {openInfo && destMarker && (
            <InfoWindow
              anchor={destMarker}
              maxWidth={240}
              onCloseClick={() => setOpenInfo(false)}
            >
              <div className="p-1 text-slate-900 text-xs space-y-1">
                <p className="font-bold">
                  Pedido #{orderNumber} · {destinationLabel}
                </p>
                <p className="text-slate-600">{destinationAddress}</p>
              </div>
            </InfoWindow>
          )}
        </>
      )}
    </>
  );
}

export function CourierGpsMap({
  apiKey,
  storeName,
  storeAddress,
  destinationLabel,
  destinationAddress,
  orderNumber,
  driverPosition,
  gpsActive,
  onToggleGps,
  onQuotaExceeded,
}: CourierGpsMapProps) {
  const [routeSummary, setRouteSummary] = useState<ComputedRouteSummary | null>(
    null,
  );
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const originInput: LatLngPoint | string = driverPosition ?? storeAddress;

  const googleMapsExternalUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    driverPosition ? `${driverPosition.lat},${driverPosition.lng}` : storeAddress,
  )}&destination=${encodeURIComponent(destinationAddress)}&travelmode=driving`;

  const wazeExternalUrl = `https://waze.com/ul?q=${encodeURIComponent(
    destinationAddress,
  )}&navigate=yes`;

  return (
    <div className="bg-white dark:bg-[#13151c] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Map Header Controls */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Navigation className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>
              Trajeto para <strong className="text-slate-900 dark:text-white">Pedido #{orderNumber}</strong>
            </span>
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
            {destinationAddress}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleGps}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
              gpsActive
                ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{gpsActive ? 'GPS Ao Vivo Ativo' : 'Ativar Meu GPS'}</span>
          </button>

          <a
            href={googleMapsExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Navegar Maps</span>
          </a>

          <a
            href={wazeExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Waze</span>
          </a>
        </div>
      </div>

      {/* Telemetry Summary Bar */}
      <div className="px-4 sm:px-5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <RouteIcon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>
              Origem:{' '}
              <strong className="text-slate-900 dark:text-white">
                {driverPosition ? 'Sua posição GPS' : storeName}
              </strong>
            </span>
          </span>

          {routeSummary && (
            <>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                {routeSummary.distanceKm.toFixed(1)} km
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                ~{routeSummary.durationMinutes} min de trajeto
              </span>
            </>
          )}
        </div>

        {routeSummary && routeSummary.steps.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
          >
            {showSteps
              ? 'Ocultar instruções'
              : `Ver passo a passo (${routeSummary.steps.length})`}
          </button>
        )}
      </div>

      {/* Interactive Google Map Canvas (explicit height prevents 0x0 collapse) */}
      <div className="w-full h-[320px] sm:h-[380px] lg:h-[440px] relative bg-slate-100 dark:bg-slate-950">
        {apiKey ? (
          <APIProvider apiKey={apiKey} language="pt-BR" region="BR">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={driverPosition ?? { lat: -23.588363, lng: -46.636895 }}
              defaultZoom={14}
              gestureHandling="greedy"
              fullscreenControl={false}
              streetViewControl={false}
              mapTypeControl={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              className="w-full h-full"
            >
              <RoutePolylineLayer
                origin={originInput}
                destination={destinationAddress}
                onRouteComputed={setRouteSummary}
                onRouteError={setRouteError}
                onQuotaExceeded={onQuotaExceeded}
              />
              <InteractiveMapMarkers
                originPos={routeSummary?.originLatLng}
                destinationPos={routeSummary?.destinationLatLng}
                driverPosition={driverPosition}
                storeName={storeName}
                destinationLabel={destinationLabel}
                destinationAddress={destinationAddress}
                orderNumber={orderNumber}
              />
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <MapPin className="w-8 h-8 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Mapa GPS em carregamento ou chave Google Maps pendente
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Você pode navegar imediatamente usando os botões <strong>Navegar Maps</strong> ou <strong>Waze</strong> acima, com o destino já preenchido.
              </p>
            </div>
          </div>
        )}
      </div>

      {routeError && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          {routeError}
        </div>
      )}

      {showSteps && routeSummary && routeSummary.steps.length > 0 && (
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 max-h-56 overflow-y-auto">
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Instruções do Trajeto
          </p>
          <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            {routeSummary.steps.map((step, idx) => (
              <li
                key={`${idx}-${step.distanceMeters}`}
                className="flex items-start justify-between gap-3 py-1 border-b border-slate-200/70 dark:border-slate-800/70 last:border-b-0"
              >
                <span>
                  <strong className="font-mono-tabular text-slate-500 mr-1.5">
                    {idx + 1}.
                  </strong>
                  {step.instruction}
                </span>
                {step.distanceMeters > 0 && (
                  <span className="font-mono-tabular text-slate-500 whitespace-nowrap shrink-0">
                    {step.distanceMeters >= 1000
                      ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                      : `${step.distanceMeters} m`}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
