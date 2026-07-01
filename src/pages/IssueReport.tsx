import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { apiGet, apiSend } from "../api"
import RequireGithubIssues from "../githubGate"

type Kind = "bug" | "feature"
type Status = "planned" | "in-progress" | "shipped" | "open"

interface Issue {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  htmlUrl: string
  createdAt: string
  authorLogin: string
  authorAvatar: string | null
  upvotes: number
  kind: Kind
  status: Status
  upvoted: boolean
}

const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  "in-progress": "In progress",
  shipped: "Shipped",
}

const FOOTER_RE = /\n\n---\n_Filed via the OP-1 Field site issues page\._\s*$/

function excerpt(body: string): string {
  const stripped = body.replace(FOOTER_RE, "").trim()
  return stripped.length > 320 ? stripped.slice(0, 320).trimEnd() + "…" : stripped
}

function IssueUpvote({ issue, onChanged }: { issue: Issue; onChanged: (n: number, upvoted: boolean, delta: number) => void }) {
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    const wasUpvoted = issue.upvoted
    onChanged(issue.number, !wasUpvoted, wasUpvoted ? -1 : 1) // optimistic
    try {
      await apiSend(`/api/issues/${issue.number}/upvote`, wasUpvoted ? "DELETE" : "POST")
    } catch {
      onChanged(issue.number, wasUpvoted, wasUpvoted ? 1 : -1) // revert
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={"btn upvote" + (issue.upvoted ? " active" : "")}
      onClick={toggle}
      disabled={busy}
      aria-pressed={issue.upvoted}
      title={issue.upvoted ? "Remove upvote" : "Upvote"}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 1L9 6H6.5V9H3.5V6H1L5 1Z" fill="currentColor" />
      </svg>
      {issue.upvotes}
    </button>
  )
}

function ReportForm({ kind, setKind }: { kind: Kind; setKind: (k: Kind) => void }) {
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState<string>("")

  async function submit() {
    setErr("")
    setOk("")
    if (!summary.trim() || !description.trim()) {
      setErr("Summary and description are both required.")
      return
    }
    setBusy(true)
    try {
      const issue = await apiSend<Issue>("/api/issues", "POST", { kind, summary, description })
      setSummary("")
      setDescription("")
      window.dispatchEvent(new CustomEvent("te-op1:issue-created", { detail: issue }))
      setOk(issue.htmlUrl)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="type-toggle" role="group" aria-label="Report type">
        <button
          className={"type-btn bug" + (kind === "bug" ? " active" : "")}
          onClick={() => setKind("bug")}
          aria-pressed={kind === "bug"}
        >
          Bug
        </button>
        <button
          className={"type-btn feature" + (kind === "feature" ? " active" : "")}
          onClick={() => setKind("feature")}
          aria-pressed={kind === "feature"}
        >
          Feature
        </button>
      </div>

      <div className="issue-form">
        <label className="field-label" htmlFor="issue-summary">Summary</label>
        <input
          id="issue-summary"
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={kind === "bug" ? "e.g. Patch editor drops the LFO tab on save" : "e.g. Add a dark-mode toggle for the scope"}
          maxLength={200}
        />
        <label className="field-label" htmlFor="issue-description">Description</label>
        <textarea
          id="issue-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Steps to reproduce, expected vs. actual, or what the feature should do…"
          style={{ minHeight: 140 }}
          maxLength={4000}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : kind === "bug" ? "Submit bug report" : "Submit feature request"}
          </button>
        </div>
      </div>

      {err && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
      {ok && (
        <p className="ok" style={{ marginTop: 10 }}>
          Filed on GitHub - <a href={ok} target="_blank" rel="noreferrer" style={{ color: "inherit", fontWeight: 700 }}>view issue →</a>
        </p>
      )}
    </>
  )
}

function IssueList({ kind }: { kind: Kind }) {
  const [items, setItems] = useState<Issue[] | null>(null)
  const [err, setErr] = useState("")

  function load() {
    setErr("")
    apiGet<{ items: Issue[] }>(`/api/issues?kind=${kind}`)
      .then((d) => setItems(d.items))
      .catch((e) => setErr((e as Error).message))
  }

  useEffect(() => {
    setItems(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  useEffect(() => {
    function onCreated(e: Event) {
      const issue = (e as CustomEvent<Issue>).detail
      if (issue.kind === kind) setItems((prev) => (prev ? [issue, ...prev] : [issue]))
    }
    window.addEventListener("te-op1:issue-created", onCreated)
    return () => window.removeEventListener("te-op1:issue-created", onCreated)
  }, [kind])

  function applyVote(number: number, upvoted: boolean, delta: number) {
    setItems((prev) => prev && prev.map((i) => (i.number === number ? { ...i, upvoted, upvotes: i.upvotes + delta } : i)))
  }

  if (err) return <p className="error">{err}</p>
  if (items === null) return <p className="muted">Loading…</p>
  if (items.length === 0) return <p className="muted">No {kind === "bug" ? "bug reports" : "feature requests"} yet - be the first.</p>

  return (
    <div className="issue-list">
      {items.map((issue) => (
        <article className="issue-item" key={issue.number}>
          <div className="issue-item-head">
            <span className={"chip status-" + issue.status}>{STATUS_LABEL[issue.status]}</span>
            <a className="issue-item-title" href={issue.htmlUrl} target="_blank" rel="noreferrer">{issue.title}</a>
            <IssueUpvote issue={issue} onChanged={applyVote} />
          </div>
          {excerpt(issue.body) && <p className="issue-item-body">{excerpt(issue.body)}</p>}
        </article>
      ))}
    </div>
  )
}

function IssueReportHome() {
  const [params, setParams] = useSearchParams()
  const kind: Kind = params.get("type") === "feature" ? "feature" : "bug"

  function setKind(k: Kind) {
    setParams({ type: k }, { replace: true })
  }

  return (
    <>
      <h1 className="hero-title">Report an issue</h1>
      <p className="lead">
        Reports post as a GitHub issue on your account, tagged {kind === "bug" ? "bug" : "enhancement"}.
      </p>

      <ReportForm kind={kind} setKind={setKind} />

      <h2>{kind === "bug" ? "Open bug reports" : "Open feature requests"}</h2>
      <IssueList kind={kind} />
    </>
  )
}

export default function IssueReport() {
  return (
    <RequireGithubIssues title="Report an issue">
      <IssueReportHome />
    </RequireGithubIssues>
  )
}
