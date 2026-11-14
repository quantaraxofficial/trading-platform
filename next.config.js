/** @type {import('next').NextConfig} */
// Security headers on every page: no framing (clickjacking), no MIME sniffing, a strict referrer,
// only the browser features the site uses (the mic for collab voice; the camera and the screen for
// live streams), HTTPS pinned in production.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), microphone=(self), display-capture=(self)' },
  // (allow-popups: the Google sign-in window must be able to report back)
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig = {
  // The site doesn't use next/image: the image optimizer (and its attack surface) stays off
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config) => {
    // Ignore node-specific modules when bundling for the browser
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  turbopack: {},
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
