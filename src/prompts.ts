import { cancel, isCancel } from '@clack/prompts'

export function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel('Cancelled.')
    process.exit(130)
  }
  return value as Exclude<T, symbol>
}
