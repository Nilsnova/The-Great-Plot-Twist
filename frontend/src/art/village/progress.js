// VIS-35: original blank plaques; actual record/stage values are painted by decorations.js.
export const sheets = {progress: {file: 'village/progress-v1.png', width: 1774, height: 887}};
const statueBounds = [203, 526, 209, 20];
const statue = (rect, sourceFoot) => ({sheet: 'progress', rect, sourceFoot, logical: [40, 56, 4], fitBounds: statueBounds});
export const frames = {
  island_record: {sheet: 'progress', rect: [34, 303, 341, 411], sourceFoot: [172, 389], logical: [40, 48, 4]},
  island_statue_1: statue([375, 274, 313, 447], [154, 427]),
  island_statue_2: statue([693, 201, 325, 519], [156, 500]),
  island_statue_3: statue([1022, 186, 351, 535], [163, 516]),
  island_statue_4: statue([1373, 176, 401, 546], [203, 526]),
};
