import { Link } from 'react-router'
import { splitTaskRefs, taskPath } from './taskLinks'

export function TaskRefs({ text, groupId }: { text: string; groupId: string }) {
  return (
    <>
      {splitTaskRefs(text).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Link
            key={i}
            to={taskPath(groupId, part.number)}
            className="font-semibold text-link underline"
          >
            #{part.number}
          </Link>
        ),
      )}
    </>
  )
}
