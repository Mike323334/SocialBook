import { chunkPage } from './chunking'

const page = {
  documentId: 'book-1',
  pageNumber: 15,
  text: `
    Los hábitos son acciones repetidas que pueden convertirse
    en comportamientos automáticos. La repetición permite que
    ciertas acciones requieran menos esfuerzo consciente.
    Con el tiempo, pequeñas acciones pueden producir cambios
    significativos. Por eso, modificar pequeñas partes de
    nuestra rutina puede tener consecuencias importantes.
  `,
}

const chunks = chunkPage(page)

console.log('Number of chunks:', chunks.length)

for (const chunk of chunks) {
  console.log('---')
  console.log('ID:', chunk.id)
  console.log('Page:', chunk.pageNumber)
  console.log('Chunk:', chunk.chunkIndex)
  console.log('Text:', chunk.text)
}