// A small min-heap of grid cells by cost, for the route search in pathing.js. Equal costs come out
// lowest cell index first, so the search visits cells in the same order in every browser.

const before = (a, b) => a.cost < b.cost || (a.cost === b.cost && a.index < b.index);

export function createCellHeap() {
  const items = [];
  return {
    get size() { return items.length; },
    push(cost, index) {
      items.push({ cost, index });
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!before(items[i], items[parent])) break;
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      }
    },
    pop() {
      const top = items[0], last = items.pop();
      if (items.length) { items[0] = last; sinkDown(items); }
      return top;
    },
  };
}

// Move the first item down until both of its children come after it.
function sinkDown(items) {
  let i = 0;
  for (;;) {
    const left = 2 * i + 1, right = left + 1;
    let smallest = i;
    if (left < items.length && before(items[left], items[smallest])) smallest = left;
    if (right < items.length && before(items[right], items[smallest])) smallest = right;
    if (smallest === i) return;
    [items[i], items[smallest]] = [items[smallest], items[i]];
    i = smallest;
  }
}
