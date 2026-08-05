#!/usr/bin/env python3
"""Append an OCR-only form/table page to an extracted RAG table package."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import subprocess
from collections import defaultdict
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--tesseract", type=Path, required=True)
    parser.add_argument("--tessdata", type=Path, required=True)
    parser.add_argument("--document-title", required=True)
    parser.add_argument("--source-file", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--page", type=int, required=True)
    parser.add_argument("--title", required=True)
    args = parser.parse_args()

    command = [
        str(args.tesseract), str(args.image), "stdout", "tsv", "--tessdata-dir", str(args.tessdata),
        "-l", "kor+eng", "--psm", "6",
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    lines: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in csv.DictReader(io.StringIO(completed.stdout), delimiter="\t"):
        text = (row.get("text") or "").strip()
        try:
            confidence = float(row.get("conf") or -1)
        except ValueError:
            confidence = -1
        if text and confidence >= 25:
            lines[(row["block_num"], row["par_num"], row["line_num"])].append(row)

    cells = []
    matrix = []
    confidences = []
    for row_index, words in enumerate(lines.values()):
        words.sort(key=lambda word: int(word["left"]))
        text = " ".join(word["text"].strip() for word in words if word["text"].strip())
        if not text:
            continue
        left = min(int(word["left"]) for word in words)
        top = min(int(word["top"]) for word in words)
        right = max(int(word["left"]) + int(word["width"]) for word in words)
        bottom = max(int(word["top"]) + int(word["height"]) for word in words)
        confidence = sum(float(word["conf"]) for word in words) / len(words)
        confidences.append(confidence)
        cells.append({
            "row": row_index,
            "column": 0,
            "rowspan": 1,
            "colspan": 1,
            "text": text,
            "bbox": [left, top, right, bottom],
        })
        matrix.append([text])
    if not matrix:
        raise SystemExit("OCR produced no usable text rows")

    identity = f"{args.source_file}\0{args.page}\0ocr\0{json.dumps(matrix, ensure_ascii=False)}"
    checksum = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    markdown = "| OCR 추출 내용 |\n| --- |\n" + "\n".join(
        f"| {row[0].replace('|', '\\|')} |" for row in matrix
    )
    record = {
        "id": f"KHT-{checksum[:24]}",
        "document_title": args.document_title,
        "source_file": args.source_file,
        "revision_basis": args.revision,
        "page_start": args.page,
        "page_end": args.page,
        "table_index": 1,
        "table_title": args.title,
        "table_type": "ocr_form",
        "context_before": args.title,
        "context_after": "",
        "row_count": len(matrix),
        "column_count": 1,
        "cells": cells,
        "anchor_matrix": matrix,
        "expanded_matrix": matrix,
        "markdown": markdown,
        "search_text": "\n".join([args.document_title, args.title, *[row[0] for row in matrix]]),
        "extraction_method": "ocr",
        "confidence": round(min(confidences) / 100 if confidences else 0, 3),
        "checksum_sha256": checksum,
    }
    tables = json.loads(args.input.read_text(encoding="utf-8"))
    tables = [table for table in tables if not (
        table.get("source_file") == args.source_file and table.get("page_start") == args.page
        and table.get("extraction_method") == "ocr"
    )]
    tables.append(record)
    args.input.write_text(json.dumps(tables, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"id": record["id"], "rows": len(matrix), "confidence": record["confidence"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
