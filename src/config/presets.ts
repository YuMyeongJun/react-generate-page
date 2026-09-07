/**
 * Built-in presets.
 *
 * `react-mvvm` is the default and is a **copy** of what 0.1.37 emitted — the
 * template bodies below were extracted from that release's source rather than
 * retyped, and tests/legacy-parity.test.ts compares them byte for byte against
 * fixtures captured from it. If you change them, existing users' generated code
 * changes. Don't, unless that is the point.
 *
 * The other presets are starting points for stacks this package had no support
 * for before. They are not copies of anything measured, so treat them as drafts:
 * run `--dry-run` and adjust before trusting them.
 */
import type { Config } from "./types.js";

const conditionTemplate = `export const {{Name}}Condition = () => {
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      // TODO: 검색 로직 구현
    }}>
       <button
          type="submit"
          className="ml-auto rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          검색
        </button>
    </form>
  );
};
`;

const componentTemplate = `{{#if searchCondition}}
import { {{Name}}Condition } from './{{Name}}Condition';{{/if}}

export const {{Name}}Component = () => {
  return (
    <div>
      {{#if searchCondition}}<div>
        <{{Name}}Condition />
      </div>{{/if}}
    </div>
  );
};
`;

const viewModelTemplate = `import { createContext } from 'react';

interface I{{Name}}ViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const {{Name}}ViewModel = createContext<I{{Name}}ViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const {{Name}}ViewModelProvider = ({ children }: Props) => {
  return (
    <{{Name}}ViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </{{Name}}ViewModel.Provider>
  );
};
`;

const pageTemplate = `import {
  {{Name}}Component,
  {{Name}}ViewModelProvider,
} from '{{componentsAlias}}/{{path}}';

export const {{Name}}Page = () => {
  return (
    <{{Name}}ViewModelProvider>
      <{{Name}}Component />
    </{{Name}}ViewModelProvider>
  );
};
`;

const componentIndexTemplate = `export * from './{{Name}}Component';
export * from './{{Name}}ViewModel';
`;

const pageIndexTemplate = `export * from './{{Name}}Page';
`;

/**
 * The shipped default. Reproduces 0.1.37 exactly, including two quirks that are
 * load-bearing only in the sense that changing them would rewrite files in
 * repositories that already use this package:
 *   - Component.tsx starts with a blank line.
 *   - Without a search condition, Component.tsx contains a line of six spaces.
 */
const reactMvvm: Config = {
  root: "src",
  vars: {
    componentsAlias: "@components/pages",
  },
  // Prompt wording only - these labels are what the CLI asks, not what it
  // writes. The generated Condition.tsx keeps its original Korean strings,
  // which tests/legacy-parity.test.ts pins byte for byte. Override any label
  // in your own config.
  flags: [
    { id: "searchCondition", label: "Does this screen need search filters?", default: false },
    {
      id: "createInterface",
      label: "Create a model interfaces directory? (models/interfaces/{{path}})",
      default: false,
    },
    {
      id: "createType",
      label: "Create a model types directory? (models/types/{{path}})",
      default: false,
    },
    {
      id: "createHooks",
      label: "Create a hooks directory? (hooks/client/{{path}})",
      default: false,
    },
  ],
  targets: [
    {
      id: "component",
      dir: "components/pages/{{path}}",
      parentIndex: true,
      files: [
        { name: "{{Name}}Condition.tsx", when: "searchCondition", template: conditionTemplate },
        { name: "{{Name}}Component.tsx", template: componentTemplate },
        { name: "{{Name}}ViewModel.tsx", template: viewModelTemplate },
        { name: "index.ts", template: componentIndexTemplate },
      ],
    },
    {
      id: "page",
      dir: "pages/{{path}}",
      parentIndex: true,
      files: [
        { name: "{{Name}}Page.tsx", template: pageTemplate },
        { name: "index.ts", template: pageIndexTemplate },
      ],
    },
    // 0.1.37 wrote these three index.ts files empty. It also defined a
    // generateModelIndex() that returned "// Add model exports here" and never
    // called it, so no released version ever emitted that string.
    {
      id: "interfaces",
      dir: "models/interfaces/{{path}}",
      when: "createInterface",
      parentIndex: true,
      files: [{ name: "index.ts", template: "" }],
    },
    {
      id: "types",
      dir: "models/types/{{path}}",
      when: "createType",
      parentIndex: true,
      files: [{ name: "index.ts", template: "" }],
    },
    {
      id: "hooks",
      dir: "hooks/client/{{path}}",
      when: "createHooks",
      parentIndex: true,
      files: [{ name: "index.ts", template: "" }],
    },
  ],
  // Empty on purpose: we have not read your repository, so we do not know what
  // "passing" means in it. `npx @mj_yu/react-generate-page init` fills this in
  // from your package.json.
  verify: { commands: [], selfFix: true },
};

