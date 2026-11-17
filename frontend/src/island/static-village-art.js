// Static landmarks keep their existing identity/foot while adopting prepared, owned art.
import * as THREE from 'three';
export function createArtworkTasks(onChange = () => {}, onError = () => {}) {
  const pending = new Map(), failed = new Set(); let disposed = false;
  const publish = () => { if (!disposed) onChange({failed: [...failed], pending: [...pending.keys()]}); };
  return {
    run(key, operation) {
      if (disposed) return Promise.resolve();
      if (pending.has(key)) return pending.get(key);
      const task = Promise.resolve().then(operation).then(() => { failed.delete(key); }, error => {
        if (!disposed) { failed.add(key); onError(error); }
      }).finally(() => { pending.delete(key); publish(); });
      pending.set(key, task); publish(); return task;
    },
    dispose() { disposed = true; pending.clear(); failed.clear(); },
  };
}
export function createStaticVillageArt({root, load, sizes, registered, tasks}) {
  const tracked = new Map(), materials = new Map(), released = new Set(); let disposed = false;
  const release = value => { if (value && !released.has(value)) { released.add(value); value.dispose(); } };
  const releaseUnused = value => {
    let used = false;
    root.traverse(item => { if (item.material === value || item.material?.map === value) used = true; });
    if (!used) release(value);
  };
  function swap(mesh, id, material) {
    if (mesh.material === material) return;
    const [width, height, anchor] = sizes[id], geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height * (.5 - anchor), 0);
    const previous = mesh.material; release(mesh.geometry);
    mesh.geometry = geometry; mesh.material = material; mesh.userData.art = id;
    releaseUnused(previous.map); releaseUnused(previous);
  }
  function ensure(id) {
    if (disposed || materials.has(id)) return Promise.resolve();
    return tasks.run(`static:${id}`, async () => {
      const loaded = await load([id]), material = loaded[id];
      if (disposed) { for (const value of Object.values(loaded)) { release(value.map); release(value); } return; }
      if (!material) throw new Error(`Prepared static artwork is missing: ${id}`);
      materials.set(id, material);
      for (const mesh of tracked.get(id)) swap(mesh, id, material);
    });
  }
  return {
    track(mesh, id) {
      if (disposed || !registered(id)) return;
      if (!tracked.has(id)) tracked.set(id, new Set()); tracked.get(id).add(mesh);
      if (materials.has(id)) swap(mesh, id, materials.get(id)); else void ensure(id);
    },
    retry() { return Promise.all([...tracked.keys()].map(ensure)); },
    dispose() {
      if (disposed) return; disposed = true;
      // Remove owned meshes before the enclosing place lifetime traverses shared scene resources.
      for (const [id, meshes] of tracked) if (materials.has(id)) for (const mesh of meshes) { mesh.removeFromParent(); release(mesh.geometry); }
      for (const material of materials.values()) { release(material.map); release(material); }
      materials.clear(); tracked.clear();
    },
  };
}
