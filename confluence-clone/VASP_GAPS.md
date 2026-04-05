# Vasp Framework — Gaps Analysis for One-Shot Full Web App Generation

> Written while building a Confluence-like collaborative wiki with Vasp.
> This document captures every friction point, missing feature, and workaround
> encountered in real usage. It is structured as a roadmap toward making Vasp
> a truly "one-shot" declarative app creator — where a single `.vasp` file
> generates a fully working, production-quality web application with zero
> additional hand-written code.

---

## What "One-Shot" Means

A one-shot web app creator generates a **complete, runnable, production-quality application**
from a single declarative file. No hand-written Vue components. No manually implemented
server functions. No "now write the business logic yourself." The developer declares
**what** the app does; the framework generates **how** it's done.

Today Vasp gets 40–60% of the way there for simple CRUD apps.
For real-world apps like Confluence, it gets to maybe 20%.

---

## Issues Encountered During Confluence Clone Creation

### Issue 1 — No `RichText` Field Type

**Impact: Critical (blocker for any content-centric app)**

Confluence pages have a rich text body — formatted headings, lists, code blocks,
images, tables. Vasp's field types are:
`String`, `Int`, `Boolean`, `DateTime`, `Float`, `Text`, `Json`, `Enum`, `File`.

There is no `RichText` type. The workaround is to store the editor's JSON document
(Tiptap ProseMirror format) in a `Json` field:

```vasp
entity Page {
  body: Json @nullable  // stores ProseMirror JSON — not readable by CRUD/autoPage
}
```

**The problem:** The generated `autoPage form` renders a `Json` field as a raw textarea
or not at all. There is no Tiptap/Quill/Slate editor integration. The `crud` CRUD endpoints
work fine for persistence, but the entire editing experience must be hand-written.

**What it should be:**

```vasp
entity Page {
  body: RichText @nullable  // generates: Tiptap editor in form, rendered HTML in detail
}
```

The framework should generate:
- A `<TiptapEditor>` component in autoPage forms and CRUD forms
- Rendered HTML output in autoPage detail views
- Proper sanitization on the backend (DOMPurify or `@tiptap/extension-*` sanitization)
- PostgreSQL full-text index on the text content

---

### Issue 2 — No Page/Component Scaffolding for Custom `page` Blocks

**Impact: Critical (every non-trivial app needs custom UI)**

When you declare:

```vasp
page PageViewPage {
  component: import PageView from "@src/pages/PageView.vue"
}
```

Vasp wires the router but **does not create** `src/pages/PageView.vue`. The developer must
write the entire component from scratch. For a Confluence clone this means writing:
- Space view with a tree sidebar showing the page hierarchy
- Page view with Tiptap rendered HTML, comments section, version badge
- Page editor with Tiptap, toolbar, autosave, conflict detection
- Page history view with diffs between versions
- Search results page with highlights

That's 8–10 non-trivial Vue components. A "one-shot" framework cannot have
these as blanks.

**What it should be:**

1. `autoPage` should cover far more patterns (see Issue 4)
2. The `page` block should accept a `template:` hint so the framework scaffolds a
   sensible starting component:

```vasp
page PageViewPage {
  component: import PageView from "@src/pages/PageView.vue"
  template: master-detail  // generates sidebar + content area layout
}
```

Or, the framework should generate a minimal but functional component that the developer
can eject and customize.

---

### Issue 3 — No Self-Referential Relation Rendering

**Impact: High (tree structures are common in real apps)**

Confluence pages are hierarchical: a Page has a `parent: Page @nullable` field.
The `.vasp` DSL can declare this, and Drizzle correctly generates a self-referential
foreign key. However:

1. The generated CRUD list view shows a flat table — no tree/hierarchy
2. The `autoPage list` has no `treeMode` option
3. There is no `<TreeTable>` component in the generated output
4. The `autoPage detail` shows the parent as a raw ID, not a linked breadcrumb

**What it should be:**

```vasp
autoPage PageTree {
  entity: Page
  path: "/spaces/:spaceKey/pages"
  type: list
  display: tree          // renders PrimeVue TreeTable instead of DataTable
  parentField: parentId  // the self-referential FK field
  labelField: title      // what to show in the tree node
  rowActions: [view, edit, delete, addChild]
}
```

---

### Issue 4 — `autoPage` Covers Only 3 Basic Patterns

**Impact: High**

`autoPage` supports `list`, `form`, `detail`. For a Confluence clone you need:

