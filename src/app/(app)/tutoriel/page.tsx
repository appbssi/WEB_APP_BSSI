'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Zap,
  Lock,
  FileCheck2,
  Users,
  Sword,
  Rocket,
  CalendarClock,
  PackageCheck,
  BookUser,
  Banknote,
  Map,
  QrCode,
  Search,
  CheckCircle2,
  Printer,
  Sparkles,
  HelpCircle,
  Clock,
  Layers,
  ChevronRight,
  Fingerprint,
  FileText,
  BadgeAlert,
  ArrowRight,
  Award,
  KeyRound,
  Eye,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const advantages = [
    {
      id: 'adv-1',
      title: 'Zéro Perte de Données & Dématérialisation Totale',
      category: 'Productivité',
      icon: Zap,
      badge: 'Gain de Temps',
      description:
        "Fini les registres papier égarés, raturés ou détériorés. Toutes les opérations (dotations d'armes, arrestations, scellés, convocations) sont centralisées et sauvegardées en temps réel sur une base souveraine hautement sécurisée.",
      points: [
        'Économie de plus de 70% du temps administratif quotidien pour les officiers et secrétaires.',
        'Recherche instantanée d’un agent, d’un scellé ou d’un procès-verbal en quelques secondes.',
        'Accès simultané et synchronisé entre les postes de commandement et les unités de terrain.',
      ],
    },
    {
      id: 'adv-2',
      title: 'Chaîne de Traçabilité Inviolable & Responsabilisation',
      category: 'Sécurité',
      icon: Lock,
      badge: 'Anti-Fraude',
      description:
        "Chaque action est signée, horodatée à la seconde près et rattachée à l'identifiant certifié (IDC) de l'opérateur. L'historique d'une arme, d'une pièce à conviction ou d'un gardé à vue ne peut être altéré.",
      points: [
        "Audit trail complet : qui a sorti l'arme, à quelle heure, pour quelle mission, et qui l'a réceptionnée.",
        'Élimination des contestations grâce à la double validation obligatoire (Agent + Armurier/Officier).',
        'Registre des modifications certifié et consultable uniquement par le Haut Commandement.',
      ],
    },
    {
      id: 'adv-3',
      title: 'Conformité Légale & Respect des Droits de la Personne',
      category: 'Juridique',
      icon: ShieldCheck,
      badge: 'Réglementaire',
      description:
        "Le module de Garde à Vue (GAV) intègre un chronomètre réglementaire strict (48h/72h) avec alertes visuelles progressives, garantissant qu'aucune détention ne dépasse le délai légal prescrit par le Code de Procédure Pénale.",
      points: [
        'Alertes en direct (Normal -> Attention -> Urgence critique) pour éviter toute détention arbitraire.',
        'Enregistrement exhaustif des droits notifiés, examens médicaux et visites d’avocats.',
        'Génération automatique des procès-verbaux de levée et de déferrement au Parquet.',
      ],
    },
    {
      id: 'adv-4',
      title: 'Visibilité Tactique & Décisionnelle en Temps Réel',
      category: 'Opérations',
      icon: Layers,
      badge: 'Tactique',
      description:
        "Le commandement dispose d'une vue panoramique instantanée : effectifs disponibles, missions en cours, cartographie des patrouilles et stocks d'armurerie par détachement.",
      points: [
        'Cartographie interactive des unités déployées et des points névralgiques.',
        'Tableaux de bord dynamiques avec jauges opérationnelles et alertes de fin de mission.',
        'Filtrage instantané par détachement territorial ou vision nationale unifiée.',
      ],
    },
    {
      id: 'adv-5',
      title: 'Documents Officiels Certifiés & Normalisés',
      category: 'Secrétariat',
      icon: FileCheck2,
      badge: 'Authentifié',
      description:
        "Création en un clic d'ordres de mission, de convocations, d'attestations et de feuilles d'émargement au format PDF haute résolution avec armoiries nationales, filigrane antifraude, signature électronique et tampon officiel sBSSI.",
      points: [
        'En-tête officiel de la République de Côte d’Ivoire et estampille de sécurité.',
        'Génération conforme prête pour transmission aux autorités judiciaires ou ministérielles.',
        'Impression optimisée et export direct sans manipulation graphique manuelle.',
      ],
    },
    {
      id: 'adv-6',
      title: 'Pointage Rapide par Scanner QR Code Biométrique',
      category: 'Agents',
      icon: QrCode,
      badge: 'Biométrique & QR',
      description:
        'Chaque agent dispose d’une carte d’identification officielle dotée d’un QR Code crypté. Les appels de rassemblement et les contrôles de sécurité se font en une fraction de seconde avec un smartphone ou une webcam.',
      points: [
        'Pointage de plus de 100 agents en moins de 3 minutes lors des rassemblements matinaux.',
        'Détection instantanée des matricules non reconnus ou suspendus.',
        'Calcul immédiat du taux de présence et génération de la feuille d’émargement signée.',
      ],
    },
  ];

  const securityFeatures = [
    {
      id: 'sec-1',
      title: 'Contrôle d’Accès Basé sur les Rôles (RBAC Étanche)',
      icon: KeyRound,
      tag: 'Architecture',
      description:
        "L'accès aux différentes fonctionnalités est strictement compartimenté selon le profil de l'utilisateur :",
      details: [
        'Administrateur (Haut Commandement) : Contrôle total, validation des demandes, gestion des armes, finances et logs d’audit.',
        'Secrétariat (Greffe & Chancellerie) : Enregistrement des GAV, saisies, rédaction des actes officiels et suivi des rassemblements.',
        'Observateur / Agent de terrain : Consultation restreinte aux missions assignées, pointages et soumission de demandes individuelles.',
      ],
    },
    {
      id: 'sec-2',
      title: 'Codes QR Sécurisés & Signature Numérique Structurée',
      icon: Fingerprint,
      tag: 'Cryptographie',
      description:
        'Le QR code attribué à chaque agent ne contient pas simplement un lien Web vulnérable, mais une structure JSON sécurisée intégrant son identifiant IDC unique, son matricule d’incorporation et un hash d’intégrité.',
      details: [
        'Résistant aux tentatives de falsification ou de duplication de badges plastifiés.',
        'Vérification croisée immédiate contre le registre chiffré de la base de données.',
        'Indicateur visuel vert de confirmation en temps réel dans le scanner optique.',
      ],
    },
    {
      id: 'sec-3',
      title: 'Piste d’Audit Inaltérable & Journalisation des Actions',
      icon: Eye,
      tag: 'Traçabilité',
      description:
        'Chaque opération critique fait l’objet d’une entrée automatique dans le journal d’audit (Recent Activities) :',
      details: [
        'Enregistrement de l’heure exacte (timestamp ISO certifié), de l’adresse IP/terminal et du rôle de l’utilisateur.',
        'Impossibilité pour un utilisateur de supprimer ou modifier les traces de ses propres actions.',
        'Consultation disponible pour les inspections générales et les enquêtes internes.',
      ],
    },
    {
      id: 'sec-4',
      title: 'Protection & Scellés Numériques des Pièces à Conviction',
      icon: PackageCheck,
      tag: 'Juridique',
      description:
        'Le registre des scellés assure la continuité de la chaîne de garde judiciaire :',
      details: [
        'Attribution d’un numéro de scellé unique non réutilisable.',
        'Enregistrement de l’état, des photographies, de la valeur estimée et du lieu précis de mise sous clé.',
        'Procès-verbal de sortie ou de restitution avec mention expresse de la destination (laboratoire, tribunal, destruction).',
      ],
    },
    {
      id: 'sec-5',
      title: 'Horodatage & Filigrane Antifraude sur les Documents PDF',
      icon: FileText,
      tag: 'Authenticité',
      description:
        'Tous les PDF générés par le moteur du logiciel embarquent un ensemble de dispositifs de sécurité anti-reproduction :',
      details: [
        'Armoiries officielles de la Côte d’Ivoire haute précision et blason sBSSI.',
        'Signature électronique calligraphiée et cachet circulaire officiel.',
        'Filigrane de fond et mention légale d’authenticité en pied de page.',
      ],
    },
    {
      id: 'sec-6',
      title: 'Surveillance des Sessions & Verrouillage Automatique',
      icon: Lock,
      tag: 'Système',
      description:
        'Protection contre les accès opportunistes en cas de poste laissé sans surveillance :',
      details: [
        'Gestion sécurisée des tokens d’authentification via Firebase Auth souverain.',
        'Bouton de déconnexion rapide dans l’en-tête permettant de clôturer immédiatement la session.',
        'Isolation hermétique des données entre les différents détachements régionaux.',
      ],
    },
  ];

  const modules = [
    {
      id: 'mod-dashboard',
      name: '1. Tableau de Bord Stratégique',
      icon: Layers,
      href: '/dashboard',
      role: 'Tous rôles (vue adaptée)',
      summary: 'Centre névralgique de visualisation de la disponibilité et de l’état des forces.',
      inputs: 'Données agrégées en temps réel de tous les sous-systèmes.',
      howTo: [
        'Consultez les cartes KPI en haut de page (Total Agents, En mission, Armes disponibles, GAV actives).',
        'Surveillez le graphique de répartition par détachement et le taux d’alerte.',
        'Consultez la liste des dernières activités enregistrées pour détecter toute anomalie.',
      ],
      securityRule: 'Les agents de terrain n’ont accès qu’aux informations de leur propre détachement.',
    },
    {
      id: 'mod-agents',
      name: '2. Gestion des Agents & Badges QR',
      icon: Users,
      href: '/agents',
      role: 'Administrateur, Observateur',
      summary: 'Répertoire complet des effectifs de la Brigade, matricules et fiches d’identification.',
      inputs: 'Nom, prénom, matricule, grade, unité, photo, contacts d’urgence.',
      howTo: [
        'Cliquez sur "+ Nouvel Agent" pour enregistrer une recrue avec son matricule.',
        'Utilisez le bouton "Scanner QR" pour vérifier instantanément l’identité d’un agent sur le terrain.',
        'Cliquez sur "Badge & QR" sur la fiche d’un agent pour générer sa carte officielle imprimable.',
      ],
      securityRule: 'Chaque carte d’identité contient un QR code crypté vérifié en temps réel dans la base sBSSI.',
    },
    {
      id: 'mod-armurerie',
      name: '3. Armurerie & Munitions',
      icon: Sword,
      href: '/armurerie',
      role: 'Administrateur',
      summary: 'Gestion rigoureuse du parc d’armes à feu, munitions et dotations tactiques.',
      inputs: 'Modèle d’arme, numéro de série, calibre, statut (En stock, En dotation, En révision).',
      howTo: [
        'Enregistrez chaque arme neuve avec son numéro de série unique.',
        'Pour attribuer une arme : sélectionnez l’agent, la mission associée et validez la décharge.',
        'Pour réintégrer une arme : cliquez sur "Réintégrer", saisissez les munitions tirées et contrôlez l’état.',
      ],
      securityRule: 'Alerte immédiate si une arme n’est pas réintégrée à la date d’échéance de la mission.',
    },
    {
      id: 'mod-missions',
      name: '4. Missions & Déploiements Tactiques',
      icon: Rocket,
      href: '/missions',
      role: 'Administrateur, Observateur',
      summary: 'Planification, exécution et suivi des opérations de terrain.',
      inputs: 'Intitulé de mission, type (Surveillance, Intervention, Escorte), agents assignés, dates.',
      howTo: [
        'Créez une mission en spécifiant les objectifs, le chef de mission et l’équipe.',
        'Générez l’Ordre de Mission officiel au format PDF signé.',
        'Suivez l’avancement (Planifiée -> En cours -> Terminée) et clôturez avec rapport.',
      ],
      securityRule: 'Les agents reçoivent une notification et leur badge est requis pour validation de départ.',
    },
    {
      id: 'mod-gav',
      name: '5. Garde à Vue (GAV) & Registre Judiciaire',
      icon: Lock,
      href: '/gav',
      role: 'Administrateur, Secrétariat',
      summary: 'Chronométrage légal et suivi scrupuleux des personnes retenues.',
      inputs: 'Identité du gardé à vue, motif légal, officier enquêteur, date/heure exacte de début.',
      howTo: [
        'Cliquez sur "Nouveau GAV" dès l’arrivée de la personne au poste.',
        'Renseignez les notifications de droits (avocat, médecin, famille).',
        'Surveillez le badge chronomètre (compte à rebours 48h/72h).',
        'À l’issue, clôturez par "Libération" ou "Déferrement au Parquet" avec PV.',
      ],
      securityRule: 'Alerte visuelle clignotante à 4h de l’échéance légale pour prévenir tout dépassement.',
    },
    {
      id: 'mod-saisies',
      name: '6. Saisies & Registre des Scellés',
      icon: PackageCheck,
      href: '/saisies',
      role: 'Administrateur, Secrétariat, Observateur',
      summary: 'Inventaire infalsifiable des objets et substances sous main de justice.',
      inputs: 'Description, quantité, catégorie (Armes, Stupéfiants, Devises, Véhicules), lieu de dépôt.',
      howTo: [
        'Créez un scellé avec numéro d’inventaire officiel et valeur estimée.',
        'Imprimez la fiche de scellé pour collage sur le sachet ou coffre.',
        'Enregistrez les mouvements de pièces avec visa de l’autorité judiciaire.',
      ],
      securityRule: 'Chaque mouvement requiert la signature de l’officier déposant et du greffier.',
    },
    {
      id: 'mod-gatherings',
      name: '7. Rassemblements & Feuilles d’Émargement',
      icon: CalendarClock,
      href: '/gatherings',
      role: 'Administrateur, Secrétariat, Observateur',
      summary: 'Organisation des appels d’effectifs et contrôle de présence en temps réel.',
      inputs: 'Date, détachement, type de rassemblement (Rapport matinal, Briefing d’urgence).',
      howTo: [
        'Créez la séance de rassemblement.',
        'Pointez les agents manuellement ou scannez leur QR Code en continu.',
        'Générez la feuille d’émargement officielle avec le récapitulatif des présents/absents/justifiés.',
      ],
      securityRule: 'Horodatage individuel du pointage pour certifier la ponctualité des agents.',
    },
    {
      id: 'mod-demandes',
      name: '8. Mes Demandes & Workflow Hiérarchique',
      icon: Clock,
      href: '/demandes',
      role: 'Tous agents',
      summary: 'Soumission et arbitrage des requêtes administratives des agents.',
      inputs: 'Type de demande (Congé, Permission, Matériel, Explication), motif, pièces jointes.',
      howTo: [
        'L’agent dépose sa demande depuis son portail.',
        'La hiérarchie reçoit une notification d’alerte avec badge clignotant.',
        'L’administrateur étudie, valide ou rejette avec commentaire motivé.',
      ],
      securityRule: 'Décision irrévocable enregistrée avec notification automatique retournée à l’agent.',
    },
    {
      id: 'mod-cartographie',
      name: '9. Cartographie Tactique',
      icon: Map,
      href: '/cartographie',
      role: 'Tous rôles autorisés',
      summary: 'Visualisation spatiale des points d’intérêt, bases et théâtres d’opérations.',
      inputs: 'Coordonnées GPS, périmètres de sécurité, détachements territoriaux.',
      howTo: [
        'Naviguez sur la carte interactive OpenStreetMap/Leaflet.',
        'Filtrez les couches par type d’incident ou implantation des détachements.',
        'Consultez les informations contextuelles en cliquant sur les marqueurs tactiques.',
      ],
      securityRule: 'Coordonnées sensibles masquées pour les comptes non accrédités.',
    },
    {
      id: 'mod-secretariat',
      name: '10. Secrétariat & Actes Officiels',
      icon: BookUser,
      href: '/secretariat',
      role: 'Administrateur, Secrétariat',
      summary: 'Centrale d’édition des convocations, attestations et courriers d’autorité.',
      inputs: 'Destinataire, objet, corps du texte, références d’enregistrement.',
      howTo: [
        'Sélectionnez le modèle d’acte (Convocation, Décharge, Note de service).',
        'Complétez les variables du formulaire.',
        'Générez le document PDF instantané complet avec en-tête d’État et signature.',
      ],
      securityRule: 'Numérotation chronologique séquentielle empêchant l’insertion d’antidates.',
    },
    {
      id: 'mod-finance',
      name: '11. Finances & Indemnités Opérationnelles',
      icon: Banknote,
      href: '/finance',
      role: 'Administrateur',
      summary: 'Suivi rigoureux des budgets de mission, primes de risque et dépenses logistiques.',
      inputs: 'Montant, détachement bénéficiaire, catégorie de dépense, justificatif.',
      howTo: [
        'Enregistrez les allocations budgétaires par détachement.',
        'Comptabilisez les décaissements liés aux missions spéciales.',
        'Générez le rapport de synthèse financière pour le Ministère de tutelle.',
      ],
      securityRule: 'Validation par double signature numérique pour tout montant supérieur au seuil critique.',
    },
  ];

  const faqs = [
    {
      q: 'Comment réagir si un QR code d’agent ne scanne pas ?',
      a: 'Vérifiez la luminosité ambiante et la propreté de la caméra. Si le badge est abîmé, utilisez la barre de recherche textuelle pour saisir le matricule IDC (ex: VUCE1Z). L’administrateur peut rééditer un nouveau badge officiel en 1 clic dans la section Agents.',
    },
    {
      q: 'Que se passe-t-il si la connexion réseau est instable lors d’un pointage ?',
      a: 'L’architecture moderne de sBSSI gère les états hors-ligne temporaires grâce au cache applicatif. Dès le rétablissement de la connexion, les modifications en attente sont synchronisées automatiquement vers Firestore.',
    },
    {
      q: 'Comment s’assurer qu’une arme est correctement réintégrée ?',
      a: 'Rendez-vous dans le module Armurerie, repérez l’arme marquée "En dotation", cliquez sur le bouton vert "Réintégrer", indiquez le nombre de cartouches consommées et validez. L’arme repasse instantanément au statut "En stock".',
    },
    {
      q: 'Pourquoi les PDF s’ouvrent-ils avec un en-tête et un tampon officiels ?',
      a: 'Le moteur de génération PDF intègre directement les éléments réglementaires de la République de Côte d’Ivoire et de la sBSSI. Ces éléments sont dessinés vectoriellement avec un cachet horodaté pour garantir leur validité juridique en cas de contrôle.',
    },
    {
      q: 'Comment changer de détachement géographique pour consulter d’autres bases ?',
      a: 'Utilisez le sélecteur de détachement situé en haut à droite dans l’en-tête (Header). Sélectionnez le détachement souhaité (ex: Abidjan, Bouaké, San-Pedro, etc.) pour filtrer instantanément toutes les vues.',
    },
  ];

