import { intro, outro, password } from '@clack/prompts'
import { defineCommand } from 'citty'
import { exitIfCancelled } from '../../prompts.js'

export default defineCommand({
  meta: { name: 'set-key', description: 'Store an API key' },
  async run() {
    intro('brew review config set-key')
    const key = exitIfCancelled(await password({
      message: 'API key',
      validate: value => (value?.trim() ? undefined : 'Required'),
    }))
    outro(`Received a key of ${String(key.length)} characters (not stored yet).`)
  },
})
