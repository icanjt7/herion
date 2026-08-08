#!/usr/bin/env python3
"""Extract page-aware semantic RAG chunks from text-based PDF documents."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber


PAGE_NUMBER_RE = re.compile(r"^\s*[-–—]?\s*\d+\s*[-–—]?\s*$")
HEADING_RE = re.compile(
    r"^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.ㆍ\s]|제\s*\d+(?:의\d+)?\s*조|"
    r"\d+(?:[-.]\d+)*[.ㆍ\s]|[가-힣]\s*[.)]|[□■◆◇❍○●▶])"
)


@dataclass(frozen=True)
class DocumentSpec:
    path: Path
    title: str
    revision: str


def parse_document(value: str) -> DocumentSpec:
    parts = value.split("::")
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("--document must be PATH::TITLE::REVISION")
    path = Path(parts[0]).expanduser().resolve()
    if not path.is_file():
        raise argparse.ArgumentTypeError(f"PDF not found: {path}")
    return DocumentSpec(path, parts[1].strip(), parts[2].strip())


def normalize_lines(text: str | None) -> list[str]:
    if not text:
        return []
    result: list[str] = []
    for raw in text.replace("\x00", "").replace("\r", "\n").splitlines():
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line or PAGE_NUMBER_RE.fullmatch(line):
            continue
        result.append(line)
    return result


def heading_candidate(line: str) -> str:
    cleaned = re.sub(r"[·.]{4,}\s*\d*\s*$", "", line).strip()
    if len(cleaned) > 110:
        return ""
    if HEADING_RE.match(cleaned) or re.match(r"^(?:목\s*차|참고|붙임|별표|별지)", cleaned):
        return cleaned
    return ""


def chunks_for_page(lines: list[str], limit: int = 1800) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    start = 0
    while start < len(lines):
        end = start
        size = 0
        while end < len(lines):
            addition = len(lines[end]) + 1
            if end > start and size + addition > limit:
                break
            size += addition
            end += 1
        text = "\n".join(lines[start:end]).strip()
        if text:
            chunks.append((start, end, text))
        if end >= len(lines):
            break
        start = max(start + 1, end - 2)
    return chunks


def extract(specs: list[DocumentSpec]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    documents: list[dict[str, Any]] = []
    for spec in specs:
        document_count = 0
        empty_pages: list[int] = []
        current_heading = "본문"
        global_line = 0
        with pdfplumber.open(spec.path) as pdf:
            for page_number, page in enumerate(pdf.pages, 1):
                lines = normalize_lines(page.extract_text(x_tolerance=1.5, y_tolerance=3.0))
                if not lines:
                    empty_pages.append(page_number)
                    continue
                page_headings = [heading_candidate(line) for line in lines]
                page_headings = [heading for heading in page_headings if heading]
                if page_headings:
                    current_heading = page_headings[0]
                for chunk_index, (start, end, text) in enumerate(chunks_for_page(lines), 1):
                    local_headings = [heading_candidate(line) for line in lines[start:end]]
                    local_headings = [heading for heading in local_headings if heading]
                    section = local_headings[-1] if local_headings else current_heading
                    unit_type = "body"
                    if re.search(r"(?:^|\n)Q\d*[.)]?|질의|문답", text, re.I):
                        unit_type = "qa"
                    elif re.search(r"예시|사례", text):
                        unit_type = "example"
                    elif re.search(r"양식|서식|별지", section):
                        unit_type = "form"
                    identity = f"{spec.path.name}\0{page_number}\0{chunk_index}\0{text}"
                    checksum = hashlib.sha256(identity.encode("utf-8")).hexdigest()
                    rows.append({
                        "id": f"ACC-{checksum[:24]}",
                        "document_title": spec.title,
                        "chapter_title": current_heading,
                        "section_title": section,
                        "text": text,
                        "unit_type": unit_type,
                        "department": "경영지원실 회계·계약 담당부서",
                        "metadata": {
                            "collection": "accounting-contract",
                            "source_file": spec.path.name,
                            "revision_basis": spec.revision,
                            "page_start": page_number,
                            "page_end": page_number,
                            "source_line_start_approx": global_line + start + 1,
                            "source_line_end_approx": global_line + end,
                        },
                        "checksum_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    })
                    document_count += 1
                global_line += len(lines)
        documents.append({
            "document_title": spec.title,
            "source_file": spec.path.name,
            "revision_basis": spec.revision,
            "page_count": len(pdf.pages),
            "chunk_count": document_count,
            "empty_pages": empty_pages,
        })
    summary = {
        "schema_version": 1,
        "document_count": len(documents),
        "page_count": sum(item["page_count"] for item in documents),
        "chunk_count": len(rows),
        "documents": documents,
    }
    return rows, summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", action="append", type=parse_document, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    rows, summary = extract(args.document)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