| UI Pattern | autoPage support? | Workaround |
|------------|------------------|------------|
| DataTable list | ✅ Yes | — |
| Create/edit form | ✅ Yes (no rich text) | Hand-write |
| Detail view | ✅ Yes (flat fields only) | — |
| Tree/hierarchy view | ❌ No | Hand-write |
| Master-detail (sidebar + content) | ❌ No | Hand-write |
| Kanban/board | ❌ No | Hand-write |
| Calendar view | ❌ No | Hand-write |
| Search results | ❌ No | Hand-write |
| Dashboard with charts | ❌ No | Hand-write |
| Timeline / activity feed | ❌ No | Hand-write |

**What it should be:**

```vasp
autoPage SpaceDashboard {
  entity: Space
  path: "/spaces/:id"
  type: master-detail
  sidebar: {
    entity: Page
    foreignKey: spaceId
    display: tree
    parentField: parentId
    labelField: title
  }
  main: {
    type: detail
    fields: [title, description, owner]
  }
}
```

---

### Issue 5 — Query/Action Functions Must Be Entirely Hand-Written

**Impact: High (kills the "one-shot" promise)**

The `query` and `action` blocks only declare *that* a function exists and which entities
it touches. The function body is always hand-written:

```vasp
query searchPages {
  fn: import { searchPages } from "@src/queries/search.js"
  entities: [Page, Space]
  auth: true
}
```

This means the developer must write `src/queries/search.js` with the full Drizzle query.
For a Confluence clone this is 8 queries × 30–100 lines = 400–800 lines of Drizzle ORM code.

**What it should be:**

For common patterns, the framework should be able to generate the function body.
High-value generators to add:

1. **Full-text search** (PostgreSQL `tsvector`/`tsquery`):

```vasp
query searchPages {
  entities: [Page, Space]
  auth: true
  searchFields: [title, body]  // generates PostgreSQL FTS query
  filterBy: [spaceId, status]
  returns: Page[]
}
```

2. **Aggregated/joined queries** without custom code:

```vasp
query getPageWithComments {
  entity: Page
  with: [comments.author, labels]  // auto-generated join
  auth: true
}
```

3. **Filtered list with sorting**:

```vasp
query getSpacePages {
  entity: Page
  filter: { spaceId: $spaceId, status: published }
  orderBy: [updatedAt: desc]
  paginate: true
}
```

---

### Issue 6 — ManyToMany Relations Not Supported in autoPage Forms

**Impact: High**

A `Page` has `labels: Label[] @manyToMany`. The `autoPage form` cannot render a
multi-select for this relation. There is no generated UI for selecting related records
from a M2M junction table.

**What it should be:**

```vasp
autoPage PageCreate {
  entity: Page
  type: form
  fields: [title, body, labels, status]
  // labels: Label[] → generates a MultiSelect dropdown with Label.name as option label
}
```

The framework should detect `@manyToMany` fields and generate `MultiSelect` inputs
(PrimeVue `MultiSelect`) with the related entity's records loaded from the API.

---

### Issue 7 — File Fields Not Integrated in autoPage / CRUD Forms

**Impact: High**

`User.avatar: File @storage(AvatarStorage)` declares that `avatar` is a file stored
via the `AvatarStorage` provider. The storage block generates an upload endpoint
(`POST /api/storage/avatar-storage`). But:

1. The `autoPage form` renders a `File` field as a plain `<input type="text">` (or ignores it)
2. There is no generated `<FileUpload>` component wired to the storage endpoint
3. After upload, the returned URL is not automatically set in the form field

**What it should be:**

`File` fields in `autoPage form` and `crud` forms should generate:
- A PrimeVue `<FileUpload>` component
- Wired to the correct `/api/storage/<name>` endpoint
- Setting the resulting URL into the form field automatically

---

### Issue 8 — No Full-Text Search DSL Block

**Impact: High (required for any knowledge-base or content app)**

Confluence's most critical feature is search — searching across page titles, bodies,
and space names. Vasp has no search primitive. The workarounds are:

- Write a custom `query searchPages { fn: import ... }` with hand-written Drizzle + `pg`
  queries using PostgreSQL `to_tsvector`/`to_tsquery`
- Add a separate search service (Elasticsearch, Typesense, Meilisearch) manually

**What it should be:**

```vasp
search WikiSearch {
  provider: postgres        // or meilisearch, typesense
  entities: [Page, Space]
  fields: {
    Page: [title, body]     // body is RichText — extracted text is indexed
    Space: [name, description]
  }
}
```

This would generate:
- PostgreSQL `tsvector` columns + GIN index (for `provider: postgres`)
- Trigger to update the index on insert/update
- A `GET /api/search?q=...` endpoint
- A `SearchInput` component wired to the endpoint

---

### Issue 9 — No Page Version / Revision History Primitive

**Impact: Medium-High**

Version history (who changed what and when, with diffing and restore) is a first-class
Confluence feature. Vasp has no `@versioned` modifier or `history:` block type. The only
workaround is a manual `PageVersion` entity + action functions that manually copy rows.

