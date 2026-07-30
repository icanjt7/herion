/* global PptxGenJS */
(function khaPptxFactory(global) {
  'use strict';

  const COLORS = Object.freeze({
    navy: '122856',
    blue: '4DA3E2',
    yellow: 'F1A000',
    gray: '333333',
    lightGray: 'F8F9FA',
    border: 'E3E8EF',
    white: 'FFFFFF',
  });
  const FONT_FACE = 'Malgun Gothic';
  const SLIDE_W = 13.333;
  const SLIDE_H = 7.5;
  const BODY_TOP = 1.42;
  const BODY_BOTTOM = 7.02;
  const CARD_GAP = 0.22;
  const CARD_W = 5.93;
  const COLUMN_X = [0.62, 6.78];

  function cleanText(value) {
    return String(value ?? '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeFilename(value) {
    const name = cleanText(value)
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 60);
    return `${name || '국가유산진흥원 발표자료'}.pptx`;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return cleanText(value);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date).replace(/\s/g, '');
  }

  function shapeType(pptx, name) {
    return pptx.ShapeType?.[name] || name;
  }

  function addRect(slide, pptx, x, y, w, h, color, options = {}) {
    slide.addShape(shapeType(pptx, options.rounded ? 'roundRect' : 'rect'), {
      x, y, w, h,
      rectRadius: options.rounded ? 0.07 : undefined,
      fill: { color, transparency: options.transparency || 0 },
      line: options.line || { color, transparency: 100 },
    });
  }

  function addBrandMark(slide, data = {}) {
    if (data.logoData) {
      slide.addImage({
        data: data.logoData,
        x: 0.68,
        y: 0.42,
        w: Number(data.logoWidth) || 1.45,
        h: Number(data.logoHeight) || 0.52,
      });
      return;
    }
    slide.addText('국가유산진흥원', {
      x: 0.68, y: 0.43, w: 2.6, h: 0.38,
      fontFace: FONT_FACE, fontSize: 14, bold: true,
      color: COLORS.navy, margin: 0, breakLine: false,
    });
    slide.addText('KOREA HERITAGE AGENCY', {
      x: 0.69, y: 0.77, w: 2.8, h: 0.18,
      fontFace: 'Arial', fontSize: 5.5, bold: true,
      charSpacing: 1.5, color: COLORS.gray, margin: 0,
    });
  }

  function addAccentBar(slide, pptx) {
    const y = 1.1;
    addRect(slide, pptx, 0.62, y, 0.66, 0.055, COLORS.yellow);
    addRect(slide, pptx, 1.28, y, 0.66, 0.055, COLORS.blue);
    addRect(slide, pptx, 1.94, y, 10.77, 0.055, COLORS.navy);
  }

  function addContentHeader(slide, pptx, title, continued = false) {
    slide.background = { color: COLORS.white };
    slide.addText(`${cleanText(title) || '주요 내용'}${continued ? ' (계속)' : ''}`, {
      x: 0.62, y: 0.5, w: 12.08, h: 0.42,
      fontFace: FONT_FACE, fontSize: 20, bold: true,
      color: COLORS.navy, margin: 0, fit: 'shrink',
      breakLine: false, valign: 'middle',
    });
    addAccentBar(slide, pptx);
  }

  function splitLongText(value, maxChars = 92) {
    const text = cleanText(value);
    if (!text) return [];
    if (text.length <= maxChars) return [text];
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
    const result = [];
    let current = '';
    for (const sentence of sentences) {
      const part = sentence.trim();
      if (!part) continue;
      if (`${current} ${part}`.trim().length <= maxChars) {
        current = `${current} ${part}`.trim();
        continue;
      }
      if (current) result.push(current);
      if (part.length <= maxChars) {
        current = part;
      } else {
        for (let offset = 0; offset < part.length; offset += maxChars) {
          result.push(part.slice(offset, offset + maxChars));
        }
        current = '';
      }
    }
    if (current) result.push(current);
    return result;
  }

  function normalizeSections(data = {}) {
    const rawSections = Array.isArray(data.sections) ? data.sections : [];
    return rawSections.map((section, index) => {
      const heading = cleanText(section?.title || section?.heading || `핵심 내용 ${index + 1}`);
      let rawItems = section?.bullets || section?.items || section?.points || section?.body || [];
      if (!Array.isArray(rawItems)) rawItems = [rawItems];
      const bullets = rawItems.flatMap(item => {
        const value = typeof item === 'object' ? item?.text : item;
        return splitLongText(value);
      }).filter(Boolean);
      return { heading, bullets: bullets.length ? bullets : ['내용을 확인해 주세요.'] };
    }).filter(section => section.heading || section.bullets.length);
  }

  function estimatedLineCount(text, charsPerLine = 39) {
    return Math.max(1, Math.ceil(cleanText(text).length / charsPerLine));
  }

  function estimatedCardHeight(section) {
    const titleLines = estimatedLineCount(section.heading, 28);
    const bodyLines = section.bullets.reduce(
      (sum, bullet) => sum + estimatedLineCount(bullet, 40),
      0,
    );
    return Math.min(5.48, Math.max(
      1.08,
      0.32 + titleLines * 0.27 + bodyLines * 0.245 + section.bullets.length * 0.09 + 0.28,
    ));
  }

  function splitOversizedSection(section, maxHeight = 2.65) {
    const parts = [];
    let bullets = [];
    for (const bullet of section.bullets) {
      const candidate = { heading: section.heading, bullets: [...bullets, bullet] };
      if (bullets.length && estimatedCardHeight(candidate) > maxHeight) {
        parts.push({ heading: section.heading, bullets });
        bullets = [bullet];
      } else {
        bullets.push(bullet);
      }
    }
    if (bullets.length) parts.push({ heading: section.heading, bullets });
    return parts.map((part, index) => ({
      ...part,
      heading: index ? `${part.heading} (계속)` : part.heading,
    }));
  }

  function paginateCards(sections) {
    const cards = sections.flatMap(section => splitOversizedSection(section));
    const pages = [];
    let page = [];
    let rowY = BODY_TOP;

    for (let index = 0; index < cards.length; index += 2) {
      const row = cards.slice(index, index + 2);
      const heights = row.map(estimatedCardHeight);
      const rowHeight = Math.max(...heights);
      if (page.length && rowY + rowHeight > BODY_BOTTOM) {
        pages.push(page);
        page = [];
        rowY = BODY_TOP;
      }
      row.forEach((card, column) => {
        page.push({
          ...card,
          x: COLUMN_X[column],
          y: rowY,
          h: heights[column],
        });
      });
      rowY += rowHeight + CARD_GAP;
    }
    if (page.length || !pages.length) pages.push(page);
    return pages;
  }

  function addCard(slide, pptx, card) {
    addRect(slide, pptx, card.x, card.y, CARD_W, card.h, COLORS.lightGray, {
      rounded: true,
      line: { color: COLORS.border, width: 0.8 },
    });
    addRect(slide, pptx, card.x, card.y, 0.07, card.h, COLORS.blue);

    const titleH = Math.max(0.3, estimatedLineCount(card.heading, 28) * 0.27);
    slide.addText(card.heading, {
      x: card.x + 0.26, y: card.y + 0.17, w: CARD_W - 0.48, h: titleH,
      fontFace: FONT_FACE, fontSize: 16, bold: true,
      color: COLORS.navy, margin: 0, fit: 'shrink', valign: 'top',
      breakLine: false,
    });

    let bulletY = card.y + 0.25 + titleH;
    const remaining = card.y + card.h - 0.18 - bulletY;
    const weights = card.bullets.map(bullet => estimatedLineCount(bullet, 40));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    card.bullets.forEach((bullet, index) => {
      const bulletH = Math.max(0.24, remaining * (weights[index] / totalWeight));
      slide.addText(bullet, {
        x: card.x + 0.3, y: bulletY, w: CARD_W - 0.55, h: bulletH,
        fontFace: FONT_FACE, fontSize: 12, color: COLORS.gray,
        bullet: true, margin: 2, breakLine: false,
        paraSpaceAfter: 3, fit: 'shrink', valign: 'top',
        lineSpacingMultiple: 1.1,
      });
      bulletY += bulletH;
    });
  }

  /**
   * @param {PptxGenJS} pptx
   * @param {{title:string, date?:string|Date, department?:string, team?:string,
   *          logoData?:string, logoWidth?:number, logoHeight?:number}} data
   */
  function createCoverSlide(pptx, data = {}) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };
    addBrandMark(slide, data);

    addRect(slide, pptx, 0.68, 1.35, 0.9, 0.06, COLORS.yellow);
    addRect(slide, pptx, 1.58, 1.35, 0.9, 0.06, COLORS.blue);
    addRect(slide, pptx, 2.48, 1.35, 10.18, 0.06, COLORS.navy);

    slide.addText(cleanText(data.title) || '발표자료 제목', {
      x: 0.78, y: 2.35, w: 11.75, h: 1.52,
      fontFace: FONT_FACE, fontSize: 32, bold: true,
      color: COLORS.navy, align: 'center', valign: 'middle',
      margin: 0.04, fit: 'shrink', breakLine: false,
    });

    if (data.subtitle) {
      slide.addText(cleanText(data.subtitle), {
        x: 1.15, y: 4.0, w: 11.03, h: 0.52,
        fontFace: FONT_FACE, fontSize: 17,
        color: COLORS.gray, align: 'center', valign: 'middle',
        margin: 0, fit: 'shrink',
      });
    }

    const organization = [cleanText(data.department), cleanText(data.team)]
      .filter(Boolean).join(' · ') || '국가유산진흥원';
    slide.addText(`${formatDate(data.date)}\n${organization}`, {
      x: 8.15, y: 5.92, w: 4.42, h: 0.78,
      fontFace: FONT_FACE, fontSize: 14,
      color: COLORS.gray, align: 'right', valign: 'bottom',
      margin: 0, breakLine: false, fit: 'shrink',
      lineSpacingMultiple: 1.05,
    });
    return slide;
  }

  /**
   * Creates one or more slides when the card content does not fit.
   * @param {PptxGenJS} pptx
   * @param {{title:string, sections:Array}} data
   * @returns {Array} generated slides
   */
  function createContentSlide(pptx, data = {}) {
    const sections = normalizeSections(data);
    const pages = paginateCards(sections.length ? sections : [{
      heading: '주요 내용',
      bullets: ['내용을 확인해 주세요.'],
    }]);
    return pages.map((cards, pageIndex) => {
      const slide = pptx.addSlide();
      addContentHeader(slide, pptx, data.title, pageIndex > 0);
      cards.forEach(card => addCard(slide, pptx, card));
      return slide;
    });
  }

  function createEndingSlide(pptx) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };
    addRect(slide, pptx, 0, 0, 0.16, SLIDE_H, COLORS.navy);
    addRect(slide, pptx, 0.16, 0, 0.07, SLIDE_H, COLORS.blue);
    addRect(slide, pptx, 0.23, 0, 0.04, SLIDE_H, COLORS.yellow);

    slide.addText('감사합니다', {
      x: 1.35, y: 2.63, w: 10.8, h: 0.8,
      fontFace: FONT_FACE, fontSize: 36, bold: true,
      color: COLORS.navy, align: 'center', valign: 'middle',
      margin: 0, breakLine: false,
    });
    slide.addShape(shapeType(pptx, 'line'), {
      x: 5.82, y: 3.65, w: 1.7, h: 0,
      line: { color: COLORS.yellow, width: 2.2 },
    });
    slide.addText(
      'www.kh.or.kr  |  서울특별시 강남구 봉은사로 406  |  T. 02-566-6300',
      {
        x: 1.2, y: 6.62, w: 11.1, h: 0.28,
        fontFace: FONT_FACE, fontSize: 10.5,
        color: COLORS.gray, align: 'center', margin: 0,
        fit: 'shrink', breakLine: false,
      },
    );
    return slide;
  }

  function createPresentation(data = {}) {
    if (typeof global.PptxGenJS !== 'function') {
      throw new Error('PptxGenJS 4.x 라이브러리를 먼저 불러와 주세요.');
    }
    const pptx = new global.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = cleanText(data.author) || '국가유산진흥원';
    pptx.company = '국가유산진흥원';
    pptx.subject = cleanText(data.subject) || cleanText(data.title);
    pptx.title = cleanText(data.title) || '국가유산진흥원 발표자료';
    pptx.lang = 'ko-KR';
    pptx.theme = {
      headFontFace: FONT_FACE,
      bodyFontFace: FONT_FACE,
      lang: 'ko-KR',
    };

    createCoverSlide(pptx, data);
    const contentSlides = Array.isArray(data.slides) ? data.slides : [{
      title: data.contentTitle || '주요 내용',
      sections: data.sections || [],
    }];
    contentSlides.forEach(slideData => createContentSlide(pptx, slideData));
    createEndingSlide(pptx);
    return pptx;
  }

  async function downloadKhaPresentation(data = {}, fileName) {
    const pptx = createPresentation(data);
    const resolvedName = fileName || safeFilename(data.title);
    await pptx.writeFile({ fileName: resolvedName, compression: true });
    return resolvedName;
  }

  global.KhaPptx = Object.freeze({
    COLORS,
    createCoverSlide,
    createContentSlide,
    createEndingSlide,
    createPresentation,
    downloadKhaPresentation,
    safeFilename,
  });
  global.createCoverSlide = createCoverSlide;
  global.createContentSlide = createContentSlide;
  global.createEndingSlide = createEndingSlide;
})(window);
