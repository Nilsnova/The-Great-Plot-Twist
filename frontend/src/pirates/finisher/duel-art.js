// Board and duel presentation. The scene supplies the prompt and the local response;
// the drawing never reads or changes the fight's clock, input stream or score.
const WIDTH = 640, HEIGHT = 300;
const INK = '#17242b';
const GOLD = '#ffc966';
const TAU = Math.PI * 2;

const PALETTES = [
  {coat: '#244f69', seam: '#4a8491', shadow: '#172e43', hat: '#193642', ribbon: '#5da9ac', skin: '#efb684'},
  {coat: '#8e3e34', seam: '#d37253', shadow: '#4a2a31', hat: '#422831', ribbon: '#ed8758', skin: '#d99672'},
];

function gradient(ctx, from, to, start, end) {
  const fill = ctx.createLinearGradient(0, from, 0, to);
  fill.addColorStop(0, start);
  fill.addColorStop(1, end);
  return fill;
}

function paint(ctx, path, color, outline = INK, width = 3) {
  ctx.fillStyle = color;
  ctx.fill(path);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
}

function stroke(ctx, color, width, ...points) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
}

function ellipse(ctx, color, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSeaAndDeck(ctx) {
  ctx.fillStyle = gradient(ctx, 0, 130, '#214459', '#72a09a');
  ctx.fillRect(0, 0, WIDTH, 130);
  ellipse(ctx, '#f6d58d', 477, 47, 18, 18);
  const islands = new Path2D('M0 98L30 79 59 80 78 68 105 76 120 90 158 98H0ZM386 98L432 91 452 79 479 84 505 91 531 98Z');
  paint(ctx, islands, '#385e65', null);
  ctx.fillStyle = gradient(ctx, 91, 149, '#377d83', '#175563');
  ctx.fillRect(0, 94, WIDTH, 56);
  for (const [x, y, length] of [[27, 108, 73], [120, 116, 52], [258, 102, 83], [345, 126, 31], [417, 112, 108], [537, 99, 57]]) {
    stroke(ctx, '#a5cfc2', 1.5, [x, y], [x + length, y]);
  }

  ctx.fillStyle = gradient(ctx, 132, HEIGHT, '#75442b', '#b67842');
  ctx.fillRect(0, 132, WIDTH, HEIGHT - 132);
  const planks = [[144, 151], [167, 181], [205, 225], [256, 299]];
  for (const [top, bottom] of planks) {
    ctx.fillStyle = '#ffc37a1b';
    ctx.fillRect(0, top, WIDTH, bottom - top);
    stroke(ctx, '#42291e', 3, [0, top], [WIDTH, top]);
    stroke(ctx, '#de9d63', 1.5, [0, top + 4], [WIDTH, top + 4]);
  }
  for (const [x, y, dx, dy] of [[234, 145, -11, 23], [444, 145, 18, 23], [81, 169, -27, 36], [342, 169, 6, 36],
    [232, 207, -18, 50], [540, 207, 42, 50], [92, 258, -35, 42], [399, 258, 16, 42]]) {
    stroke(ctx, '#613b26', 2, [x, y], [x + dx, y + dy]);
    ellipse(ctx, '#5b3b2a', x - 5, y + dy - 4, 2, 1.2);
    ellipse(ctx, '#5b3b2a', x + dx + 7, y + dy - 4, 2, 1.2);
  }

  ctx.fillStyle = '#382b25';
  ctx.fillRect(0, 110, WIDTH, 17);
  ctx.fillStyle = '#ae7348';
  ctx.fillRect(0, 108, WIDTH, 8);
  stroke(ctx, '#e1ac69', 2, [0, 108], [WIDTH, 108]);
  for (const x of [36, 108, 214, 408, 526, 594]) {
    ctx.fillStyle = '#61412e';
    ctx.fillRect(x - 5, 110, 10, 42);
    ctx.fillStyle = '#946242';
    ctx.fillRect(x - 3, 112, 3, 37);
  }

  const sides = new Path2D('M0 0L61 0 37 123 0 151ZM640 0H594L611 120 640 144Z');
  paint(ctx, sides, '#173442', '#16303a', 4);
  stroke(ctx, '#a98d62', 3, [57, 0], [34, 123]);
  stroke(ctx, '#967c58', 2, [595, 0], [612, 118]);
  const lamp = new Path2D('M6 65H27L24 87H9ZM7 62L17 57 27 62Z M614 65H635L632 87H617ZM614 62L624 57 635 62Z');
  paint(ctx, lamp, '#e8aa5f', '#483725', 2.5);
  stroke(ctx, '#ffdf8e', 2, [11, 70], [12, 80]);
  stroke(ctx, '#ffdf8e', 2, [619, 70], [620, 80]);

  ctx.fillStyle = gradient(ctx, 257, HEIGHT, '#16202500', '#18212d82');
  ctx.fillRect(0, 257, WIDTH, HEIGHT - 257);
}

const PATHS = {
  rearBoot: 'M-25 -44L-6 -42 -10 -12 -13 2 -43 2Q-48 -1 -43 -9L-32 -14Z',
  frontBoot: 'M7 -42L26 -42 30 -13 44 -7Q49 0 42 2H16L11 -5Z',
  jacket: 'M-30 -90Q-19 -101 9 -97L28 -88 28 -56 35 -33Q14 -26 3 -32L-8 -43 -15 -31Q-32 -30 -41 -39L-31 -58Z',
  jacketShadow: 'M-29 -85L-16 -78 -20 -54 -26 -36Q-34 -34 -38 -39L-30 -59Z',
  lapel: 'M1 -96L19 -92 17 -69 7 -61 1 -73 -8 -81Z',
  sleeve: 'M-29 -87Q-43 -80 -42 -61L-38 -53Q-30 -52 -27 -60L-22 -74Z',
  face: 'M-20 -135Q-8 -151 12 -143 26 -139 25 -123L31 -115 25 -109Q24 -97 11 -94L-8 -98Q-20 -101 -24 -111Z',
  hair: 'M-22 -138Q-8 -155 13 -146L22 -139 12 -133 -6 -135 -10 -107 -18 -103 -24 -111Z',
  hat: 'M-39 -131Q-34 -141 -28 -148L-22 -153Q-13 -151 -9 -152L1 -165 14 -152 23 -149 31 -154 36 -142 47 -139Q47 -133 38 -130L17 -124Q-19 -120 -39 -131Z',
  brim: 'M-34 -134Q-10 -123 15 -128L42 -137Q24 -128 14 -126 -11 -121 -34 -134Z',
  opponentTail: 'M-21 -137L-43 -139 -38 -128 -52 -123 -33 -122 -19 -130Z',
  eye: 'M12 -126Q16 -128 20 -126',
  sword: 'M12 -5L107 -8Q126 -9 139 -17L126 -2Q115 9 104 9L12 5Z',
  swordFace: 'M18 -3L110 -4 127 -9 116 -2 105 4 18 3Z',
  hand: 'M-10 -5Q-6 -13 4 -12L11 -3 8 6 -2 8 -10 4Z',
  guard: 'M10 -12Q15 -11 16 -4V9Q13 13 10 8L8 -7Z',
  arrow: 'M0 -31L29 -3H13V25H-13V-3H-29Z',
};

function drawFighter(ctx, paths, palette, x, facing, step, strike, recoil) {
  ellipse(ctx, '#19273374', x + facing * step * .6, 250, 50 + step * .23, 9);
  ctx.save();
  ctx.translate(x + facing * step, 247);
  ctx.scale(facing, 1);
  ctx.rotate(.12 * strike - .16 * recoil);
  paint(ctx, paths.rearBoot, palette.shadow);
  paint(ctx, paths.frontBoot, '#49322d');
  stroke(ctx, '#b77b55', 2, [-40, -4], [-16, -4]);
  stroke(ctx, '#b77b55', 2, [19, -4], [41, -4]);
  paint(ctx, paths.jacket, palette.coat);
  paint(ctx, paths.jacketShadow, palette.shadow, null);
  paint(ctx, paths.sleeve, palette.shadow);
  paint(ctx, paths.lapel, palette.seam, '#26363b', 1.8);
  stroke(ctx, '#e8b868', 2, [6, -70], [10, -46], [15, -37]);
  stroke(ctx, '#1e292d', 7, [-30, -52], [25, -51]);
  ctx.fillStyle = GOLD;
  ctx.fillRect(6, -55, 10, 7);
  ctx.fillStyle = '#5b4230';
  ctx.fillRect(9, -53, 4, 3);

  paint(ctx, paths.face, palette.skin);
  paint(ctx, paths.hair, '#69483a', null);
  stroke(ctx, '#4c3230', 2, [13, -113], [20, -112], [24, -113]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke(paths.eye);
  ellipse(ctx, INK, 18.5, -123.2, 1.7, 2.4);
  if (facing < 0) paint(ctx, paths.opponentTail, palette.ribbon, null);
  paint(ctx, paths.hat, palette.hat, INK, 4);
  paint(ctx, paths.brim, palette.ribbon, null);
  ellipse(ctx, GOLD, 8, -144, 5.5, 5.5);
  ellipse(ctx, '#885b40', 8, -144, 2.2, 2.2);

  // Shoulder, elbow and wrist move together to keep the blade in the captain's grip.
  const handX = 35 + strike * 17 - recoil * 5, handY = -65 - strike * 13 - recoil * 5;
  stroke(ctx, INK, 18, [16, -86], [24, -66], [handX, handY]);
  stroke(ctx, palette.seam, 12, [16, -86], [24, -66], [handX, handY]);
  ctx.translate(handX, handY);
  ctx.rotate(-.32 - strike * .13 - recoil * .42);
  paint(ctx, paths.sword, '#a8c3bf', INK, 3.8);
  paint(ctx, paths.swordFace, '#f6f1cd', null);
  paint(ctx, paths.guard, GOLD, '#624830', 2);
  paint(ctx, paths.hand, palette.skin, INK, 2.5);
  ctx.restore();
}

function drawImpact(ctx, age, landed, animate) {
  if (age >= .31) return;
  const opacity = animate ? Math.max(0, 1 - age / .31) : .9;
  ctx.save();
  ctx.globalAlpha = opacity;
  const x = landed ? 359 : 278, scale = animate ? .7 + age * 3.3 : 1;
  ctx.translate(x, 150);
  ctx.scale(scale, scale);
  if (landed) {
    stroke(ctx, '#fff5c5', 4, [-18, 18], [12, -11]);
    stroke(ctx, GOLD, 3, [-22, -5], [-32, -11]);
    stroke(ctx, GOLD, 3, [12, 12], [25, 17]);
    stroke(ctx, GOLD, 2.5, [19, -16], [28, -25]);
  } else {
    stroke(ctx, '#ffe0b6', 4, [-12, -12], [10, 10]);
    stroke(ctx, '#ffd38b', 4, [10, -12], [-12, 10]);
    stroke(ctx, '#e19979', 2.5, [-18, 3], [-28, 8]);
  }
  ctx.restore();
}

function drawPrompt(ctx, paths, {direction, remaining, response}) {
  // A separate shape and glyph identify both outcomes without relying on colour.
  const hit = response === 'hit', answered = response !== 'ready';
  const accent = !answered ? GOLD : hit ? '#9fe3b3' : '#ffb397';
  const centre = !answered ? '#173943' : hit ? '#205041' : '#6d3937';
  ellipse(ctx, '#12253180', 320, 88, 65, 68);
  ellipse(ctx, '#0a2832', 320, 82, 62, 63);
  ellipse(ctx, '#d79c50', 320, 82, 57.5, 58.5);
  ellipse(ctx, '#1c343b', 320, 82, 54, 55);
  ellipse(ctx, centre, 320, 82, 47.5, 49);
  ctx.strokeStyle = '#ffffff27';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(320, 82, 51, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(320, 82, 51, -Math.PI / 2, -Math.PI / 2 + remaining * TAU);
  ctx.stroke();
  ctx.save();
  ctx.translate(320, 82);
  ctx.rotate(direction * Math.PI / 2);
  paint(ctx, paths.arrow, '#fff1c9', '#0b242e', 3);
  ctx.restore();
  if (answered) {
    ellipse(ctx, '#122c35', 366, 123, 16, 16);
    ellipse(ctx, accent, 366, 123, 12, 12);
    if (hit) stroke(ctx, '#19343c', 3, [360, 123], [364, 127], [372, 118]);
    else {
      stroke(ctx, '#4c2d29', 2.7, [362, 119], [370, 127]);
      stroke(ctx, '#4c2d29', 2.7, [370, 119], [362, 127]);
    }
  }
}

export function createDuelArt(ctx) {
  const deck = ctx.canvas.ownerDocument.createElement('canvas');
  deck.width = WIDTH;
  deck.height = HEIGHT;
  const backdrop = deck.getContext('2d');
  if (backdrop) drawSeaAndDeck(backdrop);
  const paths = Object.fromEntries(Object.entries(PATHS).map(([key, data]) => [key, new Path2D(data)]));
  return ({direction, remaining, response, age, clock, animate}) => {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (backdrop) ctx.drawImage(deck, 0, 0);
    else drawSeaAndDeck(ctx);
    const hit = response === 'hit', missed = response === 'miss';
    const motion = animate ? Math.max(0, 1 - age / .33) : 0;
    const poised = animate ? Math.sin(clock * 5) * 1.4 : 0;
    drawFighter(ctx, paths, PALETTES[0], 151, 1, poised + (hit ? 42 : missed ? -12 : 0) * motion,
      hit ? motion : 0, missed ? motion : 0);
    drawFighter(ctx, paths, PALETTES[1], 489, -1, -poised + (missed ? 43 : hit ? -12 : 0) * motion,
      missed ? motion : 0, hit ? motion : 0);
    if (hit || missed) drawImpact(ctx, age, hit, animate);
    drawPrompt(ctx, paths, {direction, remaining, response});
    ctx.restore();
  };
}
