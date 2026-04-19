export type AppSystem = 'birthday' | 'points';

export interface InventoryItem {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  totalExchanged?: number;
  lastUpdated?: any;
  system: AppSystem;
}

export interface ExchangeRecord {
  id?: string;
  system: AppSystem;
  handler: string;
  date: string;
  exchangeItem?: string; // For birthday system or confirmed points
  quantity: number;
  imageUrl?: string; // For points system pending records
  status: 'pending' | 'confirmed';
  details?: string;
  timestamp: any;
  note?: string;
}
