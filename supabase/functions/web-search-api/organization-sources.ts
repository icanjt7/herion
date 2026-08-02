export type OrganizationProfile = 'kha' | 'khs';

type OrganizationPage = {
  name: string;
  url: string;
  startMarkers: string[];
  endMarkers: string[];
};

export const ORGANIZATION_PAGES: Record<OrganizationProfile, OrganizationPage> = {
  kha: {
    name: '국가유산진흥원 부서안내',
    url: 'https://www.kh.or.kr/org/chf/menu/410',
    startMarkers: ['원장\n경영기획본부', '경영기획본부'],
    endMarkers: ['진흥원소개', '개인정보 처리방침'],
  },
  khs: {
    name: '국가유산청 조직안내',
    url: 'https://www.khs.go.kr/html/HtmlPage.do?pg=/introduce/organization_info.jsp&mn=NS_05_05_01',
    startMarkers: ['본청(', '청장\n대변인'],
    endMarkers: ['정부/지자체 조직도 바로가기', '만족도조사'],
  },
};

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hexadecimal = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function plainTextFromHtml(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/gi, ' ')
    .replace(/<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|footer|h[1-6]|header|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function markerIndex(text: string, markers: string[], startAt = 0) {
  for (const marker of markers) {
    const index = text.indexOf(marker, startAt);
    if (index >= 0) return index;
  }
  return -1;
}

export function extractOrganizationText(html: string, profile: OrganizationProfile) {
  const page = ORGANIZATION_PAGES[profile];
  const plain = plainTextFromHtml(html);
  const start = markerIndex(plain, page.startMarkers);
  if (start < 0) throw new Error(`${page.name} 본문 시작 위치를 찾지 못했습니다.`);
  const end = markerIndex(plain, page.endMarkers, start + 1);
  const content = plain.slice(start, end > start ? end : Math.min(plain.length, start + 12_000)).trim();
  if (content.length < 80) throw new Error(`${page.name} 본문이 충분하지 않습니다.`);
  return content.slice(0, 12_000);
}

const pageCache = new Map<OrganizationProfile, { expiresAt: number; value: Promise<string> }>();

export async function fetchOrganizationText(profile: OrganizationProfile) {
  const cached = pageCache.get(profile);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const page = ORGANIZATION_PAGES[profile];
  const value = fetch(page.url, {
    headers: { 'User-Agent': 'Herian organization source verifier/1.0' },
    signal: AbortSignal.timeout(20_000),
  }).then(async response => {
    if (!response.ok) throw new Error(`${page.name} 조회 오류 ${response.status}`);
    return extractOrganizationText(await response.text(), profile);
  });
  pageCache.set(profile, { expiresAt: Date.now() + 10 * 60 * 1000, value });
  return value.catch(error => {
    pageCache.delete(profile);
    throw error;
  });
}
