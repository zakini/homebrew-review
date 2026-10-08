import { confirm, intro, outro, select, text } from '@clack/prompts'
import { exitIfCancelled } from './prompts.js'

interface ReviewOptions {
  model?: string
  yes?: true
}

export async function review(target: string | undefined, options: ReviewOptions) {
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
    const ok = options.yes === true || exitIfCancelled(await confirm({ message: `Really remove ${pkg}?` }))
    outro(ok ? `Would remove ${pkg} (hello-world: nothing was uninstalled).` : 'Left unchanged.')
    return
  }

  outro(`Keeping ${pkg}${options.model ? ` (model: ${options.model})` : ''}.`)
}
