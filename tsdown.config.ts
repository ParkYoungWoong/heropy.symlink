import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  target: 'node20.19',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  clean: true
})
