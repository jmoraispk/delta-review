import type { Discussion } from '../api/types'
import { DiscussionThread } from './DiscussionThread'

interface GeneralDiscussionsPanelProps {
  discussions: Discussion[]
  onClose: () => void
}

export function GeneralDiscussionsPanel({
  discussions,
  onClose,
}: GeneralDiscussionsPanelProps) {
  return (
    <section
      className="mr-discussions-panel"
      aria-label="MR discussions"
    >
      <header>
        <div>
          <span className="eyebrow">Merge request</span>
          <strong>
            {discussions.length}{' '}
            {discussions.length === 1 ? 'discussion' : 'discussions'}
          </strong>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="mr-discussions-list">
        {discussions.map((discussion) => (
          <DiscussionThread
            discussion={discussion}
            key={discussion.id}
          />
        ))}
      </div>
    </section>
  )
}
