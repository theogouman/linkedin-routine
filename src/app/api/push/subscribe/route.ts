import { z } from "zod";
import { saveSubscription } from "@/modules/notifications/server/push";

export const dynamic = "force-dynamic";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Enregistrement d'un appareil pour les notifications (FR-014). */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "corps JSON invalide" }, { status: 400 });
  }

  const parsed = SubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "abonnement push invalide" }, { status: 400 });
  }

  try {
    await saveSubscription(parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "échec d'enregistrement" },
      { status: 500 },
    );
  }
}
