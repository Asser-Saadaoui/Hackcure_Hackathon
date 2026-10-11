/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the multi-stage Docker build (copies .next/standalone)
  output: 'standalone',

  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        // Sahhanito: the hospital simulator (hospital-sim/service.py + compat.py)
        destination: `${process.env.SIM_URL || 'http://localhost:8200'}/api/v1/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
