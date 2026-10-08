import { defineCommand } from 'citty'
import setKey from './set-key.js'
import show from './show.js'

export default defineCommand({
  meta: { name: 'config', description: 'Manage configuration' },
  subCommands: { 'show': show, 'set-key': setKey },
})
