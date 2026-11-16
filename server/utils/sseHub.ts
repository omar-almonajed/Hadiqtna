import type { Response } from 'express';

export interface SseClient {
  id: string;
  res: Response;
  role: string;
  uid: string;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(client: SseClient): () => void {
  clients.set(client.id, client);
  return () => {
    clients.delete(client.id);
  };
}

export function broadcastSseEvent(
  event: string,
  payload: unknown,
  allowedRoles?: string[],
  targetUid?: string
): void {
  const dataLine = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [id, client] of clients.entries()) {
    const roleMatches = !allowedRoles || allowedRoles.includes(client.role);
    const uidMatches = Boolean(targetUid && client.uid === targetUid);
    if (!roleMatches && !uidMatches) {
      continue;
    }
    try {
      client.res.write(dataLine);
    } catch {
      clients.delete(id);
    }
  }
}

export function getConnectedSseCount(): number {
  return clients.size;
}
