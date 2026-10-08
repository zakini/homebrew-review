import { defineCommand } from 'citty'
import { review, reviewArgs } from '../review.js'

export default defineCommand({
  meta: { name: 'check', description: 'Review a single package' },
  args: {
    package: {
      type: 'positional',
      description: 'Package to review',
      required: true,
    },
    ...reviewArgs,
  },
  run: ({ args }) => review(args.package, args),
})
