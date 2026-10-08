import { Command } from '@commander-js/extra-typings'
import setKey from './set-key.js'
import show from './show.js'

export default new Command('config')
  .description('Manage configuration')
  .addCommand(show)
  .addCommand(setKey)
