import { Platform } from 'react-native';

/**
 * A webcam frame can be several megabytes, and a slow connection then takes a minute to upload
 * it. The face checker needs a clear face, not full resolution, so on the web the photo is
 * scaled down (longest side `maxSide` px) and re-encoded as JPEG before it is sent. Anywhere
 * else, or if anything goes wrong, the original is returned untouched.
 */
export async function shrinkFaceImage(base64: string, maxSide = 720, quality = 0.7): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return base64;
  try {
    const hadPrefix = base64.startsWith('data:');
    const src = hadPrefix ? base64 : `data:image/jpeg;base64,${base64}`;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image failed to load'));
      el.src = src;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale === 1 && base64.length < 300_000) return base64; // already small
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return base64;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    const shrunk = hadPrefix ? out : out.replace(/^data:image\/jpeg;base64,/, '');
    return shrunk.length < base64.length ? shrunk : base64;
  } catch {
    return base64;
  }
}
