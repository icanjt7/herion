(function khaPptxLlmParserFactory(global) {
  'use strict';

  const ALLOWED_TYPES = new Set([
    'cards_2col', 'stat', 'timeline', 'table', 'diagram', 'chart',
  ]);
  const MAX_SLIDES = 20;
  const MAX_ITEMS = 8;

  const PPT_JSON_SYSTEM_PROMPT = `
[PowerPoint JSON 출력 규칙]
응답은 설명, 인사말, Markdown, 코드펜스 없이 유효한 JSON 배열 하나만 출력한다.
배열의 각 원소는 한 장의 본문 슬라이드이며 type은 cards_2col, stat, timeline, table, diagram, chart 중 하나만 사용한다.
표지와 마지막 "감사합니다" 슬라이드는 클라이언트가 자동 생성하므로 JSON에 포함하지 않는다.

1) 개요·현황·대상·부서 비교처럼 두 묶음으로 나눌 내용:
{
  "type": "cards_2col",
  "title": "슬라이드 제목",
  "columns": [
    { "header": "왼쪽 카드 제목", "items": ["구체적인 내용", "구체적인 내용"] },
    { "header": "오른쪽 카드 제목", "items": ["구체적인 내용", "구체적인 내용"] }
  ]
}

2) 종합점수·성과·진단 결과처럼 핵심 수치를 강조할 내용:
{
  "type": "stat",
  "title": "슬라이드 제목",
  "mainStatLabel": "핵심 수치 설명",
  "mainStatValue": "51.43점 (발전기)",
  "subCards": [
    { "title": "세부 지표 1", "items": ["근거", "해석", "보완사항"] },
    { "title": "세부 지표 2", "items": ["근거", "해석", "보완사항"] }
  ]
}

3) 월별 일정·단계별 계획:
{
  "type": "timeline",
  "title": "슬라이드 제목",
  "steps": [
    { "date": "8월", "title": "단계 제목", "desc": "구체적인 실행 내용" }
  ]
}

4) 비교표·목록형 데이터:
{
  "type": "table",
  "title": "슬라이드 제목",
  "headers": ["구분", "2025년", "2026년", "증감"],
  "rows": [
    ["개인 역량", "51.64점", "53.41점", "+1.77점"],
    ["조직 역량", "46.08점", "49.44점", "+3.36점"]
  ],
  "note": "필요한 경우 출처 또는 주석"
}

5) 업무 절차·단계별 프로세스:
{
  "type": "diagram",
  "title": "슬라이드 제목",
  "steps": [
    { "title": "수요 발굴", "desc": "부서별 분석 수요를 수집한다." },
    { "title": "과제 선정", "desc": "효과성과 실행 가능성을 검토한다." }
  ]
}

6) 범주별 수치를 비교하는 막대그래프:
{
  "type": "chart",
  "title": "슬라이드 제목",
  "categories": ["데이터 이해", "데이터 분석", "AI 활용"],
  "series": [
    { "name": "2025년", "values": [48.2, 45.1, 57.3] },
    { "name": "2026년", "values": [52.4, 49.8, 62.5] }
  ],
  "showLegend": true,
  "showValues": false
}

작성 원칙:
- 특별히 짧은 분량을 요청하지 않았다면 본문 6~12장으로 구성한다.
- cards_2col의 columns는 정확히 2개, 각 items는 3~6개로 작성한다.
- stat의 subCards는 1~2개, 각 items는 2~5개로 작성한다.
- timeline의 steps는 한 슬라이드당 2~4개로 작성하고 단계가 많으면 슬라이드를 나눈다.
- table은 열 2~6개, 데이터 행 1~12개로 구성하며 모든 행의 열 수를 headers와 맞춘다.
- diagram의 steps는 한 슬라이드당 2~4개로 작성하고 단계가 많으면 슬라이드를 나눈다.
- chart는 범주 2~10개, 계열 1~4개로 구성하고 values에는 숫자만 사용한다.
- 제목은 결론이나 메시지가 드러나는 짧은 문장으로 작성한다.
- 각 항목은 단순 키워드가 아니라 무엇을·왜·어떻게·어떤 결과로 연결되는지 구체적으로 쓴다.
- 사용자가 제공한 수치, 일정, 기관명, 조건과 근거를 누락하거나 변경하지 않는다.
- 확인되지 않은 사실과 수치를 만들지 않는다. 미확정 사항은 "검토안" 또는 "추후 확정"으로 표시한다.
- 날짜는 "2026. 06. 09. ~ 06. 30." 형식으로 통일한다.
- JSON 문자열 안에 줄바꿈을 직접 넣지 말고 필요한 경우 \\n으로 이스케이프한다.
`.trim();

  function clean(value, maxLength = 500) {
    const normalized = global.KhaPptx?.preprocessText
      ? global.KhaPptx.preprocessText(value)
      : String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized.slice(0, maxLength);
  }

  function extractJsonCandidate(value) {
    const source = String(value ?? '')
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    if (!source) return '';
    if (source.startsWith('[') || source.startsWith('{')) return source;

    let start = -1;
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '[' || char === '{') {
        if (start < 0) start = index;
        depth += 1;
      } else if ((char === ']' || char === '}') && start >= 0) {
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
      }
    }
    return start >= 0 ? source.slice(start) : '';
  }

  function parseJson(value) {
    const candidate = extractJsonCandidate(value);
    if (!candidate) throw new Error('PowerPoint JSON을 찾지 못했습니다.');
    const repaired = candidate
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(repaired);
  }

  function normalizeItems(items) {
    return (Array.isArray(items) ? items : [items])
      .map(item => clean(typeof item === 'object' ? item?.text : item))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  }

  function normalizeCards2Col(slide) {
    const columns = (Array.isArray(slide.columns) ? slide.columns : [])
      .slice(0, 2)
      .map((column, index) => ({
        header: clean(column?.header || column?.title || `${index + 1}영역`, 80),
        items: normalizeItems(column?.items || column?.bullets),
      }));
    while (columns.length < 2) {
      columns.push({ header: columns.length ? '핵심 내용' : '기본정보', items: [] });
    }
    return {
      type: 'cards_2col',
      title: clean(slide.title || '주요 내용', 100),
      columns,
    };
  }

  function normalizeStat(slide) {
    return {
      type: 'stat',
      title: clean(slide.title || '핵심 성과', 100),
      mainStatLabel: clean(slide.mainStatLabel || slide.label || '핵심 지표', 100),
      mainStatValue: clean(slide.mainStatValue || slide.value || '—', 80),
      subCards: (Array.isArray(slide.subCards) ? slide.subCards : [])
        .slice(0, 2)
        .map((card, index) => ({
          title: clean(card?.title || `${index + 1} 세부 지표`, 100),
          items: normalizeItems(card?.items || card?.bullets),
        })),
    };
  }

  function normalizeTimeline(slide) {
    return {
      type: 'timeline',
      title: clean(slide.title || '향후 추진 계획', 100),
      steps: (Array.isArray(slide.steps) ? slide.steps : [])
        .slice(0, MAX_ITEMS)
        .map((step, index) => ({
          date: clean(step?.date || step?.period || step?.month || `단계 ${index + 1}`, 50),
          title: clean(step?.title || step?.heading || `단계 ${index + 1}`, 80),
          desc: clean(step?.desc || step?.detail || step?.description || step?.text, 300),
        })),
    };
  }

  function normalizeTable(slide) {
    const headers = normalizeItems(slide.headers).slice(0, 6);
    const rows = (Array.isArray(slide.rows) ? slide.rows : [])
      .slice(0, 20)
      .map(row => (Array.isArray(row) ? row : [row]))
      .map(row => headers.map((_, index) => clean(row[index], 180)));
    return {
      type: 'table',
      title: clean(slide.title || '비교 결과', 100),
      headers,
      rows,
      note: clean(slide.note, 200),
      colWidths: Array.isArray(slide.colWidths)
        ? slide.colWidths.slice(0, headers.length).map(Number)
        : undefined,
    };
  }

  function normalizeDiagram(slide) {
    return {
      type: 'diagram',
      title: clean(slide.title || '추진 프로세스', 100),
      steps: (Array.isArray(slide.steps) ? slide.steps : [])
        .slice(0, MAX_ITEMS)
        .map((step, index) => ({
          title: clean(step?.title || step?.label || `단계 ${index + 1}`, 80),
          desc: clean(step?.desc || step?.detail || step?.description || step?.text, 300),
        })),
    };
  }

  function normalizeChart(slide) {
    const categories = normalizeItems(slide.categories).slice(0, 12);
    return {
      type: 'chart',
      title: clean(slide.title || '지표 비교', 100),
      categories,
      series: (Array.isArray(slide.series) ? slide.series : [])
        .slice(0, 4)
        .map((series, index) => ({
          name: clean(series?.name || `계열 ${index + 1}`, 80),
          values: categories.map((_, valueIndex) => {
            const value = Number(series?.values?.[valueIndex]);
            return Number.isFinite(value) ? value : 0;
          }),
        })),
      showLegend: slide.showLegend !== false,
      showValues: Boolean(slide.showValues),
      minValue: Number.isFinite(Number(slide.minValue)) ? Number(slide.minValue) : undefined,
    };
  }

  function normalizeSlide(slide) {
    if (!slide || typeof slide !== 'object') return null;
    const type = String(slide.type ?? '').trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return null;
    if (type === 'cards_2col') return normalizeCards2Col(slide);
    if (type === 'stat') return normalizeStat(slide);
    if (type === 'timeline') return normalizeTimeline(slide);
    if (type === 'table') return normalizeTable(slide);
    if (type === 'diagram') return normalizeDiagram(slide);
    return normalizeChart(slide);
  }

  function parse(value) {
    const parsed = typeof value === 'string' ? parseJson(value) : value;
    const rawSlides = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.slides) ? parsed.slides : []);
    const slides = rawSlides.slice(0, MAX_SLIDES).map(normalizeSlide).filter(Boolean);
    if (!slides.length) throw new Error('지원되는 PowerPoint 슬라이드 데이터가 없습니다.');
    return {
      title: clean(parsed?.title || parsed?.deckTitle || '', 100),
      slides,
    };
  }

  function tryParse(value) {
    try {
      return parse(value);
    } catch {
      return null;
    }
  }

  function toMarkdown(payload) {
    const parsed = payload?.slides ? payload : parse(payload);
    const lines = [];
    parsed.slides.forEach(slide => {
      lines.push(`## ${slide.title}`);
      if (slide.type === 'cards_2col') {
        slide.columns.forEach(column => {
          lines.push(`### ${column.header}`);
          column.items.forEach(item => lines.push(`- ${item}`));
        });
      } else if (slide.type === 'stat') {
        lines.push(`**${slide.mainStatLabel}: ${slide.mainStatValue}**`);
        slide.subCards.forEach(card => {
          lines.push(`### ${card.title}`);
          card.items.forEach(item => lines.push(`- ${item}`));
        });
      } else if (slide.type === 'timeline') {
        slide.steps.forEach(step => {
          lines.push(`- **${step.date} · ${step.title}**: ${step.desc}`);
        });
      } else if (slide.type === 'table') {
        lines.push(`| ${slide.headers.join(' | ')} |`);
        lines.push(`| ${slide.headers.map(() => '---').join(' | ')} |`);
        slide.rows.forEach(row => lines.push(`| ${row.join(' | ')} |`));
        if (slide.note) lines.push(`> ${slide.note}`);
      } else if (slide.type === 'diagram') {
        slide.steps.forEach((step, index) => {
          lines.push(`${index + 1}. **${step.title}**: ${step.desc}`);
        });
      } else {
        slide.series.forEach(series => {
          const values = slide.categories
            .map((category, index) => `${category} ${series.values[index]}`)
            .join(' · ');
          lines.push(`- **${series.name}**: ${values}`);
        });
      }
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  global.KhaPptxLlmParser = Object.freeze({
    PPT_JSON_SYSTEM_PROMPT,
    parse,
    tryParse,
    toMarkdown,
  });
})(window);
