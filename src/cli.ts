#!/usr/bin/env node
import { Command } from '@commander-js/extra-typings'
import config from './commands/config/index.js'
import { review } from './review.js'

const program = new Command('brew-review')
  .version('0.1.0')
  .description('Review your installed Homebrew packages and remove the ones you no longer use')
  .argument('[package]', 'package to review (default: all installed on request)')
  .option('--model <id>', 'model ID to use')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(review)
  .addCommand(config)

await program.parseAsync()
