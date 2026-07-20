'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Layers, 
  Copy, 
  Check, 
  Crosshair, 
  Navigation, 
  Shield, 
  Eye, 
  EyeOff,
  Maximize2,
  Cpu,
  MapPin,
  Clock
} from 'lucide-react';

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
  const tileLayersRef = useRef<L.TileLayer[]>([]);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const circlesRef = useRef<{ [key: string]: L.Circle }>({});
  
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'standard' | 'satellite' | 'hybrid'>('standard');
  const [showAccuracyCircles, setShowAccuracyCircles] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hasFitBounds, setHasFitBounds] = useState(false);

  // Helper to format the role label
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'secretariat': return 'Secrétaire';
      case 'observer': return 'Observateur';
      default: return 'Visiteur';
    }
  };

  // Helper to get selected device data
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center at Abidjan, Côte d'Ivoire for high-precision regional operations
    const defaultCenter: L.LatLngExpression = [5.3600, -4.0083];
    const defaultZoom = 12;

    // Create Map with high precision features
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false, // Custom position handled later
      scrollWheelZoom: true,
    });

    // Add standard controls on the right side
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

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

  // 2. Manage Map Tile Style Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remove existing tile layers if any
    tileLayersRef.current.forEach((layer) => {
      layer.remove();
    });
    tileLayersRef.current = [];

    const newLayers: L.TileLayer[] = [];

    if (mapStyle === 'hybrid') {
      // 1. Satellite Base Layer
      const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, GIS User Community',
        maxZoom: 20,
        detectRetina: true,
      }).addTo(map);
      newLayers.push(satLayer);

      // 2. High Contrast Reference labels layer overlay
      const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 20,
        detectRetina: true,
      }).addTo(map);
      newLayers.push(labelsLayer);
    } else {
      let url = '';
      let attribution = '';

      switch (mapStyle) {
        case 'dark':
          url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
          attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
          break;
        case 'satellite':
          url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
          attribution = 'Tiles &copy; Esri &mdash; Source: Esri, GIS User Community';
          break;
        case 'standard':
        default:
          url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
          attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
          break;
      }

      const layer = L.tileLayer(url, {
        attribution,
        maxZoom: 20,
        detectRetina: true,
      }).addTo(map);
      newLayers.push(layer);
    }

    tileLayersRef.current = newLayers;
  }, [mapStyle, mapReady]);

  // 3. Render Markers & Accuracy Circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Helper to get roles colors
    const getRoleColor = (role: string) => {
      switch (role) {
        case 'admin': return '#ef4444'; // Red
        case 'secretariat': return '#f59e0b'; // Amber/Orange
        case 'observer': return '#3b82f6'; // Blue
        default: return '#10b981'; // Green
      }
    };

    // Helper to check active status
    const isOnline = (device: Device) => {
      if (!device.lastActive) return false;
      const now = Date.now();
      const lastActiveMs = device.lastActive.seconds * 1000;
      return (now - lastActiveMs) < 5 * 60 * 1000;
    };

    // Helper to compute initials
    const getInitials = (email: string) => {
      if (!email || email === 'Visiteur Anonyme') return 'VI';
      const part = email.split('@')[0];
      const parts = part.split(/[\._-]/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return part.substring(0, 2).toUpperCase();
    };

    // Helper to create custom divIcon
    const createCustomIcon = (device: Device, isSelected: boolean) => {
      const color = getRoleColor(device.role);
      const online = isOnline(device);
      const size = isSelected ? 42 : 34;
      const borderSize = isSelected ? '3px' : '2px';
      const shadow = isSelected 
        ? '0 0 15px rgba(0, 0, 0, 0.5), 0 0 10px rgba(16, 185, 129, 0.3)' 
        : '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
      const initials = getInitials(device.userEmail);

      return L.divIcon({
        className: 'custom-leaflet-icon-wrapper',
        html: `
          <div style="
            position: relative;
            width: ${size}px;
            height: ${size}px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease-in-out;
          ">
            <!-- Pulsing outer ring -->
            ${online ? `
              <div class="custom-pulse-effect" style="
                border: 2px solid ${color};
              "></div>
            ` : ''}

            <!-- Main marker node -->
            <div style="
              width: ${size}px;
              height: ${size}px;
              background-color: ${isSelected ? '#18181b' : color};
              border: ${borderSize} solid ${isSelected ? color : '#ffffff'};
              border-radius: 50%;
              box-shadow: ${shadow};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${isSelected ? '12px' : '10px'};
              font-weight: 700;
              font-family: monospace;
              color: ${isSelected ? color : '#ffffff'};
              z-index: 10;
              transition: all 0.2s ease-in-out;
            ">
              ${initials}
            </div>

            <!-- Mini device type indicator -->
            <div style="
              position: absolute;
              bottom: -4px;
              right: -4px;
              background-color: #18181b;
              border: 1px solid #3f3f46;
              border-radius: 50%;
              width: 16px;
              height: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 9px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
              z-index: 20;
            ">
              ${device.deviceType === 'mobile' ? '📱' : '💻'}
            </div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    };

    // Helper to construct popup HTML
    const getPopupContent = (device: Device) => {
      const roleLabel = getRoleLabel(device.role);
      const online = isOnline(device);
      const dateStr = device.lastActive 
        ? new Date(device.lastActive.seconds * 1000).toLocaleString('fr-FR')
        : 'En cours...';
        
      return `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; min-width: 240px; color: #f4f4f5;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid #27272a; padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${device.deviceType === 'mobile' ? '📱' : '💻'}</span>
              <strong style="color: #ffffff; font-size: 13px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${device.userEmail}</strong>
            </div>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: ${online ? 'rgba(16, 185, 129, 0.15)' : 'rgba(113, 113, 122, 0.15)'}; color: ${online ? '#34d399' : '#a1a1aa'}; border: 1px solid ${online ? 'rgba(16, 185, 129, 0.3)' : 'rgba(113, 113, 122, 0.3)'}; font-family: monospace;">
              ${online ? 'EN LIGNE' : 'INACTIF'}
            </span>
          </div>
          <div style="font-size: 11px; color: #d4d4d8; line-height: 1.6; display: flex; flex-direction: column; gap: 4px;">
            <div><strong style="color: #a1a1aa; font-family: monospace;">RÔLE :</strong> <span style="color: #ffffff; font-weight: 600;">${roleLabel.toUpperCase()}</span></div>
            <div><strong style="color: #a1a1aa; font-family: monospace;">PRÉCISION GPS :</strong> <span style="color: #34d399; font-weight: 700;">±${Math.round(device.accuracy)}m</span></div>
            <div><strong style="color: #a1a1aa; font-family: monospace;">LATITUDE :</strong> <span style="font-family: monospace; color: #ffffff;">${device.latitude.toFixed(6)}</span></div>
            <div><strong style="color: #a1a1aa; font-family: monospace;">LONGITUDE :</strong> <span style="font-family: monospace; color: #ffffff;">${device.longitude.toFixed(6)}</span></div>
            <div><strong style="color: #a1a1aa; font-family: monospace;">DERNIÈRE ACT :</strong> <span style="color: #e4e4e7;">${dateStr}</span></div>
          </div>
        </div>
      `;
    };

    // 1. Remove obsolete markers & circles
    Object.keys(markersRef.current).forEach((id) => {
      if (!devices.some(d => d.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    Object.keys(circlesRef.current).forEach((id) => {
      if (!devices.some(d => d.id === id)) {
        circlesRef.current[id].remove();
        delete circlesRef.current[id];
      }
    });

    // 2. Add or update markers & circles
    devices.forEach((device) => {
      const isSelected = device.id === selectedDeviceId;
      const customIcon = createCustomIcon(device, isSelected);
      const latLng: L.LatLngExpression = [device.latitude, device.longitude];
      const color = getRoleColor(device.role);

      const labelText = device.userEmail.split('@')[0];
      // --- Handle Marker ---
      if (markersRef.current[device.id]) {
        const marker = markersRef.current[device.id];
        marker.setLatLng(latLng);
        marker.setIcon(customIcon);
        marker.getPopup()?.setContent(getPopupContent(device));
        marker.setTooltipContent(labelText);
      } else {
        const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
        marker.bindPopup(getPopupContent(device), {
          closeButton: false,
          offset: L.point(0, -6),
        });
        marker.bindTooltip(labelText, {
          permanent: true,
          direction: 'top',
          className: 'custom-map-tooltip',
          offset: L.point(0, -22)
        });
        marker.on('click', () => {
          onSelectDevice(device.id);
        });
        markersRef.current[device.id] = marker;
      }

      // --- Handle Accuracy Circle ---
      const circleOptions = {
        color: color,
        fillColor: color,
        fillOpacity: isSelected ? 0.20 : 0.08,
        weight: isSelected ? 1.5 : 1,
        dashArray: isSelected ? '4, 4' : undefined,
        radius: device.accuracy || 15,
      };

      if (showAccuracyCircles) {
        if (circlesRef.current[device.id]) {
          const circle = circlesRef.current[device.id];
          circle.setLatLng(latLng);
          circle.setRadius(device.accuracy || 15);
          circle.setStyle(circleOptions);
        } else {
          const circle = L.circle(latLng, circleOptions).addTo(map);
          circlesRef.current[device.id] = circle;
        }
      } else {
        // Remove circle if toggled off
        if (circlesRef.current[device.id]) {
          circlesRef.current[device.id].remove();
          delete circlesRef.current[device.id];
        }
      }
    });

  }, [devices, selectedDeviceId, mapReady, onSelectDevice, showAccuracyCircles]);

  // 4. Center Map on Selected Device
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !selectedDeviceId) return;

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);
    if (selectedDevice) {
      map.setView([selectedDevice.latitude, selectedDevice.longitude], 16, {
        animate: true,
        duration: 1.0,
      });

      // Open corresponding popup
      const marker = markersRef.current[selectedDeviceId];
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [selectedDeviceId, devices, mapReady]);

  // Helper to fit map bounds to show all fleet markers
  const fitFleetBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || devices.length === 0) return;

    const group = L.featureGroup(Object.values(markersRef.current));
    map.fitBounds(group.getBounds().pad(0.15), {
      animate: true,
      duration: 1.0,
    });
  };

  // Auto-fit bounds on first load of devices to make positioning instantly precise
  useEffect(() => {
    if (mapReady && devices.length > 0 && !hasFitBounds) {
      fitFleetBounds();
      setHasFitBounds(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, mapReady, hasFitBounds]);

  // Helper to copy GPS coordinates to clipboard
  const copyCoordinates = (lat: number, lng: number) => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full h-full rounded-2xl border border-zinc-800/80 overflow-hidden shadow-2xl bg-zinc-950 flex flex-col">
      {/* Custom Styles for Pulse Effects, Leaflet dark popup & custom tooltips */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes custom-pulse-ring {
          0% { transform: scale(0.65); opacity: 0.95; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .custom-pulse-effect {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: custom-pulse-ring 2s cubic-bezier(0.25, 0, 0, 1) infinite;
          pointer-events: none;
        }
        .leaflet-popup-content-wrapper {
          background: #09090b !important;
          color: #f4f4f5 !important;
          border: 1px solid #27272a !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.6) !important;
          font-family: system-ui, -apple-system, sans-serif !important;
        }
        .leaflet-popup-tip {
          background: #09090b !important;
          border: 1px solid #27272a !important;
        }
        .custom-map-tooltip {
          background: #09090b !important;
          color: #34d399 !important; /* light green for ultra high visibility */
          border: 1px solid rgba(16, 185, 129, 0.45) !important;
          border-radius: 6px !important;
          font-family: monospace !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          padding: 2px 6px !important;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5) !important;
        }
        .leaflet-tooltip-top:before {
          border-top-color: #09090b !important;
        }
      `}} />

      {/* Floating Header Controls HUD (Style and Accuracy togglers) */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2 justify-between z-10 pointer-events-none">
        {/* Left Side Toggles (Accuracy Circle + Centering) */}
        <div className="flex gap-2 pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800 p-1.5 rounded-xl shadow-lg">
          <button
            onClick={() => setShowAccuracyCircles(!showAccuracyCircles)}
            title="Afficher/Masquer les rayons de précision"
            className={`p-2 rounded-lg transition-all border flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${
              showAccuracyCircles 
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {showAccuracyCircles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Précision
          </button>

          <button
            onClick={fitFleetBounds}
            title="Recadrer la carte sur la flotte"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
          >
            <Maximize2 className="h-4 w-4 text-emerald-400 animate-pulse" />
            Flotte
          </button>
        </div>

        {/* Right Side Style Layer Toggle */}
        <div className="flex gap-1 pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800 p-1.5 rounded-xl shadow-lg">
          <button
            onClick={() => setMapStyle('standard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mapStyle === 'standard' 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setMapStyle('hybrid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mapStyle === 'hybrid' 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Hybride
          </button>
          <button
            onClick={() => setMapStyle('satellite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mapStyle === 'satellite' 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => setMapStyle('dark')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mapStyle === 'dark' 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Tactique
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px] flex-1" style={{ zIndex: 1 }} />

      {/* Floating Bottom-Left Selected Device Dashboard Overlay */}
      {selectedDevice && (
        <div className="absolute bottom-4 left-4 z-10 w-full max-w-sm bg-zinc-950/95 backdrop-blur-md border border-zinc-850 p-4 rounded-xl shadow-2xl animate-fade-in flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2 border-b border-zinc-850 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-zinc-900 text-emerald-400 border border-zinc-800">
                <Cpu className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Détails de l'équipement</span>
                <span className="text-sm font-semibold text-white truncate max-w-[200px]" title={selectedDevice.userEmail}>
                  {selectedDevice.userEmail}
                </span>
              </div>
            </div>
            <button 
              onClick={() => onSelectDevice(null)}
              className="text-zinc-500 hover:text-zinc-300 text-xs font-mono p-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-500">RÔLE</span>
              <span className="text-zinc-200 font-semibold">{getRoleLabel(selectedDevice.role)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-500">TERMINAL</span>
              <span className="text-zinc-200 font-semibold flex items-center gap-1 uppercase">
                {selectedDevice.deviceType === 'mobile' ? '📱 Mobile' : '💻 Fixe'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 col-span-2 border-t border-zinc-900 pt-1.5">
              <span className="text-zinc-500">MÉTRIQUE PRÉCISION (GPS)</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-emerald-500" />
                Marge d'erreur : ±{Math.round(selectedDevice.accuracy)} mètres
              </span>
            </div>
            <div className="flex flex-col gap-0.5 col-span-2 border-t border-zinc-900 pt-1.5">
              <span className="text-zinc-500">COORDONNÉES TACTIQUES</span>
              <span className="text-zinc-300 font-semibold flex items-center justify-between bg-zinc-900 px-2 py-1 rounded border border-zinc-850 mt-0.5">
                <span className="text-[10px] tracking-tight">{selectedDevice.latitude.toFixed(6)}, {selectedDevice.longitude.toFixed(6)}</span>
                <button
                  onClick={() => copyCoordinates(selectedDevice.latitude, selectedDevice.longitude)}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 rounded transition-colors"
                  title="Copier les coordonnées GPS"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Fallback overlay */}
      {devices.length === 0 && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-semibold text-zinc-400 tracking-tight">En attente de transmission des coordonnées tactiques...</p>
        </div>
      )}
    </div>
  );
}
