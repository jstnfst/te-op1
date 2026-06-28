import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../auth"

const PROVIDERS: Array<[string, string]> = [
  ["google", "Continue with Google"],
  ["microsoft", "Continue with Microsoft"],
  ["yahoo", "Continue with Yahoo"],
  ["github", "Continue with GitHub"],
]

export default function Login() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  useEffect(() => {
    if (user) navigate("/")
  }, [user, navigate])

  return (
    <>
      <p className="eyebrow">Account</p>
      <h1 className="hero-title">Log in</h1>
      <p className="lead">
        Sign in to browse the community library, upload presets, and manage your own. The format
        reference &mdash; knob layout, value mappings, and the patch viewer &mdash; stays open to everyone.
      </p>
      {params.get("error") && <p className="error">Login failed. Please try again.</p>}
      <div className="provider-list">
        {PROVIDERS.map(([id, label]) => (
          <a key={id} className="btn primary" href={`/api/auth/${id}`}>
            {label}
          </a>
        ))}
      </div>
    </>
  )
}