export default function TutorialPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('avantages');

  const filteredAdvantages = useMemo(() => {
    if (!searchQuery.trim()) return advantages;
    const q = searchQuery.toLowerCase();
    return advantages.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.points.some((p) => p.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const filteredSecurity = useMemo(() => {
    if (!searchQuery.trim()) return securityFeatures;
    const q = searchQuery.toLowerCase();
    return securityFeatures.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tag.toLowerCase().includes(q) ||
        s.details.some((d) => d.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.howTo.some((h) => h.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card via-card/90 to-primary/10 border border-primary/20 p-6 sm:p-10 shadow-xl">
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              Manuel Opérationnel Officiel • sBSSI
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Guide d’Utilisation & Système de Sécurité
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Découvrez l’ensemble des avantages opérationnels, les protocoles de sécurité inviolables et
              le fonctionnement détaillé de chacun des 11 modules de la plateforme sBSSI.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <Button
              onClick={handlePrint}
              variant="outline"
              className="gap-2 border-primary/30 hover:bg-primary/10 text-foreground cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4 text-primary" />
              <span>Imprimer le Manuel</span>
            </Button>
          </div>
        </div>

        {/* Quick Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-border/40">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/50 border border-border/40">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Sécurité</p>
              <p className="text-sm font-bold text-foreground">RBAC & Audit Trail</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/50 border border-border/40">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Badges & Scan</p>
              <p className="text-sm font-bold text-foreground">QR Crypté Sécurisé</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/50 border border-border/40">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Garde à Vue</p>
              <p className="text-sm font-bold text-foreground">Délai Légal 48h/72h</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/50 border border-border/40">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Actes Officiels</p>
              <p className="text-sm font-bold text-foreground">PDFs avec Sceau d’État</p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Rechercher une fonctionnalité, un module, une règle de sécurité (ex: Armurerie, GAV, QR code, Rôles)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 pr-4 h-12 text-sm sm:text-base rounded-2xl bg-card border-border/60 shadow-sm focus-visible:ring-primary"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Effacer
          </Button>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto p-1.5 bg-muted/60 rounded-2xl gap-1">
          <TabsTrigger
            value="avantages"
            className="rounded-xl py-2.5 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            <span>Avantages Stratégiques</span>
          </TabsTrigger>
          <TabsTrigger
            value="securite"
            className="rounded-xl py-2.5 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Système de Sécurité</span>
          </TabsTrigger>
          <TabsTrigger
            value="modules"
            className="rounded-xl py-2.5 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex items-center justify-center gap-2"
          >
            <Layers className="w-4 h-4" />
            <span>Modules & Fonctionnement</span>
          </TabsTrigger>
          <TabsTrigger
            value="guide-faq"
            className="rounded-xl py-2.5 text-xs sm:text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex items-center justify-center gap-2"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Guide Pas-à-Pas & FAQ</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: AVANTAGES STRATÉGIQUES */}
        <TabsContent value="avantages" className="space-y-6 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Pourquoi utiliser le logiciel sBSSI ?
              </h2>
              <p className="text-sm text-muted-foreground">
                Bénéfices tactiques, administratifs et opérationnels pour l’institution.
              </p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">
              {filteredAdvantages.length} points clés
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredAdvantages.map((adv) => {
              const Icon = adv.icon;
              return (
                <Card
                  key={adv.id}
                  className="rounded-2xl border-border/50 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Icon className="w-6 h-6" />
                      </div>
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/30 font-bold">
                        {adv.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg font-bold text-foreground mt-3">
                      {adv.title}
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
                      {adv.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-5">
                    <div className="p-3.5 rounded-xl bg-muted/40 border border-border/30 space-y-2">
                      {adv.points.map((pt, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-foreground/90">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 2: SYSTÈME DE SÉCURITÉ */}
        <TabsContent value="securite" className="space-y-6 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Architecture de Sécurité & Protection des Données
              </h2>
              <p className="text-sm text-muted-foreground">
                Des mécanismes avancés contre l’usurpation, la fraude et la perte d’information.
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 font-semibold">
              Protection Active
            </Badge>
          </div>

          {/* Security Alert banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4">
            <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Conformité aux Standards Militaires & Policiers
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Le logiciel applique un principe de moindre privilège (PoLP). Aucune action sensible ne peut être exécutée de manière anonyme. Toute transaction fait l’objet d’un journal d’audit non altérable.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredSecurity.map((sec) => {
              const Icon = sec.icon;
              return (
                <Card
                  key={sec.id}
                  className="rounded-2xl border-border/50 bg-card hover:border-emerald-500/40 hover:shadow-md transition-all duration-300"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                        {sec.tag}
                      </Badge>
                    </div>
                    <CardTitle className="text-base sm:text-lg font-bold text-foreground mt-3">
                      {sec.title}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                      {sec.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-5">
                    <ul className="space-y-2">
                      {sec.details.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-foreground/90">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 3: FONCTIONNEMENT DES 11 MODULES */}
        <TabsContent value="modules" className="space-y-6 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Manuel Détaillé des 11 Modules Tactiques
              </h2>
              <p className="text-sm text-muted-foreground">
                Cliquez sur un module pour afficher sa procédure pas-à-pas et ses règles de gestion.
              </p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">
              11 Modules Intégrés
            </Badge>
          </div>

          <Accordion type="single" collapsible defaultValue="mod-agents" className="space-y-4">
            {filteredModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className="border border-border/50 bg-card rounded-2xl px-5 py-1 data-[state=open]:border-primary/40 data-[state=open]:shadow-md transition-all duration-200"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3.5 text-left">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm sm:text-base font-bold text-foreground">
                          {mod.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {mod.summary}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-5 space-y-4 text-sm text-foreground/90 border-t border-border/30 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/30">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Accréditations requises
                        </span>
                        <p className="text-xs sm:text-sm font-semibold text-foreground">
                          {mod.role}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/30">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Données & Paramètres gérés
                        </span>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {mod.inputs}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary block">
                        Procédure Opérationnelle :
                      </span>
                      <div className="space-y-2">
                        {mod.howTo.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm">
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-500 dark:text-amber-400">
                      <BadgeAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Règle de sécurité stricte : </span>
                        <span>{mod.securityRule}</span>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </TabsContent>

        {/* TAB 4: GUIDE RAPIDE & FAQ */}
        <TabsContent value="guide-faq" className="space-y-6 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Guides Pas-à-Pas & Foire Aux Questions
              </h2>
              <p className="text-sm text-muted-foreground">
                Réponses directes aux cas d’usage les plus fréquents sur le terrain.
              </p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary font-semibold">
              Assistance & FAQ
            </Badge>
          </div>

          {/* Quick Scenario Guides */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card className="rounded-2xl border-border/50 bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Users className="w-4 h-4" />
                Scénario 1 : Créer & Délivrer un Badge Agent
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-muted-foreground list-decimal pl-4">
                <li>Ouvrez le menu <strong>Agents</strong> et cliquez sur <strong>+ Nouvel Agent</strong>.</li>
                <li>Renseignez le nom, le grade, le détachement et le matricule.</li>
                <li>Le système génère automatiquement un identifiant crypté IDC.</li>
                <li>Cliquez sur <strong>Badge & QR</strong> pour télécharger le PDF officiel recto-verso prêt à imprimer.</li>
              </ol>
            </Card>

            <Card className="rounded-2xl border-border/50 bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                <Sword className="w-4 h-4" />
                Scénario 2 : Dotation d’Arme & Restitution
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-muted-foreground list-decimal pl-4">
                <li>Dans <strong>Armurerie</strong>, repérez l’arme disponible en stock.</li>
                <li>Cliquez sur <strong>Attribuer</strong> et associez l’agent et la mission.</li>
                <li>À la fin de la mission, cliquez sur <strong>Réintégrer</strong>.</li>
                <li>Le registre de tir et l’état du stock sont mis à jour sans possibilité de litige.</li>
              </ol>
            </Card>

            <Card className="rounded-2xl border-border/50 bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <Lock className="w-4 h-4" />
                Scénario 3 : Enregistrement d’une Garde à Vue (GAV)
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-muted-foreground list-decimal pl-4">
                <li>Dans <strong>GAV</strong>, cliquez sur <strong>Nouveau GAV</strong>.</li>
                <li>Renseignez l’heure précise d’interpellation et le motif judiciaire.</li>
                <li>Le compte à rebours 48h s’enclenche automatiquement.</li>
                <li>Clôturez avant la fin du délai légal avec génération du PV officiel.</li>
              </ol>
            </Card>

            <Card className="rounded-2xl border-border/50 bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-sky-500 font-bold text-sm">
                <CalendarClock className="w-4 h-4" />
                Scénario 4 : Appel Matinal par Scan QR
              </div>
              <ol className="space-y-2 text-xs sm:text-sm text-muted-foreground list-decimal pl-4">
                <li>Dans <strong>Rassemblements</strong>, démarrez une séance d’appel.</li>
                <li>Activez le scanner QR caméra.</li>
                <li>Chaque agent présente sa carte d’identification : bip de confirmation immédiat.</li>
                <li>Générez la feuille d’émargement officielle avec le taux exact de présence.</li>
              </ol>
            </Card>
          </div>

          {/* FAQ Accordion */}
          <div className="space-y-3 pt-4">
            <h3 className="text-lg font-bold text-foreground">Questions Fréquentes</h3>
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, idx) => (
                <AccordionItem
                  key={idx}
                  value={`faq-${idx}`}
                  className="border border-border/50 bg-card rounded-2xl px-5 py-1"
                >
                  <AccordionTrigger className="hover:no-underline font-semibold text-sm sm:text-base text-left">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
