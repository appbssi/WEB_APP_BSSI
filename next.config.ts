
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'firebase',
    '@firebase/app',
    '@firebase/auth',
    '@firebase/firestore',
    '@firebase/util',
    '@firebase/component',
    '@firebase/logger',
    'firebase-admin',
  ],
  // Option de premier niveau depuis Next.js 15 (elle était ignorée sous "experimental")
  allowedDevOrigins: [
    '*.europe-west2.run.app',
    '*.run.app',
    'localhost:3000',
    'localhost:8080',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Empêche l'intégration du portail dans une iframe d'un autre site (clickjacking)
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // CSP volontairement limitée aux directives sans risque de casser Firebase,
          // les tuiles de carte ou les images externes.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          // Caméra (scan QR) et géolocalisation (suivi des appareils) réservées au portail lui-même
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
  // Les erreurs TypeScript et ESLint bloquent de nouveau le build,
  // pour qu'aucune régression ne parte en production sans être vue.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ibb.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imgur.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's10.aconvert.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i0.wp.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