**What it should be:**

```vasp
entity Page {
  title: String @versioned   // or at entity level:
  body: Json    @versioned
  @@versioned   // generates PageVersion shadow table + track() middleware
}
```

The `@@versioned` directive would:
- Generate a `PageVersions` shadow table (auto-named)
- Inject `AFTER INSERT OR UPDATE` trigger logic (or Drizzle middleware)
- Generate `GET /api/pages/:id/versions` and `POST /api/pages/:id/restore/:version` endpoints

---

### Issue 10 — No Conditional Field Display in Forms

**Impact: Medium**

In the Confluence page editor, when `status: draft` the "Publish" button is shown;
when `status: published` the "Unpublish" button is shown. In a multi-step form,
certain fields only appear based on prior answers. Vasp has no way to express this.

**What it should be:**

```vasp
autoPage PageCreate {
  entity: Page
  type: form
  fields: [
    title,
    body,
    status,
    publishedAt { showWhen: "status == 'published'" }
  ]
}
```

---

### Issue 11 — DSL Syntax: Several "Gotcha" Parsing Rules

**Impact: Medium (discovered during authoring the .vasp file)**

The following caused parse errors that required reading the parser source to diagnose.
None of these are documented anywhere:

| What I tried | What broke | What works |
|---|---|---|
| `allowedTypes: [image/jpeg, ...]` | `/` is unexpected char | `allowedTypes: ["image/jpeg", ...]` |
| `from: no-reply@domain.com` | `-` is unexpected char | `from: "no-reply@domain.com"` |
| `maxSize: 50mb` | parse error | `maxSize: "50mb"` |
| `path: /api/search` | `/` is unexpected char | `path: "/api/search"` |
| `templates: [ {...}, {...} ]` | Expected `{` but got `[` | `templates: { name: import ... }` |
| `cache: { store: X, ttl: 60 }` | Expected identifier but got `,` | Multi-line block required |
| `columns: { id: { label: "ID" } }` | Expected `{` but got `:` | Not supported in this context |

**Recommendation:** The language server (LSP) should catch all of these with helpful
error messages. Currently the parser throws low-level "unexpected char" errors with
no hint about the correct syntax. A dedicated syntax guide / cheatsheet would also help.

---

### Issue 12 — No Computed / Derived Fields

**Impact: Medium**

Confluence shows "last modified by X, 2 hours ago" on every page. This requires:
- A join to `User` for `page.author`
- A relative time calculation

There is no way to declare derived/computed fields in the entity DSL. Every list view
shows raw IDs for foreign keys.

**What it should be:**

```vasp
entity Page {
  author: User @onDelete(restrict)
  authorName: String @computed("author.displayName")  // virtual column, read-only
}
```

Or at the query level:

```vasp
query getPages {
  entity: Page
  with: [author.displayName, author.avatar]  // eager-load specific fields
  auth: true
}
```

---

### Issue 13 — `page` Components Are Not Scaffolded

