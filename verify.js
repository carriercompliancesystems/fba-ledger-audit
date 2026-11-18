export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return new Response(JSON.stringify({ paid: false, error: "Invalid session" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const stripeKey = context.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ paid: false, error: "Server config missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      "Authorization": `Bearer ${stripeKey}`
    }
  });

  if (!resp.ok) {
    return new Response(JSON.stringify({ paid: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const session = await resp.json();
  const isPaid = session.payment_status === "paid";

  return new Response(JSON.stringify({ paid: isPaid }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}