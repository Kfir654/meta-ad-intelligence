import { NextFunction, Request, Response } from 'express';
import { ApifyApiError, ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import Ad, { AdPlatform } from '../models/Ad';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const APIFY_ACTOR_ID = 'apify/facebook-ads-scraper';
const CONTENT_UNAVAILABLE = 'Content currently unavailable';
const ACTOR_MEMORY_MBYTES = Math.min(Math.max(Number(process.env.APIFY_MEMORY_MBYTES) || 2048, 1024), 8192);
const FAST_FETCH_WAIT_SECS = Math.min(Math.max(Number(process.env.APIFY_FAST_WAIT_SECS) || 15, 10), 30);
const FAST_FETCH_TIMEOUT_SECS = Math.min(
  Math.max(Number(process.env.APIFY_FAST_TIMEOUT_SECS) || 120, 20),
  120
);
const APIFY_HTTP_TIMEOUT_MS = Math.min(Math.max(Number(process.env.APIFY_HTTP_TIMEOUT_MS) || 120000, 30000), 180000);

interface MetaAdCard {
  body?: string;
  resizedImageUrl?: string;
  originalImageUrl?: string;
  [key: string]: unknown;
}
interface MetaAdSnapshot {
  pageName?: string;
  caption?: string;
  pageVerification?: string;
  body?: { text?: string };
  cards?: MetaAdCard[];
  [key: string]: unknown;
}
export interface MetaAd {
  pageName?: string;
  publisherPlatform?: string[];
  snapshot?: MetaAdSnapshot;
  ad_creative_body?: string;
  ad_creative_bodies?: string[] | Array<{ text?: string; body?: string }>;
  ad_text?: string;
  ad_snapshot_url?: string;
  [key: string]: unknown;
}

interface FetchAdsBody {
  brandName?: string;
  query?: string;
}
interface BrandBody {
  brandName?: string;
}
interface AskBody extends BrandBody {
  userQuestion?: string;
}
interface ClusterBody extends BrandBody {
  ads?: Array<{
    _id?: string;
    text?: string;
    platform?: string;
    platforms?: string[];
    imageUrl?: string | null;
  }>;
}

type ControllerRequest = Request<unknown, unknown, FetchAdsBody>;
type AskRequest = Request<unknown, unknown, AskBody>;
type CompetitorsRequest = Request<unknown, unknown, BrandBody>;
type ClusterRequest = Request<unknown, unknown, ClusterBody>;

interface AdInsertDoc {
  brandName: string;
  text: string;
  imageUrl: string | null;
  platform: AdPlatform;
  platforms: AdPlatform[];
  pageVerification: string | null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getGroqEnv(): { apiKey: string; baseURL: string } | null {
  const apiKey = process.env.GROQ_API_KEY;
  const baseURL = process.env.GROQ_BASE_URL;
  if (!apiKey?.trim() || !baseURL?.trim()) return null;
  return { apiKey, baseURL };
}

function respondGroqNotConfigured(res: Response): boolean {
  if (!getGroqEnv()) {
    res.status(503).json({
      success: false,
      message: 'Groq AI service is not configured (GROQ_API_KEY / GROQ_BASE_URL).',
    });
    return true;
  }
  return false;
}

async function callGroqChat(p: {
  system: string;
  user: string;
  temperature: number;
  jsonObject?: boolean;
}): Promise<string> {
  const groqEnv = getGroqEnv();
  if (!groqEnv) {
    throw new Error('Groq AI is not configured (set GROQ_API_KEY and GROQ_BASE_URL).');
  }
  const client = new OpenAI({ apiKey: groqEnv.apiKey, baseURL: groqEnv.baseURL });
  const messages = [
    { role: 'system' as const, content: p.system },
    { role: 'user' as const, content: p.user },
  ];
  const run = (json: boolean) =>
    client.chat.completions.create({
      model: GROQ_MODEL,
      temperature: p.temperature,
      messages,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    });
  const extract = (completion: Awaited<ReturnType<typeof run>>) => {
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Groq returned an empty message.');
    return content;
  };
  if (!p.jsonObject) return extract(await run(false));
  try {
    return extract(await run(true));
  } catch {
    return extract(await run(false));
  }
}

type CompetitorItem = { name: string; reason: string };
type ConceptItem = { title: string; reason: string; adIds: string[] };

function parseModelJsonList<T>(p: {
  raw: string;
  keys: string[];
  mapItem: (row: unknown) => T | null;
  limit: number;
}): T[] {
  const text = (p.raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || p.raw).trim();
  const parse = (candidate: string): T[] | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed.map(p.mapItem).filter(Boolean) as T[];
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const listKey = p.keys.find((k) => Array.isArray(obj[k]));
        if (listKey) return (obj[listKey] as unknown[]).map(p.mapItem).filter(Boolean) as T[];
      }
    } catch {
      return null;
    }
    return null;
  };

  const direct = parse(text);
  if (direct?.length) return direct.slice(0, p.limit);
  const listMatch = text.match(/\[[\s\S]*\]/);
  if (!listMatch) return [];
  const fallback = parse(listMatch[0]);
  return fallback?.slice(0, p.limit) || [];
}