**Impact: High (see Issue 2, this is the #1 pain point)**

When a `page` block references `@src/pages/PageView.vue`, Vasp:
- ✅ Generates the router entry
- ✅ Imports the component
- ❌ Does NOT create the `.vue` file

For a Confluence clone, 12 custom pages × ~200 lines each = 2,400 lines of Vue code
that must be written manually. This is the single biggest barrier to one-shot generation.

**What it should be:**

The framework should scaffold a functional placeholder component for every `page` block.
The scaffold should:
1. Import and use `useQuery`/`useAction` for declared queries/actions
2. Render the entity's fields in a reasonable default layout
3. Be ejectable (user runs `vasp eject-page PageViewPage` to take full ownership)

---

### Issue 14 — No Notification / Watch / Subscription DSL

**Impact: Medium**

Confluence allows users to "watch" a page and receive email/in-app notifications when
it changes. Vasp has:
- Email blocks for sending emails from action `onSuccess`
- Background jobs for async processing

But there is no first-class "notification" or "subscription" system. The workaround
requires a manual `PageWatch` entity, a manual `watchPage` action, and manual job
enqueueing inside the `updatePage` action.

**What it should be:**

```vasp
notification PageChangeNotification {
  trigger: Page:updated
  audience: PageWatch.userId  // users who have watched the page
  channels: [email, inApp]
  email: { template: pageUpdated }
  inApp: { message: "{{page.title}} was updated by {{actor.displayName}}" }
}
```

---

### Issue 15 — Realtime Requires a Matching `crud` Block

**Impact: Low-Medium (design quirk, not a blocker)**

```
E104_REALTIME_ENTITY_NOT_CRUD: realtime 'PageChannel' references entity 'Page' which has no crud block
```

To use realtime websocket events for `Page`, a full `crud Page { operations: [...] }`
block must exist — even if the developer does not want the generated REST CRUD endpoints.
This forced adding a CRUD block just to satisfy the validator, which then generates
REST endpoints that overlap with the custom `createPage`/`updatePage` action endpoints.

**What it should be:**

Realtime should not require a CRUD block. It should be independently declarable:

```vasp
realtime PageChannel {
  entity: Page
  events: [created, updated, deleted]
  // The framework subscribes to Drizzle's afterInsert/afterUpdate/afterDelete hooks
}
```

---

### Issue 16 — No Pagination for Nested / Related Resources

**Impact: Medium**

Comments on a Confluence page need pagination (there can be hundreds). The `query`
block has no built-in pagination — it just calls a hand-written function. The `crud`
list endpoints support pagination via query params, but they're for top-level entities,
not filtered sub-resources (e.g., "comments for page 42").

**What it should be:**

```vasp
query getPageComments {
  entity: Comment
  filter: { pageId: $pageId }
  orderBy: [createdAt: asc]
  paginate: true          // generates limit/offset query params automatically
  returns: Comment[]
}
```

---

### Issue 17 — No Role-Based Navigation / Conditional Menu Items

**Impact: Medium**

The generated `layouts/default.vue.hbs` navbar shows all routes regardless of user role.
In Confluence, admin-only routes should only appear for admins.

**What it should be:**

```vasp
route AdminUsersRoute {
  path: "/admin/users"
  to: AdminUsersPage
  roles: [ admin ]        // hides from nav and guards with middleware
  showInNav: false        // or conditionally based on role
}
```

The generated layout should conditionally render nav items based on `user.role`.

---

### Issue 18 — No Inline Editing / Optimistic UI

**Impact: Low-Medium**

Confluence allows clicking a page title to edit it inline. The autoPage `detail` view
is always read-only. There is no `editable: true` option.

**What it should be:**

```vasp
autoPage PageDetail {
  entity: Page
  type: detail
  fields: [title, status, labels]
  inlineEditable: [title, status]  // render as editable on click
}
```

---

## Summary: What's Missing for One-Shot Generation

| Category | Status | Priority |
|----------|--------|----------|
| `RichText` field type (Tiptap integration) | ❌ Missing | 🔴 Critical |
| Page component scaffolding for `page` blocks | ❌ Missing | 🔴 Critical |
| Query function auto-generation (common patterns) | ❌ Missing | 🔴 Critical |
| ManyToMany field in autoPage/CRUD forms | ❌ Missing | 🔴 Critical |
| File field integration in autoPage/CRUD forms | ❌ Missing | 🔴 Critical |
| Full-text search DSL block | ❌ Missing | 🟠 High |
| Tree/hierarchy autoPage display mode | ❌ Missing | 🟠 High |
| Master-detail autoPage layout | ❌ Missing | 🟠 High |
| Self-referential relation UI (breadcrumbs, tree) | ❌ Missing | 🟠 High |
| Computed/derived fields | ❌ Missing | 🟠 High |
| `@versioned` entity directive | ❌ Missing | 🟡 Medium |
| Notification/watch subscription DSL | ❌ Missing | 🟡 Medium |
| Pagination for nested/filtered queries | ❌ Missing | 🟡 Medium |
| Conditional field display in forms | ❌ Missing | 🟡 Medium |
| Role-based navigation in generated layout | ❌ Missing | 🟡 Medium |
| Better parser error messages + docs | ❌ Missing | 🟡 Medium |
| Realtime without required CRUD block | ❌ Missing | 🟡 Medium |
| Inline editing in detail views | ❌ Missing | 🟢 Low |

---

## Vision: The Path to One-Shot

The gap between "generates a CRUD app" and "generates a real SaaS" comes down to
three things:

### 1. Richer Field Types
Add `RichText`, `Markdown`, `Color`, `Money`, `Phone`, `Address` types. Each maps to:
- A specific database column type
- A specific UI component in forms and detail views
- Backend sanitization/validation

### 2. Auto-Generated Query/Action Bodies
For 80% of real use cases, queries follow predictable patterns. The framework should
generate the implementation when the intent is clear from the DSL, and only require
a hand-written `fn: import` when the pattern is too custom.

### 3. Scaffolded Page Components
Every `page` block should produce a functional (if basic) Vue component. Developers
should eject pages they want to customize, not start from a blank file.

When these three things are in place, a developer could describe a Confluence clone
in ~300 lines of `.vasp` DSL and get a fully working, production-deployable application
with zero additional code — the true one-shot vision.

---

*Generated while building `confluence-clone/main.vasp` on the Vasp 1.3.0 framework.*
*The `.vasp` file parses and validates cleanly but requires ~3,000 lines of hand-written*
*Vue components and query functions before the app is functional.*
