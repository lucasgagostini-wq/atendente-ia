const BRIDGE_SECRET = process.env.WEBHOOK_SECRET;

export function isBridgeAuthorized(request: Request) {
  if (!BRIDGE_SECRET) return true;

  const incomingSecret = request.headers.get("x-webhook-secret");
  return Boolean(incomingSecret && incomingSecret === BRIDGE_SECRET);
}
