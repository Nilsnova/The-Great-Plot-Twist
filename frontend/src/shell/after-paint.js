// Background title services start only after its first paint and own their cleanup.
import {startTitleInput} from './title-input.js';
import {loadFestivalModule} from './world-loader.js';
import {createConnectionBanner} from '../ui/connection-banner.js';

export function startAfterPaint(ctx) {
  let disposed = false;
  const titleInput = startTitleInput({adapter: ctx.adapter, isLoading: ctx.isLoading,
    hasRuntime: () => !!ctx.runtime()});
  const banner = createConnectionBanner({send: ctx.send});
  ctx.container.append(banner.element);
  banner.update(ctx.adapter.read());
  const stop = ctx.adapter.subscribe(event => banner.update(event.view));
  const festivalReady = loadFestivalModule().then(module => {
    if (disposed || ctx.isDisposed()) return null;
    return module.createFestivalEntry(ctx);
  }).catch(() => null);
  return {festivalReady, dispose() {
    if (disposed) return;
    disposed = true; stop(); titleInput.dispose(); banner.dispose();
  }};
}
