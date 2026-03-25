import { createInterface } from 'node:readline'

/** Returns true when stdin is an interactive terminal */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY)
}

/** Ask a yes/no question. Returns true for 'y'/'Y', false for anything else. */
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]'
  const answer = await prompt(`${question} ${hint}: `)
  if (!answer.trim()) return defaultYes
  return /^y(es)?$/i.test(answer.trim())
}

/** Ask a free-text question. Returns the trimmed answer. */
export function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Present a numbered list of choices and return the index (0-based) of the selection.
 * Repeats until a valid number is entered.
 */
export async function select(question: string, choices: string[]): Promise<number> {
  process.stdout.write(`\n${question}\n`)
  choices.forEach((c, i) => {
    process.stdout.write(`  ${i + 1}) ${c}\n`)
  })
  while (true) {
    const answer = await prompt(`\n  Enter choice [1-${choices.length}]: `)
    const n = parseInt(answer.trim(), 10)
    if (!isNaN(n) && n >= 1 && n <= choices.length) return n - 1
    process.stdout.write(`  Please enter a number between 1 and ${choices.length}.\n`)
  }
}
