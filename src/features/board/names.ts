import type { Board, Member } from './api'

/** "Ben", or "#Ben" for a former member, so the seat's history stays readable. */
export function memberName(member: Member | undefined): string {
  if (!member) return 'Someone'
  return member.status === 'former' ? `#${member.display_name}` : member.display_name
}

/** The name with the "Former member" tag chat and threads show beside it. */
export function memberLabel(member: Member | undefined): string {
  return member?.status === 'former' ? `${memberName(member)} · Former member` : memberName(member)
}

export function membersById(board: Board): Map<string, Member> {
  return new Map(board.memberships.map((m) => [m.id, m]))
}