function parseCompetitorItem(row: unknown): CompetitorItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  if (!name || !reason) return null;
  return { name, reason };
}

function parseConceptItem(row: unknown): ConceptItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  const adIdsRaw =
    Array.isArray(r.adIds) ? r.adIds : Array.isArray(r.ad_ids) ? r.ad_ids : Array.isArray(r.ids) ? r.ids : [];
  const adIds = adIdsRaw.map((id) => String(id || '').trim()).filter(Boolean);
  if (!title || !reason || !adIds.length) return null;
  return { title, reason, adIds: [...new Set(adIds)] as string[] };
}

async function callGroqOrRespond(
  res: Response,
  params: { system: string; user: string; temperature: number; jsonObject?: boolean },
  fallbackMessage: string
): Promise<string | null> {
  if (respondGroqNotConfigured(res)) return null;
  try {
    return await callGroqChat(params);
  } catch (error: unknown) {
    const providerError = error as { status?: number; message?: string };
    if (providerError?.status && providerError.status >= 400 && providerError.status < 600) {
      res.status(502).json({
        success: false,
        message: providerError.message || 'The AI provider request failed. Please try again.',
      });
      return null;
    }
    res.status(502).json({
      success: false,
      message: error instanceof Error ? error.message : fallbackMessage,
    });
    return null;
  }
}

const PLATFORM_MAP: Record<string, AdPlatform> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  MESSENGER: 'messenger',
  WHATSAPP: 'other',
  THREADS: 'instagram',
  AUDIENCE_NETWORK: 'other',
};

function buildMetaAdLibraryUrl(
  searchQuery: string,
  location: 'ALL' | string,
  publisherPlatforms: string[]
) {
  const q = encodeURIComponent(searchQuery.trim());
  const country = location === 'ALL' ? 'ALL' : encodeURIComponent(location);
  const pl = publisherPlatforms.map((p, i) => `&publisher_platforms[${i}]=${encodeURIComponent(p)}`).join('');
  return (
    'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=' +
    country +
    '&is_targeted_country=false&media_type=all&search_type=keyword_unordered&q=' +
    q +
    pl
  );
}

