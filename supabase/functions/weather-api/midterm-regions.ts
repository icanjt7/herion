// 기상청 중기예보 가이드 별첨(2025.12)의 중기기온 예보구역 코드.
export type MidtermRegion = {
  name: string;
  temperatureCode: string;
  landCode: string;
};

const temperatureRegions = [
  { name: "백령도", code: "11A00101" },
  { name: "서울", code: "11B10101" },
  { name: "과천", code: "11B10102" },
  { name: "광명", code: "11B10103" },
  { name: "강화", code: "11B20101" },
  { name: "김포", code: "11B20102" },
  { name: "인천", code: "11B20201" },
  { name: "시흥", code: "11B20202" },
  { name: "안산", code: "11B20203" },
  { name: "부천", code: "11B20204" },
  { name: "의정부", code: "11B20301" },
  { name: "고양", code: "11B20302" },
  { name: "양주", code: "11B20304" },
  { name: "파주", code: "11B20305" },
  { name: "동두천", code: "11B20401" },
  { name: "연천", code: "11B20402" },
  { name: "포천", code: "11B20403" },
  { name: "가평", code: "11B20404" },
  { name: "구리", code: "11B20501" },
  { name: "남양주", code: "11B20502" },
  { name: "양평", code: "11B20503" },
  { name: "하남", code: "11B20504" },
  { name: "수원", code: "11B20601" },
  { name: "안양", code: "11B20602" },
  { name: "오산", code: "11B20603" },
  { name: "화성", code: "11B20604" },
  { name: "성남", code: "11B20605" },
  { name: "평택", code: "11B20606" },
  { name: "의왕", code: "11B20609" },
  { name: "군포", code: "11B20610" },
  { name: "안성", code: "11B20611" },
  { name: "용인", code: "11B20612" },
  { name: "이천", code: "11B20701" },
  { name: "광주", code: "11B20702" },
  { name: "여주", code: "11B20703" },
  { name: "충주", code: "11C10101" },
  { name: "진천", code: "11C10102" },
  { name: "음성", code: "11C10103" },
  { name: "제천", code: "11C10201" },
  { name: "단양", code: "11C10202" },
  { name: "청주", code: "11C10301" },
  { name: "보은", code: "11C10302" },
  { name: "괴산", code: "11C10303" },
  { name: "증평", code: "11C10304" },
  { name: "추풍령", code: "11C10401" },
  { name: "영동", code: "11C10402" },
  { name: "옥천", code: "11C10403" },
  { name: "서산", code: "11C20101" },
  { name: "태안", code: "11C20102" },
  { name: "당진", code: "11C20103" },
  { name: "홍성", code: "11C20104" },
  { name: "보령", code: "11C20201" },
  { name: "서천", code: "11C20202" },
  { name: "천안", code: "11C20301" },
  { name: "아산", code: "11C20302" },
  { name: "예산", code: "11C20303" },
  { name: "대전", code: "11C20401" },
  { name: "공주", code: "11C20402" },
  { name: "계룡", code: "11C20403" },
  { name: "세종", code: "11C20404" },
  { name: "부여", code: "11C20501" },
  { name: "청양", code: "11C20502" },
  { name: "금산", code: "11C20601" },
  { name: "논산", code: "11C20602" },
  { name: "철원", code: "11D10101" },
  { name: "화천", code: "11D10102" },
  { name: "인제", code: "11D10201" },
  { name: "양구", code: "11D10202" },
  { name: "춘천", code: "11D10301" },
  { name: "홍천", code: "11D10302" },
  { name: "원주", code: "11D10401" },
  { name: "횡성", code: "11D10402" },
  { name: "영월", code: "11D10501" },
  { name: "정선", code: "11D10502" },
  { name: "평창", code: "11D10503" },
  { name: "대관령", code: "11D20201" },
  { name: "태백", code: "11D20301" },
  { name: "속초", code: "11D20401" },
  { name: "고성", code: "11D20402" },
  { name: "양양", code: "11D20403" },
  { name: "강릉", code: "11D20501" },
  { name: "동해", code: "11D20601" },
  { name: "삼척", code: "11D20602" },
  { name: "울릉도", code: "11E00101" },
  { name: "독도", code: "11E00102" },
  { name: "전주", code: "11F10201" },
  { name: "익산", code: "11F10202" },
  { name: "정읍", code: "11F10203" },
  { name: "완주", code: "11F10204" },
  { name: "장수", code: "11F10301" },
  { name: "무주", code: "11F10302" },
  { name: "진안", code: "11F10303" },
  { name: "남원", code: "11F10401" },
  { name: "임실", code: "11F10402" },
  { name: "순창", code: "11F10403" },
  { name: "완도", code: "11F20301" },
  { name: "해남", code: "11F20302" },
  { name: "강진", code: "11F20303" },
  { name: "장흥", code: "11F20304" },
  { name: "여수", code: "11F20401" },
  { name: "광양", code: "11F20402" },
  { name: "고흥", code: "11F20403" },
  { name: "보성", code: "11F20404" },
  { name: "순천시", code: "11F20405" },
  { name: "광주", code: "11F20501" },
  { name: "장성", code: "11F20502" },
  { name: "나주", code: "11F20503" },
  { name: "담양", code: "11F20504" },
  { name: "화순", code: "11F20505" },
  { name: "구례", code: "11F20601" },
  { name: "곡성", code: "11F20602" },
  { name: "순천", code: "11F20603" },
  { name: "흑산도", code: "11F20701" },
  { name: "성산", code: "11G00101" },
  { name: "제주", code: "11G00201" },
  { name: "성판악", code: "11G00302" },
  { name: "서귀포", code: "11G00401" },
  { name: "고산", code: "11G00501" },
  { name: "이어도", code: "11G00601" },
  { name: "추자도", code: "11G00800" },
  { name: "산천단", code: "11G00901" },
  { name: "한남", code: "11G01001" },
  { name: "울진", code: "11H10101" },
  { name: "영덕", code: "11H10102" },
  { name: "포항", code: "11H10201" },
  { name: "경주", code: "11H10202" },
  { name: "문경", code: "11H10301" },
  { name: "상주", code: "11H10302" },
  { name: "예천", code: "11H10303" },
  { name: "영주", code: "11H10401" },
  { name: "봉화", code: "11H10402" },
  { name: "영양", code: "11H10403" },
  { name: "안동", code: "11H10501" },
  { name: "의성", code: "11H10502" },
  { name: "청송", code: "11H10503" },
  { name: "김천", code: "11H10601" },
  { name: "구미", code: "11H10602" },
  { name: "고령", code: "11H10604" },
  { name: "성주", code: "11H10605" },
  { name: "대구", code: "11H10701" },
  { name: "영천", code: "11H10702" },
  { name: "경산", code: "11H10703" },
  { name: "청도", code: "11H10704" },
  { name: "칠곡", code: "11H10705" },
  { name: "군위", code: "11H10707" },
  { name: "울산", code: "11H20101" },
  { name: "양산", code: "11H20102" },
  { name: "부산", code: "11H20201" },
  { name: "창원", code: "11H20301" },
  { name: "김해", code: "11H20304" },
  { name: "통영", code: "11H20401" },
  { name: "사천", code: "11H20402" },
  { name: "거제", code: "11H20403" },
  { name: "고성", code: "11H20404" },
  { name: "남해", code: "11H20405" },
  { name: "함양", code: "11H20501" },
  { name: "거창", code: "11H20502" },
  { name: "합천", code: "11H20503" },
  { name: "밀양", code: "11H20601" },
  { name: "의령", code: "11H20602" },
  { name: "함안", code: "11H20603" },
  { name: "창녕", code: "11H20604" },
  { name: "진주", code: "11H20701" },
  { name: "산청", code: "11H20703" },
  { name: "하동", code: "11H20704" },
  { name: "군산", code: "21F10501" },
  { name: "김제", code: "21F10502" },
  { name: "고창", code: "21F10601" },
  { name: "부안", code: "21F10602" },
  { name: "함평", code: "21F20101" },
  { name: "영광", code: "21F20102" },
  { name: "진도", code: "21F20201" },
  { name: "목포", code: "21F20801" },
  { name: "영암", code: "21F20802" },
  { name: "신안", code: "21F20803" },
  { name: "무안", code: "21F20804" },
] as const;

