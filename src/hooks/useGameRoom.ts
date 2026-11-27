import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import PartySocket from 'partysocket';
import type { ClientMessage, RoomState, ServerMessage } from '../types/game';
import { getPartyHost, shouldUsePartyKit } from '../lib/roomUtils';
import {
  applyRoomAction,
  createRoomEngineContext,
  markPlayerDisconnected,
  type RoomEngineContext,
} from '../lib/roomEngine';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type RoomMode = 'host' | 'join';

interface UseGameRoomOptions {
  roomCode: string | null;
  mode: RoomMode;
  playerId: string;
  playerName: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

type BroadcastPacket =
  | { kind: 'BC_ACTION'; senderId: string; msg: ClientMessage }
  | { kind: 'BC_SYNC'; state: RoomState }
  | { kind: 'BC_LEAVE'; playerId: string };

function getRoomPeerId(roomCode: string): string {
  return `card-arena-room-${roomCode.toUpperCase()}`;
}

function getHostStorageKey(roomCode: string): string {
  return `card_arena_host_state_${roomCode.toUpperCase()}`;
}

function loadSavedHostState(roomCode: string): RoomState | null {
  try {
    const raw = sessionStorage.getItem(getHostStorageKey(roomCode));
    if (!raw) return null;
    return JSON.parse(raw) as RoomState;
  } catch {
    return null;
  }
}

function saveHostState(roomCode: string, state: RoomState): void {
  try {
    sessionStorage.setItem(getHostStorageKey(roomCode), JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function useGameRoom({ roomCode, mode, playerId, playerName }: UseGameRoomOptions) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [roomNotFound, setRoomNotFound] = useState(false);

  const sendImplRef = useRef<(msg: ClientMessage) => void>(() => {});

  useEffect(() => {
    if (!roomCode) {
      setRoomState(null);
      setStatus('disconnected');
      setLastError(null);
      setRoomNotFound(false);
      sendImplRef.current = () => {};
      return;
    }

    const upperCode = roomCode.toUpperCase();
    setLastError(null);
    setRoomNotFound(false);

    // -------------------------------------------------------------------------
    // MODE A: Optional PartyKit WebSocket server (when VITE_PARTYKIT_HOST is set)
    // -------------------------------------------------------------------------
    if (shouldUsePartyKit()) {
      setStatus('connecting');
      const socket = new PartySocket({
        host: getPartyHost(),
        room: upperCode,
      });

      sendImplRef.current = (message: ClientMessage) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      };

      const handleOpen = () => {
        setStatus('connected');
        setLastError(null);
        socket.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            playerId,
            name: playerName,
          } satisfies ClientMessage),
        );
      };

      const handleMessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          if (msg.type === 'SYNC_STATE') {
            setRoomState(msg.state);
          } else if (msg.type === 'ERROR') {
            setLastError(msg.message);
          }
        } catch {
          // ignore malformed payload
        }
      };

      const handleCloseOrError = () => setStatus('reconnecting');

      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', handleCloseOrError);
      socket.addEventListener('error', handleCloseOrError);

