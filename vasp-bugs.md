# Vasp Bugs

Observed during DevBoard scaffolding:

1. **Bug:** `drizzle/schema.ts` incorrectly imports `relations` from `drizzle-orm/pg-core`. It should be imported from `drizzle-orm`.
   - **File:** `drizzle/schema.ts`
   - **Error:** `Module '"drizzle-orm/pg-core"' has no exported member 'relations'.`

2. **Bug:** `@onDelete(setNull)` generates `{ onDelete: 'setNull' }` which is invalid for Drizzle. It should generate `'set null'`.
   - **File:** `drizzle/schema.ts`
   - **Error:** `Type '"setNull"' is not assignable to type 'UpdateDeleteAction | undefined'. Did you mean '"set null"'?`

3. **Bug:** Generated server files are importing other TypeScript files with a `.ts` extension (e.g. `import { db } from '../db/client.ts'`), causing TS5097 errors unless `allowImportingTsExtensions` is enabled in `tsconfig.json`. Vasp docs say imports should end with `.js` in TS projects, but the generator emitted `.ts`.
   - **Files:** `server/**/*.ts`
   - **Error:** `An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.`

4. **Bug:** Missing Node types for `process.env`.
   - **Files:** `server/auth/middleware.ts`, `server/auth/plugin.ts`
   - **Error:** `Cannot find name 'process'. Do you need to install type definitions for node?`

5. **Bug:** Typings in `realtime` generated files implicitly have `any` type and are missing `_room` definition in `ws.data`.
   - **Files:** `server/routes/realtime/taskChannel.ts`
   - **Error:** `Parameter 'roomId' implicitly has an 'any' type.` and `Property '_room' does not exist on type...`

6. **Bug:** The generated query and action handler endpoints pass an object `{ db, user, args }` into the handler function, but the stub signatures expect `(args, context)`. For example, `server/routes/queries/getProjectsWithStats.ts` calls `getProjectsWithStats({ db, user, args: query })`, resulting in `Expected 2 arguments, but got 1.`
   - **Files:** `server/routes/queries/*.ts`, `server/routes/actions/*.ts`
   - **Error:** `Expected 2 arguments, but got 1.`

7. **Bug:** `vite-env.d.ts` or similar is missing for Vite's `import.meta.env` typings, or `tsconfig.json` does not include `"types": ["vite/client"]`.
   - **Files:** `src/vasp/auth.ts`, `src/vasp/client/*.ts`, `src/vasp/plugin.ts`
   - **Error:** `Property 'env' does not exist on type 'ImportMeta'.`

8. **Bug:** Missing implicit `any` types for `one` and `many` in `relations()` callback.
   - **Files:** `drizzle/schema.ts`
   - **Error:** `Binding element 'one' implicitly has an 'any' type.`

9. **Bug:** Mismatched types for `createdAt` and `updatedAt` in CRUD routes (`string` vs `Date`).
   - **Files:** `server/routes/crud/*.ts`
   - **Error:** `Type 'string | undefined' is not assignable to type 'SQL<unknown> | PgColumn<...> | Date | undefined'.`

These issues indicate bugs in the Vasp generation templates (`templates/shared/server/*.hbs`, `drizzle-schema.hbs`, `packages/generator/src/generators/*.ts`) and possibly `tsconfig.json` generation.
