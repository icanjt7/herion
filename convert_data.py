#!/usr/bin/env python3
"""
국가유산 CSV → JSON 변환 스크립트 (Herion 전용)

사용법:
  1. heritage_palaces_API.csv, royal_API.csv 를 이 스크립트와 같은 폴더에 둔다.
  2. python convert_data.py
  3. docs/data/heritage.json 과 docs/data/royal.json 이 생성된다.
  4. GitHub에 push하면 채팅 화면에서 자동으로 불러온다.
"""
import csv
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, 'docs', 'data')
os.makedirs(OUT_DIR, exist_ok=True)


def convert_heritage(src):
    data = []
    with open(src, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            name = (row.get('ccbaMnm1') or '').strip()
            if not name:
                continue
            data.append({
                'name':        name,
                'type':        (row.get('ccbaKdcd') or '').strip(),
                'location':    (row.get('ccbaLcad') or '').strip(),
                'content':     (row.get('content')  or '').strip(),
                'imageUrl':    (row.get('imageUrl')  or '').strip(),
                'longitude':   (row.get('longitude') or '').strip(),
                'latitude':    (row.get('latitude')  or '').strip(),
                'category':    (row.get('gcodeName') or '').strip(),
                'subcategory': (row.get('bcodeName') or '').strip(),
            })
    dst = os.path.join(OUT_DIR, 'heritage.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[heritage] {len(data):,} 건 → {dst}')


def convert_royal(src):
    data = []
    with open(src, encoding='utf-8') as f:
        # skipinitialspace=True 로 컬럼명 앞 공백 제거
        for row in csv.DictReader(f, skipinitialspace=True):
            # 키도 한 번 더 strip
            row = {k.strip(): v for k, v in row.items()}
            name = (row.get('name') or '').strip()
            if not name:
                continue
            data.append({
                'name':    name,
                'place':   (row.get('place')   or '').strip(),
                'source':  (row.get('source')  or '').strip(),
                'content': (row.get('content') or '').strip(),
            })
    dst = os.path.join(OUT_DIR, 'royal.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[royal]    {len(data):,} 건 → {dst}')


if __name__ == '__main__':
    h_csv = os.path.join(BASE, 'heritage_palaces_API.csv')
    r_csv = os.path.join(BASE, 'royal_API.csv')

    ok = True
    if os.path.exists(h_csv):
        convert_heritage(h_csv)
    else:
        print(f'[주의] {h_csv} 없음 — 파일을 프로젝트 루트에 복사하세요.')
        ok = False

    if os.path.exists(r_csv):
        convert_royal(r_csv)
    else:
        print(f'[주의] {r_csv} 없음 — 파일을 프로젝트 루트에 복사하세요.')
        ok = False

    if ok:
        print('\n완료! docs/data/ 폴더에 JSON 파일이 생성되었습니다.')
        print('GitHub에 push하면 채팅 화면에서 국가유산 관련 질문 시 자동 참조됩니다.')
