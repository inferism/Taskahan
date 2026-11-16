import { Ellipsis } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { Member } from '@/features/board/api'

export type MemberAction = 'transfer' | 'remove'

/** The leader's menu on a member's column header. */
export function MemberMenu({
  member,
  onAction,
}: {
  member: Member
  onAction: (action: MemberAction) => void
}) {
  const item =
    'flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 outline-none data-[highlighted]:bg-sunken'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Manage ${member.display_name}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-sunken"
        onClick={(e) => e.stopPropagation()}
      >
        <Ellipsis size={20} strokeWidth={1.75} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 text-body text-ink shadow-overlay"
        >
          <DropdownMenu.Item className={item} onSelect={() => onAction('transfer')}>
            Make Leader…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={`${item} text-blocked`} onSelect={() => onAction('remove')}>
            Remove from group…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
