"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CornerDownRight, ExternalLink, Reply } from "lucide-react";
import type { InboxComment } from "@/modules/inbox/server/repository";
import { Avatar } from "@/shared/components/Avatar";
import { Composer } from "@/shared/components/Composer";
import { InlineToast } from "@/shared/motion/InlineToast";
import { LearnMoreLink } from "@/shared/motion/LearnMoreLink";
import { LikeButton } from "@/shared/motion/LikeButton";
import { PanelReveal } from "@/shared/motion/PanelReveal";
import { SuccessCheck } from "@/shared/motion/SuccessCheck";
import { TooltipGroup } from "@/shared/motion/Tooltip";
import {
  generateForCommentAction,
  ignoreCommentAction,
  likeCommentAction,
  submitReply,
} from "@/app/actions";
import { relativeTime, scheduledLabel } from "@/shared/lib/format";

/**
 * Un commentaire reçu (FR-008, FR-009, FR-013).
 *
 * L'indentation reflète la profondeur d'imbrication réelle, plafonnée : au
 * delà de trois niveaux, décaler davantage réduirait la largeur de lecture à
 * rien sur un téléphone.
 */
export function InboxItem({ comment }: { comment: InboxComment }) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  const processed = comment.processed_at !== null;
  const indent = Math.min(comment.depth, 3) * 14;

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
        result.scheduledFor ? `${success} — envoi ${scheduledLabel(result.scheduledFor)}.` : success,
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
    <article className="nc-card t-resize overflow-hidden" style={{ marginLeft: indent }}>
      {comment.post ? (
        <p
          className="truncate border-b px-4 py-2 text-[12px]"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-muted)" }}
        >
          Sur ta publication du {relativeTime(comment.post.published_at)}
          {comment.post.body ? ` · ${comment.post.body.slice(0, 70)}…` : ""}
        </p>
      ) : null}

      <div className="flex items-start gap-3 p-4 pb-3">
        {comment.depth > 0 ? (
          <CornerDownRight size={14} className="mt-2 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden />
        ) : null}
        <Avatar src={comment.author_avatar_url} name={comment.author_name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">
            {comment.author_name ?? "Auteur inconnu"}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {relativeTime(comment.published_at)}
          </p>
        </div>
        {processed ? (
          <span className="nc-badge nc-badge--ok">
            <Check size={12} aria-hidden />
            {comment.processed_reason === "ignored" ? "Ignoré" : "Répondu"}
          </span>
        ) : null}
      </div>

      {comment.body ? (
        <p className="nc-selectable whitespace-pre-wrap px-4 text-[15px] leading-[1.55]">
          {comment.body}
        </p>
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

      {comment.pendingAction ? (
        <p
          className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px]"
          style={{ background: "var(--nc-status-upcoming-bg)", color: "var(--nc-status-upcoming-text)" }}
        >
          <span className="nc-blink-dot" aria-hidden />
          Réponse en file — envoi {scheduledLabel(comment.pendingAction.scheduledFor)}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
        <LikeButton
          liked={comment.liked_at !== null}
          disabled={pending || comment.liked_at !== null}
          onLike={() => run(() => likeCommentAction(comment.id), "Like en file")}
          label={comment.liked_at ? "Déjà liké" : "Liker ce commentaire"}
        />

        <button
          type="button"
          className="nc-btn nc-btn--ghost nc-btn--sm"
          onClick={() => setReplyOpen((open) => !open)}
          aria-expanded={replyOpen}
        >
          <Reply size={15} aria-hidden />
          Répondre
        </button>

        <div className="flex-1" />

        {comment.comment_url ? (
          <LearnMoreLink
            href={comment.comment_url}
            className="nc-icon-btn"
            icon={<ExternalLink size={15} aria-hidden />}
          >
            <span className="sr-only">Ouvrir dans LinkedIn</span>
          </LearnMoreLink>
        ) : null}

        {!processed ? (
          <button
            type="button"
            className="nc-btn nc-btn--ghost nc-btn--sm"
            disabled={pending}
            onClick={() => run(() => ignoreCommentAction(comment.id), "Commentaire ignoré")}
          >
            Ignorer
          </button>
        ) : null}
      </div>

      <PanelReveal
        open={replyOpen}
        className="border-t px-4 py-3"
        style={
          {
            borderColor: "var(--color-border-default)",
            "--panel-translate-y": "24px",
          } as React.CSSProperties
        }
      >
        <Composer
          placeholder="Ta réponse…"
          generateLabel="Générer une réponse"
          onGenerate={() => generateForCommentAction(comment.id)}
          onSubmit={(body, origin) => submitReply(comment.id, body, origin)}
          onDone={() => {
            setReplyOpen(false);
            router.refresh();
          }}
        />
      </PanelReveal>
    </article>
    </TooltipGroup>
  );
}
