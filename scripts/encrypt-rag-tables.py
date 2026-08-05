#!/usr/bin/env python3
"""Encrypt a private table JSON package for safe repository storage."""

from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


MAGIC = b"HRT1"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--key-file", type=Path)
    args = parser.parse_args()
    key_text = args.key_file.read_text(encoding="utf-8").strip() if args.key_file else os.environ.get("RAG_TABLE_DATA_KEY", "").strip()
    key = base64.b64decode(key_text, validate=True)
    if len(key) != 32:
        raise SystemExit("RAG_TABLE_DATA_KEY must be a base64-encoded 32-byte key")
    plaintext = args.input.read_bytes()
    rows = json.loads(plaintext)
    if not isinstance(rows, list) or not rows:
        raise SystemExit("table package must be a non-empty JSON array")
    compressed = gzip.compress(plaintext, compresslevel=9)
    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(nonce, compressed, MAGIC)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(MAGIC + nonce + encrypted)
    metadata = {
        "schemaVersion": 1,
        "tableCount": len(rows),
        "cellCount": sum(len(row.get("cells", [])) for row in rows),
        "documentCount": len({row.get("source_file") for row in rows}),
        "plaintextSha256": hashlib.sha256(plaintext).hexdigest(),
        "encryptedSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "sourceRevisions": sorted({row.get("revision_basis") for row in rows if row.get("revision_basis")}),
    }
    args.metadata.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
