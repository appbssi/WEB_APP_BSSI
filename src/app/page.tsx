
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLogo } from '@/context/logo-context';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';
import { AuthGuard } from '@/components/layout/auth-guard';

const images = [
  'https://i.imgur.com/kPlJEwW.jpeg',
  'https://i.imgur.com/VidHWmL.jpeg',
  'https://i.imgur.com/aEXY1F2.jpeg',
  'https://i.imgur.com/ZnJVbg4.jpeg',
  'https://i.imgur.com/p0CP2p6.jpeg',
];


export default function LandingPage() {
  return (
    <ClientOnly>
      <AuthGuard>
        <LandingContent />
      </AuthGuard>
    </ClientOnly>
  );
}

function LandingContent() {
  const [currentImage, setCurrentImage] = useState(0);
  const { logo } = useLogo();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prevImage) => (prevImage + 1) % images.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleEnterClick = () => {
    router.push('/login');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {images.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt="Military background"
          fill
          className={cn(
            'object-cover transition-opacity duration-1000',
            index === currentImage ? 'opacity-100' : 'opacity-0'
          )}
          priority
        />
      ))}
      <div className="absolute inset-0 bg-black/60" />
      {/* Voile renforcé au centre pour que le texte reste lisible sur les zones claires de la photo */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.25)_45%,transparent_75%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center p-4 text-center text-white">
        <div className="flex flex-col items-center animate-fade-in-up">
            <div className="mb-5 flex h-32 w-32 items-center justify-center">
                <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-emerald-500/60 bg-transparent shadow-lg ring-4 ring-emerald-500/15">
                    {logo ? (
                        <Image
                          src="https://i.ibb.co/v4p7NtMh/dd.png"
                          alt="Logo"
                          fill
                          sizes="112px"
                          priority
                          className="object-cover rounded-full"
                        />
                    ) : null}
                    {/* Reflet métallique qui traverse l'emblème (comme sur la page de connexion) */}
                    <span className="emblem-shine" aria-hidden="true" />
                </div>
            </div>
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl" style={{fontFamily: 'Montserrat, sans-serif', textShadow: '2px 2px 8px rgba(0,0,0,0.7)'}}>
                <span className="text-primary">s</span>BSSI
            </h1>
            {/* Liseré vert (emblème) → orange (application), repris de la page de connexion */}
            <span className="mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-500/70 to-primary" aria-hidden="true" />
            <p className="mt-4 max-w-2xl text-base font-medium text-white/95 sm:text-lg" style={{textShadow: '0 1px 6px rgba(0,0,0,0.8)'}}>
                Système de Brigade Spéciale de Surveillance et d'Intervention
            </p>
            <button
              type="button"
              onClick={handleEnterClick}
              className="mt-8 inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-primary px-10 py-3 text-base font-semibold uppercase tracking-wide text-primary-foreground shadow-lg shadow-black/30 ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-black/40 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 active:translate-y-0"
            >
              Entrer
            </button>
        </div>
      </div>
    </div>
  );
}