/**
 * Next.js app router. The route folder is the URL, so `page.tsx` and friends are
 * fixed names and only the directory varies.
 *
 * Draft: not measured against a real Next repository. Run --dry-run first.
 */
const nextApp: Config = {
  root: "src",
  flags: [
    { id: "loading", label: "Add a loading.tsx?", default: false },
    { id: "errorBoundary", label: "Add an error.tsx?", default: false },
    { id: "clientComponent", label: "Is the page component a client component?", default: false },
  ],
  targets: [
    {
      id: "route",
      dir: "app/{{path}}",
      files: [
        {
          name: "page.tsx",
          template: `import { {{Name}}View } from "./{{Name}}View";

export default function {{Name}}Page() {
  return <{{Name}}View />;
}
`,
        },
        {
          name: "{{Name}}View.tsx",
          template: `{{#if clientComponent}}"use client";

{{/if}}export function {{Name}}View() {
  return <main />;
}
`,
        },
        {
          name: "loading.tsx",
          when: "loading",
          template: `export default function Loading() {
  return <div aria-busy="true" />;
}
`,
        },
        {
          name: "error.tsx",
          when: "errorBoundary",
          template: `"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <button type="button" onClick={() => reset()}>
        Retry
      </button>
    </div>
  );
}
`,
        },
      ],
    },
  ],
  verify: { commands: [], selfFix: true },
};

/**
 * Remix / React Router file routes.
 *
 * Draft: not measured against a real Remix repository. Run --dry-run first.
 */
const remix: Config = {
  root: "app",
  flags: [{ id: "loader", label: "Add a loader?", default: true }],
  targets: [
    {
      id: "route",
      dir: "routes/{{path}}",
      files: [
        {
          name: "{{kebab}}.tsx",
          template: `{{#if loader}}import { useLoaderData } from "react-router";

export async function loader() {
  return { {{name}}: null };
}

{{/if}}export default function {{Name}}() {
{{#if loader}}  const data = useLoaderData<typeof loader>();

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
{{/if}}{{#unless loader}}  return <main />;
{{/unless}}}
`,
        },
      ],
    },
  ],
  verify: { commands: [], selfFix: true },
};

/**
 * Vue 3 single-file components with a composable alongside.
 *
 * Draft: not measured against a real Vue repository. Run --dry-run first.
 */
const vue: Config = {
  root: "src",
  flags: [{ id: "composable", label: "Add a composable?", default: true }],
  targets: [
    {
      id: "view",
      dir: "views/{{path}}",
      files: [
        {
          name: "{{Name}}.vue",
          template: `{{#if composable}}<script setup lang="ts">
import { use{{Name}} } from "./use{{Name}}";

const { loading } = use{{Name}}();
</script>

{{/if}}<template>
  <main{{#if composable}} :aria-busy="loading"{{/if}} />
</template>
`,
        },
        {
          name: "use{{Name}}.ts",
          when: "composable",
          template: `import { ref } from "vue";

export function use{{Name}}() {
  const loading = ref(false);

  return { loading };
}
`,
        },
      ],
    },
  ],
  verify: { commands: [], selfFix: true },
};

export const PRESETS: Record<string, Config> = {
  "react-mvvm": reactMvvm,
  "next-app": nextApp,
  remix,
  vue,
};

export const DEFAULT_PRESET = "react-mvvm";
