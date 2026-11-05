// Pure native-resolution calculation: CSS upscales the framebuffer by an integer.
export function pixelViewport(width, height) {
  const scale = Math.max(1, Math.floor(Math.min(width / 400, height / 240)));
  return { width: Math.floor(width / scale), height: Math.floor(height / scale), scale };
}
