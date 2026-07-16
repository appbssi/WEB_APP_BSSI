'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Device {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  userEmail: string;
  role: string;
  userAgent: string;
  deviceType: string;
  lastActive: any; // Firestore Timestamp
}

interface MapViewProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
}

export default function MapView({ devices, selectedDeviceId, onSelectDevice }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const [mapReady, setMapReady] = useState(false);

  // Helper to format the role label
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'secretariat': return 'Secrétaire';
      case 'observer': return 'Observateur';
      default: return 'Visiteur';
    }
  };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center at Paris/France or middle of Europe
    const defaultCenter: L.LatLngExpression = [46.2276, 2.2137];
    const defaultZoom = 5;

    // Create Map
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Add standard OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.piston.cc/mapnik/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Fallback if the standard tile provider fails
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // 2. Render Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Helper to get roles colors
    const getRoleColor = (role: string) => {
      switch (role) {
        case 'admin': return '#ef4444'; // Red
        case 'secretariat': return '#f59e0b'; // Amber/Orange
        case 'observer': return '#3b82f6'; // Blue
        default: return '#10b981'; // Green (Military theme)
      }
    };

    // Helper to create custom divIcon
    const createCustomIcon = (device: Device, isSelected: boolean) => {
      const color = getRoleColor(device.role);
      const size = isSelected ? 40 : 32;
      const borderSize = isSelected ? '4px' : '2.5px';
      const shadow = isSelected 
        ? '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)' 
        : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';

      return L.divIcon({
        className: 'custom-leaflet-icon',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background-color: ${color};
            border: ${borderSize} solid #ffffff;
            border-radius: 50%;
            box-shadow: ${shadow};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${isSelected ? '18px' : '14px'};
            transition: all 0.2s ease-in-out;
            cursor: pointer;
            position: relative;
          ">
            ${device.deviceType === 'mobile' ? '📱' : '💻'}
            ${isSelected ? `
              <span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
            ` : ''}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    };

    // Helper to construct popup HTML
    const getPopupContent = (device: Device) => {
      const roleLabel = getRoleLabel(device.role);
      const dateStr = device.lastActive 
        ? new Date(device.lastActive.seconds * 1000).toLocaleString('fr-FR')
        : 'En cours...';
        
      return `
        <div style="font-family: sans-serif; padding: 4px; min-width: 200px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 16px;">${device.deviceType === 'mobile' ? '📱' : '💻'}</span>
            <strong style="color: #111827; font-size: 14px;">${device.userEmail}</strong>
          </div>
          <div style="font-size: 11px; color: #4b5563; margin-bottom: 4px;">
            <strong>Rôle:</strong> ${roleLabel}<br/>
            <strong>Précision:</strong> ±${Math.round(device.accuracy)}m<br/>
            <strong>Activité:</strong> ${dateStr}
          </div>
          <div style="font-size: 10px; color: #9ca3af; word-break: break-all;">
            <strong>ID:</strong> ${device.id.substring(0, 15)}...
          </div>
        </div>
      `;
    };

    // Remove obsolete markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!devices.some(d => d.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    devices.forEach((device) => {
      const isSelected = device.id === selectedDeviceId;
      const customIcon = createCustomIcon(device, isSelected);
      const latLng: L.LatLngExpression = [device.latitude, device.longitude];

      if (markersRef.current[device.id]) {
        // Update existing marker position & icon
        const marker = markersRef.current[device.id];
        marker.setLatLng(latLng);
        marker.setIcon(customIcon);
        
        // Update Popup
        marker.getPopup()?.setContent(getPopupContent(device));
      } else {
        // Create new marker
        const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
        
        // Add Popup
        marker.bindPopup(getPopupContent(device), {
          closeButton: false,
          offset: L.point(0, -5),
        });

        // Add events
        marker.on('click', () => {
          onSelectDevice(device.id);
        });

        markersRef.current[device.id] = marker;
      }
    });

    // Fit map bounds to show all markers if it's the first render or markers are added
    if (devices.length > 0 && Object.keys(markersRef.current).length === devices.length && !selectedDeviceId) {
      const group = L.featureGroup(Object.values(markersRef.current));
      map.fitBounds(group.getBounds().pad(0.15));
    }

  }, [devices, selectedDeviceId, mapReady, onSelectDevice]);

  // 3. Center Map on Selected Device
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !selectedDeviceId) return;

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);
    if (selectedDevice) {
      map.setView([selectedDevice.latitude, selectedDevice.longitude], 15, {
        animate: true,
        duration: 1.0,
      });

      // Open the corresponding popup
      const marker = markersRef.current[selectedDeviceId];
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [selectedDeviceId, devices, mapReady]);

  return (
    <div className="relative w-full h-full rounded-2xl border border-border overflow-hidden shadow-sm">
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" style={{ zIndex: 1 }} />
      {devices.length === 0 && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
          <span className="animate-bounce text-2xl">📍</span>
          <p className="text-sm font-medium text-muted-foreground">En attente de données de géolocalisation...</p>
        </div>
      )}
    </div>
  );
}
