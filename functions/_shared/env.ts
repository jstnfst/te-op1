export interface Env {
  DB: D1Database
  SITE_URL: string
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  YAHOO_CLIENT_ID: string
  YAHOO_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

/** What we store inside the session JWT. */
export interface SessionUser {
  uid: number
  provider: string
  email: string | null
  name: string | null
  avatar: string | null
}
