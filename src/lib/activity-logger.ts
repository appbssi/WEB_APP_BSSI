'use client';

import { addDoc, collection, Timestamp, Firestore } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

type ActivityType = 'Agent' | 'Mission' | 'Rassemblement' | 'Visiteur' | 'Général' | 'GAV' | 'Armurerie' | 'Logistique';

/**
 * Logs an activity to the Firestore 'activities' collection.
 * This is a "fire-and-forget" operation. It does not block the UI
 * and handles its own errors silently by emitting them to a global handler.
 *
 * @param firestore - The Firestore instance.
 * @param description - A human-readable string describing the activity.
 * @param type - The category of the activity.
 * @param link - An optional client-side link related to the activity (e.g., '/agents').
 */
export function logActivity(
    firestore: Firestore, 
    description: string, 
    type: ActivityType, 
    link?: string
) {
    if (!firestore) return;

    const activitiesRef = collection(firestore, 'activities');
    
    const activityData = {
        description,
        type,
        timestamp: Timestamp.now(),
        ...(link && { link }),
    };

    addDoc(activitiesRef, activityData)
        .catch((serverError) => {
            // Silently emit the error for centralized handling, don't block user flow.
            const permissionError = new FirestorePermissionError({
                path: 'activities',
                operation: 'create',
                requestResourceData: activityData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
}
