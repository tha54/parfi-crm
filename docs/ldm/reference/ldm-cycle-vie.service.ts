/**
 * Service de gestion du cycle de vie de la Lettre de Mission.
 *
 * Implémente la machine à états :
 *   BROUILLON → A_VALIDER → VALIDEE_INTERNE → ENVOYEE → SIGNEE → ACTIVE
 *                                                              ↓
 *                                                         RESILIEE / ECHUE
 *
 * Chaque transition :
 * - Vérifie les pré-conditions métier
 * - Vérifie les autorisations utilisateur
 * - Enregistre un événement d'audit
 */

import { PrismaClient, LdmStatut, LdmEvenementType } from '@prisma/client';
import { TRPCError } from '@trpc/server';

// =============================================================================
// MATRICE DES TRANSITIONS AUTORISÉES
// =============================================================================
const TRANSITIONS_AUTORISEES: Record<LdmStatut, LdmStatut[]> = {
  [LdmStatut.BROUILLON]:        [LdmStatut.A_VALIDER, LdmStatut.ANNULEE],
  [LdmStatut.A_VALIDER]:        [LdmStatut.VALIDEE_INTERNE, LdmStatut.BROUILLON, LdmStatut.ANNULEE],
  [LdmStatut.VALIDEE_INTERNE]:  [LdmStatut.ENVOYEE, LdmStatut.BROUILLON, LdmStatut.ANNULEE],
  [LdmStatut.ENVOYEE]:          [LdmStatut.SIGNEE, LdmStatut.BROUILLON, LdmStatut.ANNULEE],
  [LdmStatut.SIGNEE]:           [LdmStatut.ACTIVE, LdmStatut.RESILIEE],
  [LdmStatut.ACTIVE]:           [LdmStatut.RESILIEE, LdmStatut.ECHUE],
  [LdmStatut.RESILIEE]:         [],
  [LdmStatut.ECHUE]:            [],
  [LdmStatut.ANNULEE]:          [],
};

// =============================================================================
// RÔLES AUTORISÉS PAR TRANSITION
// =============================================================================
type RoleUtilisateur = 'COLLABORATEUR' | 'ASSOCIE' | 'ADMIN';

const ROLES_AUTORISES: Record<string, RoleUtilisateur[]> = {
  'BROUILLON->A_VALIDER':         ['COLLABORATEUR', 'ASSOCIE', 'ADMIN'],
  'A_VALIDER->VALIDEE_INTERNE':   ['ASSOCIE', 'ADMIN'], // seul un associé peut valider
  'VALIDEE_INTERNE->ENVOYEE':     ['ASSOCIE', 'ADMIN'],
  'ENVOYEE->SIGNEE':              ['COLLABORATEUR', 'ASSOCIE', 'ADMIN'],
  'SIGNEE->ACTIVE':               ['COLLABORATEUR', 'ASSOCIE', 'ADMIN'],
  'ACTIVE->RESILIEE':             ['ASSOCIE', 'ADMIN'],
  'ACTIVE->ECHUE':                ['COLLABORATEUR', 'ASSOCIE', 'ADMIN'],
};

interface TransitionParams {
  ldmId: string;
  acteurId: string;
  acteurRole: RoleUtilisateur;
  commentaire?: string;
  metadonnees?: Record<string, any>;
}

export class LdmCycleVieService {
  constructor(private prisma: PrismaClient) {}

  // ===========================================================================
  // TRANSITIONS
  // ===========================================================================

