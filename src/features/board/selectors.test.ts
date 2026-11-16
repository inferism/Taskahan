import { upsertMember, upsertTask } from './api'
import { SEED_NOW, seedBoard, seedBoardAsBen } from './seed.fixture'
import {
  amLeader,
  columnMembers,
  deadlineGroup,
  deadlineSections,
  isBlocked,
  progressOf,
  progressText,
  shownStatus,
  tasksByMember,
} from './selectors'

const numbers = (tasks: { number: number }[]) => tasks.map((t) => t.number)
const byNumber = (n: number) => seedBoard.tasks.find((t) => t.number === n)!

describe('board selectors on the seed data', () => {
  it('orders columns: you, active members by seat, former members', () => {
    expect(columnMembers(seedBoard).map((m) => m.id)).toEqual(['ana', 'ben', 'cara', 'dev', 'eli'])
    expect(columnMembers(seedBoardAsBen).map((m) => m.id)).toEqual([
      'ben',
      'ana',
      'cara',
      'dev',
      'eli',
    ])
  })

  it('knows who leads', () => {
    expect(amLeader(seedBoard)).toBe(true)
    expect(amLeader(seedBoardAsBen)).toBe(false)
  })

  it('groups tasks by member, including members with none', () => {
    const by = tasksByMember(seedBoard)
    expect(numbers(by.get('ana')!)).toEqual([])
    expect(numbers(by.get('ben')!)).toEqual([1, 5])
    expect(numbers(by.get('cara')!)).toEqual([2])
    expect(numbers(by.get('dev')!)).toEqual([3, 4])
    expect(numbers(by.get('eli')!)).toEqual([6, 7])
  })

  it('counts progress per member', () => {
    const by = tasksByMember(seedBoard)
    expect(progressOf(by.get('ana')!)).toEqual({
      total: 0,
      done: 0,
      inProgress: 0,
      todo: 0,
      blocked: 0,
    })
    expect(progressOf(by.get('ben')!)).toMatchObject({ total: 2, done: 1, todo: 1, blocked: 0 })
    expect(progressOf(by.get('dev')!)).toMatchObject({
      total: 2,
      done: 1,
      inProgress: 1,
      blocked: 1,
    })
    expect(progressOf(seedBoard.tasks)).toEqual({
      total: 7,
      done: 2,
      inProgress: 2,
      todo: 3,
      blocked: 1,
    })
    expect(progressText(progressOf(by.get('ben')!))).toBe('1 of 2 completed')
    expect(progressText(progressOf(by.get('ana')!))).toBe('No tasks yet')
  })

  it('derives blocked from open questions on unfinished tasks only', () => {
    expect(isBlocked(byNumber(3))).toBe(true)
    expect(shownStatus(byNumber(3))).toBe('blocked')
    // cara's question was resolved, so #2 is just in progress.
    expect(shownStatus(byNumber(2))).toBe('in_progress')
    const doneWithQuestion = { ...byNumber(4), open_questions: 1 }
    expect(isBlocked(doneWithQuestion)).toBe(false)
    expect(shownStatus(doneWithQuestion)).toBe('done')
  })

  it('sorts a column under deadline headings', () => {
    const by = tasksByMember(seedBoard)
    const sections = (id: string) =>
      deadlineSections(by.get(id)!, SEED_NOW).map((s) => [s.label, numbers(s.tasks)])
    expect(sections('ben')).toEqual([
      ['Overdue', [5]],
      ['Done', [1]],
    ])
    expect(sections('dev')).toEqual([
      ['Later', [3]],
      ['Done', [4]],
    ])
    expect(sections('eli')).toEqual([
      ['This week', [6]],
      ['No deadline', [7]],
    ])
    expect(sections('ana')).toEqual([])
  })
})

describe('deadline groups', () => {
  const now = new Date(2026, 10, 16, 15, 0) // local 3 PM
  const due = (d: Date | null, status: 'todo' | 'done' = 'todo') =>
    deadlineGroup({ ...byNumber(5), status, deadline: d?.toISOString() ?? null }, now)

  it('splits at today and the next six days, in local time', () => {
    expect(due(new Date(2026, 10, 16, 14, 0))).toBe('overdue')
    expect(due(new Date(2026, 10, 16, 18, 0))).toBe('today')
    expect(due(new Date(2026, 10, 16, 23, 59))).toBe('today')
    expect(due(new Date(2026, 10, 17, 0, 0))).toBe('this_week')
    expect(due(new Date(2026, 10, 22, 23, 59))).toBe('this_week')
    expect(due(new Date(2026, 10, 23, 0, 0))).toBe('later')
    expect(due(null)).toBe('none')
    expect(due(new Date(2026, 10, 1), 'done')).toBe('done')
  })

  it('orders open tasks by deadline then number, done by most recent', () => {
    const t = byNumber(5)
    const tasks = [
      { ...t, id: 'a', number: 9, deadline: new Date(2026, 10, 18).toISOString() },
      { ...t, id: 'b', number: 8, deadline: new Date(2026, 10, 18).toISOString() },
      { ...t, id: 'c', number: 2, deadline: new Date(2026, 10, 17).toISOString() },
      { ...t, id: 'd', number: 1, status: 'done' as const, completed_at: '2026-11-01T00:00:00Z' },
      { ...t, id: 'e', number: 3, status: 'done' as const, completed_at: '2026-11-10T00:00:00Z' },
    ]
    expect(deadlineSections(tasks, now).map((s) => numbers(s.tasks))).toEqual([
      [2, 8, 9],
      [3, 1],
    ])
  })
})

describe('cache patches', () => {
  it('replaces a task in place and keeps number order', () => {
    const next = upsertTask(seedBoard, { ...byNumber(5), status: 'done' })
    expect(numbers(next.tasks)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(next.tasks.find((t) => t.number === 5)!.status).toBe('done')
    expect(seedBoard.tasks.find((t) => t.number === 5)!.status).toBe('todo')
  })

  it('moves a reassigned task to its new column', () => {
    const next = upsertTask(seedBoard, { ...byNumber(6), assignee_id: 'ana' })
    expect(numbers(tasksByMember(next).get('ana')!)).toEqual([6])
    expect(numbers(tasksByMember(next).get('eli')!)).toEqual([7])
  })

  it('drops a soft-deleted task and adds a new one', () => {
    const gone = upsertTask(seedBoard, { ...byNumber(2), deleted_at: '2026-11-16T12:00:00Z' })
    expect(numbers(gone.tasks)).toEqual([1, 3, 4, 5, 6, 7])
    const added = upsertTask(seedBoard, { ...byNumber(2), id: 't9', number: 9 })
    expect(numbers(added.tasks)).toEqual([1, 2, 3, 4, 5, 6, 7, 9])
    expect('deleted_at' in gone.tasks[0]).toBe(false)
  })

  it('turns a member former and keeps seat order', () => {
    const ben = seedBoard.memberships[1]
    const next = upsertMember(seedBoard, { ...ben, status: 'former', left_reason: 'removed' })
    expect(next.memberships.map((m) => m.seat)).toEqual([1, 2, 3, 4, 5])
    expect(columnMembers(next).map((m) => m.id)).toEqual(['ana', 'cara', 'dev', 'ben', 'eli'])
  })
})
