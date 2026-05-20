import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'deliveries.db');

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_date TEXT NOT NULL,
      delivery_time TEXT,
      project_name TEXT NOT NULL,
      item TEXT NOT NULL,
      specification TEXT,
      vendor TEXT NOT NULL,
      unload_location TEXT NOT NULL,
      storage_location TEXT,
      quantity REAL,
      unit TEXT,
      order_number TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT '予定',
      delivered_at TEXT,
      slip_image_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_date ON deliveries(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_project_name ON deliveries(project_name);
    CREATE INDEX IF NOT EXISTS idx_vendor ON deliveries(vendor);
    CREATE INDEX IF NOT EXISTS idx_status ON deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_unload_location ON deliveries(unload_location);
  `);
}

export interface Delivery {
  id: number;
  delivery_date: string;
  delivery_time: string | null;
  project_name: string;
  item: string;
  specification: string | null;
  vendor: string;
  unload_location: string;
  storage_location: string | null;
  quantity: number | null;
  unit: string | null;
  order_number: string | null;
  notes: string | null;
  status: '予定' | '納入済み';
  delivered_at: string | null;
  slip_image_path: string | null;
  created_at: string;
  updated_at: string;
}

export type DeliveryInput = Omit<Delivery, 'id' | 'created_at' | 'updated_at'>;
