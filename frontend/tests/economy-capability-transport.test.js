// Shared negotiation is forwarded without letting feature callers replace authentication.
import {describe, expect, it, vi} from 'vitest';
import {createApi, ECONOMY_CAPABILITY_HEADERS} from '../src/online/api.js';

const response = (status = 200) => new Response('{}', {
  status, headers: {'Content-Type': 'application/json'},
});

function setup(replies = [response()]) {
  let token = 'original';
  const session = {getToken: () => token, getScope: () => 'actor', clearToken: vi.fn(),
    renewToken: async () => { token = 'renewed'; return true; }};
  const fetchImpl = vi.fn();
  for (const reply of replies) fetchImpl.mockResolvedValueOnce(reply);
  return {api: createApi({session, fetchImpl}), fetchImpl};
}

describe('economy capability transport', () => {
  it.each(['get', 'post', 'put', 'del'])('forwards the capability with %s', async method => {
    const {api, fetchImpl} = setup();
    const options = {headers: ECONOMY_CAPABILITY_HEADERS};
    if (method === 'get') await api.get('/api/island/arsenal', options);
    else await api[method]('/api/island/action', {actionUid: 'request01'}, options);
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer original', 'X-Island-Economy-Version': '1',
    });
    expect(ECONOMY_CAPABILITY_HEADERS).toEqual({'X-Island-Economy-Version': '1'});
  });

  it('retains capability and request body across a real transport renewal', async () => {
    const {api, fetchImpl} = setup([response(401), response()]);
    await api.post('/api/island/action', {actionUid: 'request01'},
      {headers: ECONOMY_CAPABILITY_HEADERS});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({
      Authorization: 'Bearer renewed', 'X-Island-Economy-Version': '1',
    });
    expect(fetchImpl.mock.calls[1][1].body).toBe(fetchImpl.mock.calls[0][1].body);
  });

  it.each(['Authorization', 'authorization', 'Content-Type', 'Cookie', 'X-Actor-Id'])
    ('rejects a feature override of %s before fetching', header => {
      const {api, fetchImpl} = setup();
      expect(() => api.get('/api/island/arsenal', {headers: {[header]: 'forged'}}))
        .toThrow(TypeError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

  it.each(['1\r\nAuthorization: forged', true, 1, null])
    ('rejects a noncanonical capability value %s', value => {
      const {api, fetchImpl} = setup();
      expect(() => api.get('/api/island/arsenal',
        {headers: {'X-Island-Economy-Version': value}})).toThrow(TypeError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
});
