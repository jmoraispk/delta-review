import coderabbitMark from '../assets/coderabbit.svg'
import greptileMark from '../assets/greptile.svg'

export type ReviewerKind = 'coderabbit' | 'greptile' | 'human'

export interface ReviewerAuthor {
  name: string
  username: string
}

interface ReviewerMarkProps {
  author?: ReviewerAuthor
}

// oxlint-disable-next-line react/only-export-components
export function reviewerKind(author?: ReviewerAuthor): ReviewerKind {
  const name = author?.name.trim().toLowerCase()
  if (name === 'coderabbit') return 'coderabbit'
  if (name === 'greptile') return 'greptile'
  return 'human'
}

export function ReviewerMark({ author }: ReviewerMarkProps) {
  const kind = reviewerKind(author)
  if (kind === 'coderabbit') {
    return (
      <img className="reviewer-mark" src={coderabbitMark} alt="CodeRabbit" />
    )
  }
  if (kind === 'greptile') {
    return <img className="reviewer-mark" src={greptileMark} alt="Greptile" />
  }

  return (
    <span className="author-initial" aria-hidden="true">
      {(author?.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