function mapPublisherPlatforms(publisherPlatform?: string[]): AdPlatform[] {
  if (!Array.isArray(publisherPlatform) || !publisherPlatform.length) return ['other'];
  return [...new Set(publisherPlatform.map((v) => PLATFORM_MAP[String(v).toUpperCase()] || 'other'))];
}
function isUnexpandedTemplate(v: string) {
  return !v.trim() || /\{\{[\s\S]*\}\}/.test(v.trim());
}
function extractBodies(raw: MetaAd['ad_creative_bodies']): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((e) =>
      typeof e === 'string' ? e.trim() : e && typeof e === 'object' ? String((e as { text?: string }).text || (e as { body?: string }).body || '').trim() : ''
    )
    .filter((s) => s && !isUnexpandedTemplate(s));
}
function firstHttpUrl(...urls: Array<string | undefined | null>) {
  for (const u of urls) {
    if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
  }
  return null;
}
function extractAdText(ad: MetaAd): string | null {
  const b1 = ad.snapshot?.body?.text?.trim();
  if (b1 && !isUnexpandedTemplate(b1)) return b1;
  const b2 = ad.snapshot?.cards?.[0]?.body?.trim();
  if (b2 && !isUnexpandedTemplate(b2)) return b2;
  const all = [ad.ad_creative_body, ad.ad_text, ad.snapshot?.caption, ...extractBodies(ad.ad_creative_bodies)]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v && !isUnexpandedTemplate(v));
  if (!all.length) return null;
  return [...new Set(all)].sort((a, b) => b.length - a.length)[0];
}
function extractImageUrl(ad: MetaAd) {
  const c = ad.snapshot?.cards?.[0];
  return firstHttpUrl(c?.resizedImageUrl, c?.originalImageUrl) || firstHttpUrl(ad.ad_snapshot_url);
}
function mapMetaAdToDoc(searchBrand: string, ad: MetaAd): AdInsertDoc {
  const platforms = mapPublisherPlatforms(ad.publisherPlatform);
  const platform = platforms[0] || 'other';
  const brandName = ad.snapshot?.pageName?.trim() || ad.pageName?.trim() || searchBrand.trim() || 'Unknown brand';
  return {
    brandName,
    text: extractAdText(ad) || CONTENT_UNAVAILABLE,
    imageUrl: extractImageUrl(ad),
    platform,
    platforms,
    pageVerification: typeof ad.snapshot?.pageVerification === 'string' ? ad.snapshot.pageVerification : null,
  };
}
function getAdvertiserPageName(ad: MetaAd) {
  return String(ad.snapshot?.pageName || ad.pageName || '').trim();
}
function filterAdsByAdvertiserPageName(raw: MetaAd[], searchQuery: string) {
  const q = normalizeText(searchQuery);
  if (!q) return [];
  return raw.filter((ad) => normalizeText(getAdvertiserPageName(ad)) === q);
}
function dedupeDocsByAdText(docs: AdInsertDoc[]) {
  const s = new Set<string>();
  return docs.filter((d) => {
    const k = normalizeText(d.text || CONTENT_UNAVAILABLE);
    if (s.has(k)) return false;
    s.add(k);
    return true;
  });
}
function isRunIncomplete(run: { status?: string }) {
  return run.status === 'RUNNING' || run.status === 'READY';
}
async function callActorWithHttpTimeout(client: ApifyClient, input: Record<string, unknown>) {
  const actorCall = client.actor(APIFY_ACTOR_ID).call(input, {
    waitSecs: FAST_FETCH_WAIT_SECS,
    timeout: FAST_FETCH_TIMEOUT_SECS,
    memory: ACTOR_MEMORY_MBYTES,
    log: null,
  });
  const guard = new Promise<never>((_, r) => {
    const t = setTimeout(() => {
      const e = new Error('APIFY_HTTP_TIMEOUT') as Error & { code?: string };
      e.code = 'APIFY_HTTP_TIMEOUT';
      r(e);
    }, APIFY_HTTP_TIMEOUT_MS);
    actorCall.finally(() => clearTimeout(t)).catch(() => clearTimeout(t));
  });
  return Promise.race([actorCall, guard]);
}
async function ensureRunFinished(
  client: ApifyClient,
  run: { id?: string; status?: string; statusMessage?: string; defaultDatasetId?: string }
) {
  if (!isRunIncomplete(run) || !run.id) return run;
  return client.run(run.id).waitForFinish({ waitSecs: 60 });
}

