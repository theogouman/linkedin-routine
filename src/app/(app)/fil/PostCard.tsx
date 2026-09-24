"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageSquare, MoreHorizontal, Undo2 } from "lucide-react";
import type { FeedPost } from "@/modules/feed/server/repository";
import { Avatar } from "@/shared/components/Avatar";
import { Composer } from "@/shared/components/Composer";
import { ListPickerMenu } from "@/shared/components/ListPickerMenu";
import { ReactionIcon } from "@/shared/components/ReactionIcon";
import {
  ArrowNorthEastIcon,
  DeleteIcon,
  DependencyIcon,
  ViewOffIcon,
} from "@/shared/components/NotionIcons";
import { Dropdown } from "@/shared/motion/Dropdown";
import { ExpandableText } from "@/shared/motion/ExpandableText";
import { InlineToast } from "@/shared/motion/InlineToast";
import { LearnMoreLink } from "@/shared/motion/LearnMoreLink";
import { Lightbox } from "@/shared/motion/Lightbox";
import { Modal } from "@/shared/motion/Modal";
import { ReactionPicker } from "@/shared/motion/ReactionPicker";
import { SuccessCheck } from "@/shared/motion/SuccessCheck";
import { TooltipGroup } from "@/shared/motion/Tooltip";
import {
  generateForPostAction,
  ignorePostAction,
  likePostAction,
  restorePostAction,
  setCreatorListsAction,
  submitComment,
} from "@/app/actions";
import { asReactionType, reaction as lookupReaction, type ReactionType } from "@/shared/lib/reactions";
import { relativeTime, scheduledLabel } from "@/shared/lib/format";

/**
 * Une publication du feed (FR-004, FR-005, FR-006, FR-010, FR-013).
 *
 * Le média non restituable (vidéo, carrousel document) n'est jamais simulé :
 * on affiche un lien d'ouverture LinkedIn plutôt qu'un lecteur cassé. Mieux
 * vaut un lien honnête qu'un aperçu qui ment sur ce que l'utilisateur commente.
 *
 * Le composer est ouvert d'emblée. Le geste normal sur cet écran est de
 * commenter ; demander un clic pour ouvrir le champ ajoutait une étape à
 * quarante publications par jour.
 */

interface MediaEntry {
  type: string;
  url: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  externalOnly: boolean;
}

const MEDIA_LABELS: Record<string, string> = {
  video: "Vidéo — non lisible ici",
  document: "Carrousel document — non lisible ici",
};

