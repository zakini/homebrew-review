#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import check from './commands/check.js'
import config from './commands/config/index.js'
import review from './commands/review.js'
import { reviewArgs } from './review.js'

const main = defineCommand({
  meta: {
    name: 'brew-review',
    version: '0.1.0',
    description: 'Review your installed Homebrew packages and remove the ones you no longer use',
  },
  // Declared here too so flags are parsed before the default subcommand and show in --help
  args: reviewArgs,
  subCommands: { review, check, config },
  default: 'review',
})

await runMain(main)
