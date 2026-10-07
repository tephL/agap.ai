import { openDatabaseAsync } from "expo-sqlite";

export const DATABASE_NAME = "hazard-prefs.db";

let dbPromise = null;

/**
 * Migrations run in order. Every entry increments user_version once applied,
 * so a future schema change only appends a new migration — never wipes rows.
 */
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS hazard_layer_pref (
    layer_id TEXT PRIMARY KEY NOT NULL,
    enabled  INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS ui_pref (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

async function openDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      // Durable concurrent reads — same setup as family-offline.db.
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");

      const row = await db.getFirstAsync("PRAGMA user_version;");
      let current = row ? Number(row.user_version ?? 0) : 0;

      while (current < MIGRATIONS.length) {
        const migration = MIGRATIONS[current];
        if (typeof migration === "function") {
          await migration(db);
        } else {
          await db.execAsync(migration);
        }
        current += 1;
        await db.execAsync(`PRAGMA user_version = ${current};`);
      }

      return db;
    });
  }
  return dbPromise;
}

/**
 * Single-select hazard layer visibility. The same hazard_layer_pref table is
 * reused: exactly one row carries enabled = 1 — the layer currently overlaid
 * on the map. Legacy installs that stored several enabled rows (old
 * multi-select behavior) are collapsed on read, preferring any row that is
 * still a known layer id.
 */

/** Saved active layer id, or null when nothing is overlaid. */
export async function getActiveHazardLayerId(knownLayerIds) {
  const db = await openDb();
  const rows = await db.getAllAsync(
    "SELECT layer_id FROM hazard_layer_pref WHERE enabled = 1 ORDER BY rowid;"
  );
  const enabledIds = rows.map((row) => row.layer_id);
  if (knownLayerIds && knownLayerIds.size > 0) {
    return enabledIds.find((id) => knownLayerIds.has(id)) ?? null;
  }
  return enabledIds[0] ?? null;
}

export async function setActiveHazardLayerId(layerId) {
  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    // Single-select invariant lives here too: clear before marking.
    await txn.runAsync("DELETE FROM hazard_layer_pref;");
    if (layerId != null) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO hazard_layer_pref (layer_id, enabled) VALUES (?, 1);`,
        [layerId]
      );
    }
  });
}

/**
 * Whether the map legend chip is collapsed. Defaults to collapsed until the
 * user explicitly opens it, so a freshly-triggered layer shows a pill first
 * instead of an open card.
 */
export async function getLegendHidden() {
  const db = await openDb();
  const row = await db.getFirstAsync(
    "SELECT value FROM ui_pref WHERE key = ?;",
    ["legend_hidden"]
  );
  if (!row) return true;
  return row.value === "1";
}

export async function setLegendHidden(hidden) {
  const db = await openDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO ui_pref (key, value) VALUES (?, ?);`,
    ["legend_hidden", hidden ? "1" : "0"]
  );
}
