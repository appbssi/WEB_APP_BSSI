import type { Timestamp } from 'firebase/firestore';
import { compressImageToDataUrl } from '@/lib/image-compress';

/**
 * Volet « Ordres de mission signés » :
 * l'ordre généré est imprimé (« tiré »), signé à la main, puis scanné et archivé ici.
 *
 * Collection `signed_orders/{id de l'ordre dans pdf_documents}` ;
 * les pages scannées sont dans la sous-collection `files` (un document par page,
 * pour rester sous la limite de 1 Mo par document Firestore).
 */
export type SignedOrderStatus = 'a_signer' | 'archive';

export type SignedOrder = {
  id: string;
  pdfDocId: string;
  missionId: string | null;
  missionName: string;
  status: SignedOrderStatus;
  printedAt?: Timestamp | null;
  printCount?: number;
  /** Date portée sur l'ordre signé */
  signedOn?: Timestamp | null;
  signatory?: string;
  notes?: string;
  archivedAt?: Timestamp | null;
  fileCount?: number;
  /**
   * Agents de la mission qui peuvent consulter l'ordre signé (identifiants de fiche + matricules).
   * Rempli uniquement à l'archivage : vide tant que l'ordre n'est pas signé.
   */
  agentIds?: string[];
};

/** Identifiants des agents désignés par la mission (fiches et matricules), pour le partage de l'ordre signé. */
export function missionAgentKeys(order: {
  assignedAgentIds?: string[];
  agentIds?: string[];
  missionData?: { agents?: { id?: string; registrationNumber?: string }[] } | null;
}): string[] {
  const keys = [
    ...(order.assignedAgentIds ?? []),
    ...(order.agentIds ?? []),
    ...(order.missionData?.agents ?? []).flatMap((a) => [a?.id, a?.registrationNumber]),
  ];
  return Array.from(new Set(keys.filter((k): k is string => typeof k === 'string' && k.trim() !== '').map((k) => k.trim())));
}

export type SignedOrderFile = {
  id: string;
  index: number;
  name: string;
  mimeType: string;
  dataUrl: string;
};

/** État affiché d'un ordre de mission généré */
export type OrderStage = 'a_imprimer' | 'a_signer' | 'archive';

export function getOrderStage(record?: Pick<SignedOrder, 'status' | 'printedAt'> | null): OrderStage {
  if (record?.status === 'archive') return 'archive';
  if (record?.printedAt) return 'a_signer';
  return 'a_imprimer';
}

export const STAGE_LABELS: Record<OrderStage, string> = {
  a_imprimer: 'À imprimer',
  a_signer: 'À signer',
  archive: 'Archivé',
};

export const MAX_SCAN_FILES = 10;
/** Taille maximale d'un PDF scanné (le base64 ajoute ~33 % : reste sous 1 Mo par document) */
export const MAX_PDF_BYTES = 700 * 1024;
const SCAN_MAX_CHARS = 900_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Impossible de lire « ${file.name} ».`));
    reader.readAsDataURL(file);
  });
}

/**
 * Prépare une page scannée pour l'archivage :
 * image → redimensionnée et compressée en JPEG (texte et signature restent lisibles) ;
 * PDF → conservé tel quel s'il fait moins de 700 Ko.
 */
export async function prepareScanFile(file: File): Promise<Omit<SignedOrderFile, 'id' | 'index'>> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        `« ${file.name} » est trop lourd (${Math.round(file.size / 1024)} Ko, 700 Ko maximum). ` +
          'Scannez en qualité standard, ou envoyez une photo/image de chaque page.',
      );
    }
    return { name: file.name, mimeType: 'application/pdf', dataUrl: await readAsDataUrl(file) };
  }
  if (file.type.startsWith('image/')) {
    const dataUrl = await compressImageToDataUrl(file, { maxSize: 1800, quality: 0.8, maxOutputChars: SCAN_MAX_CHARS });
    return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl };
  }
  throw new Error(`« ${file.name} » n'est ni une image ni un PDF.`);
}
