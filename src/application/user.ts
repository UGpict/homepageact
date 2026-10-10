import type { CurrentUser } from "./types.ts"

/** UIへ固定の氏名を埋め込まず、環境変数から開発用ユーザーを決める。 */
export function currentUserFromEnv(env: NodeJS.ProcessEnv = process.env): CurrentUser {
  const id = env.SITEBOT_DEV_USER_ID?.trim() || "dev-requester"
  const displayName = env.SITEBOT_DEV_USER_NAME?.trim() || "開発用ユーザー"
  const role = env.SITEBOT_DEV_USER_ROLE === "technical-reviewer" ? "technical-reviewer" : "requester"
  return { id, displayName, roles: [role] }
}
