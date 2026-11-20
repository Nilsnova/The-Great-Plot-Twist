// Foam separates into two worn scalloped edges behind the stern, fading into stirred water.
export const SAILING_WAKE = Object.freeze({id: 'pirate-sailing-wake', width: 48, height: 18});

export function paintSailingWake(ctx) {
  const wash = ctx.createLinearGradient(1, 0, 45, 0);
  wash.addColorStop(0, '#5eb7b600');
  wash.addColorStop(.45, '#8ad6ce34');
  wash.addColorStop(.82, '#d5f0d980');
  wash.addColorStop(1, '#b7e6dd00');
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.moveTo(1, 3);
  ctx.bezierCurveTo(21, 6, 36, 7, 46, 9);
  ctx.bezierCurveTo(34, 12, 20, 12, 1, 15);
  ctx.quadraticCurveTo(9, 9, 1, 3);
  ctx.fill();

  const foam = ctx.createLinearGradient(2, 0, 44, 0);
  foam.addColorStop(0, '#b9e5d500');
  foam.addColorStop(.42, '#c7eee1aa');
  foam.addColorStop(.82, '#ecffebdd');
  foam.addColorStop(1, '#e1f9ed20');
  ctx.strokeStyle = foam;
  ctx.lineWidth = 1.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(6, 3);
  ctx.bezierCurveTo(11, 1.6, 13, 5, 19, 4.7);
  ctx.moveTo(21, 4.9);
  ctx.bezierCurveTo(31, 4.5, 31, 8.8, 43, 8.1);
  ctx.moveTo(7, 15.8);
  ctx.quadraticCurveTo(13, 12, 20, 13);
  ctx.moveTo(23, 12.8);
  ctx.bezierCurveTo(31, 13.4, 33, 9.5, 44.5, 9.5);
  ctx.stroke();
}
