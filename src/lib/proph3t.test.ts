import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock du client Supabase de l'app (source du JWT user). vi.hoisted pour
// pouvoir référencer le mock dans la factory vi.mock (hoistée en tête de fichier).
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

const CORE_URL = 'https://core.test';
const CORE_ANON = 'anon-test-key';

interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'StatusText',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// Charge le module APRÈS avoir stubé les env (lues au niveau module).
async function loadAskProph3t() {
  vi.resetModules();
  vi.stubEnv('VITE_ATLAS_SUPABASE_URL', CORE_URL);
  vi.stubEnv('VITE_ATLAS_SUPABASE_ANON_KEY', CORE_ANON);
  const mod = await import('./proph3t');
  return mod.askProph3t;
}

describe('askProph3t (Mode B — core hébergé)', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'jwt-user' } } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('POST proph3t-ask avec product=cockpit-fa, sensibilité par défaut "internal", JWT user', async () => {
    const fetchMock = mockFetchOnce(200, { conversation_id: 'c1', answer: 'ok', citations: [], confidence: 0.9 });
    const askProph3t = await loadAskProph3t();
    const r = await askProph3t({ message: 'Analyse mon CA' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(`${CORE_URL}/functions/v1/proph3t-ask`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-user');
    expect(init.headers.apikey).toBe(CORE_ANON);
    const payload = JSON.parse(init.body);
    expect(payload.product).toBe('cockpit-fa');
    expect(payload.sensitivity).toBe('internal');
    expect(payload.message).toBe('Analyse mon CA');
    expect(r.answer).toBe('ok');
  });

  it('préserve sensitivity="confidential" et society_id', async () => {
    const fetchMock = mockFetchOnce(200, { conversation_id: 'c2', answer: 'ok', citations: [], confidence: 1 });
    const askProph3t = await loadAskProph3t();
    await askProph3t({ message: 'Paie du mois', sensitivity: 'confidential', societyId: 'soc-1' });
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as FetchInit).body);
    expect(payload.sensitivity).toBe('confidential');
    expect(payload.society_id).toBe('soc-1');
  });

  it('repli sur la clé anon quand ni session ni token SSO', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetchOnce(200, { conversation_id: 'c3', answer: 'ok', citations: [], confidence: 0.5 });
    const askProph3t = await loadAskProph3t();
    await askProph3t({ message: 'question publique', sensitivity: 'public' });
    const init = fetchMock.mock.calls[0][1] as FetchInit;
    expect(init.headers.Authorization).toBe(`Bearer ${CORE_ANON}`);
  });

  it('refus propre : une réponse non-2xx lève une erreur (jamais de fuite silencieuse)', async () => {
    mockFetchOnce(403, { error: 'no compliant provider available' });
    const askProph3t = await loadAskProph3t();
    await expect(
      askProph3t({ message: 'liasse fiscale', sensitivity: 'confidential' }),
    ).rejects.toThrow(/proph3t-ask 403/);
  });
});
