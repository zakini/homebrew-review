import { intro, outro, password } from '@clack/prompts'
import { Command } from '@commander-js/extra-typings'
import { exitIfCancelled } from '../../prompts.js'

export default new Command('set-key')
  .description('Store an API key')
  .action(async () => {
    intro('brew review config set-key')
    const key = exitIfCancelled(await password({
      message: 'API key',
      validate: value => (value?.trim() ? undefined : 'Required'),
    }))
    outro(`Received a key of ${String(key.length)} characters (not stored yet).`)
  })
