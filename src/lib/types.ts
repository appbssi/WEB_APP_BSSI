
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
};

export type Availability = 'Disponible' | 'En mission' | 'En congé';

export type MissionStatus = 'Planification' | 'En cours' | 'Terminée' | 'Annulée';

export type Mission = {
  id: string;
  name: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;
  endTime?: string;
  status: MissionStatus;
  assignedAgentIds: string[];
  vehicleId?: string;
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
  financeStatus?: 'En attente' | 'Validé' | 'Refusé';
};

export type Gathering = {
  id: string;
  name: string;
  dateTime: Timestamp;
  assignedAgentIds: string[];
  absentAgentIds: string[];
}

export type Visitor = {
  id: string;
  firstName: string;
  lastName: string;
  contact: string;
  occupation: string;
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

export type ActivityLog = {
    id: string;
    description: string;
    timestamp: Timestamp;
    type: 'Agent' | 'Mission' | 'Rassemblement' | 'Visiteur' | 'Général' | 'GAV' | 'Armurerie' | 'Logistique';
    link?: string;
}

export type ExpenseCategory = 'Opérationnel' | 'Matériel' | 'Transport' | 'Logistique' | 'Autre';
export type ExpenseStatus = 'Validé' | 'En attente' | 'Refusé';

export type Expense = {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: Timestamp;
  status: ExpenseStatus;
  missionId?: string | null;
  anomalyId?: string | null;
};

export type Allocation = {
  id: string;
  agentId: string;
  amount: number;
  purpose: string;
  date: Timestamp;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
};
