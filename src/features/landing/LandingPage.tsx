import { useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Button, cn } from '@/ui'
import './landing.css'

const people = [
  { name: 'Jamie', role: 'Leader', tasks: ['Write the proposal', 'Gather references'] },
  { name: 'Alex', role: 'Member', tasks: ['Design the presentation', 'Choose a visual direction'] },
  { name: 'Sam', role: 'Member', tasks: ['Review the final draft', 'Prepare interview notes'] },
]

export function LandingPage() {
  const [member, setMember] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [resolved, setResolved] = useState(false)
  const counts = [completed ? 2 : 1, 0, 1]
  const total = counts.reduce((sum, count) => sum + count, 0)
  return (
    <div className="landing mx-auto max-w-[1440px]">
      <header className="landing-nav">
        <Link to="/" className="workspace-brand">
          Taskahan
        </Link>
        <nav aria-label="Account" className="flex items-center gap-6">
          <Link to="/login" className="text-body hover:underline">
            Log in
          </Link>
          <Link to="/signup" className="landing-action hidden sm:inline-flex">
            Create account
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <h1>
            Your people.
            <span className="landing-faces" aria-hidden="true">
              {people.map((p, i) => (
                <Avatar key={p.name} seat={i + 1} name={p.name} size={52} />
              ))}
            </span>
            <br />
            One shared board.
          </h1>
          <div className="landing-intro">
            <p>
              Taskahan gives every person a column, so your group can see who’s doing what—and who
              needs help.
            </p>
            <Link to="/signup" className="landing-action">
              Create account
            </Link>
          </div>
          <section className="landing-demo" aria-label="Interactive sample task board">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-title font-medium">Design project</h2>
                <p className="mt-1 text-label text-muted">3 members · Student group project</p>
              </div>
              <span className="text-label text-muted">Sample board · Try the controls</span>
            </div>
            <nav aria-label="Demo members" className="mb-5 flex gap-2 sm:hidden">
              {people.map((p, i) => (
                <Button
                  key={p.name}
                  className="flex-1 px-2"
                  variant={member === i ? 'primary' : 'secondary'}
                  aria-pressed={member === i}
                  onClick={() => setMember(i)}
                >
                  {p.name}
                </Button>
              ))}
            </nav>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {people.map((p, i) => (
                <div key={p.name} className={cn(member !== i && 'hidden sm:block')}>
                  <div className="flex items-center gap-3 border-b border-line pb-4">
                    <Avatar seat={i + 1} name={p.name} />
                    <div>
                      {p.name}
                      <p className="text-label text-muted">{p.role}</p>
                    </div>
                  </div>
                  {p.tasks.map((name, j) => {
                    const blocked = i === 1 && j === 0 && !resolved
                    const done = (i !== 1 && j === 1) || (i === 0 && j === 0 && completed)
                    const status = blocked
                      ? 'Blocked · Open question'
                      : done
                        ? 'Done'
                        : i === 2
                          ? 'To do'
                          : 'In progress'
                    return (
                      <div
                        key={name}
                        className="flex min-h-32 flex-col items-start gap-3 border-b border-line py-5"
                      >
                        <p className="text-body">{name}</p>
                        <p
                          className={cn(
                            'text-label',
                            blocked ? 'text-blocked' : done ? 'text-done-text' : 'text-muted',
                          )}
                        >
                          {status}
                        </p>
                        {i === 0 && j === 0 && (
                          <button
                            type="button"
                            className="min-h-8 text-label underline underline-offset-4"
                            onClick={() => setCompleted(!completed)}
                          >
                            {completed ? 'Reopen task' : 'Mark done'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3 text-label text-muted">
              <p aria-live="polite">{total} of 6 tasks completed</p>
              <p>Changes here are just a demo.</p>
            </div>
          </section>
        </section>
        <section className="landing-section">
          <div>
            <h2>
              Get unstuck,
              <br />
              in context.
            </h2>
            <p>
              Questions stay with their task. When someone needs an answer, their task becomes
              Blocked. The group can see the question and help.
            </p>
          </div>
          <div className="landing-example">
            <p className="mb-5 text-label text-muted">Design the presentation · Alex</p>
            <p className="mb-5 text-title">
              Should we include the interview findings in this version?
            </p>
            {resolved ? (
              <>
                <div className="rounded-md bg-sunken p-4">
                  <p className="text-label text-muted">Jamie · Leader</p>
                  <p className="mt-2 text-body">Yes—include the three main findings.</p>
                </div>
                <p role="status" className="mt-4 text-label text-muted">
                  Resolved · The task is back in progress.
                </p>
                <Button variant="quiet" className="mt-3" onClick={() => setResolved(false)}>
                  Reset demo
                </Button>
              </>
            ) : (
              <Button onClick={() => setResolved(true)}>Try resolving the question</Button>
            )}
          </div>
        </section>
        <section className="landing-section">
          <div>
            <h2>
              See everyone’s
              <br />
              progress.
            </h2>
            <p>
              Completed work, work in progress, and unanswered questions are visible to the whole
              group. No separate status update to write.
            </p>
          </div>
          <div className="landing-example">
            <p className="mb-4 text-label text-muted">Design project · Task progress</p>
            {people.map((p, i) => (
              <div key={p.name} className="py-4">
                <div className="flex justify-between gap-3 text-body">
                  <span>{p.name}</span>
                  <span>{counts[i]} of 2 completed</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${p.name}'s progress`}
                  aria-valuemin={0}
                  aria-valuemax={2}
                  aria-valuenow={counts[i]}
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-track"
                >
                  <div className="h-full bg-done" style={{ width: `${counts[i] * 50}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="landing-faq">
          <h2>Before you join</h2>
          <div>
            <h3>How do groups start?</h3>
            <p>
              Create an account with a username and password. Start a group as its Leader, or join
              one with its 8-letter code.
            </p>
          </div>
          <div>
            <h3>What if someone leaves?</h3>
            <p>
              Their tasks and messages stay. Their column becomes Former member, and another member
              can take over their tasks.
            </p>
          </div>
          <div>
            <h3>Can I reset a password?</h3>
            <p>
              No. Taskahan uses no email and offers no password reset. Keep your password safe.
              Accounts inactive for 30 days are deleted.
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-closing">
        <h2>
          Give everyone
          <br />a place.
        </h2>
        <Link to="/signup" className="landing-action">
          Create account
        </Link>
      </footer>
    </div>
  )
}
