/* global PptxGenJS */
(function khaPptxFactory(global) {
  'use strict';

  const COLORS = Object.freeze({
    navy: '122856',
    blue: '4DA3E2',
    yellow: 'F1A000',
    gray: '333333',
    muted: '64748B',
    bgGray: 'F4F6F9',
    lightGray: 'F8F9FA',
    border: 'E2E8F0',
    paleBlue: 'EEF6FC',
    paleYellow: 'FFF7E6',
    white: 'FFFFFF',
  });
  const FONT_FACE = 'Malgun Gothic';
  const SLIDE_W = 13.333;
  const SLIDE_H = 7.5;
  const BODY_TOP = 1.4;
  const BODY_BOTTOM = 6.2;
  const BODY_H = BODY_BOTTOM - BODY_TOP;

  function preprocessText(value) {
    return String(value ?? '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/[`*_]/g, '')
      // 2026. 6. 9. 6. 30. → 2026. 06. 09. ~ 06. 30.
      .replace(
        /\b(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?!\s*\d)/g,
        (_, year, startMonth, startDay, endMonth, endDay) =>
          `${year}. ${String(startMonth).padStart(2, '0')}. ${String(startDay).padStart(2, '0')}. ~ ${String(endMonth).padStart(2, '0')}. ${String(endDay).padStart(2, '0')}.`,
      )
      // Normalize ordinary dotted dates after range correction.
      .replace(
        /\b(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\./g,
        (_, year, month, day) =>
          `${year}. ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}.`,
      )
      .replace(
        /~\s*(\d{1,2})\.\s*(\d{1,2})\./g,
        (_, month, day) =>
          `~ ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}.`,
      )
      .replace(/(\d)\s*~\s*(\d)/g, '$1 ~ $2')
      .replace(/\s*([:：])\s*/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeFilename(value) {
    const name = preprocessText(value)
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 60);
    return `${name || '국가유산진흥원 발표자료'}.pptx`;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return preprocessText(value);
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
      rectRadius: options.rounded ? 0.08 : undefined,
      fill: { color, transparency: options.transparency || 0 },
      line: options.line || { color, transparency: 100 },
      shapeName: options.shapeName,
    });
  }

  function addCardBackground(slide, pptx, x, y, w, h, options = {}) {
    addRect(slide, pptx, x, y, w, h, options.fill || COLORS.lightGray, {
      rounded: true,
      line: { color: options.line || COLORS.border, width: 0.9 },
      shapeName: options.shapeName,
    });
  }

  function addBrandMark(slide, data = {}) {
    if (data.logoData) {
      slide.addImage({
        data: data.logoData,
        x: 0.8,
        y: 0.4,
        w: Number(data.logoWidth) || 1.45,
        h: Number(data.logoHeight) || 0.52,
      });
      return;
    }
    slide.addText('국가유산진흥원', {
      x: 0.8, y: 0.42, w: 2.6, h: 0.38,
      fontFace: FONT_FACE, fontSize: 14, bold: true,
      color: COLORS.navy, margin: 0,
    });
    slide.addText('KOREA HERITAGE AGENCY', {
      x: 0.81, y: 0.76, w: 2.8, h: 0.18,
      fontFace: 'Arial', fontSize: 5.5, bold: true,
      charSpacing: 1.5, color: COLORS.gray, margin: 0,
    });
  }

  function addAccentBar(slide, pptx) {
    const y = 1.12;
    addRect(slide, pptx, 0.8, y, 0.62, 0.055, COLORS.yellow);
    addRect(slide, pptx, 1.42, y, 0.62, 0.055, COLORS.blue);
    addRect(slide, pptx, 2.04, y, 10.49, 0.055, COLORS.navy);
  }

  function addContentHeader(slide, pptx, title, continued = false) {
    slide.background = { color: COLORS.white };
    slide.addText(`${preprocessText(title) || '주요 내용'}${continued ? ' (계속)' : ''}`, {
      x: 0.8, y: 0.5, w: 11.73, h: 0.44,
      fontFace: FONT_FACE, fontSize: 22, bold: true,
      color: COLORS.navy, margin: 0, fit: 'shrink',
      valign: 'middle',
    });
    addAccentBar(slide, pptx);
    slide.addText('HERIAN  |  국가유산진흥원', {
      x: 0.8, y: 6.72, w: 4.0, h: 0.2,
      fontFace: FONT_FACE, fontSize: 8.5,
      color: COLORS.muted, margin: 0,
    });
  }

  function splitLongText(value, maxChars = 92) {
    const text = preprocessText(value);
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

  function normalizeTables(rawTables) {
    return (Array.isArray(rawTables) ? rawTables : []).map(table => ({
      title: preprocessText(table?.title),
      headers: (Array.isArray(table?.headers) ? table.headers : []).map(preprocessText),
      rows: (Array.isArray(table?.rows) ? table.rows : [])
        .map(row => (Array.isArray(row) ? row : [row]).map(preprocessText)),
    }));
  }

  function normalizeSections(data = {}) {
    const rawSections = Array.isArray(data.sections) ? data.sections : [];
    return rawSections.map((section, index) => {
      let rawItems = section?.bullets || section?.items || section?.points || [];
      if (!Array.isArray(rawItems)) rawItems = [rawItems];
      const bullets = rawItems.flatMap(item => {
        const value = typeof item === 'object' ? item?.text : item;
        return splitLongText(value);
      }).filter(Boolean);
      let rawParagraphs = section?.paragraphs || section?.body || [];
      if (!Array.isArray(rawParagraphs)) rawParagraphs = [rawParagraphs];
      const paragraphs = rawParagraphs.flatMap(value => splitLongText(value, 130)).filter(Boolean);
      return {
        heading: preprocessText(section?.title || section?.heading || `핵심 내용 ${index + 1}`),
        paragraphs,
        bullets,
        tables: normalizeTables(section?.tables),
      };
    }).filter(section =>
      section.heading || section.paragraphs.length || section.bullets.length || section.tables.length
    );
  }

  function allContentItems(sections) {
    return sections.flatMap(section => [
      ...section.paragraphs.map(text => ({ heading: section.heading, text, type: 'paragraph' })),
      ...section.bullets.map(text => ({ heading: section.heading, text, type: 'bullet' })),
    ]);
  }

  function combinedText(data, sections) {
    return [
      data.title,
      ...sections.flatMap(section => [
        section.heading,
        ...section.paragraphs,
        ...section.bullets,
        ...section.tables.flatMap(table => [
          table.title,
          ...table.headers,
          ...table.rows.flat(),
        ]),
      ]),
    ].map(preprocessText).join(' ');
  }

  function extractMetrics(sections) {
    const candidates = allContentItems(sections);
    const metrics = [];
    const unitPattern = /-?\d[\d,]*(?:\.\d+)?\s*(?:점|%|명|건|개|억\s*원|만\s*원|원|회|일|개월|배|위)(?![가-힣A-Za-z0-9])/g;
    candidates.forEach(item => {
      const matches = item.text.match(unitPattern) || [];
      matches.forEach(value => {
        const label = preprocessText(
          item.text.replace(value, '').replace(/^[\s:：·\-–]+|[\s:：·\-–]+$/g, ''),
        ) || item.heading;
        metrics.push({ label: label.slice(0, 34), value: value.replace(/\s+/g, '') });
      });
    });
    sections.forEach(section => {
      section.tables.forEach(table => {
        table.rows.forEach(row => {
          row.slice(1).forEach((cell, columnOffset) => {
            const matches = cell.match(unitPattern) || [];
            matches.forEach(value => {
              const header = table.headers[columnOffset + 1];
              metrics.push({
                label: preprocessText([row[0], header].filter(Boolean).join(' · ')).slice(0, 34),
                value: value.replace(/\s+/g, ''),
              });
            });
          });
        });
      });
    });
    return metrics.filter((metric, index, array) =>
      array.findIndex(candidate => candidate.value === metric.value && candidate.label === metric.label) === index
    ).slice(0, 3);
  }

  function comparisonRows(sections) {
    const rows = [];
    sections.forEach(section => {
      section.tables.forEach(table => {
        table.rows.forEach(row => {
          const label = row[0] || section.heading;
          const value = row.slice(1).filter(Boolean).join(' · ');
          if (label && value) rows.push([label, value]);
        });
      });
    });
    if (rows.length) return rows;

    allContentItems(sections).forEach(item => {
      const explicit = item.text.match(/^(.{1,34}?)(?:[:：]| - | – )\s*(.+)$/);
      if (explicit) rows.push([preprocessText(explicit[1]), preprocessText(explicit[2])]);
      else if (/\d/.test(item.text)) rows.push([item.heading, item.text]);
    });
    return rows;
  }

  function adaptTypedSlideData(slideData = {}) {
    const type = String(slideData.type ?? '').trim().toLowerCase();
    if (type === 'cards_2col') {
      const columns = (Array.isArray(slideData.columns) ? slideData.columns : []).slice(0, 2);
      return {
        ...slideData,
        pattern: 'overview',
        leftTitle: preprocessText(columns[0]?.header || columns[0]?.title || '기본정보'),
        rightTitle: preprocessText(columns[1]?.header || columns[1]?.title || '핵심 내용'),
        sections: columns.map((column, index) => ({
          title: preprocessText(column?.header || column?.title || `${index + 1}영역`),
          bullets: Array.isArray(column?.items) ? column.items : [],
        })),
      };
    }
    if (type === 'stat') {
      return { ...slideData, pattern: 'stat' };
    }
    if (type === 'timeline' && Array.isArray(slideData.steps)) {
      return {
        ...slideData,
        pattern: 'timeline',
        timeline: slideData.steps.map(step => ({
          period: step?.date || step?.period,
          title: step?.title,
          detail: step?.desc || step?.detail,
        })),
      };
    }
    if (type === 'table') {
      return { ...slideData, pattern: 'table' };
    }
    if (type === 'diagram') {
      return { ...slideData, pattern: 'diagram' };
    }
    if (type === 'chart') {
      return { ...slideData, pattern: 'chart' };
    }
    return slideData;
  }

  function detectSlidePattern(data, sections) {
    const explicit = preprocessText(data.pattern || data.layout).toLowerCase();
    const allowed = new Set([
      'overview', 'metrics', 'stat', 'priority', 'timeline', 'table', 'diagram', 'chart', 'cards',
    ]);
    if (allowed.has(explicit)) return explicit;

    const text = combinedText(data, sections);
    const titleAndHeadings = [
      preprocessText(data.title),
      ...sections.map(section => section.heading),
    ].join(' ');
    const metrics = extractMetrics(sections);
    const hasComparisonTable = sections.some(section =>
      section.tables.some(table => table.rows.length > 0)
    );
    if (/(우선순위|우선 과제|개선과제|개선 과제|중점과제|1순위|2순위|3순위)/i.test(text)) {
      return 'priority';
    }
    if (
      /(향후 일정|추진 일정|세부 일정|로드맵|월별 계획|추진계획)/i.test(text) ||
      ((text.match(/\d{1,2}\s*월/g) || []).length >= 2)
    ) {
      return 'timeline';
    }
    if (
      /(성과|종합 진단|진단 결과|점수|격차|실적|지표|KPI|평가 결과|달성률)/i.test(titleAndHeadings) ||
      metrics.length >= 2 ||
      (metrics.length >= 1 && hasComparisonTable)
    ) {
      return 'metrics';
    }
    if (/(개요|현황|배경|목적|기본정보|사업 개요|추진 개요|운영 현황)/i.test(text)) {
      return 'overview';
    }
    return 'cards';
  }

  function createBodySlide(pptx, title, continued = false) {
    const slide = pptx.addSlide();
    addContentHeader(slide, pptx, title, continued);
    return slide;
  }

  function addBulletList(slide, items, box, options = {}) {
    if (!items.length) {
      slide.addText('내용을 확인해 주세요.', {
        x: box.x, y: box.y, w: box.w, h: 0.35,
        fontFace: FONT_FACE, fontSize: 12, color: COLORS.muted,
        margin: 0, fit: 'shrink',
      });
      return;
    }
    const lineWeights = items.map(item =>
      Math.max(1, Math.ceil(preprocessText(item).length / (options.charsPerLine || 36))),
    );
    const totalWeight = lineWeights.reduce((sum, value) => sum + value, 0) || 1;
    let y = box.y;
    items.forEach((item, index) => {
      const h = Math.max(0.28, box.h * (lineWeights[index] / totalWeight));
      slide.addText(preprocessText(item), {
        x: box.x, y, w: box.w, h,
        fontFace: FONT_FACE, fontSize: options.fontSize || 12,
        color: options.color || COLORS.gray,
        bullet: options.bullet !== false, margin: 2,
        paraSpaceAfter: 3, fit: 'shrink', valign: 'top',
        lineSpacingMultiple: 1.08,
      });
      y += h;
    });
  }

  function sectionItems(section) {
    return [...section.paragraphs, ...section.bullets];
  }

  function overviewColumns(sections) {
    const left = [];
    const right = [];
    sections.forEach(section => {
      const target = /(목적|핵심|수치|목표|효과|성과)/.test(section.heading) ? right : left;
      sectionItems(section).forEach(item => target.push(item));
    });
    const all = [...left, ...right];
    if (!left.length || !right.length) {
      const half = Math.ceil(all.length / 2);
      return [all.slice(0, half), all.slice(half)];
    }
    return [left, right];
  }

  function renderOverview(pptx, data, sections) {
    const explicitColumns = Array.isArray(data.columns) && data.columns.length >= 2
      ? data.columns.slice(0, 2).map(column => (
        Array.isArray(column.items) ? column.items.map(preprocessText).filter(Boolean) : []
      ))
      : null;
    const [leftItems, rightItems] = explicitColumns || overviewColumns(sections);
    const metrics = extractMetrics(sections);
    const pages = Math.max(1, Math.ceil(Math.max(leftItems.length, rightItems.length) / 5));
    const slides = [];

    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const cards = [
        {
          x: 0.8,
          title: data.columns?.[0]?.header || data.leftTitle || '기본정보',
          items: leftItems.slice(pageIndex * 5, pageIndex * 5 + 5),
        },
        {
          x: 6.77,
          title: data.columns?.[1]?.header || data.rightTitle || '핵심 수치·목적',
          items: rightItems.slice(pageIndex * 5, pageIndex * 5 + 5),
        },
      ];
      cards.forEach((card, columnIndex) => {
        addCardBackground(slide, pptx, card.x, BODY_TOP, 5.76, BODY_H, {
          shapeName: `overview-card-${columnIndex + 1}`,
        });
        addRect(slide, pptx, card.x, BODY_TOP, 0.08, BODY_H, columnIndex ? COLORS.yellow : COLORS.blue);
        slide.addText(card.title, {
          x: card.x + 0.28, y: 1.68, w: 5.15, h: 0.38,
          fontFace: FONT_FACE, fontSize: 16, bold: true,
          color: COLORS.navy, margin: 0, fit: 'shrink',
        });

        if (columnIndex === 1 && pageIndex === 0 && metrics.length) {
          const metric = metrics[0];
          slide.addText(metric.value, {
            x: card.x + 0.28, y: 2.15, w: 5.15, h: 0.74,
            fontFace: FONT_FACE, fontSize: 30, bold: true,
            color: COLORS.blue, margin: 0, fit: 'shrink',
          });
          slide.addText(metric.label, {
            x: card.x + 0.3, y: 2.85, w: 5.1, h: 0.34,
            fontFace: FONT_FACE, fontSize: 11, color: COLORS.muted,
            margin: 0, fit: 'shrink',
          });
          addBulletList(slide, card.items.filter(item => !item.includes(metric.value)), {
            x: card.x + 0.28, y: 3.35, w: 5.05, h: 2.35,
          });
        } else {
          addBulletList(slide, card.items, {
            x: card.x + 0.28, y: 2.2, w: 5.05, h: 3.5,
          });
        }
      });
      slides.push(slide);
    }
    return slides;
  }

  function tableRowsForPptx(rows) {
    return rows.map((row, index) => [
      {
        text: preprocessText(row[0]),
        options: {
          bold: index === 0,
          color: index === 0 ? COLORS.white : COLORS.navy,
          fill: index === 0 ? COLORS.navy : (index % 2 ? COLORS.white : COLORS.lightGray),
        },
      },
      {
        text: preprocessText(row[1]),
        options: {
          bold: index === 0,
          color: index === 0 ? COLORS.white : COLORS.gray,
          fill: index === 0 ? COLORS.navy : (index % 2 ? COLORS.white : COLORS.lightGray),
        },
      },
    ]);
  }

  function renderMetrics(pptx, data, sections) {
    const metrics = extractMetrics(sections);
    const comparisons = comparisonRows(sections);
    const rowPages = [];
    if (comparisons.length) {
      for (let offset = 0; offset < comparisons.length; offset += 6) {
        rowPages.push(comparisons.slice(offset, offset + 6));
      }
    } else {
      rowPages.push([]);
    }

    return rowPages.map((pageRows, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const visibleMetrics = metrics.length ? metrics : [{
        value: '—',
        label: '핵심 수치를 확인해 주세요.',
      }];
      const count = Math.min(3, visibleMetrics.length);
      const gap = 0.25;
      const cardW = (11.73 - gap * (count - 1)) / count;
      visibleMetrics.slice(0, count).forEach((metric, index) => {
        const x = 0.8 + index * (cardW + gap);
        addCardBackground(slide, pptx, x, BODY_TOP, cardW, 1.45, {
          fill: index === 0 ? COLORS.paleBlue : COLORS.lightGray,
          line: index === 0 ? COLORS.blue : COLORS.border,
          shapeName: `kpi-card-${index + 1}`,
        });
        slide.addText(metric.value, {
          x: x + 0.22, y: 1.67, w: cardW - 0.44, h: 0.58,
          fontFace: FONT_FACE, fontSize: count === 1 ? 32 : 27,
          bold: true, color: index === 0 ? COLORS.blue : COLORS.navy,
          margin: 0, align: 'center', fit: 'shrink',
        });
        slide.addText(metric.label, {
          x: x + 0.22, y: 2.28, w: cardW - 0.44, h: 0.32,
          fontFace: FONT_FACE, fontSize: 10.5,
          color: COLORS.muted, margin: 0, align: 'center', fit: 'shrink',
        });
      });

      if (pageRows.length) {
        const tableRows = [['구분', '비교 내용'], ...pageRows];
        slide.addTable(tableRowsForPptx(tableRows), {
          x: 0.8, y: 3.05, w: 11.73, h: 2.9,
          colW: [3.65, 8.08],
          rowH: 2.9 / tableRows.length,
          fontFace: FONT_FACE, fontSize: 11.5,
          color: COLORS.gray, margin: [5, 9, 5, 9],
          valign: 'middle',
          border: { type: 'solid', pt: 0.7, color: COLORS.border },
        });
      } else {
        const fallbackItems = allContentItems(sections).map(item => item.text).slice(0, 6);
        addCardBackground(slide, pptx, 0.8, 3.05, 11.73, 2.9);
        addBulletList(slide, fallbackItems, {
          x: 1.08, y: 3.34, w: 11.15, h: 2.3,
        }, { charsPerLine: 70 });
      }
      return slide;
    });
  }

  function renderStat(pptx, data) {
    const subCards = (Array.isArray(data.subCards) ? data.subCards : []).map((card, index) => ({
      title: preprocessText(card?.title || `${index + 1} 세부 지표`),
      items: (Array.isArray(card?.items) ? card.items : [])
        .flatMap(item => splitLongText(item, 90))
        .filter(Boolean),
    }));
    const pages = [];
    for (let offset = 0; offset < Math.max(subCards.length, 1); offset += 2) {
      pages.push(subCards.slice(offset, offset + 2));
    }
    return pages.map((pageCards, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      addCardBackground(slide, pptx, 0.8, BODY_TOP, 11.73, 1.45, {
        fill: COLORS.paleBlue,
        line: COLORS.blue,
        shapeName: 'main-stat-card',
      });
      slide.addText(preprocessText(data.mainStatLabel) || '핵심 지표', {
        x: 1.12, y: 1.66, w: 5.2, h: 0.34,
        fontFace: FONT_FACE, fontSize: 14,
        color: COLORS.muted, margin: 0, fit: 'shrink',
      });
      slide.addText(preprocessText(data.mainStatValue) || '—', {
        x: 1.12, y: 2.02, w: 10.9, h: 0.62,
        fontFace: FONT_FACE, fontSize: 34, bold: true,
        color: COLORS.navy, margin: 0, fit: 'shrink',
      });

      const cards = pageCards.length ? pageCards : [{
        title: '세부 진단',
        items: ['세부 지표와 해석 내용을 확인해 주세요.'],
      }];
      const gap = 0.28;
      const cardW = cards.length === 1 ? 11.73 : (11.73 - gap) / 2;
      cards.forEach((card, index) => {
        const x = 0.8 + index * (cardW + gap);
        addCardBackground(slide, pptx, x, 3.1, cardW, 3.1, {
          shapeName: `stat-detail-card-${index + 1}`,
        });
        addRect(slide, pptx, x, 3.1, 0.07, 3.1, index ? COLORS.yellow : COLORS.blue);
        slide.addText(card.title, {
          x: x + 0.28, y: 3.35, w: cardW - 0.56, h: 0.42,
          fontFace: FONT_FACE, fontSize: 15.5, bold: true,
          color: COLORS.navy, margin: 0, fit: 'shrink',
        });
        addBulletList(slide, card.items, {
          x: x + 0.28, y: 3.98, w: cardW - 0.58, h: 1.82,
        }, { charsPerLine: cards.length === 1 ? 72 : 34 });
      });
      return slide;
    });
  }

  function renderTable(pptx, data) {
    const headers = (Array.isArray(data.headers) ? data.headers : [])
      .map(value => preprocessText(value))
      .filter(Boolean);
    const rows = (Array.isArray(data.rows) ? data.rows : [])
      .map(row => (Array.isArray(row) ? row : [row]))
      .map(row => headers.map((_, index) => preprocessText(row[index] ?? '')));
    const safeHeaders = headers.length ? headers : ['구분', '내용'];
    const normalizedRows = rows.map(row => (
      safeHeaders.map((_, index) => preprocessText(row[index] ?? ''))
    ));
    const rowsPerPage = Math.max(4, Math.min(8, Number(data.rowsPerPage) || 7));
    const pages = [];
    for (let offset = 0; offset < Math.max(normalizedRows.length, 1); offset += rowsPerPage) {
      pages.push(normalizedRows.slice(offset, offset + rowsPerPage));
    }

    return pages.map((pageRows, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const tableRows = [
        safeHeaders.map(header => ({
          text: header,
          options: { bold: true, color: COLORS.white, fill: COLORS.navy, align: 'center' },
        })),
        ...pageRows.map((row, rowIndex) => row.map(value => ({
          text: value,
          options: {
            color: COLORS.gray,
            fill: rowIndex % 2 ? COLORS.bgGray : COLORS.white,
          },
        }))),
      ];
      const rowHeight = Math.min(0.62, 4.45 / Math.max(tableRows.length, 1));
      const explicitWidths = Array.isArray(data.colWidths)
        && data.colWidths.length === safeHeaders.length
        ? data.colWidths.map(Number)
        : null;
      const widthSum = explicitWidths?.reduce((sum, width) => sum + width, 0);
      const colW = widthSum > 0
        ? explicitWidths.map(width => 11.73 * width / widthSum)
        : safeHeaders.map(() => 11.73 / safeHeaders.length);

      slide.addTable(tableRows, {
        x: 0.8, y: 1.48, w: 11.73,
        colW,
        rowH: rowHeight,
        fontFace: FONT_FACE,
        fontSize: safeHeaders.length > 5 ? 9.5 : 11.5,
        color: COLORS.gray,
        margin: [5, 7, 5, 7],
        valign: 'middle',
        border: { type: 'solid', pt: 0.7, color: COLORS.border },
        autoFit: false,
      });
      if (data.note && pageIndex === pages.length - 1) {
        slide.addText(preprocessText(data.note), {
          x: 0.84, y: 5.98, w: 11.65, h: 0.2,
          fontFace: FONT_FACE, fontSize: 8.5,
          color: COLORS.muted, margin: 0, fit: 'shrink',
        });
      }
      return slide;
    });
  }

  function renderDiagram(pptx, data) {
    const steps = (Array.isArray(data.steps) ? data.steps : []).map((step, index) => ({
      title: preprocessText(step?.title || step?.label || `단계 ${index + 1}`),
      desc: preprocessText(step?.desc || step?.detail || step?.description || step?.text),
    }));
    const pages = [];
    for (let offset = 0; offset < Math.max(steps.length, 1); offset += 4) {
      pages.push(steps.slice(offset, offset + 4));
    }

    return pages.map((pageSteps, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const items = pageSteps.length ? pageSteps : [{
        title: '프로세스 단계',
        desc: '단계별 실행 내용을 확인해 주세요.',
      }];
      const arrowW = 0.38;
      const gap = 0.16;
      const cardW = (11.73 - (items.length - 1) * (arrowW + gap * 2)) / items.length;
      items.forEach((step, index) => {
        const x = 0.8 + index * (cardW + arrowW + gap * 2);
        addCardBackground(slide, pptx, x, 2.02, cardW, 3.58, {
          fill: index === 0 ? COLORS.paleBlue : COLORS.bgGray,
          line: index === 0 ? COLORS.blue : COLORS.border,
          shapeName: `process-card-${index + 1}`,
        });
        slide.addText(String(pageIndex * 4 + index + 1).padStart(2, '0'), {
          x: x + 0.22, y: 2.28, w: 0.58, h: 0.32,
          fontFace: FONT_FACE, fontSize: 12, bold: true,
          color: index === 0 ? COLORS.blue : COLORS.yellow,
          margin: 0,
        });
        slide.addText(step.title, {
          x: x + 0.22, y: 2.83, w: cardW - 0.44, h: 0.68,
          fontFace: FONT_FACE, fontSize: 16, bold: true,
          color: COLORS.navy, align: 'center', valign: 'middle',
          margin: 0, fit: 'shrink',
        });
        slide.addText(step.desc, {
          x: x + 0.24, y: 3.72, w: cardW - 0.48, h: 1.36,
          fontFace: FONT_FACE, fontSize: 11,
          color: COLORS.gray, align: 'center', valign: 'middle',
          margin: 4, fit: 'shrink',
        });
        if (index < items.length - 1) {
          slide.addShape(shapeType(pptx, 'rightArrow'), {
            x: x + cardW + gap, y: 3.53, w: arrowW, h: 0.48,
            fill: { color: COLORS.blue },
            line: { color: COLORS.blue, transparency: 100 },
            shapeName: `process-arrow-${index + 1}`,
          });
        }
      });
      return slide;
    });
  }

  function renderChart(pptx, data) {
    const categories = (Array.isArray(data.categories) ? data.categories : [])
      .map(value => preprocessText(value))
      .filter(Boolean)
      .slice(0, 12);
    const series = (Array.isArray(data.series) ? data.series : [])
      .slice(0, 4)
      .map((item, index) => ({
        name: preprocessText(item?.name || `계열 ${index + 1}`),
        labels: categories,
        values: categories.map((_, valueIndex) => {
          const value = Number(item?.values?.[valueIndex]);
          return Number.isFinite(value) ? value : 0;
        }),
      }));
    const slide = createBodySlide(pptx, data.title);
    if (!categories.length || !series.length) {
      addCardBackground(slide, pptx, 0.8, BODY_TOP, 11.73, BODY_H);
      slide.addText('차트에 표시할 범주와 수치 데이터를 확인해 주세요.', {
        x: 1.1, y: 3.3, w: 11.13, h: 0.5,
        fontFace: FONT_FACE, fontSize: 15,
        color: COLORS.muted, align: 'center', margin: 0,
      });
      return [slide];
    }
    addCardBackground(slide, pptx, 0.8, BODY_TOP, 11.73, BODY_H, {
      fill: COLORS.white,
      shapeName: 'chart-card',
    });
    slide.addChart(pptx.ChartType?.bar || 'bar', series, {
      x: 1.12, y: 1.66, w: 11.08, h: 4.22,
      catAxisLabelFontFace: FONT_FACE,
      catAxisLabelFontSize: 10,
      valAxisLabelFontFace: FONT_FACE,
      valAxisLabelFontSize: 9,
      valAxisMinVal: Number.isFinite(Number(data.minValue)) ? Number(data.minValue) : 0,
      showLegend: data.showLegend !== false && series.length > 1,
      legendPos: 'b',
      legendFontFace: FONT_FACE,
      legendFontSize: 9,
      showTitle: false,
      showValue: Boolean(data.showValues),
      dataLabelPosition: 'outEnd',
      showCatName: false,
      showSerName: false,
      chartColors: [COLORS.blue, COLORS.navy, COLORS.yellow, COLORS.muted],
      showBorder: false,
      showGridLines: true,
    });
    return [slide];
  }

  function priorityItems(data, sections) {
    if (Array.isArray(data.priorities)) {
      return data.priorities.map((item, index) => ({
        rank: index + 1,
        title: preprocessText(item?.title || item?.heading || `${index + 1}순위`),
        detail: preprocessText(item?.detail || item?.text || item?.description),
      }));
    }
    return allContentItems(sections).map((item, index) => {
      const rankMatch = item.text.match(/^\s*([1-9])\s*(?:순위|[.)])\s*(.*)$/);
      const remainder = preprocessText(rankMatch?.[2] || item.text);
      const parts = remainder.split(/[:：]\s*/, 2);
      return {
        rank: Number(rankMatch?.[1]) || index + 1,
        title: preprocessText(parts.length > 1 ? parts[0] : item.heading),
        detail: preprocessText(parts.length > 1 ? parts[1] : remainder),
      };
    });
  }

  function renderPriority(pptx, data, sections) {
    const items = priorityItems(data, sections);
    const pages = [];
    for (let offset = 0; offset < Math.max(items.length, 1); offset += 3) {
      pages.push(items.slice(offset, offset + 3));
    }
    return pages.map((pageItems, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const itemsToRender = pageItems.length ? pageItems : [{
        rank: 1, title: '우선과제', detail: '우선순위 내용을 확인해 주세요.',
      }];
      const cardW = 3.76;
      const gap = 0.23;
      itemsToRender.forEach((item, index) => {
        const x = 0.8 + index * (cardW + gap);
        addCardBackground(slide, pptx, x, 1.76, cardW, 4.18, {
          fill: index === 0 ? COLORS.paleBlue : COLORS.lightGray,
          line: index === 0 ? COLORS.blue : COLORS.border,
          shapeName: `priority-card-${index + 1}`,
        });
        slide.addShape(shapeType(pptx, 'ellipse'), {
          x: x + 1.43, y: 1.5, w: 0.9, h: 0.9,
          fill: { color: index === 0 ? COLORS.blue : COLORS.navy },
          line: { color: COLORS.white, transparency: 100 },
        });
        slide.addText(String(item.rank).padStart(2, '0'), {
          x: x + 1.43, y: 1.66, w: 0.9, h: 0.32,
          fontFace: FONT_FACE, fontSize: 17, bold: true,
          color: COLORS.white, align: 'center', margin: 0,
        });
        slide.addText(item.title || `${item.rank}순위`, {
          x: x + 0.28, y: 2.65, w: cardW - 0.56, h: 0.62,
          fontFace: FONT_FACE, fontSize: 17, bold: true,
          color: COLORS.navy, align: 'center', valign: 'middle',
          margin: 0, fit: 'shrink',
        });
        slide.addText(item.detail, {
          x: x + 0.3, y: 3.48, w: cardW - 0.6, h: 1.85,
          fontFace: FONT_FACE, fontSize: 12,
          color: COLORS.gray, align: 'center', valign: 'middle',
          margin: 5, fit: 'shrink', breakLine: false,
        });
      });
      return slide;
    });
  }

  function timelineItems(data, sections) {
    if (Array.isArray(data.timeline)) {
      return data.timeline.map((item, index) => ({
        period: preprocessText(item?.period || item?.date || item?.month || `단계 ${index + 1}`),
        title: preprocessText(item?.title || item?.heading || item?.label),
        detail: preprocessText(item?.detail || item?.text || item?.description),
      }));
    }
    const rows = comparisonRows(sections);
    if (rows.length) {
      return rows.map(row => ({ period: row[0], title: row[1], detail: '' }));
    }
    return allContentItems(sections).map((item, index) => {
      const periodMatch = item.text.match(
        /((?:20\d{2}\.\s*)?\d{1,2}(?:\.\s*\d{1,2}\.)?(?:\s*~\s*\d{1,2}(?:\.\s*\d{1,2}\.)?)?|\d{1,2}\s*(?:~\s*\d{1,2})?\s*월)/,
      );
      const period = preprocessText(periodMatch?.[1] || `단계 ${index + 1}`);
      const remainder = preprocessText(item.text.replace(periodMatch?.[0] || '', ''));
      const parts = remainder.replace(/^[:：·\-–\s]+/, '').split(/[:：]\s*/, 2);
      return {
        period,
        title: preprocessText(parts[0] || item.heading),
        detail: preprocessText(parts[1] || (parts.length > 1 ? '' : remainder)),
      };
    });
  }

  function renderTimeline(pptx, data, sections) {
    const items = timelineItems(data, sections);
    const pages = [];
    for (let offset = 0; offset < Math.max(items.length, 1); offset += 4) {
      pages.push(items.slice(offset, offset + 4));
    }
    return pages.map((pageItems, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      const itemsToRender = pageItems.length ? pageItems : [{
        period: '일정', title: '추진계획', detail: '일정 내용을 확인해 주세요.',
      }];
      const count = itemsToRender.length;
      const startX = 1.25;
      const endX = 12.08;
      const step = count > 1 ? (endX - startX) / (count - 1) : 0;
      slide.addShape(shapeType(pptx, 'line'), {
        x: startX, y: 3.05, w: Math.max(0.01, endX - startX), h: 0,
        line: {
          color: COLORS.blue, width: 2.2,
          endArrowType: count > 1 ? 'triangle' : 'none',
        },
      });
      itemsToRender.forEach((item, index) => {
        const centerX = count === 1 ? SLIDE_W / 2 : startX + index * step;
        const cardW = count === 1 ? 4.2 : Math.min(2.7, step - 0.22);
        slide.addText(item.period, {
          x: centerX - cardW / 2, y: 1.75, w: cardW, h: 0.55,
          fontFace: FONT_FACE, fontSize: 17, bold: true,
          color: index === 0 ? COLORS.blue : COLORS.navy,
          align: 'center', valign: 'middle', margin: 0, fit: 'shrink',
        });
        slide.addShape(shapeType(pptx, 'ellipse'), {
          x: centerX - 0.16, y: 2.89, w: 0.32, h: 0.32,
          fill: { color: index === 0 ? COLORS.yellow : COLORS.blue },
          line: { color: COLORS.white, width: 1 },
        });
        addCardBackground(slide, pptx, centerX - cardW / 2, 3.55, cardW, 2.12, {
          fill: index === 0 ? COLORS.paleYellow : COLORS.lightGray,
          line: index === 0 ? COLORS.yellow : COLORS.border,
          shapeName: `timeline-card-${index + 1}`,
        });
        slide.addText(item.title || `단계 ${index + 1}`, {
          x: centerX - cardW / 2 + 0.18, y: 3.82, w: cardW - 0.36, h: 0.5,
          fontFace: FONT_FACE, fontSize: 14, bold: true,
          color: COLORS.navy, align: 'center', margin: 0, fit: 'shrink',
        });
        slide.addText(item.detail, {
          x: centerX - cardW / 2 + 0.18, y: 4.43, w: cardW - 0.36, h: 0.9,
          fontFace: FONT_FACE, fontSize: 10.5,
          color: COLORS.gray, align: 'center', valign: 'middle',
          margin: 3, fit: 'shrink',
        });
      });
      return slide;
    });
  }

  function estimatedLineCount(text, charsPerLine = 39) {
    return Math.max(1, Math.ceil(preprocessText(text).length / charsPerLine));
  }

  function genericCards(sections) {
    return sections.flatMap(section => {
      const items = sectionItems(section);
      if (!items.length && section.tables.length) {
        return section.tables.flatMap(table => table.rows.map(row => ({
          heading: row[0] || section.heading,
          items: [row.slice(1).join(' · ')],
        })));
      }
      const cards = [];
      for (let offset = 0; offset < Math.max(items.length, 1); offset += 3) {
        cards.push({
          heading: offset ? `${section.heading} (계속)` : section.heading,
          items: items.slice(offset, offset + 3),
        });
      }
      return cards;
    });
  }

  function renderCards(pptx, data, sections) {
    const cards = genericCards(sections.length ? sections : [{
      heading: '주요 내용', paragraphs: [], bullets: ['내용을 확인해 주세요.'], tables: [],
    }]);
    const pages = [];
    for (let offset = 0; offset < cards.length; offset += 4) {
      pages.push(cards.slice(offset, offset + 4));
    }
    return pages.map((pageCards, pageIndex) => {
      const slide = createBodySlide(pptx, data.title, pageIndex > 0);
      pageCards.forEach((card, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = column ? 6.77 : 0.8;
        const y = BODY_TOP + row * 2.52;
        addCardBackground(slide, pptx, x, y, 5.76, 2.25, {
          shapeName: `content-card-${index + 1}`,
        });
        addRect(slide, pptx, x, y, 0.07, 2.25, column ? COLORS.yellow : COLORS.blue);
        slide.addText(card.heading, {
          x: x + 0.25, y: y + 0.18, w: 5.2, h: 0.4,
          fontFace: FONT_FACE, fontSize: 16, bold: true,
          color: COLORS.navy, margin: 0, fit: 'shrink',
        });
        addBulletList(slide, card.items, {
          x: x + 0.27, y: y + 0.72, w: 5.12, h: 1.2,
        });
      });
      return slide;
    });
  }

  /**
   * Selects and renders a visual layout from the semantic content of slideData.
   * Returns an array because overflow may create continuation slides.
   */
  function renderSlideByPattern(pptx, slideData = {}) {
    const adapted = adaptTypedSlideData(slideData);
    const normalized = {
      ...adapted,
      title: preprocessText(adapted.title) || '주요 내용',
    };
    const sections = normalizeSections(normalized);
    const pattern = detectSlidePattern(normalized, sections);
    switch (pattern) {
      case 'overview':
        return renderOverview(pptx, normalized, sections);
      case 'metrics':
        return renderMetrics(pptx, normalized, sections);
      case 'stat':
        return renderStat(pptx, normalized);
      case 'priority':
        return renderPriority(pptx, normalized, sections);
      case 'timeline':
        return renderTimeline(pptx, normalized, sections);
      case 'table':
        return renderTable(pptx, normalized);
      case 'diagram':
        return renderDiagram(pptx, normalized);
      case 'chart':
        return renderChart(pptx, normalized);
      default:
        return renderCards(pptx, normalized, sections);
    }
  }

  function createCoverSlide(pptx, data = {}) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };
    addBrandMark(slide, data);
    addRect(slide, pptx, 0.8, 1.35, 0.9, 0.06, COLORS.yellow);
    addRect(slide, pptx, 1.7, 1.35, 0.9, 0.06, COLORS.blue);
    addRect(slide, pptx, 2.6, 1.35, 9.93, 0.06, COLORS.navy);
    slide.addText(preprocessText(data.title) || '발표자료 제목', {
      x: 0.8, y: 2.35, w: 11.73, h: 1.52,
      fontFace: FONT_FACE, fontSize: 32, bold: true,
      color: COLORS.navy, align: 'center', valign: 'middle',
      margin: 0.04, fit: 'shrink',
    });
    if (data.subtitle) {
      slide.addText(preprocessText(data.subtitle), {
        x: 1.15, y: 4.0, w: 11.03, h: 0.52,
        fontFace: FONT_FACE, fontSize: 17,
        color: COLORS.gray, align: 'center', valign: 'middle',
        margin: 0, fit: 'shrink',
      });
    }
    const organization = [preprocessText(data.department), preprocessText(data.team)]
      .filter(Boolean).join(' · ') || '국가유산진흥원';
    slide.addText(`${formatDate(data.date)}\n${organization}`, {
      x: 8.15, y: 5.92, w: 4.38, h: 0.78,
      fontFace: FONT_FACE, fontSize: 14,
      color: COLORS.gray, align: 'right', valign: 'bottom',
      margin: 0, fit: 'shrink',
    });
    return slide;
  }

  function createContentSlide(pptx, data = {}) {
    return renderSlideByPattern(pptx, data);
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
      margin: 0,
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
        color: COLORS.gray, align: 'center', margin: 0, fit: 'shrink',
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
    pptx.author = preprocessText(data.author) || '국가유산진흥원';
    pptx.company = '국가유산진흥원';
    pptx.subject = preprocessText(data.subject) || preprocessText(data.title);
    pptx.title = preprocessText(data.title) || '국가유산진흥원 발표자료';
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
    contentSlides.forEach(slideData => renderSlideByPattern(pptx, slideData));
    createEndingSlide(pptx);
    return pptx;
  }

  async function downloadKhaPresentation(data = {}, fileName) {
    const pptx = createPresentation(data);
    const resolvedName = fileName || safeFilename(data.title);
    await pptx.writeFile({ fileName: resolvedName, compression: true });
    return resolvedName;
  }

  async function generateKHA_PPT(slideDataArray, options = {}) {
    if (!Array.isArray(slideDataArray) || !slideDataArray.length) {
      throw new Error('한 개 이상의 PowerPoint 슬라이드 JSON이 필요합니다.');
    }
    const title = preprocessText(options.title)
      || preprocessText(slideDataArray[0]?.deckTitle)
      || '국가유산진흥원 발표자료';
    const pptx = createPresentation({
      title,
      subtitle: options.subtitle,
      author: options.author,
      department: options.department,
      team: options.team,
      date: options.date,
      slides: slideDataArray,
    });
    if (options.download === false) return pptx;
    const filename = options.fileName || safeFilename(title);
    await pptx.writeFile({ fileName: filename, compression: true });
    return filename;
  }

  global.KhaPptx = Object.freeze({
    COLORS,
    preprocessText,
    detectSlidePattern,
    renderSlideByPattern,
    createCoverSlide,
    createContentSlide,
    createEndingSlide,
    createPresentation,
    generateKHA_PPT,
    downloadKhaPresentation,
    safeFilename,
  });
  global.renderSlideByPattern = renderSlideByPattern;
  global.generateKHA_PPT = generateKHA_PPT;
  global.createCoverSlide = createCoverSlide;
  global.createContentSlide = createContentSlide;
  global.createEndingSlide = createEndingSlide;
})(window);