const provinceDefaults = [
  { pattern: /서울/, name: "서울", code: "11B10101" },
  { pattern: /인천/, name: "인천", code: "11B20201" },
  { pattern: /경기/, name: "수원", code: "11B20601" },
  { pattern: /강원/, name: "춘천", code: "11D10301" },
  { pattern: /충북|충청북/, name: "청주", code: "11C10301" },
  { pattern: /충남|충청남|대전|세종/, name: "대전", code: "11C20401" },
  { pattern: /전북|전라북/, name: "전주", code: "11F10201" },
  { pattern: /전남|전라남|광주/, name: "광주", code: "11F20501" },
  { pattern: /경북|경상북|대구/, name: "대구", code: "11H10701" },
  { pattern: /경남|경상남|부산|울산/, name: "부산", code: "11H20201" },
  { pattern: /제주/, name: "제주", code: "11G00201" },
] as const;

function landCodeFor(temperatureCode: string) {
  if (/^11A|^11B/.test(temperatureCode)) return "11B00000";
  if (/^11C1/.test(temperatureCode)) return "11C10000";
  if (/^11C2/.test(temperatureCode)) return "11C20000";
  if (/^11D1/.test(temperatureCode)) return "11D10000";
  if (/^11D2/.test(temperatureCode)) return "11D20000";
  if (/^11E|^11H1/.test(temperatureCode)) return "11H10000";
  if (/^11H2/.test(temperatureCode)) return "11H20000";
  if (/^(?:11|21)F1/.test(temperatureCode)) return "11F10000";
  if (/^(?:11|21)F2/.test(temperatureCode)) return "11F20000";
  if (/^11G/.test(temperatureCode)) return "11G00000";
  return "";
}