      return () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('close', handleCloseOrError);
        socket.removeEventListener('error', handleCloseOrError);
        socket.close();
      };
    }

    // -------------------------------------------------------------------------
    // MODE B: Zero-Server WebRTC (PeerJS) + Same-Browser BroadcastChannel
    // -------------------------------------------------------------------------
    const channelName = getRoomPeerId(upperCode);
    const bc: BroadcastChannel | null =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;

    let disposed = false;

    if (mode === 'host') {
      // Host owns authoritative RoomState immediately (0ms startup, works solo & online)
      const ctx: RoomEngineContext = createRoomEngineContext(
        upperCode,
        loadSavedHostState(upperCode),
      );
      applyRoomAction(ctx, { type: 'JOIN_ROOM', playerId, name: playerName });
      saveHostState(upperCode, ctx.state);
      setRoomState(ctx.state);
      setStatus('connecting');

      const connections = new Map<string, DataConnection>();
      const peerToPlayer = new Map<string, string>();

      const broadcastState = (state: RoomState) => {
        const packet: ServerMessage = { type: 'SYNC_STATE', state };
        const serialized = JSON.stringify(packet);
        for (const conn of connections.values()) {
          if (conn.open) {
            try {
              conn.send(serialized);
            } catch {
              // ignore dropped peer
            }
          }
        }
        if (bc) {
          try {
            bc.postMessage({ kind: 'BC_SYNC', state } satisfies BroadcastPacket);
          } catch {
            // ignore closed channel
          }
        }
      };

      const handleIncomingAction = (msg: ClientMessage, fromPeerId?: string) => {
        if (msg.type === 'JOIN_ROOM' && fromPeerId) {
          peerToPlayer.set(fromPeerId, msg.playerId);
        }
        const res = applyRoomAction(ctx, msg);
        if (res.error) {
          setLastError(res.error);
          return;
        }
        if (res.changed) {
          setRoomState(ctx.state);
          if (res.persist) {
            saveHostState(upperCode, ctx.state);
          }
          broadcastState(ctx.state);
        }
      };

      sendImplRef.current = (msg: ClientMessage) => {
        handleIncomingAction(msg);
      };

      if (bc) {
        bc.onmessage = (event: MessageEvent<BroadcastPacket>) => {
          const data = event.data;
          if (!data || typeof data !== 'object') return;
          if (data.kind === 'BC_ACTION') {
            handleIncomingAction(data.msg);
          } else if (data.kind === 'BC_LEAVE') {
            if (markPlayerDisconnected(ctx, data.playerId)) {
              setRoomState(ctx.state);
              saveHostState(upperCode, ctx.state);
              broadcastState(ctx.state);
            }
          }
        };
      }

      let peer: Peer | null = null;
      let retryTimer: number | null = null;
      let retryCount = 0;

      const startHostPeer = () => {
        if (disposed) return;
        const nextPeer = new Peer(channelName, {
          debug: 0,
          config: { iceServers: ICE_SERVERS },
        });
        peer = nextPeer;

        nextPeer.on('open', () => {
          if (disposed) return;
          retryCount = 0;
          setStatus('connected');
          setLastError(null);
        });

        nextPeer.on('connection', (conn) => {
          connections.set(conn.peer, conn);

          conn.on('open', () => {
            try {
              conn.send(
                JSON.stringify({ type: 'SYNC_STATE', state: ctx.state } satisfies ServerMessage),
              );
            } catch {
              // ignore
            }
          });

          conn.on('data', (raw) => {
            try {
              const msg =
                typeof raw === 'string'
                  ? (JSON.parse(raw) as ClientMessage)
                  : (raw as ClientMessage);
              if (msg && typeof msg.type === 'string') {
                handleIncomingAction(msg, conn.peer);
              }
            } catch {
              // ignore malformed guest payload
            }
          });

          const onDisconnect = () => {
            connections.delete(conn.peer);
            const pid = peerToPlayer.get(conn.peer);
            peerToPlayer.delete(conn.peer);
            if (pid && !Array.from(peerToPlayer.values()).includes(pid)) {
              if (markPlayerDisconnected(ctx, pid)) {
                setRoomState(ctx.state);
                saveHostState(upperCode, ctx.state);
                broadcastState(ctx.state);
              }
            }
          };

          conn.on('close', onDisconnect);
          conn.on('error', onDisconnect);
        });

        nextPeer.on('disconnected', () => {
          if (disposed) return;
          setStatus('reconnecting');
          try {
            nextPeer.reconnect();
          } catch {
            // ignore
          }
        });

        nextPeer.on('error', (err) => {
          if (disposed) return;
          if (err.type === 'unavailable-id' && retryCount < 3) {
            retryCount += 1;
            nextPeer.destroy();
            retryTimer = window.setTimeout(startHostPeer, 1800);
          } else {
            // Still playable solo/same-browser even if WebRTC signaling is temporarily unavailable
            setStatus('reconnecting');
          }
        });
      };

      startHostPeer();

      const handleBeforeUnload = () => {
        try {
          peer?.destroy();
        } catch {
          // ignore
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        disposed = true;
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        for (const conn of connections.values()) {
          try {
            conn.close();
          } catch {
            // ignore
          }
        }
        connections.clear();
        try {
          peer?.destroy();
        } catch {
          // ignore
        }
        bc?.close();
      };
    }

    // -------------------------------------------------------------------------
    // Guest Join Mode (BroadcastChannel same-browser fast path + PeerJS WebRTC)
    // -------------------------------------------------------------------------
    setStatus('connecting');
    let connectedViaBc = false;
    let activeConn: DataConnection | null = null;
    let notFoundTimer: number | null = null;

    const sendAsGuest = (msg: ClientMessage) => {
      if (activeConn && activeConn.open) {
        activeConn.send(JSON.stringify(msg));
        return;
      }
      if (connectedViaBc && bc) {
        bc.postMessage({ kind: 'BC_ACTION', senderId: playerId, msg } satisfies BroadcastPacket);
      }
    };
    sendImplRef.current = sendAsGuest;

    const joinMsg: ClientMessage = {
      type: 'JOIN_ROOM',
      playerId,
      name: playerName,
    };

    if (bc) {
      bc.onmessage = (event: MessageEvent<BroadcastPacket>) => {
        if (disposed) return;
        const data = event.data;
        if (data?.kind === 'BC_SYNC') {
          connectedViaBc = true;
          if (notFoundTimer !== null) {
            window.clearTimeout(notFoundTimer);
            notFoundTimer = null;
          }
          setRoomNotFound(false);
          setLastError(null);
          setStatus('connected');
          setRoomState(data.state);
        }
      };
      bc.postMessage({ kind: 'BC_ACTION', senderId: playerId, msg: joinMsg } satisfies BroadcastPacket);
    }

    const peer = new Peer({
      debug: 0,
      config: { iceServers: ICE_SERVERS },
    });

    peer.on('open', () => {
      if (disposed || connectedViaBc) return;
      const conn = peer.connect(channelName, { reliable: true });
      activeConn = conn;

      conn.on('open', () => {
        if (disposed) return;
        if (notFoundTimer !== null) {
          window.clearTimeout(notFoundTimer);
          notFoundTimer = null;
        }
        setRoomNotFound(false);
        setLastError(null);
        setStatus('connected');
        conn.send(JSON.stringify(joinMsg));
      });

      conn.on('data', (raw) => {
        if (disposed) return;
        try {
          const msg =
            typeof raw === 'string'
              ? (JSON.parse(raw) as ServerMessage)
              : (raw as ServerMessage);
          if (msg.type === 'SYNC_STATE') {
            setRoomState(msg.state);
          } else if (msg.type === 'ERROR') {
            setLastError(msg.message);
          }
        } catch {
          // ignore
        }
      });

      conn.on('close', () => {
        if (disposed || connectedViaBc) return;
        setStatus('reconnecting');
        setLastError('Disconnected from room host.');
      });

      conn.on('error', () => {
        if (disposed || connectedViaBc) return;
        setStatus('reconnecting');
      });
    });

    peer.on('error', (err) => {
      if (disposed || connectedViaBc) return;
      if (err.type === 'peer-unavailable') {
        notFoundTimer = window.setTimeout(() => {
          if (disposed || connectedViaBc) return;
          setRoomNotFound(true);
          setStatus('disconnected');
          setLastError(`Room ${upperCode} was not found. Make sure the host has it open.`);
        }, 450);
      } else {
        setStatus('reconnecting');
        setLastError(`Connection issue (${err.type}). Retrying...`);
      }
    });

    return () => {
      disposed = true;
      if (notFoundTimer !== null) window.clearTimeout(notFoundTimer);
      if (connectedViaBc && bc) {
        try {
          bc.postMessage({ kind: 'BC_LEAVE', playerId } satisfies BroadcastPacket);
        } catch {
          // ignore
        }
      }
      try {
        activeConn?.close();
      } catch {
        // ignore
      }
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      bc?.close();
    };
  }, [roomCode, mode, playerId, playerName]);

  const send = useCallback((message: ClientMessage) => {
    sendImplRef.current(message);
  }, []);

  return {
    roomState,
    status,
    lastError,
    roomNotFound,
    send,
  };
}
