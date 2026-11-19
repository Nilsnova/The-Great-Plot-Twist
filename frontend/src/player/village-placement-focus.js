// Focus once per placement intent, not every frame: explicit Fit and manual panning remain usable.
export function createVillagePlacementFocus(view) {
  let previous = '';
  return placement => {
    const cell = placement?.spotId || placement?.positionOnly ? placement : placement?.cells?.at(-1);
    if (!cell || ![cell.x, cell.z].every(Number.isFinite)) { previous = ''; return; }
    const key = JSON.stringify([placement.spotId ?? (cell.positionOnly ? 'battle location' : 'walls'),
      cell.x, cell.z, placement.message ?? '', placement.cells?.length]);
    if (key === previous) return;
    previous = key;
    view.focusVillage({x: cell.x, z: cell.z, lift: cell.lift ?? 1, ...(cell.keepFit ? {keepFit: true} : {})});
  };
}
