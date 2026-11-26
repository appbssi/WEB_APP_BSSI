
import { Timestamp } from 'firebase/firestore';

export type Agent = {
  id: string;
  fullName: string;
  registrationNumber?: string;
  rank: string;
  contact?: string;
  address: string;
  section: 'Armurerie' | 'Administration' | 'Officier' | 'Adjudants' | 'FAUNE' | 'CONDUCTEUR' | 'SECTION FEMININE' | 'DETACHEMENT NOE' | 'DETACHEMENT TINGRELA' | 'DETACHEMENT MORONDO' | 'Non assigné';
  photo?: string;
  leaveStartDate?: Timestamp;
  leaveEndDate?: Timestamp;
  availability?: Availability;
  missionCount?: number;
  onLeave?: boolean;
  detachement?: string | null;
};

export type Availability = 'Disponible' | 'En mission' | 'En congé' | 'En permission';

export type MissionStatus = 'En attente' | 'Planification' | 'En cours' | 'Terminée' | 'Annulée' | 'Rejetée';

export type MissionValidationStatus = 'En attente' | 'Validée' | 'Rejetée';

export type Mission = {
  id: string;
  name: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;
  endTime?: string;
  status: MissionStatus;
  validationStatus?: MissionValidationStatus;
  validatedBy?: string;
  validatedAt?: Timestamp;
  rejectionReason?: string;
  rejectedAt?: Timestamp;
  rejectedBy?: string;
  assignedAgentIds: string[];
  vehicleId?: string;
  leaderId?: string;
  detachement?: string | null;
  section?: string | null;
  createdAt?: Timestamp;
};

export type WeaponType = 'Arme de poing' | "Fusil d'assaut" | 'Munition' | 'Accessoire' | 'Casque' | 'Gilets par balle';
export type WeaponStatus = 'Fonctionnel' | 'En maintenance' | 'Hors service';

export type Weapon = {
  id: string;
  serialNumber: string;
  model: string;
  type: WeaponType;
  status: WeaponStatus;
  quantity: number;
  lastMaintenanceDate?: Timestamp;
};

export type WeaponAssignment = {
  id: string;
  weaponId: string;
  agentId: string;
  assignedAt: Timestamp;
  returnedAt: Timestamp | null;
  notes?: string;
  ammunitionCount?: number;
  magazineCount?: number;
  returnedAmmunitionCount?: number;
  munitionLotId?: string | null;
};

export type VehicleType = 'Pick-up' | '4x4' | 'Moto' | 'Camion' | 'Berline';
export type VehicleStatus = 'Opérationnel' | 'En panne' | 'En maintenance';

export type Vehicle = {
  id: string;
  plateNumber: string;
  model: string;
  type: VehicleType;
  status: VehicleStatus;
  mileage: number;
  lastMaintenanceDate?: Timestamp;
  nextMaintenanceMileage?: number;
};

export type AnomalySeverity = 'Faible' | 'Moyenne' | 'Critique';

export type VehicleAnomaly = {
  id: string;
  vehicleId: string;
  description: string;
  severity: AnomalySeverity;
  date: Timestamp;
  isResolved: boolean;
  reportedBy: string;
};

export type Gathering = {
  id: string;
  name: string;
  dateTime: Timestamp;
  assignedAgentIds: string[];
  absentAgentIds: string[];
  attendanceTimestamps?: Record<string, string>;
}

export type Visitor = {
  id: string;
  firstName: string;
  lastName: string;
  contact: string;
  /** Ancien champ « Fonction », plus demandé dans le formulaire */
  occupation?: string;
  /** N° de la pièce d'identité présentée */
  idNumber?: string;
  /** Motif de la visite */
  visitReason?: string;
  /** Immatriculation et marque du véhicule, s'il y en a un */
  vehiclePlate?: string;
  vehicleBrand?: string;
  entryTime: Timestamp;
  exitTime: Timestamp | null;
}

export type Detainee = {
  id: string;
  lastName: string;
  firstName: string;
  birthDate: Timestamp;
  photo?: string;
  entryTime: Timestamp;
  arrestLocation: string;
  arrestReason: string;
}

export type SaisieStatus = 'En Dépôt / Scellé' | 'Transféré au Parquet' | 'Restitué' | 'Détruit' | 'En Dépôt Coffre-Fort' | 'Gardien de Saisie';

