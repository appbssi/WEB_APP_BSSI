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
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent, Availability } from '@/lib/types';
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

interface EditAgentSheetProps {
  agent: Agent;
  onAgentEdited: () => void;
  availability: Availability;
}

export function EditAgentSheet({ agent, onAgentEdited, availability }: EditAgentSheetProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [photo, setPhoto] = useState<string | null>(agent.photo || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      fullName: agent.fullName,
      registrationNumber: agent.registrationNumber || '',
      rank: agent.rank,
      contact: agent.contact || '',
      address: agent.address,
      section: agent.section || 'Non assigné',
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

      // Check for name duplicate (excluding current agent)
      if (data.fullName.trim() !== agent.fullName) {
        const qName = query(agentsRef, where("fullName", "==", data.fullName.trim()));
        const nameSnapshot = await getDocs(qName);
        if (!nameSnapshot.empty) {
            form.setError('fullName', {
                type: 'manual',
                message: 'Ce nom est déjà utilisé par un autre agent.',
            });
            return;
        }
      }

       // Check for reg number duplicate (excluding current agent)
      if (data.registrationNumber && data.registrationNumber.trim() !== agent.registrationNumber) {
        const qReg = query(agentsRef, where("registrationNumber", "==", data.registrationNumber.trim()));
        const regSnapshot = await getDocs(qReg);

        if (!regSnapshot.empty) {
          form.setError('registrationNumber', {
            type: 'manual',
            message: 'Ce matricule est déjà utilisé par un autre agent.',
          });
          return;
        }
      }

      const agentRef = doc(firestore, 'agents', agent.id);
      const updateData = {
          ...data,
          fullName: data.fullName.trim(),
          registrationNumber: data.registrationNumber?.trim() || '',
          photo: photo,
      };

      updateDoc(agentRef, updateData).then(() => {
        toast({
            title: 'Agent mis à jour !',
            description: `Les informations de l'agent ${data.fullName} ont été mises à jour.`,
        });
        logActivity(firestore, `Les informations de l'agent ${data.fullName} ont été modifiées.`, 'Agent', '/agents');
        onAgentEdited();
      }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: agentRef.path,
            operation: 'update',
            requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
      
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Erreur',
        description: "Une erreur de validation est survenue.",
      });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier l'agent</DialogTitle>
        <DialogDescription>
          Mettez à jour les informations de l'agent.
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
                <span className="text-[8px]">Photo d'identité</span>
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
                  <Input {...field} />
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
                    <Input {...field} />
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
                    <Input {...field} />
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
                    <Input {...field} />
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
                    <Input {...field} />
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
              Sauvegarder les modifications
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
