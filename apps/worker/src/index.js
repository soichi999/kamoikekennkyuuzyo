function jstNow() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst;
}

function toJSTString(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}+09:00`;
}

function toJSTDateString(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseJST(s) {
  if (!s) return jstNow();
  const d = new Date(s);
  if (isNaN(d.getTime())) return jstNow();
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

function getJSTHour(jstDate) {
  return jstDate.getUTCHours();
}

function randomString(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function randomDigits(len) {
  let r = '';
  for (let i = 0; i < len; i++) r += Math.floor(Math.random() * 10);
  return r;
}

function hashScore(lat, lng) {
  const ilat = Math.round(lat * 10000);
  const ilng = Math.round(lng * 10000);
  let h = (ilat * 31 + ilng * 37) ^ (ilng << 5);
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0;
  h = ((h ^ (h >>> 13)) * 0x27eb69d) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % 81;
}

function timeBonus(atStr) {
  const jst = parseJST(atStr);
  const h = getJSTHour(jst);
  if (h >= 6 && h <= 14) return 0;
  if (h >= 15 && h <= 16) return 6;
  if (h >= 17 && h <= 18) return 18;
  return 28;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function calculateScore(lat, lng, atStr) {
  const base = hashScore(lat, lng);
  const bonus = timeBonus(atStr);
  return clamp(Math.round(base + bonus), 0, 100);
}

function levelFromScore(s) {
  if (s <= 33) return 'safe';
  if (s <= 66) return 'caution';
  return 'danger';
}

function buildFactors(lat, lng, atStr) {
  const h = hashScore(lat, lng);
  const refugeCount = h % 3;
  const crimeCount = (h >> 2) % 3;
  const trafficCount = (h >> 4) % 3;
  const lightingScore = (h >> 6) % 3;
  const jst = parseJST(atStr);
  const hour = getJSTHour(jst);
  const factors = [];
  factors.push({
    key: 'refuge',
    label: '駆け込み先',
    impact: 10 + refugeCount * 5,
    detail: refugeCount === 0 ? '半径300m内に0件' : `半径300m内に${refugeCount}件`,
  });
  if (crimeCount > 0) {
    factors.push({
      key: 'crime',
      label: '犯罪発生',
      impact: 5 + crimeCount * 4,
      detail: `周辺で直近期${crimeCount}件の犯罪発生`,
    });
  }
  if (trafficCount > 0) {
    factors.push({
      key: 'traffic',
      label: '交通事故',
      impact: 3 + trafficCount * 3,
      detail: `周辺で直近期${trafficCount}件の事故`,
    });
  }
  if (hour >= 17 || hour < 6) {
    factors.push({
      key: 'lighting',
      label: '街灯',
      impact: 8 + lightingScore * 4,
      detail: lightingScore === 0 ? '街灯が少ない区間' : '街灯設置済み区間',
    });
  }
  return factors;
}

function nearestRefuges(lat, lng) {
  const types = ['kodomo110', 'koban', 'school', 'public'];
  const names = ['山田商店', '桜丘交番', '桜丘小学校', '区立図書館'];
  const h = hashScore(lat, lng);
  const count = 2 + (h % 2);
  const refuges = [];
  for (let i = 0; i < count; i++) {
    const idx = (h + i * 7) % types.length;
    const dist = 100 + ((h >> (i * 3)) % 4) * 80;
    refuges.push({ type: types[idx], name: names[idx], distance_m: dist });
  }
  return refuges;
}

const DUMMY_FAMILY_ID = 'fam_8f2a1c94';
const DUMMY_CHILDREN = [
  {
    child_id: 'chd_3b7e05d1',
    name: 'はると',
    grade: '小学4年',
    home: { lat: 35.6421, lng: 139.6532 },
    school: { lat: 35.6478, lng: 139.6601 },
    paired_at: '2026-08-14T19:20:00+09:00',
  },
  {
    child_id: 'chd_9a2c18f4',
    name: 'みさき',
    grade: '小学2年',
    home: { lat: 35.6430, lng: 139.6510 },
    school: { lat: 35.6478, lng: 139.6601 },
    paired_at: '2026-08-14T19:25:00+09:00',
  },
];

function generateDailyTrack() {
  const baseLat = 35.6478, baseLng = 139.6601;
  const endLat = 35.6421, endLng = 139.6532;
  const points = 8;
  const track = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const lat = +(baseLat + (endLat - baseLat) * t).toFixed(4);
    const lng = +(baseLng + (endLng - baseLng) * t).toFixed(4);
    const totalMin = 15 * 60 + i * 6;
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    track.push({ lat, lng, at: `2026-08-20T${hh}:${mm}:00+09:00` });
  }
  return track;
}

function generateDailyHotspots() {
  return [
    {
      hotspot_id: 'hs_01',
      lat: 35.6455, lng: 139.6566,
      score: 81, level: 'danger',
      at: '2026-08-20T15:45:00+09:00',
      title: '桜丘二丁目 高架下',
      reason: '駆け込み先ゼロ・見通し不良',
      factors: [
        { key: 'refuge', label: '駆け込み先', impact: 20, detail: '半径300m内に0件' },
        { key: 'lighting', label: '街灯', impact: 12, detail: '街灯が少ない区間' },
      ],
      stay_minutes: 6,
    },
    {
      hotspot_id: 'hs_02',
      lat: 35.6440, lng: 139.6548,
      score: 72, level: 'danger',
      at: '2026-08-20T15:55:00+09:00',
      title: '桜丘一丁目 裏道',
      reason: '交通量が多く歩道が狭い',
      factors: [
        { key: 'traffic', label: '交通事故', impact: 15, detail: '周辺で直近期2件の事故' },
        { key: 'refuge', label: '駆け込み先', impact: 8, detail: '半径300m内に1件' },
      ],
      stay_minutes: 4,
    },
    {
      hotspot_id: 'hs_03',
      lat: 35.6430, lng: 139.6538,
      score: 52, level: 'caution',
      at: '2026-08-20T16:05:00+09:00',
      title: '桜丘公園 横断歩道',
      reason: '信号なし横断歩道・夕方の通過',
      factors: [
        { key: 'traffic', label: '交通事故', impact: 10, detail: '周辺で直近期1件の事故' },
      ],
      stay_minutes: 3,
    },
  ];
}

function getQueryParam(url, key) {
  const val = url.searchParams.get(key);
  if (!val) return val;
  return val.replace(/ /g, '+');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code, message, status) {
  return corsResponse({ error: { code, message } }, status);
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (path === '/' || path === '/v1') {
    return corsResponse({
      app: 'カケコミ API',
      version: '1.0.0',
      phase: '1 (mock)',
      endpoints: [
        'POST /v1/pairing/create',
        'POST /v1/pairing/redeem',
        'GET /v1/family/{family_id}/children',
        'POST /v1/locations',
        'GET /v1/grid?bbox=&zoom=&at=',
        'GET /v1/score?lat=&lng=&at=',
        'GET /v1/children/{child_id}/daily?date=',
        'GET /v1/children/{child_id}/weekly?end=',
      ],
    });
  }

  if (method === 'POST' && path === '/v1/pairing/create') {
    const now = jstNow();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const code = randomDigits(6);
    const familyId = 'fam_' + randomString(8);
    return corsResponse({
      code,
      family_id: familyId,
      expires_at: toJSTString(expiresAt),
      qr_payload: `kakekomi://pair?code=${code}`,
    });
  }

  if (method === 'POST' && path === '/v1/pairing/redeem') {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    const code = body.code;
    if (!code || code === '') {
      return errorResponse('MISSING_CODE', 'codeは必須です', 400);
    }
    if (code === '000000') {
      return errorResponse('CODE_NOT_FOUND', '指定されたコードが見つかりません', 404);
    }
    const now = jstNow();
    const childId = 'chd_' + randomString(8);
    return corsResponse({
      family_id: DUMMY_FAMILY_ID,
      child_id: childId,
      name: body.child_name || '名無し',
      paired_at: toJSTString(now),
    });
  }

  const familyMatch = path.match(/^\/v1\/family\/([^/]+)\/children$/);
  if (method === 'GET' && familyMatch) {
    return corsResponse({ children: DUMMY_CHILDREN });
  }

  if (method === 'POST' && path === '/v1/locations') {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    if (!body.child_id || body.child_id === '') {
      return errorResponse('MISSING_CHILD_ID', 'child_idは必須です', 400);
    }
    if (!body.points || !Array.isArray(body.points)) {
      return errorResponse('MISSING_POINTS', 'pointsは必須です（配列）', 400);
    }
    if (body.points.length > 500) {
      return errorResponse('TOO_MANY_POINTS', 'pointsは最大500件までです', 400);
    }
    const results = body.points.map(p => {
      const score = calculateScore(p.lat, p.lng, p.at);
      return {
        lat: p.lat,
        lng: p.lng,
        at: p.at || toJSTString(jstNow()),
        score,
        level: levelFromScore(score),
        factors: buildFactors(p.lat, p.lng, p.at),
      };
    });
    let current = null;
    if (results.length > 0) {
      let maxScore = -1;
      for (const r of results) {
        if (r.score > maxScore) { maxScore = r.score; current = r; }
      }
    }
    return corsResponse({
      accepted: results.length,
      results,
      current: current ? { score: current.score, level: current.level } : null,
    });
  }

  if (method === 'GET' && path === '/v1/score') {
    const latStr = getQueryParam(url, 'lat');
    const lngStr = getQueryParam(url, 'lng');
    if (!latStr || !lngStr) {
      return errorResponse('MISSING_LATLNG', 'lat と lng は必須です', 400);
    }
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const atStr = getQueryParam(url, 'at') || toJSTString(jstNow());
    const score = calculateScore(lat, lng, atStr);
    const level = levelFromScore(score);
    return corsResponse({
      lat, lng, at: atStr, score, level,
      factors: buildFactors(lat, lng, atStr),
      title: 'この地点',
      reason: '周辺の平均的な水準です',
      nearest_refuge: nearestRefuges(lat, lng),
    });
  }

  if (method === 'GET' && path === '/v1/grid') {
    const bboxStr = getQueryParam(url, 'bbox');
    if (!bboxStr) {
      return errorResponse('MISSING_BBOX', 'bboxパラメータは必須です', 400);
    }
    const parts = bboxStr.split(',').map(parseFloat);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return errorResponse('INVALID_BBOX', 'bboxは minLng,minLat,maxLng,maxLat の4つの数値が必要です', 400);
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (minLat >= maxLat || minLng >= maxLng) {
      return errorResponse('INVALID_BBOX', 'bboxの値が不正です（min < max にしてください）', 400);
    }
    const atStr = getQueryParam(url, 'at') || toJSTString(jstNow());
    const cellSize = 0.0009;
    let cells = [];
    const maxCells = 2000;
    for (let lat = minLat; lat < maxLat && cells.length < maxCells; lat += cellSize) {
      for (let lng = minLng; lng < maxLng && cells.length < maxCells; lng += cellSize) {
        const score = calculateScore(lat, lng, atStr);
        cells.push({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), score, level: levelFromScore(score) });
      }
    }
    return corsResponse({
      cell_size_m: 100,
      at: atStr,
      count: cells.length,
      cells,
    });
  }

  const dailyMatch = path.match(/^\/v1\/children\/([^/]+)\/daily$/);
  if (method === 'GET' && dailyMatch) {
    const childId = dailyMatch[1];
    const dateStr = getQueryParam(url, 'date') || '2026-08-20';
    const today = '2026-08-20';
    if (dateStr > today) {
      return corsResponse({
        status: 'pending',
        message: 'この日の集計はまだ実行されていません',
      });
    }
    const score = calculateScore(35.6455, 139.6566, `${dateStr}T15:45:00+09:00`);
    return corsResponse({
      child_id: childId,
      date: dateStr,
      status: 'ready',
      total_score: 64,
      level: 'caution',
      baseline_score: 39,
      diff_from_baseline: 25,
      track: generateDailyTrack(),
      hotspots: generateDailyHotspots(),
      summary: {
        for_parent: '高架下の区間で駆け込み先が少なく、17時台は薄暗くなります。帰り道を一緒に確認し、明るい大通り側を通るよう伝えてあげてください。',
        for_child: 'かえりみちの　たかいかどうしたに　あぶないところが　あるよ。くらくなるまえに　とおろうね。',
        talking_points: ['高架下は明るい時間帯に通る', '何かあったらコンビニに駆け込む', '帰宅時刻を決めておく'],
        generated_at: `${dateStr}T22:00:12+09:00`,
        model: 'mock',
      },
      stats: {
        distance_m: 1840,
        duration_min: 42,
        point_count: 8,
        departed_at: `${dateStr}T15:30:00+09:00`,
        arrived_at: `${dateStr}T16:12:00+09:00`,
      },
    });
  }

  const weeklyMatch = path.match(/^\/v1\/children\/([^/]+)\/weekly$/);
  if (method === 'GET' && weeklyMatch) {
    const childId = weeklyMatch[1];
    const endStr = getQueryParam(url, 'end') || '2026-08-20';
    const endParts = endStr.split('-').map(Number);
    const baseScores = [38, 42, 55, 61, 33, 47, 39];
    const hs = [false, false, true, true, false, false, false];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(endParts[0], endParts[1] - 1, endParts[2] - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${day}`;
      const idx = 6 - i;
      const s = baseScores[idx];
      days.push({ date: ds, total_score: s, level: levelFromScore(s), has_hotspot: hs[idx] });
    }
    return corsResponse({
      child_id: childId,
      end: endStr,
      days,
      average: 42,
      baseline_score: 39,
    });
  }

  return errorResponse('NOT_FOUND', `パス ${path} は存在しません`, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  },
};