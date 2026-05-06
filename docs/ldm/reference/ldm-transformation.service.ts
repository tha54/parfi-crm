/**
 * Service de transformation Devis → Lettre de Mission
 *
 * Logique hybride :
 * - Au passage Devis = Accepté : génération automatique du brouillon LDM
 * - Validation humaine obligatoire avant envoi au client
 * - Snapshot complet des données au moment de la génération
 * - Verrouillage du devis (lecture seule) dès qu'une LDM est créée
 */

import { PrismaClient, LdmStatut, LdmDureeType, ClauseCategorie } from '@prisma/client';
import { TRPCError } from '@trpc/server';

interface GenererLdmParams {
  devisId: string;
  creeParUserId: string;
  associeSignataireId: string;
  collaborateurReferentId?: string;
  datePriseEffet?: Date;          // par défaut : date d'acceptation du devis
  dureeType?: LdmDureeType;       // par défaut : ANNUELLE_TACITE
  dureeMois?: number;             // par défaut : 12
}

export class LdmTransformationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Génère un brouillon de LDM à partir d'un devis accepté.
   * Cette fonction est idempotente : si une LDM existe déjà pour ce devis,
   * elle est retournée sans en créer une nouvelle.
   */
  async genererDepuisDevis(params: GenererLdmParams) {
    // -------------------------------------------------------------------------
    // 1. Vérifications préalables
    // -------------------------------------------------------------------------
    const devis = await this.prisma.devis.findUnique({
      where: { id: params.devisId },
      include: {
        client: true,
        missions: { include: { mission: true } },
        echeanciers: true,
      },
    });

    if (!devis) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Devis ${params.devisId} introuvable`,
      });
    }

    if (devis.statut !== 'ACCEPTE') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Le devis doit être accepté pour générer une LDM (statut actuel : ${devis.statut})`,
      });
    }

    // Idempotence : si une LDM existe déjà, on la retourne
    const ldmExistante = await this.prisma.lettreDeMission.findUnique({
      where: { devisId: params.devisId },
    });
    if (ldmExistante) {
      return ldmExistante;
    }

    // -------------------------------------------------------------------------
    // 2. Récupération des informations cabinet (Parfi France)
    // -------------------------------------------------------------------------
    const cabinet = await this.getCabinetInfo();

    // -------------------------------------------------------------------------
    // 3. Sélection des clauses applicables depuis la bibliothèque OEC
    // -------------------------------------------------------------------------
    const missionTypes = this.deduireMissionTypes(devis.missions);
    const clausesActives = await this.selectionnerClauses(missionTypes, devis);

    // -------------------------------------------------------------------------
    // 4. Calcul des dates
    // -------------------------------------------------------------------------
    const datePriseEffet = params.datePriseEffet ?? devis.dateAcceptation ?? new Date();
    const dureeMois = params.dureeMois ?? 12;
    const dateEcheance = new Date(datePriseEffet);
    dateEcheance.setMonth(dateEcheance.getMonth() + dureeMois);

    // -------------------------------------------------------------------------
    // 5. Génération du numéro de LDM
    // -------------------------------------------------------------------------
    const numero = await this.genererNumeroLdm();

    // -------------------------------------------------------------------------
    // 6. Création transactionnelle de la LDM + relations + verrouillage devis
    // -------------------------------------------------------------------------
    const ldm = await this.prisma.$transaction(async (tx) => {
      // 6.a Création de la LDM avec snapshot client
      const nouvelleLdm = await tx.lettreDeMission.create({
        data: {
          numero,
          clientId: devis.clientId,
          devisId: devis.id,
          statut: LdmStatut.BROUILLON,
          datePriseEffet,
          dureeType: params.dureeType ?? LdmDureeType.ANNUELLE_TACITE,
          dureeMois,
          dateEcheance,

          // Snapshot client - figé maintenant, ne suivra plus les évolutions
          snapshotClientSiren: devis.client.siren,
          snapshotClientDenomination: devis.client.denomination,
          snapshotClientFormeJuridique: devis.client.formeJuridique,
          snapshotClientCapitalSocial: devis.client.capitalSocial,
          snapshotClientRcs: devis.client.rcs,
          snapshotClientAdresse: devis.client.adresse,
          snapshotClientCodePostal: devis.client.codePostal,
          snapshotClientVille: devis.client.ville,
          snapshotClientPays: devis.client.pays ?? 'France',
          snapshotClientRepresentantNom: devis.client.representantLegalNom ?? '',
          snapshotClientRepresentantQualite: devis.client.representantLegalQualite ?? '',
          snapshotClientEmail: devis.client.email,
          snapshotClientTelephone: devis.client.telephone,

          // Snapshot cabinet
          snapshotCabinetDenomination: cabinet.denomination,
          snapshotCabinetAdresse: cabinet.adresse,
          snapshotCabinetSiren: cabinet.siren,
          snapshotCabinetRcs: cabinet.rcs,
          snapshotCabinetEmail: cabinet.email,
          snapshotCabinetTelephone: cabinet.telephone,

          // Honoraires (depuis le devis)
          honorairesHTAnnuelTotal: devis.montantHT,
          honorairesTVATaux: devis.tauxTVA ?? 20,
          modaliteFacturation: devis.modaliteFacturation ?? 'Mensuel',
          modaliteReglement: devis.modaliteReglement ?? 'Prélèvement SEPA',

          // Affectation
          collaborateurReferentId: params.collaborateurReferentId,
          associeSignataireId: params.associeSignataireId,
          creeParId: params.creeParUserId,

          // Création des relations en cascade
          missions: {
            create: devis.missions.map((dm, index) => ({
              type: this.mapMissionType(dm.mission.type),
              libelle: dm.mission.libelle,
              description: dm.mission.description,
              honorairesHT: dm.montantHT,
              uniteFacturation: dm.uniteFacturation,
              quantite: dm.quantite,
              dateDebut: datePriseEffet,
              dateFin: null, // continue jusqu'à résiliation
              ordre: index,
            })),
          },

          clausesAppliquees: {
            create: clausesActives.map((clause, index) => ({
              clauseSourceId: clause.id,
              clauseSourceVersion: clause.version,
              categorie: clause.categorie,
              titre: clause.titre,
              contenu: clause.contenu,
              ordre: clause.ordreParDefaut * 100 + index,
            })),
          },

          echeancesFacturation: {
            create: this.genererEcheancier(
              devis.montantHT,
              datePriseEffet,
              dureeMois,
              devis.modaliteFacturation ?? 'Mensuel',
            ),
          },

          evenements: {
            create: {
              type: 'CREATION',
              description: `LDM générée automatiquement depuis le devis ${devis.numero}`,
              acteurId: params.creeParUserId,
              metadonnees: {
                devisNumero: devis.numero,
                nombreMissions: devis.missions.length,
                nombreClauses: clausesActives.length,
              },
            },
          },
        },
        include: {
          missions: true,
          clausesAppliquees: true,
          echeancesFacturation: true,
          evenements: true,
        },
      });

      // 6.b Verrouillage du devis (lecture seule)
      await tx.devis.update({
        where: { id: devis.id },
        data: {
          verrouille: true,
          ldmGenereeId: nouvelleLdm.id,
        },
      });

      return nouvelleLdm;
    });

    return ldm;
  }

  // ===========================================================================
  // MÉTHODES PRIVÉES
  // ===========================================================================

  /**
   * Sélectionne les clauses actives applicables :
   * - toutes les clauses obligatoires du tronc commun
   * - les clauses des catégories correspondant aux missions retenues
   * - filtrage selon les conditions d'activation (capital, taille, etc.)
   */
  private async selectionnerClauses(
    missionTypes: ClauseCategorie[],
    devis: any,
  ) {
    const categoriesApplicables: ClauseCategorie[] = [
      ClauseCategorie.TRONC_COMMUN,
      ClauseCategorie.ANNEXE,
      ...missionTypes,
    ];

    // On prend la dernière version active de chaque clause
    const clauses = await this.prisma.bibliothequeClause.findMany({
      where: {
        categorie: { in: categoriesApplicables },
        estActive: true,
      },
      orderBy: [
        { code: 'asc' },
        { version: 'desc' },
      ],
    });

    // Dédupe par code (garder la version la plus récente)
    const clausesParCode = new Map<string, typeof clauses[0]>();
    for (const c of clauses) {
      if (!clausesParCode.has(c.code)) {
        clausesParCode.set(c.code, c);
      }
    }

    // Filtrage par conditions d'activation
    const clausesRetenues = Array.from(clausesParCode.values()).filter((c) => {
      if (c.obligatoire) return true;
      if (!c.conditionsActivation) return true;
      return this.evaluerConditions(c.conditionsActivation, devis, missionTypes);
    });

    return clausesRetenues.sort((a, b) => a.ordreParDefaut - b.ordreParDefaut);
  }

  /**
   * Évalue les conditions d'activation d'une clause.
   * Format JSON simple : { missionTypes: [...], siCapitalSuperieurA: 50000, ... }
   */
  private evaluerConditions(
    conditions: any,
    devis: any,
    missionTypes: ClauseCategorie[],
  ): boolean {
    if (conditions.missionTypes) {
      const matchMission = conditions.missionTypes.some((t: string) =>
        missionTypes.includes(t as ClauseCategorie),
      );
      if (!matchMission) return false;
    }

    if (conditions.siCapitalSuperieurA && devis.client.capitalSocial) {
      if (Number(devis.client.capitalSocial) <= conditions.siCapitalSuperieurA) {
        return false;
      }
    }

    if (conditions.siFormeJuridique) {
      if (!conditions.siFormeJuridique.includes(devis.client.formeJuridique)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Mappe le type de mission métier vers la catégorie de clause.
   * À adapter selon ton enum Mission existant.
   */
  private mapMissionType(typeMission: string): ClauseCategorie {
    const mapping: Record<string, ClauseCategorie> = {
      TENUE: ClauseCategorie.MISSION_TENUE,
      REVISION: ClauseCategorie.MISSION_REVISION,
      SOCIAL: ClauseCategorie.MISSION_SOCIAL,
      PAIE: ClauseCategorie.MISSION_SOCIAL,
      JURIDIQUE: ClauseCategorie.MISSION_JURIDIQUE,
      FISCAL: ClauseCategorie.MISSION_FISCAL,
      CONSEIL: ClauseCategorie.MISSION_CONSEIL,
      AUDIT: ClauseCategorie.MISSION_AUDIT,
    };
    return mapping[typeMission] ?? ClauseCategorie.MISSION_CONSEIL;
  }

  private deduireMissionTypes(devisMissions: any[]): ClauseCategorie[] {
    const types = new Set<ClauseCategorie>();
    for (const dm of devisMissions) {
      types.add(this.mapMissionType(dm.mission.type));
    }
    return Array.from(types);
  }

  /**
   * Génère un échéancier de facturation contractuel.
   * Aligné sur la modalité de facturation choisie dans le devis.
   */
  private genererEcheancier(
    montantHTAnnuel: any,
    dateDebut: Date,
    dureeMois: number,
    modalite: string,
  ) {
    const echeances: Array<{ dateEcheance: Date; libelle: string; montantHT: number }> = [];
    const montantNum = Number(montantHTAnnuel);

    let nombreEcheances: number;
    let pasMois: number;

    switch (modalite) {
      case 'Mensuel':
        nombreEcheances = dureeMois;
        pasMois = 1;
        break;
      case 'Trimestriel':
        nombreEcheances = Math.ceil(dureeMois / 3);
        pasMois = 3;
        break;
      case 'Annuel':
        nombreEcheances = Math.ceil(dureeMois / 12);
        pasMois = 12;
        break;
      default:
        nombreEcheances = 1;
        pasMois = dureeMois;
    }

    const montantParEcheance = Math.round((montantNum / nombreEcheances) * 100) / 100;

    for (let i = 0; i < nombreEcheances; i++) {
      const date = new Date(dateDebut);
      date.setMonth(date.getMonth() + i * pasMois);
      echeances.push({
        dateEcheance: date,
        libelle: `Honoraires ${this.formatPeriode(date, modalite)}`,
        montantHT: montantParEcheance,
      });
    }

    return echeances;
  }

  private formatPeriode(date: Date, modalite: string): string {
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    if (modalite === 'Mensuel') {
      return `${mois[date.getMonth()]} ${date.getFullYear()}`;
    }
    if (modalite === 'Trimestriel') {
      const trimestre = Math.floor(date.getMonth() / 3) + 1;
      return `T${trimestre} ${date.getFullYear()}`;
    }
    return `${date.getFullYear()}`;
  }

  /**
   * Génère un numéro de LDM unique au format LDM-AAAA-NNNN
   */
  private async genererNumeroLdm(): Promise<string> {
    const annee = new Date().getFullYear();
    const prefixe = `LDM-${annee}-`;

    const derniere = await this.prisma.lettreDeMission.findFirst({
      where: { numero: { startsWith: prefixe } },
      orderBy: { numero: 'desc' },
    });

    const dernierNumero = derniere
      ? parseInt(derniere.numero.substring(prefixe.length), 10)
      : 0;

    return `${prefixe}${String(dernierNumero + 1).padStart(4, '0')}`;
  }

  /**
   * Récupère les infos du cabinet (Parfi France).
   * À brancher sur ta table Cabinet ou config.
   */
  private async getCabinetInfo() {
    // TODO: à brancher sur ton modèle Cabinet réel
    return {
      denomination: 'Parfi France',
      adresse: '[Adresse Parfi France à compléter]',
      siren: '[SIREN à compléter]',
      rcs: '[RCS à compléter]',
      email: 'contact@parfi-france.fr',
      telephone: '[Téléphone à compléter]',
    };
  }
}
