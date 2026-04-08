import { db } from './client.ts'
import { seed } from '../../src/seed.ts'

async function runSeed() {
  await seed({ db })
  console.log('✅ Seed completed')
}

runSeed().catch((error) => {
  console.error('❌ Seed failed', error)
  process.exit(1)
})
