-- Store the GitHub OAuth access token (encrypted, see functions/_shared/crypto.ts)
-- so signed-in GitHub users can file issues and react on the repo as themselves.
-- Only ever set for rows where provider = 'github'.

ALTER TABLE users ADD COLUMN github_access_token TEXT;
