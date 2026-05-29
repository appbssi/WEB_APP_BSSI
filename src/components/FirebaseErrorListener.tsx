'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Ce composant intercepte et neutralise les erreurs de permission et les erreurs internes de Firebase.
 * Il empêche l'application de planter en cas de latence de mise à jour des règles de sécurité.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    // Neutralisation des erreurs de permission
    const handlePermissionError = (error: FirestorePermissionError) => {
      // On loggue uniquement en console pour le debug, sans interrompre l'utilisateur
      console.debug('Firebase Permission Handled (Silenced)');
    };

    // Interception des erreurs globales du SDK Firebase (Assertion errors, etc.)
    const handleGlobalError = (event: ErrorEvent) => {
      const isFirebaseError = event.message?.toLowerCase().includes('firebase') || 
                             event.message?.toLowerCase().includes('firestore');
      
      if (isFirebaseError) {
        console.debug('Firebase Internal Error Blocked:', event.message);
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = event.reason?.message?.toLowerCase() || '';
      const isFirebaseError = errorMessage.includes('firebase') || errorMessage.includes('firestore');
      
      if (isFirebaseError) {
        console.debug('Firebase Promise Rejection Blocked:', errorMessage);
        event.preventDefault();
        event.stopPropagation();
      }
    };

    errorEmitter.on('permission-error', handlePermissionError);
    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleRejection, true);

    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}