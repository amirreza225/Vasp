# Admin Panel and Auto Pages

## Admin panel

```vasp
admin {
  entities: [Todo, User]
}
```

Vasp generates a PrimeVue-based admin interface with:
- Sidebar navigation
- Entity list views
- Create/edit modals
- Built-in integration with admin API routes

## Auto pages

`autoPage` blocks generate list, form, and detail pages from entity definitions.

```vasp
autoPage TodoList {
  entity: Todo
  pageType: list
}
```
