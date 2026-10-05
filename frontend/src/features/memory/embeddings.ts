import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

let extractor: FeatureExtractionPipeline | null = null

export async function getEmbeddingModel(): Promise<FeatureExtractionPipeline> {
  if (extractor) {
    return extractor
  }

  extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
  )

  return extractor
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getEmbeddingModel()

  const output = await model(text, {
    pooling: 'mean',
    normalize: true,
  })

  return Array.from(output.data as Float32Array)
}