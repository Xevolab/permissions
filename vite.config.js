/*
 * Author    : Francesco
 * Created at: 2023-03-16 20:27
 * Edited by : Francesco
 * Edited at : 2023-03-16 20:28
 * 
 * Copyright (c) 2023 Xevolab S.R.L.
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: '@xevolab/permissions',
      fileName: (format) => `built.${format}.js`,
      formats: ["es", "umd"],
      outDir: "dist"
    },
  },

})
