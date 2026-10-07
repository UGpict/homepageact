export type UserRole = "requester" | "technical-reviewer" | "site-admin"

/** 認証の実装前に、Application境界へ注入する開発用ユーザー。 */
export type CurrentUser = {
  id: string
  displayName: string
  roles: UserRole[]
}

export type JobPhase =
  | "DRAFT"
  | "GENERATING"
  | "REQUESTER_REVIEW"
  | "TECHNICAL_REVIEW"
  | "READY_TO_PUBLISH"
  | "GENERATION_FAILED"

export type HumanError = {
  title: string
  message: string
  next: string
  /** 開発者向け。画面の主表示には出さない。 */
  detail?: string
  field?: string
}

export type TagGroup = "components" | "materials" | "methods" | "purposes" | "industries"

export type FormOptions = {
  workContexts: Array<{ id: "customer" | "internal" | "partner"; label: string }>
  tagGroups: Array<{
    id: TagGroup
    label: string
    terms: Array<{ id: string; label: string }>
  }>
}