async function getRecentBrandAdTexts(brandName: string, limit: number): Promise<string[] | null> {
  try {
    const recentAds = await Ad.find({
      brandName: { $regex: brandName, $options: 'i' },
      text: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return recentAds
      .filter((ad) => normalizeText(String(ad.brandName || '')).includes(normalizeText(brandName)))
      .map((ad) => (typeof ad.text === 'string' ? ad.text.trim() : ''))
      .filter((text) => text && text !== CONTENT_UNAVAILABLE && text !== '(No ad text)');
  } catch {
    return null;
  }
}

export const fetchAds = async (req: ControllerRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brand = (req.body.brandName ?? req.body.query ?? '').trim();
    if (!brand) {
      res.status(400).json({ success: false, message: 'Please enter a brand name to search.' });
      return;
    }

    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cacheCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    let cachedAds;
    try {
      cachedAds = await Ad.find({
        brandName: { $regex: `^${escapedBrand}$`, $options: 'i' },
        createdAt: { $gte: cacheCutoff },
      })
        .sort({ createdAt: -1 })
        .lean();
    } catch {
      res.status(502).json({ success: false, message: 'Could not load cached ads. Please try again.' });
      return;
    }
    if (cachedAds.length > 0) {
      res.status(200).json({
        success: true,
        count: cachedAds.length,
        data: cachedAds,
        message: 'Loaded from cache (last 2 hours)',
      });
      return;
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken?.trim()) {
      res.status(503).json({
        success: false,
        message: 'Apify is not configured. Add APIFY_API_TOKEN to your server .env file.',
      });
      return;
    }
    const client = new ApifyClient({ token: apifyToken });
    const scrapeLimit = 50;
    const publisherPlatforms = ['facebook', 'instagram', 'messenger', 'audience_network'];
    const keywordUrl = buildMetaAdLibraryUrl(brand, 'ALL', publisherPlatforms);
    const input = {
      startUrls: [{ url: keywordUrl }],
      resultsLimit: scrapeLimit,
      activeStatus: 'active',
      isDetailsPerAd: false,
      renderSeconds: 8,
      onlyTotal: false,
      proxyConfiguration: { useApifyProxy: true },
    };
    let run: { id?: string; status?: string; statusMessage?: string; defaultDatasetId?: string };
    try {
      run = await callActorWithHttpTimeout(client, input);
      run = await ensureRunFinished(client, run);
    } catch (error: unknown) {
      if (error instanceof ApifyApiError) {
        const st = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
        res.status(st).json({ success: false, message: error.message || 'Apify request failed.' });
        return;
      }
      const requestError = error as { code?: string; name?: string };
      if (
        requestError.code === 'ECONNABORTED' ||
        requestError.name === 'AxiosError' ||
        requestError.code === 'APIFY_HTTP_TIMEOUT'
      ) {
        res.status(504).json({ success: false, message: 'Meta is taking longer than usual. Please try again.' });
        return;
      }
      throw error;
    }
    if (isRunIncomplete(run)) {
      res.status(504).json({ success: false, message: 'Meta is taking longer than usual. Please try again.' });
      return;
    }
    if (run.status === 'TIMED-OUT') {
      res.status(504).json({ success: false, message: 'Meta took too long to respond. Please try again.' });
      return;
    }
    if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status !== 'SUCCEEDED') {
      res.status(502).json({ success: false, message: run.statusMessage || `Apify run ended with ${run.status}.` });
      return;
    }
    if (!run.defaultDatasetId) {
      res.status(502).json({ success: false, message: 'Apify completed, but no ads were returned.' });
      return;
    }
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: scrapeLimit });
    const raw = (items || []) as MetaAd[];
    const results = filterAdsByAdvertiserPageName(raw, brand);
    const emptyMsg = 'No official ads found for this exact brand name. Try a different variation.';
    if (!results.length) {
      res.status(404).json({ success: false, count: 0, data: [], message: emptyMsg });
      return;
    }
    const docs = dedupeDocsByAdText(
      results
        .map((it) => mapMetaAdToDoc(brand, it))
        .filter((d) => d.brandName?.trim())
        .sort((a, b) => {
          const ae = normalizeText(a.brandName) === normalizeText(brand) ? 1 : 0;
          const be = normalizeText(b.brandName) === normalizeText(brand) ? 1 : 0;
          return be - ae;
        })
    );
    if (!docs.length) {
      res.status(404).json({ success: false, count: 0, data: [], message: emptyMsg });
      return;
    }
    let inserted;
    try {
      inserted = await Ad.insertMany(docs);
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : 'Unknown database error';
      res.status(502).json({ success: false, message: `We couldn't save the ads right now. ${msg}` });
      return;
    }
    const lean = inserted.map((d) => d.toObject());
    res.status(200).json({ success: true, count: lean.length, data: lean });
  } catch (e) {
    next(e);
  }
};

export const askAds = async (req: AskRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brandName = (req.body.brandName ?? '').trim();
    const userQuestion = (req.body.userQuestion ?? '').trim();
    if (!brandName) {
      res.status(400).json({ success: false, message: 'Please choose a brand before using Ask AI.' });
      return;
    }
    if (!userQuestion) {
      res.status(400).json({ success: false, message: 'Please enter a question for AI.' });
      return;
    }
    const adTexts = await getRecentBrandAdTexts(brandName, 15);
    if (!adTexts) {
      res.status(502).json({ success: false, message: 'Could not load recent ads. Please try again.' });
      return;
    }
    if (!adTexts.length) {
      res.status(404).json({ success: false, message: 'No ad copy is available yet for this brand.' });
      return;
    }
    const ctx = adTexts.map((t) => `- ${t}`).join('\n');
    const u = `You are a marketing expert. Use ONLY the ad copy in Context below. Do not number or cite ads by index.

Reply in Markdown: start with a **Summary** or **Key takeaways** line if helpful, use bullet lists, and wrap important phrases and mini-headers in **bold** (e.g. **Main angle:** value prop here).

Context:
${ctx}

Question: ${userQuestion}`;
    const answer = await callGroqOrRespond(
      res,
      {
        system:
          'Answer in GitHub-flavored Markdown only. **Bold** every key insight and short label. Ground every claim in the given ad copy; no uncertain counts. No "Ad 1" style references.',
        user: u,
        temperature: 0.25,
      },
      'Ask AI is unavailable right now.'
    );
    if (!answer) return;
    res.status(200).json({ success: true, brandName, usedAds: adTexts.length, userQuestion, answer });
  } catch (err: unknown) {
    next(err);
  }
};

