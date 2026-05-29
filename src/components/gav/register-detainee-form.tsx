'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Loader2, User, X, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { logActivity } from '@/lib/activity-logger';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

const detaineeSchema = z.object({
  lastName: z.string().min(2, 'Le nom est requis (min 2 caractères).'),
  firstName: z.string().min(2, 'Le prénom est requis (min 2 caractères).'),
  birthDate: z.string().min(1, 'La date de naissance est requise.'),
  arrestLocation: z.string().min(2, "Le lieu d'arrestation est obligatoire."),
  arrestReason: z.string().min(5, "Le motif d'arrestation est obligatoire."),
});

type DetaineeFormValues = z.infer<typeof detaineeSchema>;

interface RegisterDetaineeFormProps {
  onSuccess: () => void;
}

export function RegisterDetaineeForm({ onSuccess }: RegisterDetaineeFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<DetaineeFormValues>({
    resolver: zodResolver(detaineeSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      birthDate: '',
      arrestLocation: '',
      arrestReason: '',
    },
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) {
        toast({
          variant: 'destructive',
          title: 'Photo trop volumineuse',
          description: 'Veuillez choisir une photo de moins de 800 Ko.',
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: DetaineeFormValues) => {
    if (!firestore) return;
    
    setSubmitError(null);

    try {
      const birthDateObj = new Date(data.birthDate);
      if (isNaN(birthDateObj.getTime())) {
        throw new Error("Date de naissance invalide.");
      }

      const detaineeData = {
        lastName: data.lastName.trim().toUpperCase(),
        firstName: data.firstName.trim(),
        birthDate: Timestamp.fromDate(birthDateObj),
        photo: photo,
        entryTime: Timestamp.now(),
        arrestLocation: data.arrestLocation.trim(),
        arrestReason: data.arrestReason.trim(),
      };

      await addDoc(collection(firestore, 'detainees'), detaineeData);

      toast({
        title: 'Enregistrement réussi',
        description: `${data.firstName} ${data.lastName} a été enregistré en GAV.`,
      });

      logActivity(firestore, `Nouvel enregistrement GAV: ${data.lastName} ${data.firstName}`, 'GAV', '/gav');
      onSuccess();
    } catch (error: any) {
      console.error("Error adding detainee record:", error);
      let errorMessage = "Une erreur est survenue lors de l'enregistrement.";
      
      if (error.code === 'permission-denied') {
        errorMessage = "Permissions insuffisantes pour écrire dans la base de données.";
        const permissionError = new FirestorePermissionError({
          path: 'detainees',
          operation: 'create',
        });
        errorEmitter.emit('permission-error', permissionError);
      } else {
        errorMessage = error.message || errorMessage;
      }

      setSubmitError(errorMessage);
      toast({
        variant: 'destructive',
        title: "Échec de l'enregistrement",
        description: errorMessage,
      });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <div className="space-y-6 py-4">
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center gap-4">
        <div className="relative p-2">
          <div 
            className="h-32 w-32 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted overflow-hidden cursor-pointer hover:bg-muted/80 transition-colors relative"
            onClick={() => fileInputRef.current?.click()}
            title="Cliquez pour importer une photo"
          >
            {photo ? (
              <Image src={photo} alt="Detainee photo" fill className="object-cover" />
            ) : (
              <div className="flex flex-col items-center text-muted-foreground text-center p-2">
                <User className="h-8 w-8 mb-1" />
                <span className="text-[10px]">Importer une photo</span>
              </div>
            )}
          </div>
          {photo && (
            <button 
              type="button"
              className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-xl hover:bg-destructive/90 transition-all z-[100] border-2 border-background"
              onClick={(e) => {
                e.stopPropagation();
                setPhoto(null);
              }}
              title="Retirer l'image"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!photo && (
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <User className="mr-2 h-4 w-4" /> Choisir un fichier
          </Button>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handlePhotoUpload} 
        />
        
        <p className="text-[10px] text-muted-foreground text-center">
          Format JPEG/PNG recommandé (max 800Ko).
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: KOUASSI" {...field} autoComplete="family-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom(s) <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Jean" {...field} autoComplete="given-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de naissance <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="arrestLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lieu d'arrestation <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Adjamé, Pont Fer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="arrestReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motif d'arrestation <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Décrivez les faits reprochés..." 
                    className="resize-none"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end pt-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement en cours...
                </>
              ) : (
                'Enregistrer en GAV'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
