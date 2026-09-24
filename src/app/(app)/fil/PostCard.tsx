"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, MessageSquare, Undo2 } from "lucide-react";
import type { FeedPost } from "@/modules/feed/server/repository";
import { Avatar } from "@/shared/components/Avatar";
import { Composer } from "@/shared/components/Composer";
import { InlineToast } from "@/shared/motion/InlineToast";
import { LearnMoreLink } from "@/shared/motion/LearnMoreLink";
import { LikeButton } from "@/shared/motion/LikeButton";
import { PanelReveal } from "@/shared/motion/PanelReveal";
import { SuccessCheck } from "@/shared/motion/SuccessCheck";
import { TiltCard } from "@/shared/motion/TiltCard";
import { TooltipGroup } from "@/shared/motion/Tooltip";
import {
  generateForPostAction,
  ignorePostAction,
  likePostAction,
  restorePostAction,
  submitComment,
} from "@/app/actions";
import { relativeTime, scheduledLabel } from "@/shared/lib/format";

/**
 * Une publication du fil (FR-004, FR-005, FR-006, FR-010, FR-013).
 *
 * Le média non restituable (vidéo, carrousel document) n'est jamais simulé :
 * on affiche un lien d'ouverture LinkedIn plutôt qu'un lecteur cassé. Mieux
 * vaut un lien honnête qu'un aperçu qui ment sur ce que l'utilisateur commente.
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

export function PostCard({ post }: { post: FeedPost }) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  const media = (Array.isArray(post.media) ? post.media : []) as MediaEntry[];
  const images = media.filter((entry) => entry.type === "image" && entry.url);
  const external = media.find((entry) => entry.externalOnly);
  const processed = post.processed_at !== null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string; scheduledFor?: string }>, success: string) => {
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

  return (
    <TooltipGroup className="nc-tt-block">
    {/* transitions.dev · 19 — inclinaison 3D au pointeur, souris uniquement,
        et coupée pendant la rédaction : une carte qui bouge sous un curseur
        de texte rendrait la relecture pénible. */}
    <TiltCard className="nc-card t-resize" glare={false} disabled={composerOpen}>
    <article data-processed={processed}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar src={post.author_avatar_url} name={post.author_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">
            {post.author_name ?? "Auteur inconnu"}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {relativeTime(post.published_at)}
          </p>
        </div>
        {processed ? (
          <span className="nc-badge nc-badge--ok">
            <Check size={12} aria-hidden />
            {post.processed_reason === "ignored" ? "Ignoré" : "Traité"}
          </span>
        ) : null}
      </div>

      {post.body ? (
        <p className="nc-selectable whitespace-pre-wrap px-4 text-[15px] leading-[1.55]">
          {post.body}
        </p>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-3 grid gap-1 px-4" style={{ gridTemplateColumns: images.length > 1 ? "1fr 1fr" : "1fr" }}>
          {images.slice(0, 4).map((image) => (
            <img
              key={image.url ?? ""}
              src={image.url ?? ""}
              alt=""
              loading="lazy"
              className="w-full rounded-[12px] object-cover"
              style={{ maxHeight: images.length > 1 ? 160 : 380 }}
            />
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
          style={{ background: "var(--nc-status-accepted-bg)", color: "var(--nc-status-accepted-text)" }}
        >
          <SuccessCheck shown={justQueued} size={15} />
          En file — rien ne part avant l&apos;heure prévue.
        </p>
      </InlineToast>

      {post.pendingAction ? (
        <p
          className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px]"
          style={{ background: "var(--nc-status-upcoming-bg)", color: "var(--nc-status-upcoming-text)" }}
        >
          <span className="nc-blink-dot" aria-hidden />
          {post.pendingAction.kind === "like" ? "Like" : "Commentaire"} en file — envoi{" "}
          {scheduledLabel(post.pendingAction.scheduledFor)}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
        {/* transitions.dev · 23 — le cœur se remplit avec un pop et part en
            gerbe. C'est le seul geste de l'app qui coûte un clic et rien
            d'autre : il mérite d'être satisfaisant. */}
        <LikeButton
          liked={post.liked_at !== null}
          disabled={pending || post.liked_at !== null}
          onLike={() => run(() => likePostAction(post.id), "Like en file")}
          label={post.liked_at ? "Déjà liké" : "Liker"}
        />

        <button
          type="button"
          className="nc-btn nc-btn--ghost nc-btn--sm"
          onClick={() => setComposerOpen((open) => !open)}
          aria-expanded={composerOpen}
        >
          <MessageSquare size={15} aria-hidden />
          Commenter
        </button>

        <div className="flex-1" />

        {post.post_url ? (
          <LearnMoreLink
            href={post.post_url}
            className="nc-icon-btn"
            icon={<ExternalLink size={15} aria-hidden />}
          >
            <span className="sr-only">Ouvrir dans LinkedIn</span>
          </LearnMoreLink>
        ) : null}

        {processed ? (
          <button
            type="button"
            className="nc-icon-btn"
            disabled={pending}
            onClick={() => run(() => restorePostAction(post.id), "Remis à traiter")}
            aria-label="Remettre à traiter"
            data-tooltip="Remettre à traiter"
          >
            <Undo2 size={15} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="nc-btn nc-btn--ghost nc-btn--sm"
            disabled={pending}
            onClick={() => run(() => ignorePostAction(post.id), "Publication ignorée")}
          >
            Ignorer
          </button>
        )}
      </div>

      {/* transitions.dev · 07 — le composer GLISSE dans la carte au lieu
          d'apparaître d'un coup et de pousser tout ce qui suit. */}
      <PanelReveal
        open={composerOpen}
        className="border-t px-4 py-3"
        style={
          {
            borderColor: "var(--color-border-default)",
            // La course par défaut du snippet (100 px) est celle d'un panneau
            // plein écran ; ici le composer glisse dans une carte.
            "--panel-translate-y": "24px",
          } as React.CSSProperties
        }
      >
        <Composer
          placeholder="Ton commentaire…"
          generateLabel="Générer un commentaire"
          onGenerate={() => generateForPostAction(post.id)}
          onSubmit={(body, origin) => submitComment(post.id, body, origin)}
          onDone={() => {
            setComposerOpen(false);
            router.refresh();
          }}
        />
      </PanelReveal>
    </article>
    </TiltCard>
    </TooltipGroup>
  );
}
