import { generateEmbedding } from './embeddings'

const text = 'Small daily habits can create significant changes over time.'

const embedding = await generateEmbedding(text)

console.log('Embedding dimensions:', embedding.length)
console.log('First 10 values:', embedding.slice(0, 10))