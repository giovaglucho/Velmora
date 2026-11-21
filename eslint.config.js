import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ADR-006 §2 — import boundaries per folder of packages/client/src (type-only imports are allowed
// where the table says "runtime"; contract types may cross folders).
const noPixi = {
  group: ['pixi.js', 'pixi.js/*', '@pixi/*'],
  message: 'pixi.js is not allowed here (ADR-006 §2).',
};
const noReact = {
  group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*'],
  message: 'react/zustand are only allowed in ui/ (ADR-006 §2).',
};
const noSim = {
  group: ['@reinos/sim', '@reinos/sim/*'],
  message: '@reinos/sim runtime is only allowed in worker/ (ADR-006 §2).',
};
const noData = {
  group: ['@reinos/data', '@reinos/data/*'],
  message: 'pure modules only depend on @reinos/shared (ADR-006 §2).',
};
const noUi = { group: ['**/ui/**'], message: 'ui/ is a leaf layer (ADR-006 §2).' };
const noInput = {
  group: ['**/input/**'],
  message: 'render/ and worker/ must not import input/ (ADR-006 §2).',
};
const noWorkerRuntime = {
  group: [
    '**/worker/client*',
    '**/worker/host*',
    '**/worker/sim.worker*',
    '**/worker/scenarios*',
    '**/worker/protocol*',
  ],
  message: 'render/ may only use worker/snapshot (reader and types) (ADR-006 §2).',
};
const noRenderRuntime = {
  group: [
    '**/render/renderer*',
    '**/render/terrain/**',
    '**/render/entities/**',
    '**/render/fog/**',
    '**/render/minimap/**',
  ],
  message:
    'input/ and ui/ may only use render/{iso,camera,culling,depth,constants,types} (ADR-006 §2).',
};
const noWorkerAll = {
  group: ['**/worker/**'],
  message: 'ui/ may only touch worker/ from bridge.ts (ADR-006 §2).',
};

const restrict = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    { patterns: patterns.map((p) => ({ ...p, allowTypeImports: true })) },
  ],
});
const strictPatterns = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
});

const clientBoundaries = [
  {
    files: ['packages/client/src/worker/**/*.ts'],
    rules: {
      ...strictPatterns(noPixi, noReact),
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage'],
    },
  },
  {
    files: ['packages/client/src/render/**/*.ts'],
    rules: restrict(noSim, noReact, noInput, noUi, noWorkerRuntime),
  },
  {
    // "pure" modules: no Pixi, no DOM, no clock (time comes in as a parameter).
    files: [
      'packages/client/src/render/{iso,camera,culling,depth,constants,types}.ts',
      'packages/client/src/render/fog/visionGrid.ts',
      'packages/client/src/render/terrain/terrainMap.ts',
      'packages/client/src/render/minimap/mapping.ts',
    ],
    rules: {
      ...strictPatterns(noPixi, noReact, noSim, noData, noInput, noUi, noWorkerRuntime),
      'no-restricted-globals': ['error', 'document', 'window', 'navigator', 'performance', 'Date'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now' },
        { object: 'performance', property: 'now' },
        { object: 'Math', property: 'random' },
      ],
    },
  },
  {
    files: ['packages/client/src/input/**/*.ts'],
    rules: restrict(noPixi, noReact, noSim, noUi, noRenderRuntime),
  },
  {
    files: ['packages/client/src/ui/**/*.{ts,tsx}'],
    ignores: ['packages/client/src/ui/bridge.ts'],
    rules: restrict(noPixi, noSim, noRenderRuntime, noWorkerAll, {
      group: ['**/input/**'],
      message: 'ui/ delegates to input/ only via bridge.ts.',
    }),
  },
  {
    files: ['packages/client/src/ui/bridge.ts'],
    rules: restrict(noPixi, noSim),
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'docs/**',
      'tools/devlog/site/**',
      'tools/lint-sim/test/fixtures/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...clientBoundaries,
  {
    // Node scripts that also run snippets inside the page (page.evaluate): both sets of globals are legitimate.
    files: ['e2e/perf/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },
);
