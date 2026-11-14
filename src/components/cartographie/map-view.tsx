'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Maximize2,
  Smartphone,
  Laptop,
  X,
  Tag,
  MapPin,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { safeToDate } from '@/lib/agents';

export interface CartoDevice {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  userEmail: string;
  role: string;
  userAgent: string;
  deviceType: string;
  lastActive: unknown;
}

interface MapViewProps {
  devices: CartoDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  isLoading?: boolean;
}

const hasValidCoords = (d: CartoDevice) =>
  typeof d.latitude === 'number' &&
  !Number.isNaN(d.latitude) &&
  typeof d.longitude === 'number' &&
  !Number.isNaN(d.longitude);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export default function MapView({
  devices,
  selectedDeviceId,
  onSelectDevice,
  isLoading = false,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayersRef = useRef<L.TileLayer[]>([]);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const circlesRef = useRef<{ [key: string]: L.Circle }>({});

  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<'standard' | 'hybrid' | 'satellite' | 'dark'>('standard');
  const [showAccuracyCircles, setShowAccuracyCircles] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hasFitBounds, setHasFitBounds] = useState(false);

  const validDevices = useMemo(() => devices.filter(hasValidCoords), [devices]);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrateur';
      case 'secretariat':
        return 'Secrétariat';
      case 'observer':
        return 'Agent / Ops';
      default:
        return 'Agent connecté';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return '#dc2626';
      case 'secretariat':
        return '#d97706';
      case 'observer':
        return '#2563eb';
      default:
        return '#059669';
    }
  };

  const isOnline = (device: CartoDevice) => {
    const dt = safeToDate(device.lastActive);
    if (!dt) return false;
    return Date.now() - dt.getTime() < 5 * 60 * 1000;
  };

  const selectedDevice = validDevices.find((d) => d.id === selectedDeviceId);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultCenter: L.LatLngExpression = [5.36, -4.0083];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: true,
    });

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

  // 2. Manage Base Tile Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    tileLayersRef.current.forEach((layer) => layer.remove());
    tileLayersRef.current = [];

    const newLayers: L.TileLayer[] = [];

    if (mapStyle === 'hybrid') {
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Esri, GIS User Community',
          maxZoom: 20,
          detectRetina: true,
        }
      ).addTo(map);
      newLayers.push(satLayer);

      const labelsLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; CARTO',
          maxZoom: 20,
          detectRetina: true,
        }
      ).addTo(map);
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
          url =
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
          attribution = 'Tiles &copy; Esri &mdash; Esri, GIS User Community';
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

  // 3. Render & Sync Markers and Accuracy Circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    const getInitials = (name: string) => {
      if (!name || name === 'Visiteur Anonyme') return 'AG';
      const clean = name.replace(/^(Commandement|Secrétariat|Agent|Terminal)\s*/i, '').trim();
      const parts = clean.split(/[\s._-]+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.substring(0, 2).toUpperCase() || 'AG';
    };

    const deviceMiniSvg = (type: string) =>
      type === 'mobile'
        ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`
        : `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>`;

    const createCustomIcon = (device: CartoDevice, isSelected: boolean) => {
      const color = getRoleColor(device.role);
      const online = isOnline(device);
      const size = isSelected ? 42 : 34;
      const initials = escapeHtml(getInitials(device.userEmail));

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
          ">
            ${
              online
                ? `<div class="custom-pulse-effect" style="border: 2px solid ${color};"></div>`
                : ''
            }
            <div style="
              width: ${size}px;
              height: ${size}px;
              background-color: ${isSelected ? '#0f172a' : color};
              border: ${isSelected ? '3px' : '2.5px'} solid ${isSelected ? color : '#ffffff'};
              border-radius: 50%;
              box-shadow: ${
                isSelected
                  ? '0 8px 20px rgba(15, 23, 42, 0.35)'
                  : '0 4px 10px rgba(15, 23, 42, 0.25)'
              };
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${isSelected ? '12px' : '11px'};
              font-weight: 700;
              font-family: 'Inter', system-ui, sans-serif;
              letter-spacing: 0.02em;
              color: #ffffff;
              z-index: 10;
              transition: transform 0.18s ease;
            ">
              ${initials}
            </div>
            <div style="
              position: absolute;
              bottom: -3px;
              right: -3px;
              background-color: #ffffff;
              color: #0f172a;
              border: 1.5px solid #cbd5e1;
              border-radius: 50%;
              width: 17px;
              height: 17px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 4px rgba(15, 23, 42, 0.18);
              z-index: 20;
            ">
              ${deviceMiniSvg(device.deviceType)}
            </div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    };

    const getPopupContent = (device: CartoDevice) => {
      const roleLabel = escapeHtml(getRoleLabel(device.role));
      const safeName = escapeHtml(device.userEmail);
      const online = isOnline(device);
      const dt = safeToDate(device.lastActive);
      const dateStr = dt
        ? dt.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'À l’instant';
      const accuracy = Math.round(device.accuracy || 0);

      return `
        <div class="sbssi-popup-card">
          <div class="sbssi-popup-header">
            <div class="sbssi-popup-title-group">
              <strong class="sbssi-popup-name">${safeName}</strong>
              <span class="sbssi-popup-sub">${roleLabel} · ${
                device.deviceType === 'mobile' ? 'Mobile' : 'Poste fixe'
              }</span>
            </div>
            <span class="sbssi-popup-status ${online ? 'is-online' : 'is-offline'}">
              <span class="sbssi-popup-dot"></span>
              ${online ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
          <div class="sbssi-popup-grid">
            <div class="sbssi-popup-metric">
              <span class="sbssi-popup-label">Précision GPS</span>
              <span class="sbssi-popup-value">±${accuracy} m</span>
            </div>
            <div class="sbssi-popup-metric">
              <span class="sbssi-popup-label">Dernier signal</span>
              <span class="sbssi-popup-value">${dateStr}</span>
            </div>
            <div class="sbssi-popup-coords">
              <span class="sbssi-popup-label">Coordonnées</span>
              <span class="sbssi-popup-mono">${device.latitude.toFixed(6)}, ${device.longitude.toFixed(6)}</span>
            </div>
          </div>
        </div>
      `;
    };

    const getTooltipHtml = (device: CartoDevice) => {
      const online = isOnline(device);
      const shortName = escapeHtml(device.userEmail.split('@')[0]);
      return `<span class="sbssi-tooltip-inner"><span class="sbssi-tooltip-dot ${
        online ? 'is-online' : 'is-offline'
      }"></span>${shortName}</span>`;
    };

    // Remove obsolete markers and circles
    Object.keys(markersRef.current).forEach((id) => {
      if (!validDevices.some((d) => d.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    Object.keys(circlesRef.current).forEach((id) => {
      if (!validDevices.some((d) => d.id === id)) {
        circlesRef.current[id].remove();
        delete circlesRef.current[id];
      }
    });

    // Add or update markers and circles
    validDevices.forEach((device) => {
      const isSelected = device.id === selectedDeviceId;
      const customIcon = createCustomIcon(device, isSelected);
      const latLng: L.LatLngExpression = [device.latitude, device.longitude];
      const color = getRoleColor(device.role);
      const tooltipHtml = getTooltipHtml(device);

      if (markersRef.current[device.id]) {
        const marker = markersRef.current[device.id];
        marker.setLatLng(latLng);
        marker.setIcon(customIcon);
        marker.getPopup()?.setContent(getPopupContent(device));
        if (showLabels) {
          if (!marker.getTooltip()) {
            marker.bindTooltip(tooltipHtml, {
              permanent: true,
              direction: 'top',
              className: 'custom-map-tooltip',
              offset: L.point(0, -22),
            });
          } else {
            marker.setTooltipContent(tooltipHtml);
          }
        } else if (marker.getTooltip()) {
          marker.unbindTooltip();
        }
      } else {
        const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
        marker.bindPopup(getPopupContent(device), {
          closeButton: false,
          offset: L.point(0, -8),
        });
        if (showLabels) {
          marker.bindTooltip(tooltipHtml, {
            permanent: true,
            direction: 'top',
            className: 'custom-map-tooltip',
            offset: L.point(0, -22),
          });
        }
        marker.on('click', () => {
          onSelectDevice(device.id);
        });
        markersRef.current[device.id] = marker;
      }

      const circleOptions: L.CircleMarkerOptions = {
        color,
        fillColor: color,
        fillOpacity: isSelected ? 0.18 : 0.08,
        weight: isSelected ? 1.5 : 1,
        dashArray: isSelected ? '4, 4' : undefined,
      };

      if (showAccuracyCircles) {
        if (circlesRef.current[device.id]) {
          const circle = circlesRef.current[device.id];
          circle.setLatLng(latLng);
          circle.setRadius(device.accuracy || 15);
          circle.setStyle(circleOptions);
        } else {
          const circle = L.circle(latLng, {
            ...circleOptions,
            radius: device.accuracy || 15,
          }).addTo(map);
          circlesRef.current[device.id] = circle;
        }
      } else if (circlesRef.current[device.id]) {
        circlesRef.current[device.id].remove();
        delete circlesRef.current[device.id];
      }
    });
  }, [validDevices, selectedDeviceId, mapReady, onSelectDevice, showAccuracyCircles, showLabels]);

  // 4. Center map on selected device
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !selectedDeviceId) return;

    const target = validDevices.find((d) => d.id === selectedDeviceId);
    if (target) {
      map.setView([target.latitude, target.longitude], 16, {
        animate: true,
        duration: 0.8,
      });

      const marker = markersRef.current[selectedDeviceId];
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [selectedDeviceId, validDevices, mapReady]);

  // Fit bounds helper
  const fitFleetBounds = () => {
    const map = mapInstanceRef.current;
    const markers = Object.values(markersRef.current);
    if (!map || !mapReady || markers.length === 0) return;

    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.18), {
      animate: true,
      duration: 0.8,
      maxZoom: 16,
    });
  };

  // Auto-fit bounds on initial device load
  useEffect(() => {
    if (mapReady && validDevices.length > 0 && !hasFitBounds) {
      fitFleetBounds();
      setHasFitBounds(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validDevices.length, mapReady, hasFitBounds]);

  const copyCoordinates = (lat: number, lng: number) => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedLastSeen = selectedDevice ? safeToDate(selectedDevice.lastActive) : null;
  const selectedOnline = selectedDevice ? isOnline(selectedDevice) : false;

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden bg-muted/30 flex flex-col">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes custom-pulse-ring {
          0% { transform: scale(0.75); opacity: 0.85; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        .custom-pulse-effect {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: custom-pulse-ring 2.2s cubic-bezier(0.25, 0, 0, 1) infinite;
          pointer-events: none;
        }
        .leaflet-popup-content-wrapper {
          background: hsl(var(--popover)) !important;
          color: hsl(var(--popover-foreground)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: 12px !important;
          box-shadow: 0 12px 28px -6px rgba(15, 23, 42, 0.22) !important;
          padding: 0 !important;
          font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
        }
        .leaflet-popup-content {
          margin: 12px 14px !important;
        }
        .leaflet-popup-tip {
          background: hsl(var(--popover)) !important;
          border: 1px solid hsl(var(--border)) !important;
        }
        .sbssi-popup-card {
          min-width: 230px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sbssi-popup-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .sbssi-popup-title-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .sbssi-popup-name {
          font-size: 13px;
          font-weight: 600;
          color: hsl(var(--foreground));
          max-width: 155px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sbssi-popup-sub {
          font-size: 11px;
          color: hsl(var(--muted-foreground));
        }
        .sbssi-popup-status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .sbssi-popup-status.is-online {
          color: #059669;
        }
        .dark .sbssi-popup-status.is-online {
          color: #34d399;
        }
        .sbssi-popup-status.is-offline {
          color: hsl(var(--muted-foreground));
        }
        .sbssi-popup-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }
        .sbssi-popup-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 12px;
        }
        .sbssi-popup-metric, .sbssi-popup-coords {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .sbssi-popup-coords {
          grid-column: span 2;
        }
        .sbssi-popup-label {
          font-size: 10px;
          font-weight: 500;
          color: hsl(var(--muted-foreground));
        }
        .sbssi-popup-value {
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--foreground));
          font-variant-numeric: tabular-nums;
        }
        .sbssi-popup-mono {
          font-size: 11px;
          font-weight: 500;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: hsl(var(--foreground));
          font-variant-numeric: tabular-nums;
        }
        .custom-map-tooltip {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: 8px !important;
          font-family: 'Inter', system-ui, sans-serif !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          padding: 3px 8px !important;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.14) !important;
        }
        .sbssi-tooltip-inner {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .sbssi-tooltip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
        }
        .sbssi-tooltip-dot.is-online {
          background: #10b981;
        }
        .sbssi-tooltip-dot.is-offline {
          background: #94a3b8;
        }
        .leaflet-tooltip-top:before {
          border-top-color: hsl(var(--card)) !important;
        }
        .leaflet-control-zoom a {
          background-color: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border)) !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: hsl(var(--muted)) !important;
        }
      `,
        }}
      />

      {/* Floating Controls HUD */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2 justify-between z-10 pointer-events-none">
        {/* Display & Viewport Actions */}
        <div className="flex flex-wrap items-center gap-1 pointer-events-auto bg-card/95 backdrop-blur-md border border-border p-1 rounded-xl shadow-md">
          <button
            type="button"
            onClick={() => setShowAccuracyCircles((v) => !v)}
            title="Afficher ou masquer les rayons de précision GPS"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              showAccuracyCircles
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            {showAccuracyCircles ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Rayons GPS
          </button>

          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            title="Afficher ou masquer les noms sur la carte"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              showLabels
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            Étiquettes
          </button>

          <button
            type="button"
            onClick={fitFleetBounds}
            disabled={validDevices.length === 0}
            title="Recadrer la carte sur tous les terminaux"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted/60 transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5 text-primary" />
            Recadrer
          </button>
        </div>

        {/* Map Base Layer Switcher */}
        <div className="flex items-center gap-1 pointer-events-auto bg-card/95 backdrop-blur-md border border-border p-1 rounded-xl shadow-md">
          {(
            [
              { id: 'standard', label: 'Plan' },
              { id: 'hybrid', label: 'Hybride' },
              { id: 'satellite', label: 'Satellite' },
              { id: 'dark', label: 'Sombre' },
            ] as const
          ).map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setMapStyle(layer.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                mapStyle === layer.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Leaflet Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px] flex-1" style={{ zIndex: 1 }} />

      {/* Selected Terminal Detail Card */}
      {selectedDevice && (
        <div className="absolute bottom-3 left-3 z-10 w-[calc(100%-1.5rem)] max-w-sm bg-card/95 backdrop-blur-md border border-border p-4 rounded-xl shadow-xl flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-muted text-foreground shrink-0">
                {selectedDevice.deviceType === 'mobile' ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  <Laptop className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate" title={selectedDevice.userEmail}>
                  {selectedDevice.userEmail}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{getRoleLabel(selectedDevice.role)}</span>
                  <span>·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      selectedOnline
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedOnline ? 'bg-emerald-500' : 'bg-muted-foreground/60'
                      }`}
                    />
                    {selectedOnline ? 'En ligne' : 'Hors ligne'}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectDevice(null)}
              aria-label="Fermer les détails du terminal"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Précision GPS
              </span>
              <p className="font-semibold text-foreground tabular-nums">
                ±{Math.round(selectedDevice.accuracy || 0)} mètres
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Dernier signal
              </span>
              <p className="font-semibold text-foreground tabular-nums">
                {selectedLastSeen
                  ? selectedLastSeen.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/70 border border-border px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-foreground tabular-nums truncate">
                {selectedDevice.latitude.toFixed(6)}, {selectedDevice.longitude.toFixed(6)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyCoordinates(selectedDevice.latitude, selectedDevice.longitude)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background transition-colors shrink-0 cursor-pointer"
              title="Copier les coordonnées GPS"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copié</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay (initial load only) */}
      {isLoading && validDevices.length === 0 && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">
            Chargement des positions en temps réel...
          </p>
        </div>
      )}

      {/* Non-blocking empty state badge when filters return 0 devices */}
      {!isLoading && validDevices.length === 0 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-full px-4 py-2 shadow-md flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Aucun terminal géolocalisé pour le filtre sélectionné
          </div>
        </div>
      )}
    </div>
  );
}
