import { pipeline } from '@huggingface/transformers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;

/**
 * Lazy singleton para o pipeline de extração de features do transformers.js.
 * Utiliza Xenova/all-MiniLM-L6-v2 localmente via ONNX.
 */
export async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

/**
 * Gera um embedding normalizado (vetor unitário de 384 dimensões) para o texto fornecido.
 */
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

/**
 * Alias de embed para compatibilidade com a especificação getEmbedding.
 */
export const getEmbedding = embed;

/**
 * Calcula o produto escalar (dot product) entre dois vetores Float32Array.
 * Como os embeddings são normalizados (L2 norm = 1), o produto escalar
 * é matematicamente equivalente à similaridade de cosseno.
 */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Alias de dot para compatibilidade com a especificação dotProduct.
 */
export const dotProduct = dot;
