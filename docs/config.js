// ─── Herion 설정 ───────────────────────────────────────────────
// Supabase 프로젝트 값을 아래에 입력하세요.
// Dashboard → Settings → API 에서 확인 가능합니다.
// ----------------------------------------------------------------
window.HERION_CONFIG = {
  supabaseUrl:     'https://enpovkaknaxfgzanyghn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucG92a2FrbmF4Zmd6YW55Z2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTk5MDEsImV4cCI6MjA5NjUzNTkwMX0.cY3q4Nf9Ppe80eLeD__tgGeAKIZSK6uReW9amQZbmpo',

  allowedDomain: 'kh.or.kr',

  // ─── Motif AI API ──────────────────────────────────────────────
  motifApiKey:  'YOUR_MOTIF_API_KEY',
  motifBaseUrl: 'https://chat.motiftech.io/openapi/v1',
  motifModels: [
    { id: 'motif-12.7b-reasoning', label: 'Motif 12.7B Reasoning' }
  ],

  // ─── Tavily 웹 검색 API ─────────────────────────────────────────
  tavilyApiKey: 'YOUR_TAVILY_API_KEY',

  // ─── 국가법령정보 API (open.law.go.kr 에서 발급) ───────────────
  lawApiKey: 'YOUR_LAW_API_KEY'
};