export function PostCard({
  post,
  lists,
  showListBadges,
  onRemoved,
}: {
  post: FeedPost;
  lists: Array<{ id: string; name: string }>;
  showListBadges: boolean;
  /** Appelé quand la carte doit quitter le feed sans attendre le serveur. */
  onRemoved?: (accountId: string | null) => void;
}) {
  const router = useRouter();
  const [justQueued, setJustQueued] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [draftLists, setDraftLists] = useState<string[]>(post.lists.map((list) => list.id));
  const [pending, startTransition] = useTransition();

  // Retrait optimiste : la carte disparaît au clic, pas au retour du serveur.
  // L'aller-retour comprend la mise à jour Postgres PUIS un `router.refresh()`
  // qui re-rend tout le feed — plusieurs secondes pendant lesquelles rien ne
  // bougeait, et l'utilisateur recliquait.
  const [removed, setRemoved] = useState(false);

  const media = (Array.isArray(post.media) ? post.media : []) as MediaEntry[];
  const images = media.filter((entry) => entry.type === "image" && entry.url);
  const external = media.find((entry) => entry.externalOnly);
  const processed = post.processed_at !== null;
  const posted = post.liked_at !== null ? asReactionType(post.reaction_type) : null;

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string; scheduledFor?: string }>,
    success: string,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "Action impossible.");
        return;
      }
      toast.success(
        result.scheduledFor
          ? `${success} — envoi ${scheduledLabel(result.scheduledFor)}.`
          : success,
      );
      if (result.scheduledFor) {
        setJustQueued(true);
        window.setTimeout(() => setJustQueued(false), 2600);
      }
      router.refresh();
    });
  };

  const ignore = () => {
    setRemoved(true);
    startTransition(async () => {
      const result = await ignorePostAction(post.id);
      if (!result.ok) {
        // La carte revient : mentir sur un échec serait pire que la latence
        // qu'on vient de supprimer.
        setRemoved(false);
        toast.error(result.message ?? "Action impossible.");
        return;
      }
      router.refresh();
    });
  };

  const saveLists = () => {
    startTransition(async () => {
      const result = await setCreatorListsAction(post.account_id ?? "", draftLists);
      if (!result.ok) {
        toast.error(result.message ?? "Changement impossible.");
        return;
      }
      setListsOpen(false);
      toast.success(
        draftLists.length === 1
          ? "Créateur déplacé dans 1 liste."
          : `Créateur rattaché à ${draftLists.length} listes.`,
      );
      router.refresh();
    });
  };

  if (removed) return null;

  return (
    <>
      <article className="nc-card t-resize overflow-hidden" data-processed={processed}>
        {/* Une infobulle est posée au-dessus de son groupe : un groupe à
            l'échelle de la carte la projetterait au-dessus de la carte, à
            cinquante centimètres du bouton qui l'a demandée. D'où un groupe
            par rangée de commandes. */}
        <TooltipGroup className="nc-tt-row items-start gap-3 p-4 pb-3">
          <Avatar src={post.author_avatar_url} name={post.author_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">
              {post.author_name ?? "Auteur inconnu"}
            </p>
            <p
              className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span>{relativeTime(post.published_at)}</span>
              {showListBadges
                ? post.lists.slice(0, 2).map((list) => (
                    <span key={list.id} className="nc-badge nc-badge--neutral">
                      {list.name}
                    </span>
                  ))
                : null}
              {showListBadges && post.lists.length > 2 ? (
                <span
                  className="nc-badge nc-badge--neutral"
                  title={post.lists.map((list) => list.name).join(" · ")}
                >
                  +{post.lists.length - 2}
                </span>
              ) : null}
            </p>
          </div>

          {processed ? (
            <span className="nc-badge nc-badge--ok shrink-0">
              <Check size={12} aria-hidden />
              {post.processed_reason === "ignored" ? "Ignoré" : "Traité"}
            </span>
          ) : null}

          <Dropdown
            label="Actions sur cette publication"
            origin="top-right"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Actions sur cette publication"
                data-tooltip="Actions"
                className="nc-icon-btn shrink-0"
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <>
                {post.post_url ? (
                  <a
                    href={post.post_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    role="menuitem"
                    className="nc-menu-item"
                    onClick={close}
                  >
                    <ArrowNorthEastIcon size={14} />
                    Ouvrir la publication
                  </a>
                ) : null}

                {processed ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="nc-menu-item"
                    onClick={() => {
                      close();
                      run(() => restorePostAction(post.id), "Remis à traiter");
                    }}
                  >
                    <Undo2 size={14} aria-hidden />
                    Remettre à traiter
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="nc-menu-item"
                    onClick={() => {
                      close();
                      ignore();
                    }}
                  >
                    <ViewOffIcon size={14} />
                    Ignorer
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  className="nc-menu-item"
                  disabled={post.account_id === null}
                  onClick={() => {
                    close();
                    setDraftLists(post.lists.map((list) => list.id));
                    setListsOpen(true);
                  }}
                >
                  <DependencyIcon size={14} />
                  Changer de liste
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="nc-menu-item nc-menu-item--danger"
                  disabled={post.account_id === null}
                  onClick={() => {
                    close();
                    // La suppression est portée par le feed : c'est lui qui
                    // doit retirer TOUTES les cartes de ce créateur, et lui qui
                    // tient le bandeau d'annulation.
                    onRemoved?.(post.account_id);
                  }}
                >
                  <DeleteIcon size={14} />
                  Supprimer le créateur
                </button>
              </>
            )}
          </Dropdown>
        </TooltipGroup>

        {post.body ? (
          <ExpandableText className="px-4">
            <p className="nc-selectable whitespace-pre-wrap text-[15px] leading-[1.55]">
              {post.body}
            </p>
          </ExpandableText>
        ) : null}

        {images.length > 0 ? (
          <div
            className="mt-3 grid gap-1 px-4"
            style={{ gridTemplateColumns: images.length > 1 ? "1fr 1fr" : "1fr" }}
          >
            {images.slice(0, 4).map((image) => (
              <button
                key={image.url ?? ""}
                type="button"
                className="nc-zoomable"
                onClick={() => setZoomed(image.url)}
                aria-label="Agrandir l'image"
              >
                <img
                  src={image.url ?? ""}
                  alt=""
                  loading="lazy"
                  className="w-full rounded-[12px] object-cover"
                  style={{ maxHeight: images.length > 1 ? 160 : 380 }}
                />
              </button>
            ))}
          </div>
        ) : null}

        {external && post.post_url ? (
          <LearnMoreLink
            href={post.post_url}
            className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 text-[13px]"
          >
            <span style={{ color: "var(--color-text-secondary)" }}>
              {MEDIA_LABELS[external.type] ?? external.title ?? "Média externe"}
            </span>
          </LearnMoreLink>
        ) : null}

        <InlineToast shown={justQueued} className="mx-4 mt-3">
          <p
            className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px]"
            style={{
              background: "var(--nc-status-accepted-bg)",
              color: "var(--nc-status-accepted-text)",
            }}
          >
            <SuccessCheck shown={justQueued} size={15} />
            En file — rien ne part avant l&apos;heure prévue.
          </p>
        </InlineToast>

        {post.pendingAction ? (
          <p
            className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px]"
            style={{
              background: "var(--nc-status-upcoming-bg)",
              color: "var(--nc-status-upcoming-text)",
            }}
          >
            <span className="nc-blink-dot" aria-hidden />
            {post.pendingAction.kind === "like" ? "Réaction" : "Commentaire"} en file — envoi{" "}
            {scheduledLabel(post.pendingAction.scheduledFor)}
          </p>
        ) : null}

        <TooltipGroup
          className="nc-tt-row mt-3 items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <ReactionPicker
            current={posted}
            disabled={pending || posted !== null}
            label={posted ? "Réaction déjà posée" : "Réagir"}
            onPick={(type: ReactionType) =>
              run(
                () => likePostAction(post.id, type),
                `${lookupReaction(type).label} en file`,
              )
            }
          />

          {/* Compteurs venus du fournisseur, affichés seulement s'il les a
              donnés : « 0 » et « masqué par LinkedIn » ne sont pas la même
              chose, et aucun appel n'a été ajouté pour les obtenir. */}
          {post.reaction_count !== null || post.comment_count !== null ? (
            <p
              className="flex items-center gap-2 text-[12px] tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {post.reaction_count !== null ? (
                <span className="inline-flex items-center gap-1">
                  <ReactionIcon type="like" size={15} />
                  {post.reaction_count}
                </span>
              ) : null}
              {post.comment_count !== null ? (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare size={13} aria-hidden />
                  {post.comment_count}
                </span>
              ) : null}
            </p>
          ) : null}

        </TooltipGroup>

        {/* Ouvert d'emblée : commenter est le geste normal de cet écran. */}
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
          <Composer
            placeholder="Ton commentaire…"
            generateLabel="Générer un commentaire"
            onGenerate={() => generateForPostAction(post.id)}
            onSubmit={(body, origin) => submitComment(post.id, body, origin)}
            onDone={() => router.refresh()}
          />
        </div>
      </article>

      <Lightbox src={zoomed} onClose={() => setZoomed(null)} />

      <Modal
        open={listsOpen}
        onClose={() => setListsOpen(false)}
        title={`Listes de ${post.author_name ?? "ce créateur"}`}
        footer={
          <>
            <button
              type="button"
              className="nc-btn nc-btn--ghost nc-btn--sm"
              onClick={() => setListsOpen(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="nc-btn nc-btn--primary nc-btn--sm"
              disabled={pending}
              onClick={saveLists}
            >
              Enregistrer
            </button>
          </>
        }
      >
        <ListPickerMenu
          lists={lists}
          selected={draftLists}
          onToggle={(id, next) =>
            setDraftLists((current) =>
              next ? [...current, id] : current.filter((entry) => entry !== id),
            )
          }
        />
        <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Le créateur apparaîtra dans le feed de chaque liste cochée.
        </p>
      </Modal>
    </>
  );
}
