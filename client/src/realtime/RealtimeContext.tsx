import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { tokenStorage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RealtimeClient, type Channel, type ConnStatus, type ServerMessage } from './socket';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/** One WebSocket per tab, open while the user is logged in. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const [client] = useState(() => new RealtimeClient());

  useEffect(() => {
    client.onAuthFailure = () => logout(); // token rejected/expired → same as a REST 401
  }, [client, logout]);

  useEffect(() => {
    const token = tokenStorage.get();
    if (status === 'authenticated' && token) client.connect(token);
    else client.disconnect();
  }, [client, status, user?.id]);

  useEffect(() => () => client.disconnect(), [client]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

function useClient(): RealtimeClient {
  const c = useContext(RealtimeContext);
  if (!c) throw new Error('Realtime hooks must be used inside <RealtimeProvider>');
  return c;
}

export function useRealtimeStatus(): ConnStatus {
  const client = useClient();
  const [status, setStatus] = useState(client.getStatus());
  useEffect(() => {
    setStatus(client.getStatus());
    return client.onStatus(setStatus);
  }, [client]);
  return status;
}

/** Calls `handler` for every message of `type`. The latest handler is always used. */
export function useRealtimeEvent(type: string, handler: (msg: ServerMessage) => void): void {
  const client = useClient();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => client.on(type, (msg) => ref.current(msg)), [client, type]);
}

/** Subscribes to a channel while the component is mounted. */
export function useChannel(channel: Channel): void {
  const client = useClient();
  useEffect(() => client.join(channel), [client, channel]);
}
