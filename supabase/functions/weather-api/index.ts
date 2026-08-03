import { resolveMidtermRegion } from './midterm-regions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const retryableStatuses = new Set([429, 500, 502, 503, 504]);
const kmaMidtermBaseUrl = 'https://apis.data.go.kr/1360000/MidFcstInfoService';
const koreaWeatherPoints = [
  { name: '서울', latitude: 37.5665, longitude: 126.9780 },
  { name: '인천', latitude: 37.4563, longitude: 126.7052 },
  { name: '수원·경기', latitude: 37.2636, longitude: 127.0286 },
  { name: '춘천·강원', latitude: 37.8813, longitude: 127.7298 },
  { name: '강릉', latitude: 37.7519, longitude: 128.8761 },
  { name: '대전·충청', latitude: 36.3504, longitude: 127.3845 },
  { name: '전주·전북', latitude: 35.8242, longitude: 127.1480 },
  { name: '광주·전남', latitude: 35.1595, longitude: 126.8526 },
  { name: '대구·경북', latitude: 35.8714, longitude: 128.6014 },
  { name: '부산·경남', latitude: 35.1796, longitude: 129.0756 },
  { name: '울산', latitude: 35.5384, longitude: 129.3114 },
  { name: '제주', latitude: 33.4996, longitude: 126.5312 },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function weatherText(code: number) {
  if (code === 0) return '맑음';
  if (code === 1) return '대체로 맑음';
  if (code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if ([51, 53, 55].includes(code)) return '이슬비';
  if ([56, 57].includes(code)) return '어는 이슬비';
  if ([61, 63, 65].includes(code)) return '비';
  if ([66, 67].includes(code)) return '어는 비';
  if ([71, 73, 75].includes(code)) return '눈';
  if (code === 77) return '싸락눈';
  if ([80, 81, 82].includes(code)) return '소나기';
  if ([85, 86].includes(code)) return '눈 소나기';
  if (code === 95) return '뇌우';
  if ([96, 99].includes(code)) return '우박을 동반한 뇌우';
  return '확인 필요';
}

async function fetchJson(url: URL, init: RequestInit = {}) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    lastResponse = response;
    if (response.ok) return await response.json() as Record<string, unknown>;
    if (!retryableStatuses.has(response.status) || attempt > 0) break;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const payload = await lastResponse?.json().catch(() => ({})) as Record<string, unknown>;
  const error = new Error(String(payload?.reason || payload?.error || '날씨 제공 서비스 요청에 실패했습니다.'));
  Object.assign(error, { upstreamStatus: lastResponse?.status || 502 });
  throw error;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function itemAt(value: unknown, index: number) {
  return Array.isArray(value) ? value[index] : null;
}

function dateInSeoul(value: Date) {
  return new Date(value.getTime() + 9 * 60 * 60 * 1000);
}

function kmaTimestamp(value: Date) {
  const seoul = dateInSeoul(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${seoul.getUTCFullYear()}${pad(seoul.getUTCMonth() + 1)}${pad(seoul.getUTCDate())}${pad(seoul.getUTCHours())}00`;
}

function kmaIssueCandidates(now = new Date()) {
  const seoul = dateInSeoul(now);
  const hour = seoul.getUTCHours();
  const issueHour = hour >= 18 ? 18 : (hour >= 6 ? 6 : -6);
  const latestUtc = new Date(Date.UTC(
    seoul.getUTCFullYear(),
    seoul.getUTCMonth(),
    seoul.getUTCDate(),
    issueHour - 9,
  ));
  return [0, 1, 2].map((index) => kmaTimestamp(new Date(latestUtc.getTime() - index * 12 * 60 * 60 * 1000)));
}

function normalizedServiceKey(value: string) {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

function kmaItem(payload: Record<string, unknown>) {
  const response = (payload.response || {}) as Record<string, unknown>;
  const header = (response.header || {}) as Record<string, unknown>;
  const body = (response.body || {}) as Record<string, unknown>;
  const items = (body.items || {}) as Record<string, unknown>;
  const rawItem = items.item;
  const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
  const resultCode = String(header.resultCode ?? '');
  return {
    item: item && typeof item === 'object' ? item as Record<string, unknown> : null,
    normal: ['0', '00'].includes(resultCode),
    resultCode,
    resultMessage: String(header.resultMsg || ''),
  };
}

async function fetchKmaItem(apiKey: string, endpoint: string, regionId: string, idParameter = 'regId') {
  let lastMessage = '';
  for (const tmFc of kmaIssueCandidates()) {
    const url = new URL(`${kmaMidtermBaseUrl}/${endpoint}`);
    url.searchParams.set('serviceKey', normalizedServiceKey(apiKey));
    url.searchParams.set('numOfRows', '10');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('dataType', 'JSON');
    url.searchParams.set(idParameter, regionId);
    url.searchParams.set('tmFc', tmFc);
    try {
      const payload = await fetchJson(url);
      const result = kmaItem(payload);
      if (result.normal && result.item) return { item: result.item, tmFc };
      lastMessage = `${result.resultCode} ${result.resultMessage}`.trim();
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : '기상청 중기예보 조회 실패';
    }
  }
  throw new Error(lastMessage || '기상청 최신 중기예보 자료를 찾지 못했습니다.');
}

async function kmaMidtermOutlook(apiKey: string) {
  const forecast = await fetchKmaItem(apiKey, 'getMidFcst', '108', 'stnId');
  return {
    issued_at: forecast.tmFc,
    text: String(forecast.item.wfSv || '').trim(),
    source: '기상청 중기예보 조회서비스',
    source_url: 'https://www.data.go.kr/data/15059468/openapi.do',
  };
}

function isoDateAfterIssue(tmFc: string, days: number) {
  const year = Number(tmFc.slice(0, 4));
  const month = Number(tmFc.slice(4, 6));
  const day = Number(tmFc.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

async function kmaMidtermForecast(apiKey: string, location: string, place: Record<string, unknown>) {
  const region = resolveMidtermRegion(location, place.name, place.admin1);
  if (!region) return null;
  const [land, temperature] = await Promise.all([
    fetchKmaItem(apiKey, 'getMidLandFcst', region.landCode),
    fetchKmaItem(apiKey, 'getMidTa', region.temperatureCode),
  ]);
  const issuedAt = temperature.tmFc || land.tmFc;
  const daily = [];
  for (let day = 4; day <= 10; day += 1) {
    const weatherAm = day <= 7 ? String(land.item[`wf${day}Am`] || '') : String(land.item[`wf${day}`] || '');
    const weatherPm = day <= 7 ? String(land.item[`wf${day}Pm`] || '') : '';
    const rainAm = day <= 7 ? numberOrNull(land.item[`rnSt${day}Am`]) : numberOrNull(land.item[`rnSt${day}`]);
    const rainPm = day <= 7 ? numberOrNull(land.item[`rnSt${day}Pm`]) : null;
    const minTemperature = numberOrNull(temperature.item[`taMin${day}`]);
    const maxTemperature = numberOrNull(temperature.item[`taMax${day}`]);
    const rainValues = [rainAm, rainPm].filter((value): value is number => value !== null);
    if (!weatherAm && !weatherPm && minTemperature === null && maxTemperature === null) continue;
    daily.push({
      date: isoDateAfterIssue(issuedAt, day),
      weather_text: weatherPm && weatherPm !== weatherAm ? `${weatherAm} / ${weatherPm}` : (weatherAm || weatherPm),
      weather_am: weatherAm,
      weather_pm: weatherPm,
      min_temperature: minTemperature,
      max_temperature: maxTemperature,
      precipitation_probability: rainValues.length ? Math.max(...rainValues) : null,
      precipitation_probability_am: rainAm,
      precipitation_probability_pm: rainPm,
    });
  }
  return {
    region_name: region.name,
    land_region_code: region.landCode,
    temperature_region_code: region.temperatureCode,
    issued_at: issuedAt,
    daily,
    source: '기상청 중기예보 조회서비스',
    source_url: 'https://www.data.go.kr/data/15059468/openapi.do',
  };
}

function openMeteoMidtermFallback(dailyItems: Array<Record<string, unknown>>) {
  return {
    region_name: '',
    issued_at: '',
    daily: dailyItems.slice(4, 11),
    source: 'Open-Meteo',
    source_url: 'https://open-meteo.com/',
    fallback_used: true,
  };
}

async function koreaNationwideWeather(kmaApiKey = '') {
  const kmaOutlookPromise = kmaApiKey
    ? kmaMidtermOutlook(kmaApiKey).catch(() => null)
    : Promise.resolve(null);
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', koreaWeatherPoints.map((point) => point.latitude).join(','));
  forecastUrl.searchParams.set('longitude', koreaWeatherPoints.map((point) => point.longitude).join(','));
  forecastUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
  );
  forecastUrl.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  forecastUrl.searchParams.set('timezone', 'Asia/Seoul');
  forecastUrl.searchParams.set('forecast_days', '1');
  const payload = await fetchJson(forecastUrl);
  const forecasts = Array.isArray(payload) ? payload : [payload];

  const regions = koreaWeatherPoints.map((point, index) => {
    const forecast = (forecasts[index] || {}) as Record<string, unknown>;
    const current = (forecast.current || {}) as Record<string, unknown>;
    const daily = (forecast.daily || {}) as Record<string, unknown>;
    const currentCode = numberOrNull(current.weather_code);
    const dailyCode = numberOrNull(itemAt(daily.weather_code, 0));
    return {
      name: point.name,
      current: {
        time: String(current.time || ''),
        temperature: numberOrNull(current.temperature_2m),
        apparent_temperature: numberOrNull(current.apparent_temperature),
        humidity: numberOrNull(current.relative_humidity_2m),
        weather_code: currentCode,
        weather_text: currentCode === null ? '확인 필요' : weatherText(currentCode),
        wind_speed: numberOrNull(current.wind_speed_10m),
      },
      today: {
        date: String(itemAt(daily.time, 0) || ''),
        weather_code: dailyCode,
        weather_text: dailyCode === null ? '확인 필요' : weatherText(dailyCode),
        min_temperature: numberOrNull(itemAt(daily.temperature_2m_min, 0)),
        max_temperature: numberOrNull(itemAt(daily.temperature_2m_max, 0)),
        precipitation_probability: numberOrNull(itemAt(daily.precipitation_probability_max, 0)),
      },
    };
  });

  return {
    scope: 'korea',
    timezone: 'Asia/Seoul',
    reference_location: '서울',
    current_time: regions[0]?.current.time || '',
    regions,
    midterm_outlook: await kmaOutlookPromise,
    source: 'Open-Meteo',
    source_url: 'https://open-meteo.com/',
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const kmaApiKey = Deno.env.get('MIDFCSTINFOSERVICE')?.trim() || '';
    if (body?.scope === 'korea') {
      return json(await koreaNationwideWeather(kmaApiKey));
    }

    const location = typeof body?.location === 'string' ? body.location.trim() : '';
    if (location.length < 2 || location.length > 120) {
      return json({ error: '지역명은 2자 이상 120자 이하여야 합니다.', code: 'WEATHER_INVALID_LOCATION' }, 400);
    }

    const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodingUrl.searchParams.set('name', location);
    geocodingUrl.searchParams.set('count', '5');
    geocodingUrl.searchParams.set('language', 'ko');
    geocodingUrl.searchParams.set('format', 'json');
    const geocoding = await fetchJson(geocodingUrl);
    const candidates = Array.isArray(geocoding.results) ? geocoding.results : [];
    const koreanQuery = /[가-힣]/.test(location);
    let place = (
      koreanQuery
        ? candidates.find((candidate: unknown) =>
            String((candidate as Record<string, unknown>)?.country_code || '').toUpperCase() === 'KR'
          ) || candidates[0]
        : candidates[0]
    ) as Record<string, unknown> | undefined;
    let geocodingSource = 'Open-Meteo Geocoding';
    let geocodingSourceUrl = 'https://open-meteo.com/en/docs/geocoding-api';

    // Open-Meteo 지명 검색은 한글 표기를 찾지 못하는 경우가 있어
    // 사용자 요청 단위로만 OpenStreetMap Nominatim을 보조 지오코더로 사용한다.
    if (!place) {
      const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
      nominatimUrl.searchParams.set('q', location);
      nominatimUrl.searchParams.set('format', 'jsonv2');
      nominatimUrl.searchParams.set('limit', '5');
      nominatimUrl.searchParams.set('addressdetails', '1');
      nominatimUrl.searchParams.set('accept-language', 'ko');
      const nominatim = await fetchJson(nominatimUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Herian-Weather/1.0 (https://herian.kh.or.kr)',
        },
      });
      const osmCandidates = Array.isArray(nominatim) ? nominatim : [];
      const osmPlace = osmCandidates[0] as Record<string, unknown> | undefined;
      if (osmPlace) {
        const address = (osmPlace.address || {}) as Record<string, unknown>;
        place = {
          name: address.city || address.town || address.village || address.municipality
            || address.county || osmPlace.name || location,
          admin1: address.state || address.province || '',
          country: address.country || '',
          country_code: address.country_code || '',
          latitude: osmPlace.lat,
          longitude: osmPlace.lon,
        };
        geocodingSource = 'OpenStreetMap Nominatim';
        geocodingSourceUrl = 'https://www.openstreetmap.org/copyright';
      }
    }

    if (!place) {
      return json({
        error: `'${location}' 지역을 찾지 못했습니다. 시·군·구 또는 도시 이름으로 다시 입력해 주세요.`,
        code: 'WEATHER_LOCATION_NOT_FOUND',
      }, 404);
    }
    const latitude = numberOrNull(place.latitude);
    const longitude = numberOrNull(place.longitude);
    if (latitude === null || longitude === null) {
      return json({ error: '조회 지역의 좌표를 확인할 수 없습니다.', code: 'WEATHER_LOCATION_INVALID' }, 502);
    }

    const kmaForecastPromise = kmaApiKey
      ? kmaMidtermForecast(kmaApiKey, location, place).catch(() => null)
      : Promise.resolve(null);

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(latitude));
    forecastUrl.searchParams.set('longitude', String(longitude));
    forecastUrl.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    );
    forecastUrl.searchParams.set('hourly', 'precipitation_probability');
    forecastUrl.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
    );
    forecastUrl.searchParams.set('timezone', 'auto');
    // 4~10일 기상청 조회 실패 시에만 사용할 보조 자료까지 한 번에 받는다.
    forecastUrl.searchParams.set('forecast_days', '11');
    const forecast = await fetchJson(forecastUrl);

    const current = (forecast.current || {}) as Record<string, unknown>;
    const hourly = (forecast.hourly || {}) as Record<string, unknown>;
    const daily = (forecast.daily || {}) as Record<string, unknown>;
    const hourlyTimes = Array.isArray(hourly.time) ? hourly.time.map(String) : [];
    const currentTime = String(current.time || '');
    const currentHour = currentTime.slice(0, 13);
    const hourlyIndex = hourlyTimes.findIndex((time) => time.slice(0, 13) === currentHour);
    const currentCode = Number(current.weather_code);
    const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
    const dailyItems = dailyTimes.slice(0, 11).map((date, index) => {
      const code = Number(itemAt(daily.weather_code, index));
      return {
        date: String(date),
        weather_code: Number.isFinite(code) ? code : null,
        weather_text: Number.isFinite(code) ? weatherText(code) : '확인 필요',
        min_temperature: numberOrNull(itemAt(daily.temperature_2m_min, index)),
        max_temperature: numberOrNull(itemAt(daily.temperature_2m_max, index)),
        precipitation_probability: numberOrNull(itemAt(daily.precipitation_probability_max, index)),
        precipitation_sum: numberOrNull(itemAt(daily.precipitation_sum, index)),
        sunrise: String(itemAt(daily.sunrise, index) || ''),
        sunset: String(itemAt(daily.sunset, index) || ''),
      };
    });

    const kmaMidterm = await kmaForecastPromise;
    return json({
      location: {
        query: location,
        name: String(place.name || location),
        admin1: String(place.admin1 || ''),
        country: String(place.country || ''),
        latitude,
        longitude,
        timezone: String(forecast.timezone || place.timezone || ''),
        geocoding_source: geocodingSource,
        geocoding_source_url: geocodingSourceUrl,
      },
      current: {
        time: currentTime,
        temperature: numberOrNull(current.temperature_2m),
        apparent_temperature: numberOrNull(current.apparent_temperature),
        humidity: numberOrNull(current.relative_humidity_2m),
        precipitation_probability: numberOrNull(itemAt(hourly.precipitation_probability, hourlyIndex)),
        precipitation: numberOrNull(current.precipitation),
        rain: numberOrNull(current.rain),
        snowfall: numberOrNull(current.snowfall),
        weather_code: Number.isFinite(currentCode) ? currentCode : null,
        weather_text: Number.isFinite(currentCode) ? weatherText(currentCode) : '확인 필요',
        cloud_cover: numberOrNull(current.cloud_cover),
        wind_speed: numberOrNull(current.wind_speed_10m),
        wind_direction: numberOrNull(current.wind_direction_10m),
        wind_gusts: numberOrNull(current.wind_gusts_10m),
      },
      today: dailyItems[0] || null,
      daily: dailyItems.slice(0, 3),
      midterm: kmaMidterm?.daily.length ? kmaMidterm : openMeteoMidtermFallback(dailyItems),
      source: 'Open-Meteo',
      source_url: 'https://open-meteo.com/',
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : '날씨 조회 중 오류가 발생했습니다.',
      code: 'WEATHER_UPSTREAM_ERROR',
    }, Number((error as { upstreamStatus?: number })?.upstreamStatus) || 502);
  }
});
