'use client';

import { useEffect, useRef, useMemo } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useRole } from '@/hooks/use-role';
import type { Agent } from '@/lib/types';

export function DeviceTracker() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { role, idc, agentId } = useRole();
  const lastWriteTimeRef = useRef<number>(0);

  // Seule la fiche de l'agent connecté est chargée (identifiant fourni par le jeton signé)
  const agentRef = useMemoFirebase(
    () => (firestore && agentId ? doc(firestore, 'agents', agentId) : null),
    [firestore, agentId]
  );
  const { data: matchedAgent } = useDoc<Agent>(agentRef);

  useEffect(() => {
    // Rien n'est envoyé tant que l'identité signée n'est pas connue (requis par les règles Firestore)
    if (!firestore || !user || !idc || typeof window === 'undefined') return;

    // 1. Obtenir ou générer un ID de périphérique persistant unique dans localStorage
    let deviceId = localStorage.getItem('app-device-id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('app-device-id', deviceId);
    }

    const userIdc = idc;

    let displayName = '';
    if (matchedAgent) {
      displayName = matchedAgent.fullName;
    } else if (role === 'admin') {
      displayName = `Commandement (${userIdc})`;
    } else if (role === 'secretariat') {
      displayName = `Secrétariat (${userIdc})`;
    } else {
      displayName = `Agent (${userIdc})`;
    }

    let watchId: number | null = null;

    const updateLocation = async (position: GeolocationPosition) => {
      const now = Date.now();
      // Throttle writes to once every 15 seconds for increased real-time precision
      if (now - lastWriteTimeRef.current < 15000) {
        return;
      }
      lastWriteTimeRef.current = now;

      try {
        const deviceDocRef = doc(firestore, 'device_locations', deviceId!);
        
        // Détection du type d'appareil
        const userAgent = navigator.userAgent;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        
        await setDoc(deviceDocRef, {
          id: deviceId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          userEmail: displayName,
          agentName: displayName,
          userIdc: userIdc || null,
          agentId: agentId || null,
          role: role || 'observer',
          userAgent: userAgent,
          deviceType: isMobile ? 'mobile' : 'desktop',
          lastActive: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('Erreur lors de la mise à jour de la géolocalisation:', err);
      }
    };

    const handleGeoError = (error: GeolocationPositionError) => {
      console.warn('Erreur ou refus de géolocalisation:', error.message);
    };

    if ('geolocation' in navigator) {
      // Démarrer la surveillance de la position en temps réel avec haute précision
      watchId = navigator.geolocation.watchPosition(
        updateLocation,
        handleGeoError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 15000,
        }
      );
    } else {
      console.warn('La géolocalisation n’est pas supportée par ce navigateur.');
    }

    return () => {
      if (watchId !== null && typeof window !== 'undefined') {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [firestore, user, role, idc, agentId, matchedAgent]);

  return null; // Composant de service en arrière-plan
}

