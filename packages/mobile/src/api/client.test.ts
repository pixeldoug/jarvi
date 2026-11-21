import { appEvents } from '@/lib/events';
import { api, ApiError, setSessionToken } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('api client', () => {
  const onUnauthorized = jest.fn();
  let unsubscribe: () => void;

  beforeEach(() => {
    onUnauthorized.mockReset();
    unsubscribe = appEvents.on('unauthorized', onUnauthorized);
    setSessionToken(null);
  });

  afterEach(() => unsubscribe());

  it('sends the session token and returns arrays untouched', async () => {
    setSessionToken('abc');
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, [{ id: 't1' }]));
    globalThis.fetch = fetchMock;
    await expect(api.get('/api/tasks')).resolves.toEqual([{ id: 't1' }]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });

  it('signs out when the active session is rejected', async () => {
    setSessionToken('expired');
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(403, { error: 'Invalid token' }));
    await expect(api.get('/api/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('ignores a 401 for a request sent before the session started', async () => {
    let respond: (response: Response) => void = () => undefined;
    globalThis.fetch = jest.fn(() => new Promise<Response>((resolve) => (respond = resolve)));
    const pending = api.post('/api/onboarding/step', { step: 'whatsapp' });
    setSessionToken('fresh');
    respond(jsonResponse(401, { error: 'Access token required' }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns network failures into a readable error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.get('/api/tasks')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('conexão') });
  });
});
