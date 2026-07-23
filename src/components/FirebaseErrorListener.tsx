'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Ce composant intercepte et neutralise les erreurs de permission et les erreurs internes de Firebase,
 * ainsi que les avertissements bénins du navigateur comme ResizeObserver.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    // Neutralisation des erreurs de permission
    const handlePermissionError = (error: FirestorePermissionError) => {
      console.debug('Firebase Permission Handled (Silenced)', error);
    };

    const isResizeObserverMsg = (str: string) => {
      const lower = (str || '').toLowerCase();
      return (
        lower.includes('resizeobserver') ||
        lower.includes('resize observer') ||
        lower.includes('undelivered notifications') ||
        lower.includes('loop limit exceeded')
      );
    };

    // Interception des erreurs globales (Firebase, ResizeObserver, etc.)
    const handleGlobalError = (event: ErrorEvent) => {
      const msg = String(event.message || event.error?.message || event.error || '').toLowerCase();
      const isFirebaseError = msg.includes('firebase') || msg.includes('firestore');
      const isResizeObserverError = isResizeObserverMsg(msg);

      if (isFirebaseError || isResizeObserverError) {
        console.debug('Global Error Blocked:', event.message || msg);
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = String(event.reason?.message || event.reason || '').toLowerCase();
      const isFirebaseError = errorMessage.includes('firebase') || errorMessage.includes('firestore');
      const isResizeObserverError = isResizeObserverMsg(errorMessage);

      if (isFirebaseError || isResizeObserverError) {
        console.debug('Promise Rejection Blocked:', errorMessage);
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
      }
    };

    // Interception window.onerror
    const origOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      const msgStr = String(message || '').toLowerCase();
      if (isResizeObserverMsg(msgStr)) {
        return true; // supprime l'erreur
      }
      if (origOnError) {
        return origOnError.apply(this, [message, source, lineno, colno, error]);
      }
      return false;
    };

    errorEmitter.on('permission-error', handlePermissionError);
    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleRejection, true);

    return () => {
      window.onerror = origOnError;
      errorEmitter.off('permission-error', handlePermissionError);
      window.removeEventListener('error', handleGlobalError, true);
      window.removeEventListener('unhandledrejection', handleRejection, true);
    };
  }, []);

  return null;
}
