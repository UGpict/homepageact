import { existsSync } from "node:fs"
import path from "node:path"
import {
  confidentialTermsFromEnv,
  createAchievementDraft,
  currentUserFromEnv,
  getFormOptions,
  getJob,
  prepareAchievementImage,
  providerFromEnv,
  readPublicImage,
  type AppContext,
} from "sitebot/application"

export function appContext(): AppContext {
  const packRoot = resolvePackRoot()
  const dataRoot = process.env.SITEBOT_DATA_ROOT
    ? path.resolve(process.env.SITEBOT_DATA_ROOT)
    : path.join(packRoot, "data/sitebot")
  return {
    packRoot,
    dataRoot,
    user: currentUserFromEnv(),
    provider: providerFromEnv(),
    confidentialTerms: confidentialTermsFromEnv(),
  }
}

export function formOptions() {
  return getFormOptions(appContext())
}

export { createAchievementDraft, getJob, prepareAchievementImage, readPublicImage }

function resolvePackRoot(): string {
  if (process.env.SITEBOT_PACK_ROOT) return path.resolve(process.env.SITEBOT_PACK_ROOT)
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), ".."),
  ]
  return candidates.find((candidate) => existsSync(path.join(candidate, "sitebot.yaml"))) ?? candidates[1] ?? process.cwd()
}
