'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import type { Agent } from '@/lib/types';
import { safeToDate } from '@/lib/agents';
import type { CartoDevice } from '@/components/cartographie/map-view';
import dynamic from 'next/dynamic';
import {
  Map as MapIcon,
  Monitor,
  Smartphone,
  Laptop,
  RefreshCw,
  Compass,
  Radio,
  Search,
  MapPin,
  Clock,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

const MapView = dynamic(() => import('@/components/cartographie/map-view'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[560px] rounded-xl bg-muted/40 flex flex-col items-center justify-center gap-3">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground font-medium">
        Initialisation de la carte interactive...
      </p>
    </div>
  ),
});

type FilterRole = 'all' | 'online' | 'admin' | 'secretariat' | 'observer';

export default function CartographiePage() {
  const firestore = useFirestore();

  const agentsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'agents') : null),
    [firestore]
  );
  const { data: agents } = useCollection<Agent>(agentsQuery);

  const [devices, setDevices] = useState<CartoDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterRole>('all');
  const [refreshing, setRefreshing] = useState(false);

  const processedDevices = useMemo(() => {
    return devices.map((d) => {
      let displayName = d.userEmail;

      if (!displayName || displayName === 'Visiteur Anonyme' || displayName.includes('Anonyme')) {
        const record = d as unknown as { agentId?: string; userIdc?: string };
        const matched = agents?.find(
          (a) =>
            (record.agentId && a.id === record.agentId) ||
            (record.userIdc && (a.id === record.userIdc || a.registrationNumber === record.userIdc))
        );

        if (matched) {
          displayName = matched.fullName;
        } else if (d.role === 'admin') {
          displayName = 'Commandement / Admin';
        } else if (d.role === 'secretariat') {
          displayName = 'Poste Secrétariat';
        } else {
          displayName = `Agent (${d.id.substring(0, 6)})`;
        }
      }

      return {
        ...d,
        userEmail: displayName,
      };
    });
  }, [devices, agents]);

  useEffect(() => {
    if (!firestore) return;

    const q = query(collection(firestore, 'device_locations'), orderBy('lastActive', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedDevices: CartoDevice[] = [];
        snapshot.forEach((doc) => {
          fetchedDevices.push({
            ...(doc.data() as Omit<CartoDevice, 'id'>),
            id: doc.id,
          });
        });
        setDevices(fetchedDevices);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur temps réel Cartographie:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore]);

  const triggerManualPositionUpdate = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    setRefreshing(true);

    navigator.geolocation.getCurrentPosition(
      () => setRefreshing(false),
      (err) => {
        console.warn('Erreur de mise à jour manuelle:', err.message);
        setRefreshing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const isOnline = (device: CartoDevice) => {
    const dt = safeToDate(device.lastActive);
    if (!dt) return false;
    return Date.now() - dt.getTime() < 5 * 60 * 1000;
  };

  const stats = useMemo(() => {
    const total = processedDevices.length;
    const onlineCount = processedDevices.filter(isOnline).length;
    const mobileCount = processedDevices.filter((d) => d.deviceType === 'mobile').length;
    const desktopCount = processedDevices.filter((d) => d.deviceType === 'desktop').length;

    let sumAccuracy = 0;
    processedDevices.forEach((d) => {
      sumAccuracy += Number(d.accuracy) || 0;
    });
    const avgAccuracy = total > 0 ? Math.round(sumAccuracy / total) : 0;

    return { total, onlineCount, mobileCount, desktopCount, avgAccuracy };
  }, [processedDevices]);

  const filteredDevices = useMemo(() => {
    const queryLower = searchQuery.trim().toLowerCase();
    return processedDevices.filter((device) => {
      const matchesSearch =
        !queryLower ||
        device.userEmail.toLowerCase().includes(queryLower) ||
        device.id.toLowerCase().includes(queryLower);

      if (!matchesSearch) return false;
      if (activeFilter === 'all') return true;
      if (activeFilter === 'online') return isOnline(device);
      return device.role === activeFilter;
    });
  }, [processedDevices, searchQuery, activeFilter]);

  const formatRole = (roleName: string) => {
    switch (roleName) {
      case 'admin':
        return 'Admin';
      case 'secretariat':
        return 'Secrétariat';
      case 'observer':
        return 'Agents';
      default:
        return 'Agent';
    }
  };

  const formatRoleFull = (roleName: string) => {
    switch (roleName) {
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* Page Header */}
      <PageHeader
        icon={MapIcon}
        title="Cartographie des équipements"
        description="Suivi géographique en temps réel des terminaux et appareils connectés sur le terrain."
      >
        <Button size="sm" className="gap-1.5 font-semibold" onClick={triggerManualPositionUpdate} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualisation…' : 'Actualiser ma position'}
        </Button>
      </PageHeader>

      {/* Unified KPI Strip */}
      <div className="bg-card border border-border rounded-xl shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden">
        <div className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-muted text-foreground shrink-0">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total terminaux</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">En ligne (5 min)</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {stats.onlineCount}
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Appareils mobiles</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {stats.mobileCount}
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <Laptop className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Postes fixes</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {stats.desktopCount}
            </p>
          </div>
        </div>

        <div className="p-4 col-span-2 sm:col-span-1 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Précision moy.</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              ±{stats.avgAccuracy} m
            </p>
          </div>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Map Canvas (8 cols) */}
        <div className="xl:col-span-8 bg-card border border-border rounded-xl shadow-sm p-1.5 h-[560px] lg:h-[660px]">
          <MapView
            devices={filteredDevices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            isLoading={loading}
          />
        </div>

        {/* Terminal Directory Panel (4 cols) */}
        <div className="xl:col-span-4 bg-card border border-border rounded-xl shadow-sm h-[560px] lg:h-[660px] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Terminaux actifs</h2>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {filteredDevices.length} affiché{filteredDevices.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Rechercher un agent ou terminal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-9 text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Segmented Filter Control */}
            <div className="bg-muted p-1 rounded-lg flex flex-wrap gap-1">
              {(['all', 'online', 'admin', 'secretariat', 'observer'] as FilterRole[]).map(
                (filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`flex-1 min-w-fit px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      activeFilter === filter
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter === 'all'
                      ? 'Tous'
                      : filter === 'online'
                        ? 'En ligne'
                        : formatRole(filter)}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground gap-2.5">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm font-medium">Chargement des terminaux...</p>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center h-full py-16 px-6 text-muted-foreground gap-2">
                <MapPin className="h-7 w-7 text-muted-foreground/60" />
                <p className="text-sm font-semibold text-foreground">Aucun terminal trouvé</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Aucun équipement ne correspond aux critères de recherche ou de filtrage actuels.
                </p>
              </div>
            ) : (
              filteredDevices.map((device) => {
                const online = isOnline(device);
                const selected = device.id === selectedDeviceId;
                const lastDate = safeToDate(device.lastActive);
                const formattedDate = lastDate
                  ? lastDate.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'N/A';

                const hasCoords =
                  typeof device.latitude === 'number' &&
                  !Number.isNaN(device.latitude) &&
                  typeof device.longitude === 'number' &&
                  !Number.isNaN(device.longitude);

                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => setSelectedDeviceId(device.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer flex flex-col gap-2 ${
                      selected
                        ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            selected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {device.deviceType === 'mobile' ? (
                            <Smartphone className="h-4 w-4" />
                          ) : (
                            <Laptop className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              selected ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {device.userEmail}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                            {formatRoleFull(device.role)} · ±{Math.round(device.accuracy || 0)} m
                          </p>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${
                          online
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            online ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                          }`}
                        />
                        {online ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums pl-11">
                      <span className="flex items-center gap-1 font-mono truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {hasCoords
                          ? `${device.latitude.toFixed(5)}, ${device.longitude.toFixed(5)}`
                          : 'Coordonnées indisponibles'}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3 shrink-0" />
                        {formattedDate}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
