import { describe, expect, it } from 'vitest'
import { toCamelCase, toKebabCase, toPascalCase, TemplateEngine } from './TemplateEngine.js'

describe('TemplateEngine helpers', () => {
  const engine = new TemplateEngine()

  it('camelCase', () => {
    expect(engine.renderString('{{camelCase name}}', { name: 'get-todos' })).toBe('getTodos')
    expect(engine.renderString('{{camelCase name}}', { name: 'MyTodoApp' })).toBe('myTodoApp')
  })

  it('pascalCase', () => {
    expect(engine.renderString('{{pascalCase name}}', { name: 'get-todos' })).toBe('GetTodos')
    expect(engine.renderString('{{pascalCase name}}', { name: 'myApp' })).toBe('MyApp')
  })

  it('kebabCase', () => {
    expect(engine.renderString('{{kebabCase name}}', { name: 'MyTodoApp' })).toBe('my-todo-app')
    expect(engine.renderString('{{kebabCase name}}', { name: 'getTodos' })).toBe('get-todos')
  })

  it('join', () => {
    expect(engine.renderString('{{join arr ", "}}', { arr: ['a', 'b', 'c'] })).toBe('a, b, c')
    expect(engine.renderString('{{join arr " | "}}', { arr: ['x'] })).toBe('x')
  })

  it('importPath rewrites .js to .ts when ext is ts', () => {
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/queries.js', ext: 'ts' })).toBe('@src/queries.ts')
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/queries.js', ext: 'js' })).toBe('@src/queries.js')
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/pages/Home.vue', ext: 'ts' })).toBe('@src/pages/Home.vue')
  })

  it('eq helper', () => {
    expect(engine.renderString('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 'x', b: 'x' })).toBe('yes')
    expect(engine.renderString('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 'x', b: 'y' })).toBe('no')
  })

  it('includes helper', () => {
    expect(engine.renderString('{{#if (includes arr item)}}yes{{else}}no{{/if}}', { arr: ['a', 'b'], item: 'b' })).toBe('yes')
    expect(engine.renderString('{{#if (includes arr item)}}yes{{else}}no{{/if}}', { arr: ['a', 'b'], item: 'c' })).toBe('no')
  })

  it('renders basic template', () => {
    const result = engine.renderString('Hello {{name}}!', { name: 'Vasp' })
    expect(result).toBe('Hello Vasp!')
  })

  it('throws GeneratorError for unknown template key', () => {
    expect(() => engine.render('nonexistent.hbs', {})).toThrow('Template not found')
  })
})

describe('String transform utils', () => {
  it('toCamelCase', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld')
    expect(toCamelCase('MyTodo')).toBe('myTodo')
    expect(toCamelCase('get_todos')).toBe('getTodos')
  })

  it('toPascalCase', () => {
    expect(toPascalCase('hello-world')).toBe('HelloWorld')
    expect(toPascalCase('getTodos')).toBe('GetTodos')
  })

  it('toKebabCase', () => {
    expect(toKebabCase('MyTodoApp')).toBe('my-todo-app')
    expect(toKebabCase('getTodos')).toBe('get-todos')
  })
})
