import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryStore, getGoogleMapsApiKey } from '@/lib/server-store';
import { calculateDeliveryQuote } from '@/lib/delivery-pricing';
import type { DeliveryMode, StoreSettings } from '@/types/delivery';

interface DistanceRequestBody {
  originAddress?: string;
  destinationAddress?: string;
  originCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
  neighborhood?: string;
  subtotal?: number;
  deliveryMode?: DeliveryMode;
  storeOverride?: Partial<StoreSettings>;
}

interface RoutesApiResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    legs?: Array<{
      startLocation?: { latLng?: { latitude: number; longitude: number } };
      endLocation?: { latLng?: { latitude: number; longitude: number } };
    }>;
  }>;
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

function parseDurationMinutes(durationStr?: string): number | null {
  if (!durationStr) return null;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  return Math.max(1, Math.round(Number(match[1]) / 60));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DistanceRequestBody;
    const db = getDeliveryStore();
    const store: StoreSettings = body.storeOverride
      ? { ...db.store, ...body.storeOverride }
      : db.store;

    const originAddress =
      body.originAddress?.trim() ||
      `${store.address}, ${store.neighborhood}, Brasil`;
    const destinationAddress = body.destinationAddress?.trim() || '';

    const deliveryMode: DeliveryMode = body.deliveryMode ?? 'entrega';
    const subtotal = Math.max(0, Number(body.subtotal) || 0);

    if (deliveryMode === 'retirada') {
      const quote = calculateDeliveryQuote({
        store,
        subtotal,
        deliveryMode: 'retirada',
      });
      return NextResponse.json({ ok: true, source: 'retirada', ...quote });
    }

    const apiKey = getGoogleMapsApiKey();
    let distanceKm: number | null = null;
    let routeDurationMinutes: number | null = null;
    let destinationLat: number | undefined;
    let destinationLng: number | undefined;
    let quotaExceeded = false;
    let apiError: string | undefined;

    if (
      apiKey &&
      (destinationAddress || (body.destinationCoords && body.originCoords))
    ) {
      const originWaypoint = body.originCoords
        ? {
            location: {
              latLng: {
                latitude: body.originCoords.lat,
                longitude: body.originCoords.lng,
              },
            },
          }
        : { address: originAddress };

      const destinationWaypoint = body.destinationCoords
        ? {
            location: {
              latLng: {
                latitude: body.destinationCoords.lat,
                longitude: body.destinationCoords.lng,
              },
            },
          }
        : { address: destinationAddress };

      try {
        const res = await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'routes.distanceMeters,routes.duration,routes.legs.endLocation',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            },
            body: JSON.stringify({
              origin: originWaypoint,
              destination: destinationWaypoint,
              travelMode: 'TWO_WHEELER',
              routingPreference: 'TRAFFIC_AWARE',
              languageCode: 'pt-BR',
              units: 'METRIC',
            }),
          },
        );

        const data = (await res.json()) as RoutesApiResponse;

        if (
          res.status === 429 ||
          data?.error?.status === 'RESOURCE_EXHAUSTED'
        ) {
          quotaExceeded = true;
          apiError = 'Cota do Google Maps excedida temporariamente.';
        } else if (res.ok && data.routes && data.routes.length > 0) {
          const primary = data.routes[0];
          if (typeof primary.distanceMeters === 'number') {
            distanceKm = Number((primary.distanceMeters / 1000).toFixed(2));
          }
          routeDurationMinutes = parseDurationMinutes(primary.duration);
          const endLatLng = primary.legs?.[0]?.endLocation?.latLng;
          if (endLatLng) {
            destinationLat = endLatLng.latitude;
            destinationLng = endLatLng.longitude;
          }
        } else if (data?.error?.message) {
          // Retry once with DRIVE travelMode in case TWO_WHEELER is unsupported in region
          const fallbackRes = await fetch(
            'https://routes.googleapis.com/directions/v2:computeRoutes',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                  'routes.distanceMeters,routes.duration,routes.legs.endLocation',
                'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
              },
              body: JSON.stringify({
                origin: originWaypoint,
                destination: destinationWaypoint,
                travelMode: 'DRIVE',
                routingPreference: 'TRAFFIC_AWARE',
                languageCode: 'pt-BR',
                units: 'METRIC',
              }),
            },
          );
          const fallbackData = (await fallbackRes.json()) as RoutesApiResponse;
          if (
            fallbackRes.status === 429 ||
            fallbackData?.error?.status === 'RESOURCE_EXHAUSTED'
          ) {
            quotaExceeded = true;
            apiError = 'Cota do Google Maps excedida temporariamente.';
          } else if (
            fallbackRes.ok &&
            fallbackData.routes &&
            fallbackData.routes.length > 0
          ) {
            const primary = fallbackData.routes[0];
            if (typeof primary.distanceMeters === 'number') {
              distanceKm = Number((primary.distanceMeters / 1000).toFixed(2));
            }
            routeDurationMinutes = parseDurationMinutes(primary.duration);
            const endLatLng = primary.legs?.[0]?.endLocation?.latLng;
            if (endLatLng) {
              destinationLat = endLatLng.latitude;
              destinationLng = endLatLng.longitude;
            }
          } else {
            apiError =
              fallbackData?.error?.message ||
              data.error.message ||
              'Não foi possível calcular a rota para este endereço.';
          }
        }
      } catch {
        apiError = 'Falha de rede ao consultar Google Routes API.';
      }
    }

    const quote = calculateDeliveryQuote({
      store,
      subtotal,
      deliveryMode,
      neighborhood: body.neighborhood,
      distanceKm,
    });

    return NextResponse.json({
      ok: true,
      distanceKm,
      routeDurationMinutes,
      destinationLat,
      destinationLng,
      quotaExceeded,
      apiError,
      usedGoogleRoutes: distanceKm !== null,
      ...quote,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Erro ao calcular taxa por distância.' },
      { status: 400 },
    );
  }
}
