import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // When a lockfile exists at the repo root, Next infers the wrong workspace root and
  // cannot resolve tailwindcss from frontend/node_modules.
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": path.join(
        __dirname,
        "lib/stubs/async-storage.ts"
      ),
    }
    return config
  },
}

export default nextConfig
