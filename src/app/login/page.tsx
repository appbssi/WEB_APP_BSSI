
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { signInAnonymously } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogo } from '@/context/logo-context';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { setRole } from '@/hooks/use-role';
import { FirebaseError } from 'firebase/app';
import { ClientOnly } from '@/components/layout/client-only';


const loginSchema = z.object({
  email: z.string().min(1, 'Veuillez saisir votre identifiant (IDC).'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const ADMIN_LOGIN = 'bssi';

const images = [
  'https://i.imgur.com/kPlJEwW.jpeg',
  'https://i.imgur.com/VidHWmL.jpeg',
  'https://i.imgur.com/aEXY1F2.jpeg',
  'https://i.imgur.com/ZnJVbg4.jpeg',
  'https://i.imgur.com/p0CP2p6.jpeg',
];

export default function LoginPage() {
  return (
    <ClientOnly>
      <LoginContent />
    </ClientOnly>
  );
}

function LoginContent() {
  const { logo } = useLogo();
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prevImage) => (prevImage + 1) % images.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setHasError(false);
    try {
      const { email: rawLogin } = data;
      const login = rawLogin.trim().toUpperCase();
      let userRole: 'admin' | 'observer' | 'secretariat' | null = null;

      if (login === '0CWKIX') {
        userRole = 'admin';
      } else if (rawLogin.toLowerCase() === ADMIN_LOGIN) {
        userRole = 'admin';
      } else if (rawLogin.toLowerCase() === 'secretariat') {
        userRole = 'secretariat';
      } else if (login.length >= 3) {
        // Any other non-empty IDC/login of at least 3 chars can log in as observer (restricted)
        userRole = 'observer';
      }

      if (userRole) {
        await signInAnonymously(auth);
        if (typeof window !== 'undefined') {
          localStorage.setItem('app-user-idc', login);
        }
        setRole(userRole);
        // The AuthGuard will handle the redirection
      } else {
         setHasError(true);
         toast({
            variant: 'destructive',
            title: 'Erreur de connexion',
            description: "Identifiant (IDC) incorrect.",
        });
      }
    } catch (error) {
      setHasError(true);
      console.error('Login Error:', error);
      const description = error instanceof FirebaseError 
        ? "Impossible de se connecter au service. Veuillez réessayer." 
        : "Une erreur inconnue est survenue.";
      toast({ variant: 'destructive', title: 'Erreur de connexion', description });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: any, value: string) => {
    if (hasError) {
      setHasError(false);
    }
    field.onChange(value);
  }

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center">
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
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in-up">
            <Card className={cn("dark text-left text-card-foreground w-full max-w-sm bg-background/80 backdrop-blur-md shadow-2xl border-2 border-transparent rounded-xl subtle-float", hasError ? "neon-error-box" : "neon-orange-box")}>
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-28 w-28 flex items-center justify-center">
                        <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-emerald-500/20 bg-transparent shadow-lg">
                            {logo ? (
                            <Image src={logo} alt="Logo" fill className="object-cover scale-105" />
                            ) : null}
                        </div>
                    </div>
                    <CardTitle><span className="text-primary">s</span>BSSI</CardTitle>
                    <CardDescription>Saisissez votre Identifiant (IDC) pour vous connecter</CardDescription>
                </CardHeader>
                <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Identifiant (IDC)</FormLabel>
                            <FormControl>
                            <Input 
                                type="text" 
                                placeholder="ex: 0CWKIX"
                                {...field}
                                onChange={(e) => handleInputChange(field, e.target.value)}
                                className="rounded-full neon-orange-input"
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full login-btn text-white font-semibold rounded-xl" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Se connecter
                    </Button>
                    </form>
                </Form>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
