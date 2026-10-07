import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { HarnessError } from "./errors.ts"
import { assertPublishAllowed, resolveInsideRoot } from "./paths.ts"
import type { SitePack } from "./sitepack.ts"

const MAX_BYTES = 12 * 1024 * 1024
const MAX_EDGE = 1600

/**
 * アップロードされた画像を、公開してよいバイト列に変える。
 * EXIF / IPTC / XMP は残さず、元のファイル名は公開名にもバイト列にも残さない。
 */
export async function preparePublicImage(input: {
  bytes: Buffer
  sourceName: string
}): Promise<{ file: string; bytes: Buffer }> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_BYTES) {
    throw new HarnessError("C22", "image size is outside the allowed range")
  }

  let output: Buffer
  try {
    output = await sharp(input.bytes, { failOn: "error", unlimited: false })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    throw new HarnessError("C22", "image could not be decoded")
  }

  const meta = await sharp(output).metadata()
  if (meta.format !== "webp" || meta.exif || meta.iptc || meta.xmp) {
    throw new HarnessError("C22", "processed image still carries metadata")
  }

  const digest = createHash("sha256").update(output).digest("hex").slice(0, 16)
  const file = `img-${digest}.webp`
  const sourceStem = path.basename(input.sourceName, path.extname(input.sourceName)).toLowerCase()
  if (sourceStem && file.toLowerCase().includes(sourceStem)) {
    throw new HarnessError("C22", "original file name leaked into the public name")
  }
  if (bufferIncludes(output, input.sourceName)) {
    throw new HarnessError("C22", "original file name leaked into the image bytes")
  }
  return { file, bytes: output }
}

export async function writePublicImage(input: {
  root: string
  pack: SitePack
  kind: "achievement" | "column"
  sourceName: string
  bytes: Buffer
}): Promise<{ relativePath: string; file: string; bytes: Buffer }> {
  const prepared = await preparePublicImage({
    bytes: input.bytes,
    sourceName: input.sourceName,
  })
  const relativePath = `public/images/${input.kind}/${prepared.file}`
  assertPublishAllowed(relativePath, input.pack.allowedPaths, input.pack.forbiddenPaths)
  const target = resolveInsideRoot(input.root, relativePath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, prepared.bytes)
  return { relativePath, file: prepared.file, bytes: prepared.bytes }
}

function bufferIncludes(bytes: Buffer, text: string): boolean {
  if (!text) return false
  return bytes.includes(Buffer.from(text))
}
