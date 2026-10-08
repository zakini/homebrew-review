import { defineCommand } from 'citty'
import { review, reviewArgs } from '../review.js'

export default defineCommand({
  meta: { name: 'review', description: 'Review all installed packages (default)' },
  args: reviewArgs,
  run: ({ args }) => review(undefined, args),
})
