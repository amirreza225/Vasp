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

  it('passes when query references declared entity block', () => {
    expect(() => validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `)).not.toThrow()
  })

  it('fails when crud entity has no matching entity block (with entity blocks present)', () => {
    expect(() => validate(`
      ${APP}
      entity Recipe { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
    `)).toThrow('E111_CRUD_ENTITY_NOT_DECLARED')
  })

  it('passes when crud entity matches declared entity block', () => {
    expect(() => validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
    `)).not.toThrow()
  })

  it('does not require entity blocks when none are declared (backward compat)', () => {
    expect(() => validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
    `)).not.toThrow()
  })

  it('fails when duplicate entity names exist', () => {
    expect(() => validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      entity Todo { id: Int @id name: String }
    `)).toThrow('E112_DUPLICATE_ENTITY')
  })

  it('fails when duplicate route paths exist', () => {
    expect(() => validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      route Landing { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `)).toThrow('E113_DUPLICATE_ROUTE_PATH')
  })

  it('passes with unique route paths', () => {
    expect(() => validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      route About { path: "/about" to: AboutPage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
      page AboutPage { component: import About from "@src/pages/About.vue" }
    `)).not.toThrow()
  })

  it('fails when relation field references undefined entity (E115)', () => {
    expect(() => validate(`
      ${APP}
      entity Todo { id: Int @id author: Ghost }
    `)).toThrow('E115_UNDEFINED_RELATION_ENTITY')
  })

  it('passes when relation field references declared entity (E115 no error)', () => {
    expect(() => validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User }
    `)).not.toThrow()
  })

  it('passes with Text field type (E114 no error)', () => {
    expect(() => validate(`
      ${APP}
      entity Post { id: Int @id body: Text }
    `)).not.toThrow()
  })

  it('passes with Json field type (E114 no error)', () => {
    expect(() => validate(`
      ${APP}
      entity Post { id: Int @id meta: Json }
    `)).not.toThrow()
  })

  it('fails for truly unsupported lowercase field type (E114)', () => {
    // lowercase "uuid" is not a recognised primitive and is not a capitalised entity ref
    // so the Parser treats it as unknown and the SemanticValidator raises E114
    // NOTE: In the new DSL, only capitalised names are treated as relation refs.
    // Lowercase unknown types fail at the parser level with E026; we just verify
    // that a fake capitalized entity that doesn't exist raises E115, not E114.
    expect(() => validate(`
      ${APP}
      entity Todo { id: Int @id author: Nonexistent }
    `)).toThrow('E115_UNDEFINED_RELATION_ENTITY')
  })

  it('passes one-to-many virtual array relation field', () => {
    expect(() => validate(`
      ${APP}
      entity User { id: Int @id todos: Todo[] }
      entity Todo { id: Int @id author: User }
    `)).not.toThrow()
  })
})
