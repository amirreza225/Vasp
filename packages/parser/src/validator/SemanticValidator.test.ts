import { describe, expect, it } from 'vitest'
import { parse } from '../parser/Parser.js'
import { SemanticValidator } from './SemanticValidator.js'

function validate(source: string) {
  const ast = parse(source)
  new SemanticValidator().validate(ast)
}

const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`

describe('SemanticValidator', () => {
  it('passes a valid minimal config', () => {
    expect(() => validate(APP)).not.toThrow()
  })

  it('fails when app block is missing', () => {
    // Parse will produce null app — validator catches it
    const ast = parse(APP)
    // Manually break it for testing
    const brokenAst = { ...ast, app: null as unknown as typeof ast.app }
    expect(() => new SemanticValidator().validate(brokenAst)).toThrow('E100_MISSING_APP_BLOCK')
  })

  it('fails when route references unknown page', () => {
    expect(() => validate(`
      ${APP}
      route Home { path: "/" to: NonExistentPage }
    `)).toThrow('E101_UNKNOWN_PAGE_REF')
  })

  it('passes when route references existing page', () => {
    expect(() => validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `)).not.toThrow()
  })

  it('fails when crud has empty operations', () => {
    expect(() => validate(`
      ${APP}
      crud Todo { entity: Todo operations: [] }
    `)).toThrow('E102_EMPTY_CRUD_OPERATIONS')
  })

  it('fails when realtime entity has no crud', () => {
    expect(() => validate(`
      ${APP}
      realtime TodoChannel { entity: Todo events: [created] }
    `)).toThrow('E104_REALTIME_ENTITY_NOT_CRUD')
  })

  it('passes when realtime entity has crud', () => {
    expect(() => validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel { entity: Todo events: [created] }
    `)).not.toThrow()
  })

  it('fails when auth has no methods', () => {
    expect(() => validate(`
      ${APP}
      auth User { userEntity: User methods: [] }
    `)).toThrow('E106_EMPTY_AUTH_METHODS')
  })

  it('fails when query references unknown entity', () => {
    expect(() => validate(`
      ${APP}
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [UnknownEntity]
      }
    `)).toThrow('E108_UNKNOWN_ENTITY_REF')
  })

  it('passes when query references known entity', () => {
    expect(() => validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `)).not.toThrow()
  })

  it('collects multiple errors', () => {
    try {
      validate(`
        ${APP}
        route R1 { path: "/" to: MissingPage1 }
        route R2 { path: "/a" to: MissingPage2 }
      `)
    } catch (e: unknown) {
      expect((e as { diagnostics: unknown[] }).diagnostics).toHaveLength(2)
    }
  })
})
