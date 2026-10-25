'use strict';
// Proxy tussen de app en de PrijsProfeet-API.
// De API-key blijft op de server (omgevingsvariabele PRIJSPROFEET_KEY) en komt nooit in de browser.
// Netlify Function. Lokaal (netlify dev) zonder login, online alleen voor Robert en gebruikers met het recht "boodschappenwacht" (gebruikersbeheer).
//
// GET /.netlify/functions/boodschappenwacht-offers?ean=8711000675298
//   -> { ean, offers: [...], keyed: true|false, fetched_at }

const { requireAccess } = require('../lib/hub-admin');

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

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  // Online alleen met het recht "boodschappenwacht", zodat niemand de API-limiet kan opmaken. Lokaal met netlify dev geen login nodig.
  if (process.env.NETLIFY_DEV !== 'true') {
    let access;
    try { access = await requireAccess(event, 'boodschappenwacht'); }
    catch (err) { return json(500, { error: err.message }); }
    if (access.denied) return access.denied;
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
