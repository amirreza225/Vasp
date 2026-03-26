import { join } from "node:path";

export const TEMPLATES_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "templates",
);

export const MINIMAL_VASP = `
app MinimalApp {
  title: "Minimal Test App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`;
