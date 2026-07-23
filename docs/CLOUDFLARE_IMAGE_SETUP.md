# Cloudflare 무료 이미지 생성 설정

Herian은 별도 이미지 생성 버튼 없이 다음과 같은 문장을 입력하면 이미지 생성 요청으로 자동 분기합니다.

- `경복궁을 수채화 느낌으로 그려줘`
- `국가유산 행사 포스터 이미지를 생성해 줘`
- `전통 문양 배너를 만들어 줘`
- `생성해`

`보고서 생성해`, `문서 생성해`, `표를 만들어 줘`처럼 이미지가 아닌 산출물을 명시하면 기존 채팅 기능으로 처리합니다.

## 1. Cloudflare 계정 만들기

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 가입하고 로그인합니다.
2. 왼쪽 메뉴에서 **Workers AI**를 선택합니다.
3. **Use REST API**를 선택합니다.

별도의 Cloudflare Worker를 직접 만들 필요는 없습니다. Herian의 Supabase 함수가 Workers AI REST API를 호출합니다.

## 2. Account ID 복사하기

Workers AI의 **Use REST API** 화면에서 **Account ID**를 복사합니다.

- 이 값은 계정 식별자입니다.
- API Token과 서로 다른 값입니다.

## 3. API Token 만들기

1. 같은 화면에서 **Create a Workers AI API Token**을 선택합니다.
2. 미리 지정된 권한을 확인하고 토큰을 생성합니다.
3. 표시된 토큰을 즉시 복사해 안전한 곳에 보관합니다.

API Token은 다시 전체 값이 표시되지 않을 수 있습니다. 분실했다면 새 토큰을 만들면 됩니다. Global API Key는 사용하지 않습니다.

## 4. GitHub 저장소에 값 등록하기

GitHub 저장소에서 **Settings → Secrets and variables → Actions → New repository secret**으로 이동한 뒤 다음 두 항목을 만듭니다.

| Secret 이름 | 입력할 값 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 2단계에서 복사한 Account ID |
| `CLOUDFLARE_API_TOKEN` | 3단계에서 복사한 Workers AI API Token |

기존 배포에 사용하는 `SUPABASE_KHA_PROJECT` Secret도 등록되어 있어야 합니다.

API Token을 `docs/config.js`나 HTML 파일에 직접 넣으면 안 됩니다. GitHub Actions가 이 값을 Supabase Secret으로 안전하게 전달합니다.

## 5. 이미지 API 배포하기

두 Secret을 등록한 다음 아래 중 하나를 실행합니다.

1. 변경사항을 `main` 브랜치에 push합니다. 또는
2. GitHub의 **Actions → Deploy Image Generation API Proxy → Run workflow**를 실행합니다.

배포가 성공하면 `image-api` Supabase Edge Function이 생성됩니다.

## 6. 동작 확인하기

Herian 입력창에 다음처럼 입력합니다.

```text
창덕궁 후원을 봄날 수채화 삽화로 그려줘
```

정상이라면 대화창에 이미지와 **이미지 다운로드**, **다시 생성** 버튼이 표시됩니다.

## 무료 한도를 모두 사용한 경우

Cloudflare의 일일 무료 할당량이 소진되면 Herian은 다음 메시지를 표시합니다.

> Cloudflare의 금일 무료 이미지 생성 한도를 모두 사용했습니다. 금일은 더 생성할 수 없습니다.

Cloudflare 무료 한도는 매일 00:00 UTC, 한국시간으로 오전 9시에 갱신됩니다. Cloudflare 유료 요금제로 전환하지 않는 한 무료 한도를 넘겨 자동 과금되지 않고 요청이 실패합니다.

## 문제 해결

- **설정이 완료되지 않았다는 오류:** GitHub Secret 두 개의 이름과 값, 배포 워크플로 성공 여부를 확인합니다.
- **Cloudflare 인증 오류:** API Token을 새로 만들고 `CLOUDFLARE_API_TOKEN`을 교체한 뒤 워크플로를 다시 실행합니다.
- **이미지가 생성되지 않음:** Cloudflare Workers AI 대시보드에서 사용량과 오류를 확인합니다.
- **일반 문서 요청이 이미지로 처리됨:** `보고서`, `문서`, `표`, `파일`처럼 원하는 산출물 종류를 문장에 명시합니다.
