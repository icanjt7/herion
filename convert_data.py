#!/usr/bin/env python3
"""
국가유산 CSV/API → JSON 변환 스크립트 (Herion 전용)

[로컬 실행]
  python convert_data.py
  - heritage_palaces_API.csv, royal_API.csv 가 있으면 CSV → JSON 변환

[GitHub Actions / API 자동갱신]
  KHS_API_KEY=YOUR_KEY python convert_data.py
  - 국가유산청 Open API에서 직접 데이터를 가져와 JSON 생성
  - API 키: data.go.kr → "국가문화유산포털_문화재검색" 검색 후 활용신청

[결과]
  docs/data/heritage.json  — 국보·보물·사적 등 문화재 정보
  docs/data/royal.json     — 궁궐 건물 스토리
"""
import csv
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET

BASE    = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, 'docs', 'data')
os.makedirs(OUT_DIR, exist_ok=True)

KHS_API_KEY = os.environ.get('KHS_API_KEY', '').strip()

# 국가유산 종목코드
HERITAGE_TYPES = {
    '11': '국보',
    '12': '보물',
    '13': '사적',
    '14': '명승',
    '15': '천연기념물',
    '17': '국가무형유산',
    '18': '국가민속문화재',
}


# ── API에서 가져오기 ───────────────────────────────────────────────
def fetch_from_api(api_key: str) -> list:
    """국가유산청 Open API(data.go.kr)에서 문화재 목록을 가져온다."""
    all_items = []

    for type_code, type_name in HERITAGE_TYPES.items():
        page = 1
        while True:
            url = (
                'https://www.khs.go.kr/cha/SearchKindOpenapiList.do'
                f'?pageUnit=100&pageIndex={page}'
                f'&ccbaKdcd={type_code}&apiKey={api_key}'
            )
            try:
                req = urllib.request.Request(
                    url, headers={'User-Agent': 'HerionBot/1.0', 'Accept': '*/*'}
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read().decode('utf-8')

                root = ET.fromstring(raw)
                items = root.findall('.//item')
                if not items:
                    break

                for item in items:
                    get = lambda tag: (item.findtext(tag) or '').strip()
                    name = get('ccbaMnm1')
                    if not name:
                        continue
                    all_items.append({
                        'name':        name,
                        'type':        type_name,
                        'location':    get('ccbaLcad'),
                        'content':     get('content'),
                        'imageUrl':    get('imageUrl'),
                        'longitude':   get('longitude'),
                        'latitude':    get('latitude'),
                        'category':    get('gcodeName'),
                        'subcategory': get('bcodeName'),
                    })

                print(f'  [{type_name}] {page}페이지 {len(items)}건 수집')
                if len(items) < 100:
                    break
                page += 1
                time.sleep(0.3)   # API 과호출 방지

            except Exception as e:
                print(f'  [{type_name}] {page}페이지 오류: {e}')
                break

    return all_items


# ── CSV에서 가져오기 ──────────────────────────────────────────────
def convert_heritage_csv(src: str) -> list:
    data = []
    with open(src, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            name = (row.get('ccbaMnm1') or '').strip()
            if not name:
                continue
            data.append({
                'name':        name,
                'type':        (row.get('ccbaKdcd')  or '').strip(),
                'location':    (row.get('ccbaLcad')  or '').strip(),
                'content':     (row.get('content')   or '').strip(),
                'imageUrl':    (row.get('imageUrl')  or '').strip(),
                'longitude':   (row.get('longitude') or '').strip(),
                'latitude':    (row.get('latitude')  or '').strip(),
                'category':    (row.get('gcodeName') or '').strip(),
                'subcategory': (row.get('bcodeName') or '').strip(),
            })
    return data


def convert_royal_csv(src: str) -> list:
    data = []
    with open(src, encoding='utf-8') as f:
        for row in csv.DictReader(f, skipinitialspace=True):
            row  = {k.strip(): v for k, v in row.items()}
            name = (row.get('name') or '').strip()
            if not name:
                continue
            data.append({
                'name':    name,
                'place':   (row.get('place')   or '').strip(),
                'source':  (row.get('source')  or '').strip(),
                'content': (row.get('content') or '').strip(),
            })
    return data


# ── 저장 ─────────────────────────────────────────────────────────
def save_json(data: list, path: str, label: str):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[{label}] {len(data):,}건 → {path}')


# ── 메인 ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    heritage_csv  = os.path.join(BASE, 'heritage_palaces_API.csv')
    royal_csv     = os.path.join(BASE, 'royal_API.csv')
    heritage_json = os.path.join(OUT_DIR, 'heritage.json')
    royal_json    = os.path.join(OUT_DIR, 'royal.json')

    # ── 국가유산 데이터 ───────────────────────────────────────────
    if KHS_API_KEY:
        print('[ 국가유산청 API에서 직접 수집 중... ]')
        heritage = fetch_from_api(KHS_API_KEY)
        if heritage:
            save_json(heritage, heritage_json, 'heritage(API)')
        else:
            print('  API 수집 실패. CSV fallback 시도...')
            if os.path.exists(heritage_csv):
                save_json(convert_heritage_csv(heritage_csv), heritage_json, 'heritage(CSV)')
    elif os.path.exists(heritage_csv):
        save_json(convert_heritage_csv(heritage_csv), heritage_json, 'heritage(CSV)')
    else:
        print(f'[주의] heritage_palaces_API.csv 없음. KHS_API_KEY도 없음.')

    # ── 궁궐 스토리 데이터 ───────────────────────────────────────
    if os.path.exists(royal_csv):
        save_json(convert_royal_csv(royal_csv), royal_json, 'royal(CSV)')
    else:
        print(f'[주의] royal_API.csv 없음 — 건너뜁니다.')

    print('\n완료! GitHub에 push하면 채팅에서 국가유산 질문 시 자동 참조됩니다.')
    if not KHS_API_KEY:
        print('\n[ API 자동갱신 설정 방법 ]')
        print('  1. data.go.kr → "국가문화유산포털 문화재 검색" 검색 → 활용신청')
        print('  2. 발급된 키를 GitHub → Settings → Secrets → KHS_API_KEY 로 등록')
        print('  3. 이후 매주 일요일 새벽 3시에 데이터가 자동 갱신됩니다.')
