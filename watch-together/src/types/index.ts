export type Role = 'presenter' | 'viewer';

export interface WsMessage {
  type: string;
  roomId?: string;
  payload?: Record<string, unknown>;
  state?: RoomState;
  clientId?: string;
  role?: Role;
  from?: string;
}

export interface RoomState {
  clientCount: number;
  hasPresenter: boolean;
  videoUrl: string | null;
}

export interface ChatMessage {
  clientId: string;
  role: Role;
  text: string;
  timestamp: number;
}
