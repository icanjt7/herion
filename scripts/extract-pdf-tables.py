#!/usr/bin/env python3
"""Extract ruled and appendix tables from Korean policy PDFs.

The output preserves physical cells and row/column spans while also producing
an expanded matrix and Markdown optimized for retrieval-augmented generation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber


LINE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 5,
    "edge_min_length": 8,
}

TEXT_SETTINGS = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "min_words_vertical": 2,
    "min_words_horizontal": 2,
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 5,
}

APPENDIX_RE = re.compile(r"\[(?:별표|별지)\s*[^\]]*\]|(?:지급|적용|산정|평가|배점|등급|기준)표")
PAGE_NUMBER_RE = re.compile(r"^\s*[-–—]?\s*\d+\s*[-–—]?\s*$")


@dataclass(frozen=True)
class DocumentSpec:
    path: Path
    title: str
    revision: str


def normalized_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("\u0000", "").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    return value.strip()


def cluster(values: Iterable[float], tolerance: float = 2.5) -> list[float]:
    result: list[list[float]] = []
    for value in sorted(values):
        if result and abs(value - sum(result[-1]) / len(result[-1])) <= tolerance:
            result[-1].append(value)
        else:
            result.append([value])
    return [sum(group) / len(group) for group in result]


def nearest_index(values: list[float], target: float) -> int:
    return min(range(len(values)), key=lambda index: abs(values[index] - target))


def bbox_overlap(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> float:
    x0 = max(left[0], right[0])
    top = max(left[1], right[1])
    x1 = min(left[2], right[2])
    bottom = min(left[3], right[3])
    if x1 <= x0 or bottom <= top:
        return 0.0
    intersection = (x1 - x0) * (bottom - top)
    smaller = min((left[2] - left[0]) * (left[3] - left[1]), (right[2] - right[0]) * (right[3] - right[1]))
    return intersection / smaller if smaller else 0.0


def context_lines(page: Any, bbox: tuple[float, float, float, float]) -> tuple[str, str, str]:
    x0, top, x1, bottom = bbox
    before = normalized_text(page.crop((0, max(0, top - 105), page.width, top)).extract_text())
    after = normalized_text(page.crop((0, bottom, page.width, min(page.height, bottom + 65))).extract_text())
    before_lines = [line for line in before.splitlines() if line.strip() and not PAGE_NUMBER_RE.match(line)]
    after_lines = [line for line in after.splitlines() if line.strip() and not PAGE_NUMBER_RE.match(line)]
    title_candidates = before_lines[-4:]
    title = next((line for line in reversed(title_candidates) if APPENDIX_RE.search(line)), "")
    if not title and title_candidates:
        title = title_candidates[-1]
    return title[:500], "\n".join(before_lines[-8:])[:2000], "\n".join(after_lines[:5])[:1200]


def cell_text(page: Any, bbox: tuple[float, float, float, float]) -> str:
    x0, top, x1, bottom = bbox
    inset = 0.35
    if x1 - x0 > inset * 2 and bottom - top > inset * 2:
        bbox = (x0 + inset, top + inset, x1 - inset, bottom - inset)
    return normalized_text(page.crop(bbox).extract_text(x_tolerance=1.5, y_tolerance=2.5))


def markdown_table(matrix: list[list[str | None]]) -> str:
    if not matrix:
        return ""
    width = max(len(row) for row in matrix)
    rows = [row + [None] * (width - len(row)) for row in matrix]

    def escaped(value: str | None) -> str:
        return (value or "원문상 빈칸").replace("|", "\\|").replace("\n", "<br>")

    header = rows[0]
    lines = ["| " + " | ".join(escaped(value) for value in header) + " |"]
    lines.append("| " + " | ".join("---" for _ in range(width)) + " |")
    lines.extend("| " + " | ".join(escaped(value) for value in row) + " |" for row in rows[1:])
    return "\n".join(lines)


def classify_table(title: str, rows: int, columns: int, matrix: list[list[str | None]]) -> str:
    joined = " ".join(value or "" for row in matrix for value in row)
    if "별지" in title or re.search(r"신청서|보고서|의뢰서|의견서|확인서|서약서|대장", title):
        return "form"
    if rows <= 2 or columns <= 1:
        return "layout_box"
    if re.search(r"문답|질의|Q\d+", joined):
        return "qa_table"
    return "data_table"


def extract_table(page: Any, table: Any, spec: DocumentSpec, page_number: int, table_index: int, method: str) -> dict[str, Any] | None:
    raw_cells = [tuple(float(value) for value in bbox) for bbox in table.cells]
    if not raw_cells:
        return None
    xs = cluster([value for bbox in raw_cells for value in (bbox[0], bbox[2])])
    ys = cluster([value for bbox in raw_cells for value in (bbox[1], bbox[3])])
    if len(xs) < 2 or len(ys) < 2:
        return None
    row_count = len(ys) - 1
    column_count = len(xs) - 1
    physical_cells: list[dict[str, Any]] = []
    expanded: list[list[str | None]] = [[None for _ in range(column_count)] for _ in range(row_count)]
    anchors: list[list[str | None]] = [[None for _ in range(column_count)] for _ in range(row_count)]

    for bbox in sorted(raw_cells, key=lambda value: (value[1], value[0])):
        col = nearest_index(xs, bbox[0])
        col_end = nearest_index(xs, bbox[2])
        row = nearest_index(ys, bbox[1])
        row_end = nearest_index(ys, bbox[3])
        colspan = max(1, col_end - col)
        rowspan = max(1, row_end - row)
        text = cell_text(page, bbox)
        physical_cells.append({
            "row": row,
            "column": col,
            "rowspan": rowspan,
            "colspan": colspan,
            "text": text,
            "bbox": [round(value, 2) for value in bbox],
        })
        if row < row_count and col < column_count:
            anchors[row][col] = text or None
        for row_index in range(row, min(row_count, row + rowspan)):
            for column_index in range(col, min(column_count, col + colspan)):
                expanded[row_index][column_index] = text or None

    nonempty = sum(1 for row in expanded for value in row if value)
    if nonempty < 2:
        return None
    title, before, after = context_lines(page, tuple(table.bbox))
    table_type = classify_table(title, row_count, column_count, expanded)
    source_identity = f"{spec.path.name}\0{page_number}\0{table_index}\0{json.dumps(expanded, ensure_ascii=False)}"
    checksum = hashlib.sha256(source_identity.encode("utf-8")).hexdigest()
    table_id = f"KHT-{checksum[:24]}"
    search_parts = [spec.title, title, before, after]
    search_parts.extend(value for row in expanded for value in row if value)
    search_text = normalized_text("\n".join(search_parts))
    confidence = min(1.0, 0.45 + min(nonempty / max(1, row_count * column_count), 1) * 0.35 + (0.15 if method == "lines" else 0.05))
    return {
        "id": table_id,
        "document_title": spec.title,
        "source_file": spec.path.name,
        "revision_basis": spec.revision,
        "page_start": page_number,
        "page_end": page_number,
        "table_index": table_index,
        "table_title": title,
        "table_type": table_type,
        "context_before": before,
        "context_after": after,
        "row_count": row_count,
        "column_count": column_count,
        "cells": physical_cells,
        "anchor_matrix": anchors,
        "expanded_matrix": expanded,
        "markdown": markdown_table(expanded),
        "search_text": search_text,
        "extraction_method": method,
        "confidence": round(confidence, 3),
        "checksum_sha256": checksum,
    }


def parse_document(value: str) -> DocumentSpec:
    parts = value.split("::")
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("--document must be PATH::TITLE::REVISION")
    path = Path(parts[0]).expanduser().resolve()
    if not path.is_file():
        raise argparse.ArgumentTypeError(f"PDF not found: {path}")
    return DocumentSpec(path=path, title=parts[1].strip(), revision=parts[2].strip())


def extract_documents(specs: list[DocumentSpec]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    audit_documents: list[dict[str, Any]] = []
    for spec in specs:
        document_tables = 0
        pages_with_tables: set[int] = set()
        appendix_without_table: list[int] = []
        possible_ocr_pages: list[int] = []
        with pdfplumber.open(spec.path) as pdf:
            for page_number, page in enumerate(pdf.pages, 1):
                page_text = normalized_text(page.extract_text())
                candidates = [(item, "lines") for item in page.find_tables(LINE_SETTINGS)]
                if APPENDIX_RE.search(page_text) and not candidates:
                    candidates = [(item, "text") for item in page.find_tables(TEXT_SETTINGS)]
                accepted_bboxes: list[tuple[float, float, float, float]] = []
                accepted = 0
                for table, method in candidates:
                    bbox = tuple(float(value) for value in table.bbox)
                    if any(bbox_overlap(bbox, existing) > 0.8 for existing in accepted_bboxes):
                        continue
                    item = extract_table(page, table, spec, page_number, accepted + 1, method)
                    if not item:
                        continue
                    tables.append(item)
                    accepted_bboxes.append(bbox)
                    accepted += 1
                if accepted:
                    pages_with_tables.add(page_number)
                    document_tables += accepted
                elif APPENDIX_RE.search(page_text):
                    appendix_without_table.append(page_number)
                if len(page_text) < 30 and getattr(page, "images", None):
                    possible_ocr_pages.append(page_number)
                if page_number % 25 == 0 or page_number == len(pdf.pages):
                    print(f"{spec.path.name}: {page_number}/{len(pdf.pages)} pages, {document_tables} tables", file=sys.stderr, flush=True)
            audit_documents.append({
                "document_title": spec.title,
                "source_file": spec.path.name,
                "revision_basis": spec.revision,
                "page_count": len(pdf.pages),
                "table_count": document_tables,
                "pages_with_tables": sorted(pages_with_tables),
                "appendix_or_table_hint_without_detection": appendix_without_table,
                "possible_ocr_pages": possible_ocr_pages,
            })
    duplicate_ids = len(tables) - len({table["id"] for table in tables})
    summary = {
        "schema_version": 1,
        "document_count": len(specs),
        "page_count": sum(item["page_count"] for item in audit_documents),
        "table_count": len(tables),
        "cell_count": sum(len(item["cells"]) for item in tables),
        "duplicate_id_count": duplicate_ids,
        "by_type": {
            table_type: sum(1 for table in tables if table["table_type"] == table_type)
            for table_type in sorted({table["table_type"] for table in tables})
        },
        "documents": audit_documents,
    }
    return tables, summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", action="append", type=parse_document, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    tables, summary = extract_documents(args.document)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(tables, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
