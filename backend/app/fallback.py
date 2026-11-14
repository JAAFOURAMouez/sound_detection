"""Réponses de repli construites par gabarits (LLM indisponible ou réponse invalide).

Le même esprit que le prompt système : phrases courtes, incertitude annoncée, recommandation
proportionnée, rappel des limites quand le danger est possible.
"""

from collections import Counter

from app.schemas import AssistantAnswer, ChatRequest, ReportAnswer, ReportRequest, Severity

DISCLAIMER = "Je ne suis pas un dispositif de sécurité certifié."


def severity_of(level: int) -> Severity:
    return "alerte" if level >= 3 else "verification" if level >= 1 else "information"


def chat_fallback(request: ChatRequest) -> AssistantAnswer:
    event = request.event
    label = event.family_label or event.family or "un son"
    severity = severity_of(event.severity)
    if event.type == "drift":
        return AssistantAnswer(
            reply="L'ambiance a changé durablement par rapport à la calibration. "
            "Ce n'est pas un danger en soi.",
            recommendation="Recalibre si ce nouveau fond sonore est normal.",
            severity="information",
        )
    if event.type == "unknown":
        score = f" (score d'anomalie {event.score_max:.2f})" if event.score_max is not None else ""
        reply = (
            f"J'ai entendu un son inhabituel{score}, mais il ne ressemble à rien que je "
            "reconnaisse avec assez de certitude."
        )
    else:
        reply = f"On dirait {label}, avec une confiance de {round(event.confidence * 100)} %."
    if severity == "alerte":
        recommendation = (
            f"Vérifie sur place tout de suite. En cas de danger, appelle le 112. {DISCLAIMER}"
        )
    elif severity == "verification":
        recommendation = "Jette un œil ou tends l'oreille pour vérifier que tout va bien."
    else:
        recommendation = "Rien à faire, je continue d'écouter."
    return AssistantAnswer(reply=reply, recommendation=recommendation, severity=severity)


def report_fallback(request: ReportRequest) -> ReportAnswer:
    events = request.events
    if not events:
        return ReportAnswer(
            summary="Aucun événement pendant cette session : ambiance calme.", highlights=[]
        )
    families = Counter(e.family_label or e.family or "inconnu" for e in events if e.type != "drift")
    serious = [e for e in events if e.severity >= 2]
    parts = [f"{len(events)} événement(s) pendant la session."]
    if families:
        top = ", ".join(f"{name} ({count})" for name, count in families.most_common(3))
        parts.append(f"Les plus fréquents : {top}.")
    if serious:
        parts.append(f"{len(serious)} méritaient une vérification.")
    else:
        parts.append("Aucun ne semblait grave.")
    highlights = [
        f"{e.started_at:%H:%M} — {e.family_label or e.family or 'son inconnu'}"
        + (f" : {e.note}" if e.note else "")
        for e in sorted(serious, key=lambda e: -e.severity)[:5]
    ]
    return ReportAnswer(summary=" ".join(parts), highlights=highlights)