function provincePrefix(context: string) {
  if (/서울|인천|경기/.test(context)) return /^11B/;
  if (/충북|충청북/.test(context)) return /^11C1/;
  if (/충남|충청남|대전|세종/.test(context)) return /^11C2/;
  if (/강원/.test(context)) return /^11D/;
  if (/전북|전라북/.test(context)) return /^(?:11|21)F1/;
  if (/전남|전라남|광주/.test(context)) return /^(?:11|21)F2/;
  if (/경북|경상북|대구/.test(context)) return /^11H1/;
  if (/경남|경상남|부산|울산/.test(context)) return /^11H2/;
  if (/제주/.test(context)) return /^11G/;
  return null;
}

export function resolveMidtermRegion(
  ...values: unknown[]
): MidtermRegion | null {
  const context = values.map((value) => String(value || "")).join(" ").replace(
    /\s+/g,
    "",
  );
  const matching = temperatureRegions
    .filter((region) => context.includes(region.name.replace(/[()]/g, "")))
    .sort((left, right) => right.name.length - left.name.length);
  const preferredPrefix = provincePrefix(context);
  const exact =
    (preferredPrefix
      ? matching.find((region) => preferredPrefix.test(region.code))
      : null) ||
    matching[0];
  const fallback = provinceDefaults.find((region) =>
    region.pattern.test(context)
  );
  const selected = exact || fallback;
  if (!selected) return null;
  const landCode = landCodeFor(selected.code);
  return landCode
    ? { name: selected.name, temperatureCode: selected.code, landCode }
    : null;
}
