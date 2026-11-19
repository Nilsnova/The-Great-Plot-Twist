// Focus once per intent or a measured inset change. Fit and manual panning remain usable.
export function createVillagePlacementFocus(view) {
  let previous = '';
  return (placement, viewport = null) => {
    const cell = placement?.spotId || placement?.positionOnly ? placement : placement?.cells?.at(-1);
    if (!cell || ![cell.x, cell.z].every(Number.isFinite)) { previous = ''; return; }
    const key = JSON.stringify([placement.spotId ?? (cell.positionOnly ? 'battle location' : 'walls'),
      cell.x, cell.z, placement.message ?? '', placement.cells?.length,
      viewport?.width, viewport?.height, viewport?.top, viewport?.bottom]);
    if (key === previous) return;
    previous = key;
    view.focusVillage({x: cell.x, z: cell.z, lift: cell.lift ?? 1, ...(cell.keepFit ? {keepFit: true} : {})});
  };
}
