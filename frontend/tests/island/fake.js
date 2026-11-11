// The island lane's tests use the one in-memory fake (src/pirates/fake-api.js) through the island client
// (src/island/api.js), the way ?islands=fake does in the game: {ok, data} answers plus the dev helpers.
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport, FAKE_FRIEND, FAKE_SPOTS} from '../../src/pirates/fake-api.js';

export {createFakeIslandTransport, FAKE_SPOTS};
export const FAKE_FRIEND_CODE = FAKE_FRIEND.code;
export function createFakeIslandApi(options = {}) {
  const transport = createFakeIslandTransport(options);
  return Object.assign(createIslandApi({transport, makeUid: options.makeUid}), {dev: transport.dev});
}
