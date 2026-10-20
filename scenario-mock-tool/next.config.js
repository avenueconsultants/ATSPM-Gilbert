const path = require('path')
module.exports = {
  reactStrictMode: false,
  experimental: { externalDir: true },
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  // Shared WebUI source has existing generated-model type errors; retain its build policy.
  typescript: { ignoreBuildErrors: true },
  webpack(config) {
    // One React/MUI instance across the tool and shared source.
    for (const name of ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material', '@mui/system', '@mui/icons-material', 'zustand']) {
      config.resolve.alias[name] = path.join(__dirname, 'node_modules', name)
    }
    config.resolve.modules.unshift(path.join(__dirname, 'node_modules'))
    return config
  },
}
