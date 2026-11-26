import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import type { ClientMessage, RoomState, ServerMessage } from '../types/game';
import { getPartyHost } from '../lib/roomUtils';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseGameRoomOptions {
  roomCode: string | null;
  playerId: string;
  playerName: string;
}

export function useGameRoom({ roomCode, playerId, playerName }: UseGameRoomOptions) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setRoomState(null);
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    setLastError(null);

    const host = getPartyHost();
    const socket = new PartySocket({
      host,
      room: roomCode.toUpperCase(),
    });
    socketRef.current = socket;

    const sendJoin = () => {
      const joinMsg: ClientMessage = {
        type: 'JOIN_ROOM',
        playerId,
        name: playerName,
      };
      socket.send(JSON.stringify(joinMsg));
    };

    const handleOpen = () => {
      setStatus('connected');
      setLastError(null);
      sendJoin();
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
        // Ignore malformed server payload
      }
    };

    const handleClose = () => {
      setStatus('reconnecting');
    };

    const handleError = () => {
      setStatus('reconnecting');
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);
    socket.addEventListener('error', handleError);

    return () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
      socket.removeEventListener('error', handleError);
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode, playerId, playerName]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }, []);

  return {
    roomState,
    status,
    lastError,
    send,
  };
}
