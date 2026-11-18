import { defineConfig } from 'vite';
import tailwind from '@tailwindcss/vite';
import postcss from 'postcss';
import selectors from 'postcss-selector-parser';
import { readFileSync } from 'node:fs';

const { name: scope } = JSON.parse(
  readFileSync(new URL('./module.json', import.meta.url), 'utf8'),
) as { name: string };
if (!/^[a-z][a-z0-9-]*$/.test(scope)) throw Error('Invalid app scope');
const root = `[data-chrona-app="${scope}"]`;

export default defineConfig({
  plugins: [
    tailwind(),
    {
      name: 'chrona-css-scope',
      enforce: 'post',
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type !== 'asset' || !asset.fileName.endsWith('.css'))
            continue;
          const sheet = postcss.parse(String(asset.source));
          sheet.walkRules((rule) => {
            if (
              rule.parent?.type === 'atrule' &&
              rule.parent.name.endsWith('keyframes')
            )
              return;
            rule.selector = selectors((list) => {
              list.each((selector) => {
                const value = selector.toString();
                const scoped =
                  value === ':root' ||
                  value === ':host' ||
                  value === '[data-chrona-app]'
                    ? root
                    : value.startsWith('.chat-workbench')
                      ? `${root}${value}`
                      : `${root} ${value}`;
                selector.replaceWith(selectors().astSync(scoped).nodes[0]!);
              });
            }).processSync(rule.selector);
          });
          const keyframes = new Map<string, string>();
          sheet.walkAtRules(/^(?:-webkit-)?keyframes$/, (rule) => {
            const name = rule.params;
            rule.params = `${scope}-${name}`;
            keyframes.set(name, rule.params);
          });
          sheet.walkDecls(
            /^(?:-webkit-)?animation(?:-name)?$/,
            (declaration) => {
              declaration.value = declaration.value.replace(
                /[\w-]+/g,
                (name) => keyframes.get(name) ?? name,
              );
            },
          );
          asset.source = sheet.toString().replaceAll('--tw-', `--${scope}-tw-`);
        }
      },
    },
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __APP_SCOPE__: JSON.stringify(scope),
  },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    lib: {
      entry: 'browser-entry.ts',
      formats: ['es'],
      fileName: () => 'ui.js',
      cssFileName: 'ui',
    },
    minify: true,
  },
});