export type Saisie = {
  id: string;
  designation: string;
  quantity: number;
  unit?: string;
  category: string;
  dateSaisie: Timestamp;
  location?: string;
  missionId?: string;
  /** N° de l'ordre de mission sous lequel la saisie a été faite */
  missionOrderNumber?: string;
  /** OPJ/APJ ayant procédé à la saisie */
  agentId?: string;
  agentName?: string;
  /** Qualité de l'agent saisissant : officier ou agent de police judiciaire */
  agentQualite?: 'OPJ' | 'APJ' | null;
  /** Contrevenants (une saisie peut en avoir plusieurs) */
  contrevenants?: string[];
  /** Personnes interpellées */
  interpelles?: string[];
  /** Ancien champ à un seul contrevenant — gardé pour les anciennes saisies, rempli avec la liste jointe */
  detaineeName?: string;
  /** Ancien champ interpellé (texte ou oui/non) — lu seulement pour les anciennes saisies */
  interpelle?: string | boolean | null;
  pvNumber?: string;
  status: SaisieStatus;
  notes?: string;
  createdAt?: Timestamp;
};

export type ActivityLog = {
    id: string;
    description: string;
    timestamp: Timestamp;
    type: 'Agent' | 'Mission' | 'Rassemblement' | 'Visiteur' | 'Général' | 'GAV' | 'Armurerie' | 'Logistique';
    link?: string;
}

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
};

export type Demande = {
  id: string;
  agentId: string;
  agentName: string;
  type: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason?: string;
  status: 'en_attente' | 'acceptee' | 'refusee';
  comment?: string;
  createdAt: Timestamp;
  notified: boolean;
  vu_par_agent: boolean;
  /**
   * Pièce jointe (justificatif) : seules les métadonnées sont ici ;
   * le fichier est dans `demandes/{id}/files/piece_jointe` (chargé à la demande).
   */
  attachment?: { name: string; mimeType: string } | null;
};

export type Explication = {
  id: string;
  agentId: string;
  agentName: string;
  requestText: string;
  requestDate: Timestamp;
  replyText?: string;
  replyDate?: Timestamp | null;
  // 'lu' | 'archive' | 'accepte' : anciens statuts encore présents dans d'anciens documents Firestore
  status: 'en_attente' | 'repondu' | 'sanctionne' | 'lu' | 'archive' | 'accepte';
  sanctionText?: string;
  sanctionDate?: Timestamp | null;
  notifiedAgent: boolean;
  notifiedAdmin: boolean;
  notifiedAgentSanction?: boolean;
};

// --- Volet Information (renseignement) ---

export type InformationPriority = 'basse' | 'moyenne' | 'haute' | 'urgente';

export type Information = {
  id: string;
  /** Provenance de l'information (informateur, service, appel, patrouille…) */
  source: string;
  /** Objet : ce que rapporte l'information */
  objet: string;
  /** Degré de priorité */
  priority: InformationPriority;
  createdAt: Timestamp;
  /** IDC de la personne qui a enregistré l'information */
  createdBy: string;
};

// --- Volet Renseignement : enquête menée sur une information, puis compte rendu ---

export type RenseignementStatus = 'en_cours' | 'termine';

/** Résultat du renseignement, indiqué dans le compte rendu */
export type RenseignementConclusion = 'confirmee' | 'partielle' | 'infirmee' | 'indeterminee';

export type Renseignement = {
  id: string;
  /** Information à l'origine du renseignement */
  informationId: string;
  /** Copie de l'information au moment de l'ouverture (lisible même si elle est supprimée) */
  informationSource: string;
  informationObjet: string;
  informationPriority: InformationPriority;
  /** Agents chargés du renseignement (documents « agents ») */
  assignedAgentIds?: string[];
  /** Noms des agents chargés, au moment de l'ouverture */
  assignedTo: string;
  /** Consignes / axes de recherche */
  instructions?: string;
  status: RenseignementStatus;
  startedAt: Timestamp;
  createdBy: string;
  /** Compte rendu, rédigé à la fin du renseignement */
  compteRendu?: string;
  conclusion?: RenseignementConclusion;
  compteRenduAt?: Timestamp | null;
  compteRenduBy?: string;
};
