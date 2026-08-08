#!/usr/bin/env python3
"""Append OCR chunks for image-heavy PDF pages with little embedded text."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


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


def normalize(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\x00", "")).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", action="append", type=parse_document, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--tesseract", type=Path, required=True)
    parser.add_argument("--tessdata", type=Path, required=True)
    parser.add_argument("--max-embedded-chars", type=int, default=30)
    args = parser.parse_args()
    rows = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("input must be a JSON array")
    appended = []
    attempted = []
    for spec in args.document:
        with pdfplumber.open(spec.path) as pdf:
            for page_number, page in enumerate(pdf.pages, 1):
                embedded = normalize(page.extract_text())
                if len(embedded) >= args.max_embedded_chars or not page.images:
                    continue
                attempted.append({"source_file": spec.path.name, "page": page_number})
                with tempfile.TemporaryDirectory(prefix="herian-ocr-") as directory:
                    image_path = Path(directory) / "page.png"
                    page.to_image(resolution=180).original.save(image_path)
                    result = subprocess.run(
                        [
                            str(args.tesseract), str(image_path), "stdout",
                            "--tessdata-dir", str(args.tessdata),
                            "-l", "kor+eng", "--psm", "6",
                        ],
                        check=True,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                    )
                text = normalize(result.stdout)
                if len(text) < 40:
                    continue
                identity = f"{spec.path.name}\0ocr\0{page_number}\0{text}"
                checksum = hashlib.sha256(identity.encode("utf-8")).hexdigest()
                appended.append({
                    "id": f"ACC-OCR-{checksum[:20]}",
                    "document_title": spec.title,
                    "chapter_title": "이미지 화면·서식 OCR",
                    "section_title": f"PDF {page_number}쪽 이미지 OCR",
                    "text": text,
                    "unit_type": "reference",
                    "department": "경영지원실 회계·계약 담당부서",
                    "metadata": {
                        "collection": "accounting-contract",
                        "source_file": spec.path.name,
                        "revision_basis": spec.revision,
                        "page_start": page_number,
                        "page_end": page_number,
                        "extraction_method": "ocr",
                        "extraction_confidence": "보조 검색용",
                    },
                    "checksum_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                })
    combined = rows + appended
    args.output.write_text(json.dumps(combined, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    summary = {
        "attempted_page_count": len(attempted),
        "appended_chunk_count": len(appended),
        "total_chunk_count": len(combined),
        "attempted_pages": attempted,
    }
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
