// G8's full 31-command baseline, retained by the G9 sequential driver.
export const g8Commands=[
 ['tests','npm test'],['build','npm run build'],['generator','python3 scripts/pixel_art/generate.py'],
 ['credits','node scripts/check-credits.js'],['living','node scripts/check-living.js'],['life','node scripts/check-life.js'],
 ['case','node scripts/check-case.js'],['world','node scripts/check-world.js'],['readability','node scripts/check-readability.js'],
 ['browser','CAPTURE_PREFIX=G8 node scripts/check-browser.js'],['production','CAPTURE_PREFIX=G8 node scripts/check-production.js'],
 ['pixel','node scripts/check-pixel.js'],['pixel-production','ART_PRODUCTION=1 node scripts/check-pixel.js'],
 ['kit','node scripts/check-ui-kit.js'],['kit-production','KIT_PRODUCTION=1 node scripts/check-ui-kit.js'],
 ['cinematics','node scripts/check-cinematics.js'],['intro','node scripts/check-intro.js'],['weather','node scripts/check-weather-wiring.js'],
 ['experience','node scripts/check-experience.js'],['demo','node scripts/check-demo.js'],['loading','node scripts/check-loading.js'],
 ['lifecycle','node scripts/check-lifecycle.js'],
 ['csp','node scripts/check-csp.js'],['islet-world','node scripts/check-islet-world.js'],['bulletin','node scripts/check-bulletin.js'],
 ['hook','node scripts/check-hook.js'],['harbor-life','node scripts/check-harbor-life.js'],['presenter','node scripts/check-presenter.js'],
 ['golden','node scripts/check-golden-path.js'],['chaos','node scripts/check-chaos.js'],
 ['a11y','node scripts/check-a11y.js'],
];
