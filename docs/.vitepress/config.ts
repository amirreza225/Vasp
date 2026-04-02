import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Vasp',
  description: 'Declarative full-stack framework for Vue developers',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/' },
      { text: 'DSL Reference', link: '/dsl/' },
      { text: 'CLI', link: '/cli/' },
      { text: 'Features', link: '/features/' },
      { text: 'API / Reference', link: '/api/' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'GitHub', link: 'https://github.com/amirreza225/Vasp' },
    ],
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: {
              title: 4,
              text: 2,
            },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/amirreza225/Vasp' }],
    footer: {
      message: 'Released under the Apache License 2.0.',
      copyright: 'Copyright © 2026 Vasp contributors',
    },
    sidebar: [
      {
        text: 'Introduction / Getting Started',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/guide/' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Create Your First Project', link: '/guide/create-project' },
        ],
      },
      {
        text: 'Guide',
        collapsed: false,
        items: [
          { text: 'Generated Project Structure', link: '/guide/project-structure' },
          { text: 'Frontend Integration', link: '/guide/frontend-integration' },
        ],
      },
      {
        text: 'The .vasp DSL',
        collapsed: false,
        items: [
          { text: 'DSL Overview', link: '/dsl/' },
          { text: 'app Block', link: '/dsl/app' },
          { text: 'entity Block', link: '/dsl/entity' },
          { text: 'Queries, Actions, CRUD, API', link: '/dsl/data-flow' },
          { text: 'Advanced Blocks', link: '/dsl/advanced' },
        ],
      },
      {
        text: 'CLI Reference',
        collapsed: false,
        items: [
          { text: 'CLI Overview', link: '/cli/' },
          { text: 'All Commands', link: '/cli/commands' },
        ],
      },
      {
        text: 'Features',
        collapsed: false,
        items: [
          { text: 'Feature Overview', link: '/features/' },
          { text: 'Authentication & RBAC', link: '/features/auth' },
          { text: 'CRUD', link: '/features/crud' },
          { text: 'Realtime & Jobs', link: '/features/realtime-jobs' },
          { text: 'Admin Panel & Auto Pages', link: '/features/admin-autopage' },
        ],
      },
      {
        text: 'VS Code Extension',
        collapsed: true,
        items: [{ text: 'Editor Support', link: '/extension/vscode' }],
      },
      {
        text: 'Customization & Extending Templates',
        collapsed: true,
        items: [{ text: 'Plugins & Overrides', link: '/customization/templates-plugins' }],
      },
      {
        text: 'Deployment & Production',
        collapsed: true,
        items: [{ text: 'Deploying Vasp Apps', link: '/deployment/production' }],
      },
      {
        text: 'Troubleshooting',
        collapsed: true,
        items: [{ text: 'Common Problems', link: '/troubleshooting' }],
      },
      {
        text: 'API Reference',
        collapsed: true,
        items: [{ text: 'Monorepo Packages', link: '/api/' }],
      },
      {
        text: 'Changelog',
        collapsed: true,
        items: [{ text: 'Release Notes', link: '/changelog' }],
      },
      {
        text: 'Contributing Docs',
        collapsed: true,
        items: [{ text: 'How to Add Docs', link: '/contributing-docs' }],
      },
    ],
  },
})
