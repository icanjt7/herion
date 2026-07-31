// ─── Herian 설정 ───────────────────────────────────────────────
// Supabase 프로젝트 값을 아래에 입력하세요.
// Dashboard → Settings → API 에서 확인 가능합니다.
// ----------------------------------------------------------------
window.HERION_CONFIG = {
  supabaseUrl:     'https://enpovkaknaxfgzanyghn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucG92a2FrbmF4Zmd6YW55Z2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTk5MDEsImV4cCI6MjA5NjUzNTkwMX0.cY3q4Nf9Ppe80eLeD__tgGeAKIZSK6uReW9amQZbmpo',

  allowedDomain: 'kh.or.kr',
  serviceLocale: 'ko-KR',
  serviceTimeZone: 'Asia/Seoul',
  defaultWeatherLocation: '서울',
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
  imageApiProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/image-api',
  motifModels: [
    { id: 'motif3', label: 'Motif3 300B' }
  ],
  // 응답 생성 한도. 실제 출력량은 연결된 모델/API의 최대 한도 안에서 결정됩니다.
  maxOutputTokens: 16384,
  spellCheckMaxOutputTokens: 8192,

  // Docling 문서 분석·보고서 생성 서비스. 배포 전에는 빈 값으로 두면 브라우저 파서를 사용합니다.
  documentApiUrl: '',

  // ─── Tavily 웹 검색 프록시 ───────────────────────────────────────
  // API 키는 브라우저에 노출하지 않고 Supabase Edge Function에서 관리합니다.
  webSearchProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/web-search-api',

  // ─── Open-Meteo 날씨 프록시 ────────────────────────────────────
  weatherApiProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/weather-api',

  // ─── 국가법령정보 API (open.law.go.kr 에서 발급) ───────────────
  lawApiKey: 'YOUR_LAW_API_KEY',
  lawApiProxyUrl: 'https://enpovkaknaxfgzanyghn.supabase.co/functions/v1/law-api'
};
