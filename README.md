# linkedin-routine

Application mobile-first (PWA iOS) qui remplace le fil natif LinkedIn pour deux routines
d'engagement quotidiennes : commenter les publications d'une liste curée de créateurs, et
répondre aux commentaires reçus sur ses propres posts. Le principe : une file finie,
ordonnée et vidable — une inbox, pas un fil infini.

## État du projet

Développement piloté par la spécification ([Spec Kit](https://github.com/github/spec-kit)).

| Étape | Commande | État |
|---|---|---|
| Spécification | `/speckit-specify` | ✅ [`specs/001-linkedin-engagement-inbox/spec.md`](specs/001-linkedin-engagement-inbox/spec.md) |
| Clarifications | `/speckit-clarify` | ⬜ 2 points ouverts |
| Constitution | `/speckit-constitution` | ⬜ modèle non renseigné |
| Plan technique | `/speckit-plan` | ⬜ |
| Tâches | `/speckit-tasks` | ⬜ |
| Implémentation | `/speckit-implement` | ⬜ |

Aucun code applicatif n'existe encore : la stack technique relève du plan.

## Structure

- `specs/001-linkedin-engagement-inbox/spec.md` — le quoi et le pourquoi (scénarios, exigences,
  critères de succès, contraintes externes, hors-périmètre).
- `specs/001-linkedin-engagement-inbox/checklists/requirements.md` — revue qualité de la spec.
- `.specify/` — modèles, scripts et mémoire Spec Kit.
- `.claude/skills/` — commandes Spec Kit disponibles dans Claude Code.
