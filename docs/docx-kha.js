/* global docx */
(function khaDocxFactory(global) {
  'use strict';

  const COLORS = Object.freeze({
    navy: '122856',
    blue: '4DA3E2',
    yellow: 'F1A000',
    gray: '333333',
    muted: '667085',
    lightGray: 'F8F9FA',
    border: 'D9E0EA',
    white: 'FFFFFF',
  });
  const FONT_FACE = 'Malgun Gothic';
  const A4_WIDTH = 11906;
  const A4_HEIGHT = 16838;
  const PAGE_MARGIN = 1000;
  const CONTENT_WIDTH = A4_WIDTH - (PAGE_MARGIN * 2);

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
    return `${name || '국가유산진흥원 보고서'}.docx`;
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

  function normalizeSections(data = {}) {
    const sections = Array.isArray(data.sections) ? data.sections : [];
    return sections.map((section, index) => ({
      heading: cleanText(section?.heading || section?.title || `주요 내용 ${index + 1}`),
      paragraphs: (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
        .map(cleanText).filter(Boolean),
      bullets: (Array.isArray(section?.bullets) ? section.bullets : [])
        .map(item => cleanText(typeof item === 'object' ? item?.text : item)).filter(Boolean),
      tables: (Array.isArray(section?.tables) ? section.tables : [])
        .map(table => ({
          title: cleanText(table?.title),
          headers: (Array.isArray(table?.headers) ? table.headers : []).map(cleanText),
          rows: (Array.isArray(table?.rows) ? table.rows : [])
            .map(row => (Array.isArray(row) ? row : [row]).map(cleanText)),
        })),
    })).filter(section =>
      section.heading || section.paragraphs.length || section.bullets.length || section.tables.length
    );
  }

  function tableColumnWidths(columnCount) {
    const count = Math.max(1, columnCount);
    const width = Math.floor(CONTENT_WIDTH / count);
    const widths = Array(count).fill(width);
    widths[count - 1] += CONTENT_WIDTH - (width * count);
    return widths;
  }

  function tableCell(api, text, width, options = {}) {
    const border = {
      style: api.BorderStyle.SINGLE,
      size: 5,
      color: COLORS.border,
    };
    return new api.TableCell({
      width: { size: width, type: api.WidthType.DXA },
      borders: { top: border, bottom: border, left: border, right: border },
      shading: {
        fill: options.header ? COLORS.navy : (options.alternate ? COLORS.lightGray : COLORS.white),
        type: api.ShadingType.CLEAR,
      },
      margins: { top: 110, bottom: 110, left: 130, right: 130 },
      verticalAlign: api.VerticalAlign.CENTER,
      children: [
        new api.Paragraph({
          alignment: options.header ? api.AlignmentType.CENTER : api.AlignmentType.LEFT,
          spacing: { after: 0, line: 270 },
          children: [
            new api.TextRun({
              text: cleanText(text),
              font: FONT_FACE,
              size: options.header ? 19 : 18,
              bold: Boolean(options.header),
              color: options.header ? COLORS.white : COLORS.gray,
            }),
          ],
        }),
      ],
    });
  }

  function createTable(api, table) {
    const maxColumns = Math.max(
      table.headers.length,
      ...table.rows.map(row => row.length),
      1,
    );
    const headers = Array.from(
      { length: maxColumns },
      (_, index) => table.headers[index] || `항목 ${index + 1}`,
    );
    const widths = tableColumnWidths(maxColumns);
    const rows = [
      new api.TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((header, index) =>
          tableCell(api, header, widths[index], { header: true })
        ),
      }),
      ...table.rows.map((row, rowIndex) => new api.TableRow({
        cantSplit: true,
        children: widths.map((width, columnIndex) =>
          tableCell(api, row[columnIndex] || '', width, { alternate: rowIndex % 2 === 1 })
        ),
      })),
    ];
    return new api.Table({
      width: { size: CONTENT_WIDTH, type: api.WidthType.DXA },
      columnWidths: widths,
      rows,
    });
  }

  function createHeader(api) {
    return new api.Header({
      children: [
        new api.Paragraph({
          border: {
            bottom: {
              style: api.BorderStyle.SINGLE,
              size: 10,
              color: COLORS.navy,
              space: 4,
            },
          },
          spacing: { after: 100 },
          children: [
            new api.TextRun({
              text: '국가유산진흥원',
              font: FONT_FACE,
              size: 18,
              bold: true,
              color: COLORS.navy,
            }),
            new api.TextRun({
              text: '  KOREA HERITAGE AGENCY',
              font: 'Arial',
              size: 10,
              bold: true,
              color: COLORS.muted,
            }),
          ],
        }),
      ],
    });
  }

  function createFooter(api) {
    return new api.Footer({
      children: [
        new api.Paragraph({
          tabStops: [{
            type: api.TabStopType.RIGHT,
            position: api.TabStopPosition.MAX,
          }],
          border: {
            top: {
              style: api.BorderStyle.SINGLE,
              size: 4,
              color: COLORS.border,
              space: 4,
            },
          },
          children: [
            new api.TextRun({
              text: 'www.kh.or.kr | 서울특별시 강남구 봉은사로 406 | T. 02-566-6300',
              font: FONT_FACE,
              size: 14,
              color: COLORS.muted,
            }),
            new api.TextRun({ text: '\t', font: FONT_FACE, size: 14 }),
            new api.TextRun({
              children: ['-', api.PageNumber.CURRENT, '-'],
              font: FONT_FACE,
              size: 14,
              color: COLORS.muted,
            }),
          ],
        }),
      ],
    });
  }

  function coverChildren(api, data) {
    const organization = [cleanText(data.department), cleanText(data.team)]
      .filter(Boolean).join(' · ') || cleanText(data.author) || '국가유산진흥원';
    return [
      new api.Paragraph({
        spacing: { before: 1200, after: 180 },
        alignment: api.AlignmentType.CENTER,
        children: [
          new api.TextRun({
            text: '국가유산진흥원',
            font: FONT_FACE,
            size: 28,
            bold: true,
            color: COLORS.navy,
          }),
        ],
      }),
      new api.Paragraph({
        spacing: { after: 1300 },
        alignment: api.AlignmentType.CENTER,
        children: [
          new api.TextRun({ text: '━━━━', color: COLORS.yellow, size: 16 }),
          new api.TextRun({ text: '━━━━', color: COLORS.blue, size: 16 }),
          new api.TextRun({ text: '━━━━━━━━━━━━', color: COLORS.navy, size: 16 }),
        ],
      }),
      new api.Paragraph({
        alignment: api.AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [
          new api.TextRun({
            text: cleanText(data.title) || '보고서 제목',
            font: FONT_FACE,
            size: 44,
            bold: true,
            color: COLORS.navy,
          }),
        ],
      }),
      ...(data.subtitle ? [
        new api.Paragraph({
          alignment: api.AlignmentType.CENTER,
          spacing: { after: 1600 },
          children: [
            new api.TextRun({
              text: cleanText(data.subtitle),
              font: FONT_FACE,
              size: 24,
              color: COLORS.gray,
            }),
          ],
        }),
      ] : [
        new api.Paragraph({ spacing: { after: 1600 }, children: [] }),
      ]),
      new api.Paragraph({
        alignment: api.AlignmentType.RIGHT,
        spacing: { after: 100 },
        children: [
          new api.TextRun({
            text: formatDate(data.date),
            font: FONT_FACE,
            size: 21,
            color: COLORS.gray,
          }),
        ],
      }),
      new api.Paragraph({
        alignment: api.AlignmentType.RIGHT,
        children: [
          new api.TextRun({
            text: organization,
            font: FONT_FACE,
            size: 21,
            color: COLORS.gray,
          }),
        ],
      }),
      new api.Paragraph({ children: [new api.PageBreak()] }),
    ];
  }

  function bodyChildren(api, data) {
    const sections = normalizeSections(data);
    const children = [];
    sections.forEach((section, sectionIndex) => {
      if (
        sectionIndex === 0 &&
        cleanText(section.heading).toLocaleLowerCase() === cleanText(data.title).toLocaleLowerCase()
      ) {
        section.heading = '개요';
      }
      children.push(new api.Paragraph({
        heading: api.HeadingLevel.HEADING_1,
        keepNext: true,
        children: [new api.TextRun(section.heading || '주요 내용')],
      }));
      section.paragraphs.forEach(paragraph => {
        children.push(new api.Paragraph({
          spacing: { after: 150, line: 340 },
          alignment: api.AlignmentType.JUSTIFIED,
          children: [
            new api.TextRun({
              text: paragraph,
              font: FONT_FACE,
              size: 21,
              color: COLORS.gray,
            }),
          ],
        }));
      });
      section.bullets.forEach(bullet => {
        children.push(new api.Paragraph({
          numbering: { reference: 'kha-bullets', level: 0 },
          spacing: { after: 100, line: 320 },
          children: [
            new api.TextRun({
              text: bullet,
              font: FONT_FACE,
              size: 21,
              color: COLORS.gray,
            }),
          ],
        }));
      });
      section.tables.forEach(table => {
        if (table.title) {
          children.push(new api.Paragraph({
            heading: api.HeadingLevel.HEADING_2,
            keepNext: true,
            children: [new api.TextRun(table.title)],
          }));
        }
        children.push(createTable(api, table));
        children.push(new api.Paragraph({ spacing: { after: 120 }, children: [] }));
      });
    });
    if (!children.length) {
      children.push(new api.Paragraph({
        children: [new api.TextRun('작성 내용을 확인해 주세요.')],
      }));
    }
    return children;
  }

  function createDocument(data = {}) {
    const api = global.docx;
    if (!api?.Document || !api?.Packer) {
      throw new Error('docx 9.x 라이브러리를 먼저 불러와 주세요.');
    }
    return new api.Document({
      creator: cleanText(data.author) || '국가유산진흥원',
      title: cleanText(data.title) || '국가유산진흥원 보고서',
      subject: cleanText(data.subject) || cleanText(data.title),
      description: '국가유산진흥원 Herian에서 생성한 보고서',
      styles: {
        default: {
          document: {
            run: { font: FONT_FACE, size: 21, color: COLORS.gray },
            paragraph: { spacing: { line: 320 } },
          },
        },
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { font: FONT_FACE, size: 32, bold: true, color: COLORS.navy },
            paragraph: {
              spacing: { before: 320, after: 180 },
              outlineLevel: 0,
              border: {
                bottom: {
                  style: api.BorderStyle.SINGLE,
                  size: 8,
                  color: COLORS.blue,
                  space: 3,
                },
              },
            },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { font: FONT_FACE, size: 26, bold: true, color: COLORS.navy },
            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
          },
        ],
      },
      numbering: {
        config: [{
          reference: 'kha-bullets',
          levels: [{
            level: 0,
            format: api.LevelFormat.BULLET,
            text: '•',
            alignment: api.AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 560, hanging: 280 },
              },
            },
          }],
        }],
      },
      sections: [{
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT },
            margin: {
              top: 1050,
              right: PAGE_MARGIN,
              bottom: 1050,
              left: PAGE_MARGIN,
              header: 420,
              footer: 420,
            },
          },
        },
        headers: { default: createHeader(api) },
        footers: { default: createFooter(api) },
        children: [...coverChildren(api, data), ...bodyChildren(api, data)],
      }],
    });
  }

  async function buildDocument(data = {}) {
    const document = createDocument(data);
    return {
      blob: await global.docx.Packer.toBlob(document),
      filename: safeFilename(data.title),
    };
  }

  async function downloadDocument(data = {}) {
    const result = await buildDocument(data);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return result.filename;
  }

  global.KhaDocx = Object.freeze({
    COLORS,
    createDocument,
    buildDocument,
    downloadDocument,
    safeFilename,
  });
})(window);
