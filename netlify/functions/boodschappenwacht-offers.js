'use strict';
// Proxy tussen de app en de PrijsProfeet-API.
// De API-key blijft op de server (omgevingsvariabele PRIJSPROFEET_KEY) en komt nooit in de browser.
// Netlify Function. Lokaal (netlify dev) zonder login, online alleen met geldig hub-token van Robert.
//
// GET /.netlify/functions/boodschappenwacht-offers?ean=8711000675298
//   -> { ean, offers: [...], keyed: true|false, fetched_at }

const BASE = 'https://www.prijsprofeet.nl/api/v1';
const USER_AGENT = 'Boodschappenwacht/0.1 (testversie)'; // geen "bot", "crawler" of "spider" erin
const TTL_MS = 15 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map();

const KEEP = [
  'product_id', 'retailer', 'name', 'brand', 'ean', 'quantity', 'unit', 'unit_price',
  'price', 'original_price', 'savings_percentage', 'savings_amount',
  'promotion_type', 'promotion_status', 'promotional_keywords',
  'multi_buy_quantity', 'multi_buy_price', 'valid_from', 'valid_until', 'valid_until_estimated',
  'loyalty_price', 'loyalty_program', 'in_store_only', 'online_only', 'product_url', 'image_url',
];

function slim(p) {
  const o = {};
  for (const k of KEEP) o[k] = p[k] === undefined ? null : p[k];
  return o;
}

const pad13 = (e) => String(e).padStart(13, '0');

const HUB_URL = 'https://swrunlzeydmcskceqdju.supabase.co';
const HUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'; // publieke anon-key, zelfde als in mail-list.js
const ADMIN_EMAIL = 'robert@circe-advies.nl';

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

async function emailFromToken(token) {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, { headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json()).email || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  // Online alleen voor Robert, zodat niemand de API-limiet kan opmaken. Lokaal met netlify dev geen login nodig.
  if (process.env.NETLIFY_DEV !== 'true') {
    const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Niet ingelogd' });
    if ((await emailFromToken(token)) !== ADMIN_EMAIL) return json(403, { error: 'Geen toegang' });
  }

  const ean = String((event.queryStringParameters && event.queryStringParameters.ean) || '').trim();
  if (!/^\d{8,14}$/.test(ean)) return json(400, { error: 'Ongeldige barcode' });

  const CC = { 'Cache-Control': 'private, max-age=900' };
  const hit = cache.get(ean);
  if (hit && Date.now() - hit.ts < TTL_MS) return json(200, hit.body, { ...CC, 'X-Cache': 'HIT' });

  const key = process.env.PRIJSPROFEET_KEY || '';
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (key) headers['X-API-Key'] = key;

  let r;
  try {
    r = await fetch(`${BASE}/search?q=${encodeURIComponent(ean)}&page_size=50`, { headers, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    return json(502, { error: 'PrijsProfeet is niet bereikbaar' });
  }

  if (r.status === 429) return json(429, { error: 'Te veel verzoeken bij PrijsProfeet, probeer het zo opnieuw' });
  if (r.status === 401 || r.status === 403) return json(502, { error: `PrijsProfeet weigert het verzoek (status ${r.status}). Controleer de API-key` });
  if (!r.ok) return json(502, { error: `PrijsProfeet gaf status ${r.status}` });

  let data;
  try { data = await r.json(); } catch (err) { return json(502, { error: 'Onverwacht antwoord van PrijsProfeet' }); }

  // De zoekfunctie is fuzzy. Alleen rijen met exact deze EAN horen bij het gescande product.
  const wanted = pad13(ean);
  const rows = data.results || data.products || [];
  const offers = rows
    .filter((p) => p && p.ean && pad13(p.ean) === wanted)
    .filter((p) => p.promotion_status === 'active' || p.promotion_status === 'upcoming')
    .map(slim);

  const body = { ean, offers, keyed: Boolean(key), fetched_at: new Date().toISOString() };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(ean, { ts: Date.now(), body });
  return json(200, body, CC);
};
