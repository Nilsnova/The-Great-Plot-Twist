// The Keeper's Lock calls: the question, an answer and the place search, through the game's api.js
// (the Bearer token stays in the memory session). Every answer is plain data and nothing throws.
// Used by: lock-screen.js. Tested with a fake fetch in tests/class-demo-api.test.js.
const query = place => (place ? `?${new URLSearchParams({name: place.name, latitude: String(place.latitude), longitude: String(place.longitude)})}` : '');

export function createLockApi({api}) {
  return {
    read: place => api.get(`/api/lock${query(place)}`),
    answer: ({answer, actionUid, place}) => api.post('/api/lock/answer', place ? {answer, actionUid, place: {name: place.name, latitude: place.latitude, longitude: place.longitude}} : {answer, actionUid}),
    search: text => api.get(`/api/places/search?${new URLSearchParams({q: text.trim().slice(0, 60)})}`),
  };
}
