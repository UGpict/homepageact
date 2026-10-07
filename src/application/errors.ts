import { HarnessError } from "../errors.ts"
import type { HumanError } from "./types.ts"

const KNOWN: Record<string, Omit<HumanError, "detail" | "field">> = {
  C03: {
    title: "保存先を確認できませんでした",
    message: "この操作の保存先が、許可された場所にありません。",
    next: "入力を見直してください。解決しない場合は担当者に連絡してください。",
  },
  C04: {
    title: "保存できない場所です",
    message: "この操作では、その場所へファイルを書けません。",
    next: "入力を見直してください。解決しない場合は担当者に連絡してください。",
  },
  C05: {
    title: "入力内容を確認してください",
    message: "必要な項目の形式が、サイトのルールと合っていません。",
    next: "赤く示された項目を修正して、もう一度下書きを作成してください。",
  },
  C06: {
    title: "下書きが入力内容と合いませんでした",
    message: "作成された文章が、入力した工程と一致しません。",
    next: "工程の内容を確認して、もう一度下書きを作成してください。",
  },
  C07: {
    title: "画像の対応を確認してください",
    message: "工程と画像の組み合わせが一致しません。",
    next: "使用画像を選び直して、もう一度下書きを作成してください。",
  },
  C08: {
    title: "リンク先を確認できませんでした",
    message: "存在しないページへのリンクが含まれています。",
    next: "もう一度下書きを作成してください。繰り返す場合は担当者に連絡してください。",
  },
  C10: {
    title: "公開できない情報が含まれている可能性があります",
    message: "入力内容または画像に、機密情報として登録されている語句が見つかりました。",
    next: "該当箇所を確認して修正してください。",
  },
  C17: {
    title: "確認を記録できませんでした",
    message: "依頼した本人は、技術確認を完了できません。",
    next: "技術担当者に確認を依頼してください。",
  },
  C18: {
    title: "確認情報の扱いを止めました",
    message: "公開する本文に、確認記録を混ぜることはできません。",
    next: "この下書きは使わず、もう一度作成してください。",
  },
  C20: {
    title: "確認が必要な内容を確定できませんでした",
    message: "出典または確認箇所が、入力した工程と結びついていません。",
    next: "工程と画像を確認して、もう一度下書きを作成してください。",
  },
  C22: {
    title: "画像を処理できませんでした",
    message: "このファイルは画像として受け取れないか、サイズが大きすぎます。",
    next: "別の画像を選んで、もう一度アップロードしてください。",
  },
  C23: {
    title: "保存先を確認できませんでした",
    message: "ファイルの保存先がルールから外れています。",
    next: "画面からやり直してください。保存先を自分で指定する必要はありません。",
  },
  U16: {
    title: "この操作はまだ行えません",
    message: "複数のファイルを同時に変更する操作は、停止しています。",
    next: "実績の新規作成だけを行ってください。",
  },
  RECIPE_DISABLED: {
    title: "この操作はまだ行えません",
    message: "選んだ作業は、現在停止しています。",
    next: "実績の追加を選んでください。",
  },
  EXECUTOR: {
    title: "この操作はまだ行えません",
    message: "自動でファイルを編集する方式は、この画面では使いません。",
    next: "実績の追加を選んでください。",
  },
}

export function harnessErrorToHuman(error: HarnessError): HumanError {
  const known = KNOWN[error.code]
  return {
    title: known?.title ?? "下書きを作成できませんでした",
    message: known?.message ?? "安全のための確認で処理を止めました。",
    next: known?.next ?? "入力内容を見直すか、担当者に連絡してください。",
    detail: error.message,
  }
}

export function inputError(
  title: string,
  message: string,
  next: string,
  field?: string,
  detail?: string,
): HumanError {
  return { title, message, next, field, detail }
}
