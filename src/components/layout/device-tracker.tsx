'use client';

import { useEffect, useRef, useMemo } from 'react';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import type { Agent } from '@/lib/types';

export function DeviceTracker() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { role } = useRole();
  const lastWriteTimeRef = useRef<number>(0);

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agents } = useCollection<Agent>(agentsQuery);

  useEffect(() => {
    if (!firestore || typeof window === 'undefined') return;

    // 1. Obtenir ou générer un ID de périphérique persistant unique dans localStorage
    let deviceId = localStorage.getItem('app-device-id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('app-device-id', deviceId);
    }

    const userIdc = (localStorage.getItem('app-user-idc') || '').toUpperCase().trim();

    // Trouver l'agent correspondant à l'IDC ou Matricule connecté
    const matchedAgent = agents?.find(a => {
      if (!a || !userIdc) return false;
      const aId = String(a.id || '').toUpperCase().trim();
      const aReg = String(a.registrationNumber || '').toUpperCase().trim();
      return aId === userIdc || aReg === userIdc;
    });

    let displayName = '';
    if (matchedAgent) {
      displayName = matchedAgent.fullName;
    } else if (userIdc) {
      if (['0CWKIX', 'CQZSBH', 'VUCE1Z', 'QXTSLG'].includes(userIdc) || role === 'admin') {
        displayName = `Commandement (${userIdc})`;
      } else if (role === 'secretariat') {
        displayName = `Secrétariat (${userIdc})`;
      } else {
        displayName = `Agent (${userIdc})`;
      }
    } else if (role === 'admin') {
      displayName = 'Commandement Général';
    } else if (role === 'secretariat') {
      displayName = 'Poste Secrétariat';
    } else {
      displayName = `Terminal Agent (${deviceId.substring(0, 6)})`;
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
          agentId: matchedAgent?.id || null,
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
  }, [firestore, user, role, agents]);

  return null; // Composant de service en arrière-plan
}

