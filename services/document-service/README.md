# Herian Document Service

Herian의 정적 웹 화면과 분리된 문서 처리 컨테이너입니다.

- `POST /v1/documents/parse`: Docling 기반 PDF/DOCX/PPTX/XLSX 구조 분석, HWPX 기본 구조 분석
- `POST /v1/reports`: DOCX/PDF/PPTX 보고서 생성
- HWPX 출력: `/app/templates/<template_id>.hwpx` 기관 템플릿의 `{{TITLE}}`, `{{SUBTITLE}}`, `{{AUTHOR}}`, `{{BODY}}` 치환
- `GET /health`: 상태 확인

로컬 실행:

```powershell
docker compose up --build document-service
```

문서에는 개인정보가 포함될 수 있으므로 외부 공개 전 인증, 접근 로그, 보존기간, 저장 금지 정책을 확정해야 합니다. 서비스는 업로드 파일을 임시 디렉터리에서 처리하고 요청 종료 후 삭제합니다.
