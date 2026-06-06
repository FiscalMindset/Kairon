const VLM_MODEL = 'qwen2-vl-2b-instruct-q4_0';
const VLM_PROMPT = 'Read the numbers in this CAPTCHA image. Return ONLY the digits, nothing else.';

let vlmReady = false;
let vlmLoading = false;
let initPromise = null;

export function isVlmAvailable() {
  return vlmReady;
}

export function isVlmLoading() {
  return vlmLoading;
}

export async function loadVlmModel(onProgress) {
  if (vlmReady) return true;
  if (initPromise) return initPromise;

  vlmLoading = true;
  initPromise = _doLoad(onProgress);
  try {
    const result = await initPromise;
    vlmReady = result;
    return result;
  } finally {
    vlmLoading = false;
    initPromise = null;
  }
}

async function _doLoad(onProgress) {
  try {
    const { RunAnywhere, VLM, detectCapabilities } = await import('@runanywhere/web');

    const caps = await detectCapabilities();
    if (!caps.hasWebGPU) {
      console.warn('[VLM] WebGPU not available, VLM will be slow');
    }

    await RunAnywhere.initialize({ environment: 'development', debug: false });

    const modelUrl = `/models/${VLM_MODEL}/${VLM_MODEL}.gguf`;
    const mmprojUrl = `/models/${VLM_MODEL}/mmproj.gguf`;

    await VLM.loadModel(modelUrl, mmprojUrl, VLM_MODEL, {
      onProgress: (pct) => {
        console.log(`[VLM] Model download: ${(pct * 100).toFixed(0)}%`);
        onProgress?.(pct);
      },
    });

    console.log('[VLM] Model ready');
    return true;
  } catch (e) {
    console.error('[VLM] Load failed:', e);
    return false;
  }
}

export async function solveCaptcha(imageBase64) {
  if (!vlmReady) {
    const loaded = await loadVlmModel();
    if (!loaded) return null;
  }

  try {
    const { VLM, VLMImageFormat } = await import('@runanywhere/web');

    const img = new Image();
    const pixelData = await new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        resolve({ rgb: new Uint8Array(imageData.data.buffer), width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = imageBase64;
    });

    const result = await VLM.process(
      { format: VLMImageFormat.RGB, rgbPixels: pixelData.rgb, width: pixelData.width, height: pixelData.height },
      VLM_PROMPT,
      { maxTokens: 10, temperature: 0.1 },
    );

    const cleaned = (result.text || '').replace(/[^0-9]/g, '');
    if (cleaned.length >= 3 && cleaned.length <= 8) return cleaned;
    return null;
  } catch (e) {
    console.error('[VLM] Solve failed:', e);
    return null;
  }
}
