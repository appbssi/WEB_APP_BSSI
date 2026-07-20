'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useRole } from '@/hooks/use-role';
import dynamic from 'next/dynamic';
import { 
  Map, 
  Tv, 
  Smartphone, 
  Laptop, 
  RefreshCw, 
  Compass, 
  Users, 
  ShieldCheck,
  Search,
  MapPin,
  Clock,
  Activity
} from 'lucide-react';

// Dynamic import of MapView to avoid SSR issues
const MapView = dynamic(() => import('@/components/cartographie/map-view'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] rounded-2xl border border-emerald-500/10 bg-zinc-950/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      <p className="text-sm text-zinc-400 font-medium tracking-tight">Initialisation du système radar...</p>
    </div>
  )
});

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

type FilterRole = 'all' | 'admin' | 'secretariat' | 'observer' | 'visiteur' | 'online';

export default function CartographiePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { role } = useRole();
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterRole>('all');
  const [refreshing, setRefreshing] = useState(false);

  // 1. Subscribe to Real-time Device Locations
  useEffect(() => {
    if (!firestore) return;

    const q = query(
      collection(firestore, 'device_locations'),
      orderBy('lastActive', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedDevices: Device[] = [];
      snapshot.forEach((doc) => {
        fetchedDevices.push({
          ...(doc.data() as Omit<Device, 'id'>),
          id: doc.id,
        });
      });
      setDevices(fetchedDevices);
      setLoading(false);
    }, (error) => {
      console.error('Erreur temps réel Cartographie:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  // 2. Refresh Geolocation manually
  const triggerManualPositionUpdate = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    setRefreshing(true);
    
    navigator.geolocation.getCurrentPosition(
      () => {
        setRefreshing(false);
      },
      (err) => {
        console.warn('Erreur de mise à jour manuelle:', err.message);
        setRefreshing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 3. Helper to determine if device is currently "Online" (active in last 5 minutes)
  const isOnline = (device: Device) => {
    if (!device.lastActive) return false;
    const now = Date.now();
    const lastActiveMs = device.lastActive.seconds * 1000;
    return (now - lastActiveMs) < 5 * 60 * 1000; // 5 minutes window
  };

  // 4. Statistics computations
  const stats = useMemo(() => {
    const total = devices.length;
    const onlineCount = devices.filter(isOnline).length;
    const mobileCount = devices.filter(d => d.deviceType === 'mobile').length;
    const desktopCount = devices.filter(d => d.deviceType === 'desktop').length;
    
    let sumAccuracy = 0;
    devices.forEach(d => sumAccuracy += d.accuracy || 0);
    const avgAccuracy = total > 0 ? Math.round(sumAccuracy / total) : 0;

    return { total, onlineCount, mobileCount, desktopCount, avgAccuracy };
  }, [devices]);

  // 5. Filter & Search Devices
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      // Search matching
      const matchesSearch = 
        device.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filter matching
      if (activeFilter === 'all') return true;
      if (activeFilter === 'online') return isOnline(device);
      return device.role === activeFilter;
    });
  }, [devices, searchQuery, activeFilter]);

  // Helper to get role translation
  const formatRole = (roleName: string) => {
    switch (roleName) {
      case 'admin': return 'Administrateur';
      case 'secretariat': return 'Secrétariat';
      case 'observer': return 'Observateur';
      default: return 'Visiteur';
    }
  };

  // Helper to get role styling classes
  const getRoleBadgeClasses = (roleName: string) => {
    switch (roleName) {
      case 'admin':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'secretariat':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'observer':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold tracking-widest text-emerald-500 uppercase font-mono">Radar de Connexion Tactique</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Map className="h-6 w-6 text-emerald-500" />
            Cartographie des Équipements
          </h1>
          <p className="text-sm text-zinc-400">
            Suivi géographique en temps réel de tous les appareils connectés et terminaux d'agents actifs.
          </p>
        </div>
        
        <button
          onClick={triggerManualPositionUpdate}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/25 transition-all duration-200 text-xs font-bold uppercase tracking-wider shadow-sm disabled:opacity-50 cursor-pointer self-start md:self-center"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Mise à jour...' : 'Actualiser ma Position'}
        </button>
      </div>

      {/* Grid Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Tv className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Total Terminaux</p>
            <p className="text-xl font-bold text-white font-mono mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Actifs (5 min)</p>
            <p className="text-xl font-bold text-white font-mono mt-0.5">{stats.onlineCount}</p>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Appareils Mobiles</p>
            <p className="text-xl font-bold text-white font-mono mt-0.5">{stats.mobileCount}</p>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Laptop className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Postes Fixes</p>
            <p className="text-xl font-bold text-white font-mono mt-0.5">{stats.desktopCount}</p>
          </div>
        </div>

        <div className="p-4 col-span-2 lg:col-span-1 bg-zinc-900/30 border border-zinc-800/60 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Précision Moyenne</p>
            <p className="text-xl font-bold text-white font-mono mt-0.5">±{stats.avgAccuracy}m</p>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Map Section (2/3 width) */}
        <div className="xl:col-span-2 bg-zinc-900/20 border border-zinc-800/50 rounded-2xl p-2 h-[600px] relative">
          <MapView 
            devices={filteredDevices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />
        </div>

        {/* Sidebar Devices Panel (1/3 width) */}
        <div className="space-y-4 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 h-[600px] flex flex-col">
          <div className="space-y-3.5">
            <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono">Radar de Terminaux</h3>
            
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Rechercher un terminal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-950 border border-zinc-850 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-zinc-800/50">
              {(['all', 'online', 'admin', 'secretariat', 'visiteur'] as FilterRole[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all cursor-pointer border ${
                    activeFilter === filter
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm'
                      : 'border-transparent bg-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  {filter === 'all' ? 'Tous' : filter === 'online' ? 'En ligne' : formatRole(filter)}
                </button>
              ))}
            </div>
          </div>

          {/* List scrollarea */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-zinc-500 gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                <p className="text-xs">Chargement de la flotte...</p>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-20 text-zinc-500 gap-2">
                <MapPin className="h-6 w-6 text-zinc-600 animate-pulse" />
                <p className="text-xs font-semibold text-zinc-400">Aucun terminal détecté</p>
                <p className="text-[11px] text-zinc-500 max-w-xs">Aucun équipement ne correspond aux critères de filtrage ou de recherche actuels.</p>
              </div>
            ) : (
              filteredDevices.map((device) => {
                const online = isOnline(device);
                const selected = device.id === selectedDeviceId;
                const formattedDate = device.lastActive
                  ? new Date(device.lastActive.seconds * 1000).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'N/A';

                return (
                  <div
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col gap-2 relative overflow-hidden ${
                      selected
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                        : 'bg-zinc-950/40 border-zinc-850 hover:bg-zinc-900/40 hover:border-zinc-800'
                    }`}
                  >
                    {/* Selected accent highlight background */}
                    {selected && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    )}

                    <div className="flex items-start justify-between gap-2 z-10">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          device.deviceType === 'mobile' 
                            ? 'bg-zinc-900 text-zinc-400' 
                            : 'bg-zinc-900 text-zinc-400'
                        }`}>
                          {device.deviceType === 'mobile' ? (
                            <Smartphone className="h-3.5 w-3.5" />
                          ) : (
                            <Laptop className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <p className={`text-xs font-semibold transition-colors truncate max-w-[170px] ${
                            selected ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'
                          }`}>
                            {device.userEmail}
                          </p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider w-max mt-1 ${getRoleBadgeClasses(device.role)}`}>
                            {formatRole(device.role)}
                          </span>
                        </div>
                      </div>

                      {/* Online/Offline Badge */}
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        online
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-800/30 text-zinc-500 border border-zinc-800/20'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                        {online ? 'EN LIGNE' : 'INACTIF'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-850/40 z-10">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-zinc-600" />
                        {device.latitude.toFixed(6)}, {device.longitude.toFixed(6)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-zinc-600" />
                        {formattedDate}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
