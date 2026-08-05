import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(marked.parse(markdown || '', { async: false }) as string)
}
