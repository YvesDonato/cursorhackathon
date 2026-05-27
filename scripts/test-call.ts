const WEBHOOK_URL = "http://localhost:3000/api/message-webhook";
const CALL_ID = `test-${Date.now()}`;
const DELAY_MS = 3000;

const messages = [
  { role: "agent", message: "Bonjour! Merci d'avoir appelé Bella Salon. Comment puis-je vous aider aujourd'hui?" },
  { role: "user",  message: "Bonjour, je voudrais prendre rendez-vous pour une coupe de cheveux." },
  { role: "agent", message: "Parfait! Je serais ravi de vous aider. Quel est votre nom?" },
  { role: "user",  message: "Je m'appelle Sophie Martin." },
  { role: "agent", message: "Merci Sophie. Quel jour vous conviendrait le mieux?" },
  { role: "user",  message: "Peut-être jeudi prochain vers 15h si possible?" },
  { role: "agent", message: "Jeudi 5 juin à 15h00, c'est parfait. Puis-je avoir votre numéro de téléphone?" },
  { role: "user",  message: "Oui, c'est le 555-0192." },
  { role: "agent", message: "Merci! J'ai bien noté votre rendez-vous. Vous recevrez une confirmation par SMS." },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(payload: object) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook returned ${res.status}: ${body}`);
  }
  return res.json();
}

async function run() {
  console.log(`Starting test call  call_id=${CALL_ID}`);

  for (let i = 0; i < messages.length; i++) {
    const { role, message } = messages[i];
    const last_message = i === messages.length - 1;

    console.log(`[${role}] ${message}`);
    await post({ call_id: CALL_ID, role, message, last_message });

    if (!last_message) await sleep(DELAY_MS);
  }

  console.log("Call ended.");
}

run().catch(console.error);
