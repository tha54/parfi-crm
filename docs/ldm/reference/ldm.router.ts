/**
 * Router tRPC pour le module Lettre de Mission.
 *
 * Endpoints exposés :
 * - genererDepuisDevis : déclenchement hybride (auto via event, manuel via bouton)
 * - lister / obtenir : lecture
 * - soumettreAValidation : collaborateur → relecture associé
 * - validerEnInterne : associé valide
 * - envoyerAuClient : associé déclenche l'envoi
 * - marquerCommeSignee : upload du document signé par le client
 * - resilier / annuler : gestion fin de vie
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc'; // à adapter à ton init tRPC
import { LdmTransformationService } from '../../services/ldm-transformation.service';
import { LdmCycleVieService } from '../../services/ldm-cycle-vie.service';
import { LdmDureeType, LdmStatut } from '@prisma/client';

export const ldmRouter = router({
  // ---------------------------------------------------------------------------
  // GÉNÉRATION DEPUIS UN DEVIS
  // ---------------------------------------------------------------------------
  genererDepuisDevis: protectedProcedure
    .input(
      z.object({
        devisId: z.string(),
        associeSignataireId: z.string(),
        collaborateurReferentId: z.string().optional(),
        datePriseEffet: z.date().optional(),
        dureeType: z.nativeEnum(LdmDureeType).optional(),
        dureeMois: z.number().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const service = new LdmTransformationService(ctx.prisma);
      return service.genererDepuisDevis({
        ...input,
        creeParUserId: ctx.user.id,
      });
    }),

  // ---------------------------------------------------------------------------
  // LECTURE
  // ---------------------------------------------------------------------------
  lister: protectedProcedure
    .input(
      z.object({
        statut: z.nativeEnum(LdmStatut).optional(),
        clientId: z.string().optional(),
        collaborateurReferentId: z.string().optional(),
        recherche: z.string().optional(),
        page: z.number().default(1),
        parPage: z.number().default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const where: any = {};
      if (input.statut) where.statut = input.statut;
      if (input.clientId) where.clientId = input.clientId;
      if (input.collaborateurReferentId) {
        where.collaborateurReferentId = input.collaborateurReferentId;
      }
      if (input.recherche) {
        where.OR = [
          { numero: { contains: input.recherche } },
          { snapshotClientDenomination: { contains: input.recherche } },
          { snapshotClientSiren: { contains: input.recherche } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.lettreDeMission.findMany({
          where,
          include: {
            client: { select: { id: true, denomination: true, siren: true } },
            associeSignataire: { select: { id: true, nom: true } },
            collaborateurReferent: { select: { id: true, nom: true } },
            _count: { select: { missions: true, echeancesFacturation: true } },
          },
          orderBy: { creeLe: 'desc' },
          skip: (input.page - 1) * input.parPage,
          take: input.parPage,
        }),
        ctx.prisma.lettreDeMission.count({ where }),
      ]);

      return { items, total, page: input.page, parPage: input.parPage };
    }),

  obtenir: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.lettreDeMission.findUnique({
        where: { id: input.id },
        include: {
          client: true,
          devis: { select: { id: true, numero: true, dateAcceptation: true } },
          missions: { orderBy: { ordre: 'asc' } },
          clausesAppliquees: { orderBy: { ordre: 'asc' } },
          echeancesFacturation: { orderBy: { dateEcheance: 'asc' } },
          evenements: {
            include: { acteur: { select: { id: true, nom: true } } },
            orderBy: { date: 'desc' },
          },
          associeSignataire: { select: { id: true, nom: true, email: true } },
          collaborateurReferent: { select: { id: true, nom: true, email: true } },
        },
      });
    }),

  // ---------------------------------------------------------------------------
  // TRANSITIONS DE STATUT
  // ---------------------------------------------------------------------------
  soumettreAValidation: protectedProcedure
    .input(z.object({ ldmId: z.string(), commentaire: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.soumettreAValidation({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        commentaire: input.commentaire,
      });
    }),

  validerEnInterne: protectedProcedure
    .input(z.object({ ldmId: z.string(), commentaire: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.validerEnInterne({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        commentaire: input.commentaire,
      });
    }),

  envoyerAuClient: protectedProcedure
    .input(
      z.object({
        ldmId: z.string(),
        documentPdfUrl: z.string().url(),
        commentaire: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.envoyerAuClient({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        documentPdfUrl: input.documentPdfUrl,
        commentaire: input.commentaire,
      });
    }),

  marquerCommeSignee: protectedProcedure
    .input(
      z.object({
        ldmId: z.string(),
        documentSigneUrl: z.string().url(),
        dateSignature: z.date(),
        documentHash: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.marquerCommeSignee({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        documentSigneUrl: input.documentSigneUrl,
        dateSignature: input.dateSignature,
        documentHash: input.documentHash,
      });
    }),

  resilier: protectedProcedure
    .input(
      z.object({
        ldmId: z.string(),
        motif: z.string().min(10),
        dateResiliation: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.resilier({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        motif: input.motif,
        dateResiliation: input.dateResiliation,
      });
    }),

  annuler: protectedProcedure
    .input(z.object({ ldmId: z.string(), motif: z.string().min(5) }))
    .mutation(async ({ input, ctx }) => {
      const service = new LdmCycleVieService(ctx.prisma);
      return service.annuler({
        ldmId: input.ldmId,
        acteurId: ctx.user.id,
        acteurRole: ctx.user.role,
        motif: input.motif,
      });
    }),

  // ---------------------------------------------------------------------------
  // ALERTES & SUIVI
  // ---------------------------------------------------------------------------
  ldmAEcheance: protectedProcedure
    .input(z.object({ joursAvant: z.number().default(60) }))
    .query(async ({ input, ctx }) => {
      const limite = new Date();
      limite.setDate(limite.getDate() + input.joursAvant);

      return ctx.prisma.lettreDeMission.findMany({
        where: {
          statut: LdmStatut.ACTIVE,
          dureeType: 'ANNUELLE_TACITE',
          dateEcheance: { lte: limite },
        },
        include: {
          client: { select: { id: true, denomination: true } },
          associeSignataire: { select: { id: true, nom: true } },
        },
        orderBy: { dateEcheance: 'asc' },
      });
    }),
});
