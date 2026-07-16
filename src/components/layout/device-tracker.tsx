'use client';

import { useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useRole } from '@/hooks/use-role';

export function DeviceTracker() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { role } = useRole();

  useEffect(() => {
    if (!firestore || typeof window === 'undefined') return;

    // 1. Obtenir ou générer un ID de périphérique persistant unique dans localStorage
    let deviceId = localStorage.getItem('app-device-id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('app-device-id', deviceId);
    }

    let watchId: number | null = null;

    const updateLocation = async (position: GeolocationPosition) => {
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
          userEmail: user?.email || 'Visiteur Anonyme',
          role: role || 'visiteur',
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
      // Démarrer la surveillance de la position en temps réel
      watchId = navigator.geolocation.watchPosition(
        updateLocation,
        handleGeoError,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
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
  }, [firestore, user, role]);

  return null; // Composant de service en arrière-plan
}
