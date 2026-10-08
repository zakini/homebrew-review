import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'show', description: 'Show the current configuration' },
  run() {
    console.log('No configuration yet.')
  },
})