  async soumettreAValidation(params: TransitionParams) {
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.A_VALIDER,
      evenementType: LdmEvenementType.MODIFICATION,
      description: 'LDM soumise à validation interne',
      verifications: async (ldm) => {
        if (ldm.missions.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Impossible de soumettre une LDM sans aucune mission',
          });
        }
        if (ldm.clausesAppliquees.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Impossible de soumettre une LDM sans aucune clause',
          });
        }
        if (!ldm.snapshotClientRepresentantNom) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Le représentant légal du client doit être renseigné',
          });
        }
      },
    });
  }

  async validerEnInterne(params: TransitionParams) {
    // Décision D6 : pas de contrainte 4-yeux.
    // Un associé peut valider sa propre LDM (équipe de 11, contrainte trop lourde).
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.VALIDEE_INTERNE,
      evenementType: LdmEvenementType.VALIDATION_INTERNE,
      description: `LDM validée en interne par ${params.acteurId}`,
    });
  }

  async envoyerAuClient(params: TransitionParams & { documentPdfUrl: string }) {
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.ENVOYEE,
      evenementType: LdmEvenementType.ENVOI_CLIENT,
      description: 'LDM envoyée au client pour signature',
      misesAJour: {
        documentPdfUrl: params.documentPdfUrl,
      },
      verifications: async (ldm) => {
        if (!ldm.snapshotClientEmail) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Aucune adresse email client pour envoyer la LDM',
          });
        }
      },
    });
  }

  async marquerCommeSignee(
    params: TransitionParams & {
      documentSigneUrl: string;
      dateSignature: Date;
      documentHash?: string;
    },
  ) {
    const ldm = await this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.SIGNEE,
      evenementType: LdmEvenementType.SIGNATURE,
      description: `LDM signée par le client le ${params.dateSignature.toLocaleDateString('fr-FR')}`,
      misesAJour: {
        documentSigneUrl: params.documentSigneUrl,
        documentHash: params.documentHash,
      },
    });

    // Activation automatique après signature
    await this.activer({
      ldmId: params.ldmId,
      acteurId: params.acteurId,
      acteurRole: params.acteurRole,
      commentaire: 'Activation automatique après signature',
    });

    return ldm;
  }

  async activer(params: TransitionParams) {
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.ACTIVE,
      evenementType: LdmEvenementType.MODIFICATION,
      description: 'LDM activée - prise d\'effet contractuelle',
    });
  }

  async resilier(
    params: TransitionParams & { motif: string; dateResiliation: Date },
  ) {
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.RESILIEE,
      evenementType: LdmEvenementType.RESILIATION,
      description: `Résiliation : ${params.motif}`,
      misesAJour: {
        dateResiliation: params.dateResiliation,
        motifResiliation: params.motif,
      },
    });
  }

  async annuler(params: TransitionParams & { motif: string }) {
    return this.transitionner({
      ...params,
      nouveauStatut: LdmStatut.ANNULEE,
      evenementType: LdmEvenementType.ANNULATION,
      description: `Annulation : ${params.motif}`,
      apresSucces: async (tx, ldm) => {
        // Si annulation, on déverrouille le devis associé
        if (ldm.devisId) {
          await tx.devis.update({
            where: { id: ldm.devisId },
            data: { verrouille: false, ldmGenereeId: null },
          });
        }
      },
    });
  }

  // ===========================================================================
  // CŒUR DE LA MACHINE À ÉTATS (générique)
  // ===========================================================================
  private async transitionner(params: {
    ldmId: string;
    acteurId: string;
    acteurRole: RoleUtilisateur;
    nouveauStatut: LdmStatut;
    evenementType: LdmEvenementType;
    description: string;
    commentaire?: string;
    metadonnees?: Record<string, any>;
    misesAJour?: Record<string, any>;
    verifications?: (ldm: any) => Promise<void>;
    apresSucces?: (tx: any, ldm: any) => Promise<void>;
  }) {
    const ldm = await this.prisma.lettreDeMission.findUnique({
      where: { id: params.ldmId },
      include: {
        missions: true,
        clausesAppliquees: true,
      },
    });

    if (!ldm) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LDM introuvable' });
    }

    // 1. Vérification de la transition autorisée
    const transitionsValides = TRANSITIONS_AUTORISEES[ldm.statut];
    if (!transitionsValides.includes(params.nouveauStatut)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Transition interdite : ${ldm.statut} → ${params.nouveauStatut}`,
      });
    }

    // 2. Vérification du rôle
    const cleTransition = `${ldm.statut}->${params.nouveauStatut}`;
    const rolesAutorises = ROLES_AUTORISES[cleTransition] ?? [];
    if (!rolesAutorises.includes(params.acteurRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Le rôle ${params.acteurRole} n'est pas autorisé pour cette transition`,
      });
    }

    // 3. Vérifications métier spécifiques
    if (params.verifications) {
      await params.verifications(ldm);
    }

    // 4. Transaction : mise à jour + audit + post-traitement
    return this.prisma.$transaction(async (tx) => {
      const ldmMaj = await tx.lettreDeMission.update({
        where: { id: params.ldmId },
        data: {
          statut: params.nouveauStatut,
          ...(params.misesAJour ?? {}),
        },
      });

      await tx.ldmEvenement.create({
        data: {
          ldmId: params.ldmId,
          type: params.evenementType,
          description: params.commentaire
            ? `${params.description} - ${params.commentaire}`
            : params.description,
          acteurId: params.acteurId,
          metadonnees: {
            ancienStatut: ldm.statut,
            nouveauStatut: params.nouveauStatut,
            ...(params.metadonnees ?? {}),
          },
        },
      });

      if (params.apresSucces) {
        await params.apresSucces(tx, ldmMaj);
      }

      return ldmMaj;
    });
  }
}
