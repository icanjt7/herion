// ─── Herion 설정 ───────────────────────────────────────────────
// Supabase 프로젝트 값을 아래에 입력하세요.
// Dashboard → Settings → API 에서 확인 가능합니다.
// ----------------------------------------------------------------
window.HERION_CONFIG = {
  supabaseUrl:     'https://enpovkaknaxfgzanyghn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucG92a2FrbmF4Zmd6YW55Z2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTk5MDEsImV4cCI6MjA5NjUzNTkwMX0.cY3q4Nf9Ppe80eLeD__tgGeAKIZSK6uReW9amQZbmpo',

  allowedDomain: 'kh.or.kr',
  bootstrapUsers: [
    {
      email: 't@kh.or.kr',
      name: 't',
      role: 'user',
      department: '',
      position_title: ''
    }
  ],

  // ─── Motif AI API ──────────────────────────────────────────────
  motifApiProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/motif-api',
  motifModels: [
    { id: 'motif3', label: 'Motif3 300B' }
  ],

  // ─── Tavily 웹 검색 API ─────────────────────────────────────────
  tavilyApiKey: 'YOUR_TAVILY_API_KEY',

  // ─── 국가법령정보 API (open.law.go.kr 에서 발급) ───────────────
  lawApiKey: 'YOUR_LAW_API_KEY',
  lawApiProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/law-api'
};