export const findCompetitors = async (
  req: CompetitorsRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const brandName = (req.body.brandName ?? '').trim();
    if (!brandName) {
      res.status(400).json({ success: false, message: 'Please choose a brand before finding competitors.' });
      return;
    }
    const adTexts = await getRecentBrandAdTexts(brandName, 20);
    if (!adTexts) {
      res.status(502).json({ success: false, message: 'Could not load recent ads. Please try again.' });
      return;
    }
    const optionalContext =
      adTexts.length > 0
        ? `\n\nOptional ad copy context:\n${adTexts.slice(0, 12).map((t) => `- ${t}`).join('\n')}`
        : '';
    const u = `For brand "${brandName}", list 4 competitors as JSON: { "competitors": [ { "name", "reason" } ] }.${optionalContext}`;
    const raw = await callGroqOrRespond(
      res,
      {
        system: 'Output only valid JSON, no markdown.',
        user: u,
        temperature: 0.35,
        jsonObject: true,
      },
      'Competitor lookup is unavailable right now.'
    );
    if (!raw) return;
    const competitors = parseModelJsonList<CompetitorItem>({
      raw,
      keys: ['competitors'],
      mapItem: parseCompetitorItem,
      limit: 4,
    });
    if (!competitors.length) {
      res.status(502).json({ success: false, message: 'We could not parse competitors from the AI response.' });
      return;
    }
    res
      .status(200)
      .json({ success: true, brandName, usedAdSnippets: adTexts.length, competitors: competitors.slice(0, 4) });
  } catch (err: unknown) {
    next(err);
  }
};

export const clusterAds = async (req: ClusterRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brandName = (req.body.brandName ?? '').trim();
    const adsIn = Array.isArray(req.body.ads) ? req.body.ads : [];
    if (!brandName) {
      res.status(400).json({ success: false, message: 'Please choose a brand before grouping concepts.' });
      return;
    }
    if (!adsIn.length) {
      res.status(400).json({ success: false, message: 'No ads were provided for clustering.' });
      return;
    }
    const adsForPrompt = adsIn
      .map((a) => {
        const id = String(a._id || '').trim();
        const text = String(a.text || '').trim();
        const platform = String(a.platform || '').trim();
        if (!id || !text) return null;
        return { id, text: text.slice(0, 500), platform };
      })
      .filter((x): x is { id: string; text: string; platform: string } => Boolean(x))
      .slice(0, 60);
    if (!adsForPrompt.length) {
      res
        .status(400)
        .json({ success: false, message: 'Each ad needs an _id and text to be grouped.' });
      return;
    }
    const pay = adsForPrompt
      .map((a) => `{"id":"${a.id}","platform":"${a.platform}","text":${JSON.stringify(a.text)}}`)
      .join(',\n');
    const u = `Group these ads into 3–5 creative concepts. Return JSON: { "concepts": [ { "title", "reason", "adIds": string[] } ] }.\nBrand: ${brandName}\n[\n${pay}\n]`;
    const raw = await callGroqOrRespond(
      res,
      {
        system: 'Output only valid JSON. Every id once.',
        user: u,
        temperature: 0.25,
        jsonObject: true,
      },
      'Concept grouping is unavailable right now.'
    );
    if (!raw) return;
    let concepts = parseModelJsonList<ConceptItem>({
      raw,
      keys: ['concepts', 'clusters', 'groups'],
      mapItem: parseConceptItem,
      limit: 5,
    });
    if (!concepts.length) {
      res.status(502).json({ success: false, message: 'We could not parse concept groups from the AI response.' });
      return;
    }
    const valid = new Set(adsForPrompt.map((a) => a.id));
    concepts = concepts
      .map((c) => ({ ...c, adIds: c.adIds.filter((i) => valid.has(i)) }))
      .filter((c) => c.adIds.length > 0)
      .slice(0, 5);
    if (!concepts.length) {
      res.status(502).json({ success: false, message: 'No valid concept groups were returned.' });
      return;
    }
    res.status(200).json({ success: true, brandName, inputAds: adsForPrompt.length, concepts });
  } catch (err: unknown) {
    next(err);
  }
};
