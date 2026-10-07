import path from "node:path"
import { HarnessError } from "./errors.ts"
import { SLUG_PATTERN } from "./schema.ts"

export function globToRegExp(pattern: string): RegExp {
  let expression = ""
  for (let i = 0; i < pattern.length; i++) {
    const current = pattern[i]
    const next = pattern[i + 1]
    if (current === "*" && next === "*") {
      expression += ".*"
      i++
      continue
    }
    if (current === "*") {
      expression += "[^/]*"
      continue
    }
    if (current && "\\.+^${}()|[]".includes(current)) {
      expression += `\\${current}`
      continue
    }
    expression += current ?? ""
  }
  return new RegExp(`^${expression}$`)
}

export function matchesGlob(pattern: string, file: string): boolean {
  return globToRegExp(pattern).test(file)
}

export function assertSafeRelative(relative: string): string {
  const normalized = relative.replaceAll("\\", "/")
  if (path.isAbsolute(normalized)) {
    throw new HarnessError("C23", "output path must be relative")
  }
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new HarnessError("C23", "output path is not confined")
  }
  return normalized
}

export function expectedPublishPath(template: string, slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new HarnessError("C23", "slug is not a safe token")
  }
  if (!template.includes("{slug}")) {
    throw new HarnessError("C23", "output template has no {slug} slot")
  }
  return assertSafeRelative(template.replaceAll("{slug}", slug))
}

export function assertPublishAllowed(
  relative: string,
  allowed: string[],
  forbidden: string[],
): void {
  const normalized = assertSafeRelative(relative)
  if (forbidden.some((pattern) => matchesGlob(pattern, normalized))) {
    throw new HarnessError("C04", `forbidden path: ${normalized}`)
  }
  if (!allowed.some((pattern) => matchesGlob(pattern, normalized))) {
    throw new HarnessError("C03", `path is outside allowed_paths: ${normalized}`)
  }
}

export function resolveInsideRoot(root: string, relative: string): string {
  const normalized = assertSafeRelative(relative)
  const rootResolved = path.resolve(root)
  const target = path.resolve(rootResolved, normalized)
  const back = path.relative(rootResolved, target)
  if (back.startsWith("..") || path.isAbsolute(back)) {
    throw new HarnessError("C23", "resolved path escapes the job root")
  }
  return target
}
