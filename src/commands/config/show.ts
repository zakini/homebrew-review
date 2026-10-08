import { Command } from '@commander-js/extra-typings'

export default new Command('show')
  .description('Show the current configuration')
  .action(() => {
    console.log('No configuration yet.')
  })
