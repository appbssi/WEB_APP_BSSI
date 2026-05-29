'use client';

import { useState, useRef } from 'react';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { Loader2, User, X } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import Image from 'next/image';

const agentSchema = z.object({
  fullName: z.string().min(2, 'Le nom complet est requis'),
  registrationNumber: z.string().optional(),
  rank: z.string().min(1, 'Le grade est requis'),
  contact: z.string().transform(val => val.replace(/\D/g, '')).pipe(z.string().min(8, "Le contact doit contenir au moins 8 chiffres.").max(14, "Le contact ne peut pas dépasser 14 chiffres.")).optional().or(z.literal('')),
  address: z.string().min(3, "L'adresse est requise"),
  section: z.string({ required_error: "Veuillez sélectionner une section."}),
});

type AgentFormValues = z.infer<typeof agentSchema>;

interface RegisterAgentFormProps {
  onAgentRegistered: () => void;
}


export function RegisterAgentForm({ onAgentRegistered }: RegisterAgentFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      fullName: '',
      registrationNumber: '',
      rank: '',
      contact: '',
      address: '',
      section: 'Non assigné',
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

  const onSubmit = async (data: AgentFormValues) => {
    if (!firestore) return;

    try {
      const agentsRef = collection(firestore, 'agents');
      
      // Prevent duplicate by name
      const nameQuery = query(agentsRef, where("fullName", "==", data.fullName.trim()));
      const nameQuerySnapshot = await getDocs(nameQuery);
      if (!nameQuerySnapshot.empty) {
        form.setError('fullName', {
          type: 'manual',
          message: 'Un agent avec ce nom est déjà enregistré.',
        });
        return;
      }

      // Prevent duplicate by registration number
      if (data.registrationNumber) {
        const regQuery = query(agentsRef, where("registrationNumber", "==", data.registrationNumber.trim()));
        const regQuerySnapshot = await getDocs(regQuery);
        if (!regQuerySnapshot.empty) {
          form.setError('registrationNumber', {
            type: 'manual',
            message: 'Ce matricule est déjà utilisé par un autre agent.',
          });
          return; 
        }
      }
      
      const agentData = {
        ...data,
        fullName: data.fullName.trim(),
        registrationNumber: data.registrationNumber?.trim() || '',
        photo: photo,
        leaveStartDate: null,
        leaveEndDate: null,
      };

      addDoc(agentsRef, agentData)
        .then(() => {
            toast({
                title: 'Agent enregistré !',
                description: `L'agent ${data.fullName} a été ajouté avec succès.`,
            });
            logActivity(firestore, `L'agent ${data.fullName} a été enregistré.`, 'Agent', '/agents');
            form.reset();
            setPhoto(null);
            onAgentRegistered();
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: agentsRef.path,
                operation: 'create',
                requestResourceData: agentData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: "Une erreur inattendue est survenue.",
      });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Enregistrer un nouvel agent</DialogTitle>
        <DialogDescription>
          Ajoutez un nouvel agent à la brigade.
        </DialogDescription>
      </DialogHeader>
      
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative p-2">
          <div 
            className="h-24 w-24 rounded-full border-2 border-dashed flex items-center justify-center bg-muted overflow-hidden cursor-pointer hover:bg-muted/80 transition-colors relative"
            onClick={() => fileInputRef.current?.click()}
          >
            {photo ? (
              <Image src={photo} alt="Agent photo" fill className="object-cover" />
            ) : (
              <div className="flex flex-col items-center text-muted-foreground text-center p-2">
                <User className="h-6 w-6 mb-1" />
                <span className="text-[10px]">Photo d'identité</span>
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
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handlePhotoUpload} 
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom et Prénom(s)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ex: KOUASSI KOFFI JEAN" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matricule</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: 812 115-B" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rank"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grade</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: SGT" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: 0102030405" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Abidjan, Cocody" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
           <FormField
              control={form.control}
              name="section"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section (Détachement)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une section" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Non assigné">NON ASSIGNÉ</SelectItem>
                      <SelectItem value="Armurerie">ARMURERIE</SelectItem>
                      <SelectItem value="Administration">ADMINISTRATION</SelectItem>
                      <SelectItem value="FAUNE">FAUNE</SelectItem>
                      <SelectItem value="CONDUCTEUR">CONDUCTEUR</SelectItem>
                      <SelectItem value="SECTION FEMININE">SECTION FEMININE</SelectItem>
                      <SelectItem value="DETACHEMENT NOE">DETACHEMENT NOE</SelectItem>
                      <SelectItem value="DETACHEMENT TINGRELA">DETACHEMENT TINGRELA</SelectItem>
                      <SelectItem value="DETACHEMENT MORONDO">DETACHEMENT MORONDO</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sauvegarder l'agent
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
