
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { signInWithCustomToken } from 'firebase/auth';
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
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { FirebaseError } from 'firebase/app';
import { ClientOnly } from '@/components/layout/client-only';
import { AuthGuard } from '@/components/layout/auth-guard';
import { WELCOME_PENDING_KEY } from '@/components/layout/agent-welcome';


const loginSchema = z.object({
  email: z.string().min(1, 'Veuillez saisir votre identifiant (IDC).'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type LoginStep = 'idc' | 'password' | 'create_password' | 'forgot' | 'reset';

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
      <AuthGuard>
        <LoginContent />
      </AuthGuard>
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

  // Étapes : IDC, puis (agents) mot de passe, ou création du mot de passe à la 1re connexion
  const [step, setStep] = useState<LoginStep>('idc');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Mot de passe oublié : matricule, puis code transmis par un administrateur
  const [matricule, setMatricule] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetContact, setResetContact] = useState<string | null>(null);
  const isNewPassword = step === 'create_password' || step === 'reset';

  const clearStepError = () => {
    setStepError(null);
    setHasError(false);
  };

  const goTo = (next: LoginStep) => {
    setStep(next);
    setPassword('');
    setConfirmPassword('');
    setResetCode('');
    clearStepError();
  };

  const backToIdc = () => {
    goTo('idc');
    setMatricule('');
    setResetContact(null);
  };

  const finishLogin = async (token: string) => {
    // Signale à l'espace agent qu'il doit afficher la fenêtre de bienvenue
    try {
      sessionStorage.setItem(WELCOME_PENDING_KEY, '1');
    } catch {}
    await signInWithCustomToken(auth, token);
    // L'AuthGuard se charge de la redirection
  };

  const submitForgot = async (idc: string) => {
    if (step === 'forgot' && !matricule.trim()) {
      setHasError(true);
      setStepError('Veuillez saisir votre matricule.');
      return;
    }
    if (step === 'reset') {
      if (!/^\d{6}$/.test(resetCode.trim())) {
        setHasError(true);
        setStepError('Le code contient 6 chiffres.');
        return;
      }
      if (password !== confirmPassword) {
        setHasError(true);
        setStepError('Les deux mots de passe ne sont pas identiques.');
        return;
      }
    }

    setIsLoading(true);
    clearStepError();
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          step === 'forgot'
            ? { idc, matricule }
            : { idc, code: resetCode.trim(), newPassword: password }
        ),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
        sent?: boolean;
        contact?: string;
        restart?: boolean;
      };

      if (res.ok && payload.token) {
        toast({ title: 'Mot de passe modifié', description: 'Votre nouveau mot de passe est enregistré.' });
        await finishLogin(payload.token);
      } else if (res.ok && payload.sent) {
        setResetContact(payload.contact ?? null);
        goTo('reset');
      } else {
        setHasError(true);
        setStepError(payload.error || 'Une erreur est survenue.');
        if (payload.restart) {
          setStep('forgot');
          setResetCode('');
        }
      }
    } catch {
      setHasError(true);
      setStepError('Impossible de joindre le service. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: LoginFormValues) => {
    setStepError(null);
    if (step === 'forgot' || step === 'reset') return submitForgot(data.email);
    if (step === 'create_password') {
      if (password !== confirmPassword) {
        setHasError(true);
        setStepError('Les deux mots de passe ne sont pas identiques.');
        return;
      }
    }
    if (step !== 'idc' && !password) {
      setHasError(true);
      setStepError('Veuillez saisir votre mot de passe.');
      return;
    }

    setIsLoading(true);
    setHasError(false);
    try {
      // L'IDC (et le mot de passe des agents) est vérifié par le serveur, qui renvoie un jeton signé.
      const res = await fetch('/api/auth/idc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idc: data.email,
          ...(step === 'password' ? { password } : {}),
          ...(step === 'create_password' ? { newPassword: password } : {}),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
        step?: 'password' | 'create_password';
      };

      if (res.ok && payload.token) {
        await finishLogin(payload.token);
      } else if (payload.step) {
        // Le serveur demande l'étape suivante (ou signale une erreur sur cette étape)
        if (payload.step !== step) {
          setStep(payload.step);
          setPassword('');
          setConfirmPassword('');
        }
        if (payload.error) {
          setHasError(true);
          setStepError(payload.error);
          if (payload.step === 'password') setPassword('');
        }
      } else {
         setHasError(true);
         toast({
            variant: 'destructive',
            title: 'Erreur de connexion',
            description: payload.error || "Identifiant (IDC) incorrect.",
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
                            <Image
                              src="https://i.ibb.co/v4p7NtMh/dd.png"
                              alt="Logo"
                              fill
                              className="object-cover rounded-full"
                            />
                        </div>
                    </div>
                    <CardTitle><span className="text-primary">s</span>BSSI</CardTitle>
                    <CardDescription>
                      {step === 'idc' && 'Saisissez votre Identifiant (IDC) pour vous connecter'}
                      {step === 'password' && 'Saisissez votre mot de passe'}
                      {step === 'create_password' &&
                        'Première connexion : créez votre mot de passe. Il vous sera demandé avec votre IDC à chaque connexion.'}
                      {step === 'forgot' && 'Mot de passe oublié : confirmez votre identité avec votre matricule.'}
                      {step === 'reset' && 'Saisissez le code reçu, puis choisissez un nouveau mot de passe.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Identifiant (IDC)</FormLabel>
                              {step !== 'idc' && (
                                <button
                                  type="button"
                                  onClick={backToIdc}
                                  className="text-xs font-semibold text-primary hover:underline"
                                >
                                  Modifier
                                </button>
                              )}
                            </div>
                            <FormControl>
                            <Input
                                type="text"
                                placeholder="Votre identifiant"
                                autoComplete="username"
                                readOnly={step !== 'idc'}
                                {...field}
                                onChange={(e) => handleInputChange(field, e.target.value)}
                                className={cn("rounded-full neon-orange-input", step !== 'idc' && "opacity-70")}
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    {step === 'forgot' && (
                      <div className="space-y-2">
                        <Label htmlFor="login-matricule">Matricule</Label>
                        <Input
                          id="login-matricule"
                          type="text"
                          autoFocus
                          value={matricule}
                          onChange={(e) => {
                            setMatricule(e.target.value);
                            clearStepError();
                          }}
                          placeholder="Votre matricule"
                          className="rounded-full neon-orange-input"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Si l&apos;IDC et le matricule correspondent, un code vous sera transmis sur le contact
                          enregistré sur votre fiche.
                        </p>
                      </div>
                    )}

                    {step === 'reset' && (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-xs text-foreground">
                          Demande enregistrée. Un administrateur va vous transmettre un code à 6 chiffres
                          {resetContact ? <> au <span className="font-semibold">{resetContact}</span></> : null}.
                          Le code est valable 2 heures.
                        </div>
                        <Label htmlFor="login-reset-code">Code reçu</Label>
                        <Input
                          id="login-reset-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          autoFocus
                          value={resetCode}
                          onChange={(e) => {
                            setResetCode(e.target.value.replace(/\D/g, ''));
                            clearStepError();
                          }}
                          placeholder="••••••"
                          className="rounded-full neon-orange-input text-center font-mono tracking-[0.5em]"
                        />
                      </div>
                    )}

                    {(step === 'password' || isNewPassword) && (
                      <div className="space-y-2">
                        <Label htmlFor="login-password">
                          {isNewPassword ? 'Nouveau mot de passe' : 'Mot de passe'}
                        </Label>
                        <div className="relative">
                          <Input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                            autoFocus={step !== 'reset'}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setStepError(null);
                              setHasError(false);
                            }}
                            placeholder={isNewPassword ? '8 caractères minimum' : 'Votre mot de passe'}
                            className="rounded-full neon-orange-input pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {isNewPassword && (
                          <>
                            <Label htmlFor="login-password-confirm">Confirmer le mot de passe</Label>
                            <Input
                              id="login-password-confirm"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={confirmPassword}
                              onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                setStepError(null);
                                setHasError(false);
                              }}
                              placeholder="Retapez le mot de passe"
                              className="rounded-full neon-orange-input"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Au moins 8 caractères, dont une lettre et un chiffre.
                            </p>
                          </>
                        )}
                        {step === 'password' && (
                          <button
                            type="button"
                            onClick={() => goTo('forgot')}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Mot de passe oublié ?
                          </button>
                        )}
                      </div>
                    )}

                    {stepError && (
                      <p role="alert" className="text-sm font-medium text-destructive">{stepError}</p>
                    )}

                    <Button type="submit" className="w-full login-btn text-white font-semibold rounded-xl" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {step === 'idc'
                          ? 'Continuer'
                          : step === 'create_password'
                            ? 'Créer mon mot de passe'
                            : step === 'forgot'
                              ? 'Recevoir un code'
                              : step === 'reset'
                                ? 'Changer mon mot de passe'
                                : 'Se connecter'}
                    </Button>
                    {(step === 'forgot' || step === 'reset') && (
                      <button
                        type="button"
                        onClick={() => goTo('password')}
                        className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Retour à la connexion
                      </button>
                    )}
                    </form>
                </Form>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
