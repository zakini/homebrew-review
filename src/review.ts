import { confirm, intro, outro, select, text } from '@clack/prompts'
import { exitIfCancelled } from './prompts.js'

export const reviewArgs = {
  model: {
    type: 'string',
    description: 'Model ID to use',
    valueHint: 'id',
  },
  yes: {
    type: 'boolean',
    alias: 'y',
    description: 'Skip the confirmation prompt',
  },
} as const

export async function review(target: string | undefined, args: { model?: string | undefined, yes?: boolean | undefined }) {
  intro('brew review')

  const pkg = target
    ?? exitIfCancelled(await text({
      message: 'Which package would you like to review?',
      placeholder: 'wget',
    }))

  const action = exitIfCancelled(await select({
    message: `What should happen with ${pkg}?`,
    options: [
      { value: 'keep', label: 'Keep it' },
      { value: 'remove', label: 'Remove it' },
    ],
  }))

  if (action === 'remove') {
    const ok = args.yes === true || exitIfCancelled(await confirm({ message: `Really remove ${pkg}?` }))
    outro(ok ? `Would remove ${pkg} (hello-world: nothing was uninstalled).` : 'Left unchanged.')
    return
  }

  outro(`Keeping ${pkg}${args.model ? ` (model: ${args.model})` : ''}.`)
}
