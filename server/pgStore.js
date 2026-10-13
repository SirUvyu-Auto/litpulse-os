const { Pool, Client } = require('pg');

class PgStore {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.isSyncing = false;
    this.lastSyncAt = null;
    this.statusMessage = 'Standby (Local Backup Active)';
    this.connectionString = process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? null : 'postgresql://postgres:postgres@localhost:5432/litpulse');
  }

  async init(initialDataCallback) {
    if (!this.connectionString) {
      this.isConnected = false;
      this.statusMessage = 'Local JSON Storage Active';
      console.log('[TRIS Storage] Operating on Local JSON Backup (data/database.json).');
      return;
    }

    try {
      // First attempt to ensure database exists if running locally
      await this._ensureDatabaseExists();

      const isRemote = this.connectionString && !this.connectionString.includes('localhost') && !this.connectionString.includes('127.0.0.1');
      this.pool = new Pool({
        connectionString: this.connectionString,
        connectionTimeoutMillis: 3500,
        idleTimeoutMillis: 30000,
        max: 10,
        ssl: isRemote ? { rejectUnauthorized: false } : false
      });

      this.pool.on('error', (err) => {
        console.warn('[TRIS PostgreSQL] Pool background error (falling back to local JSON backup):', err.message);
        this.isConnected = false;
        this.statusMessage = 'Local Backup Active (PG Reconnecting)';
      });

      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS tris_cases (
            target_id TEXT PRIMARY KEY,
            case_id TEXT,
            source_log_id TEXT,
            source_file TEXT,
            priority_score INTEGER DEFAULT 0,
            status TEXT DEFAULT 'Active',
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_tris_cases_priority ON tris_cases(priority_score DESC);
          CREATE INDEX IF NOT EXISTS idx_tris_cases_log ON tris_cases(source_log_id);
          CREATE INDEX IF NOT EXISTS idx_tris_cases_file ON tris_cases(source_file);

          CREATE TABLE IF NOT EXISTS tris_metadata (
            meta_key TEXT PRIMARY KEY,
            meta_value JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        this.isConnected = true;
        this.statusMessage = 'PostgreSQL Primary + Local JSON Backup';
        console.log('[TRIS PostgreSQL] Connected and verified relational/JSONB schema.');

        // Check if PostgreSQL has existing records
        const countRes = await client.query('SELECT COUNT(*)::int AS cnt FROM tris_cases');
        const rowCount = countRes.rows[0]?.cnt || 0;

        if (rowCount > 0) {
          console.log(`[TRIS PostgreSQL] Loaded ${rowCount} cases verified in PostgreSQL primary store.`);
          const pgData = await this.loadAll(client);
          if (pgData && initialDataCallback) {
            initialDataCallback(pgData, 'postgres');
          }
        } else if (initialDataCallback) {
          console.log('[TRIS PostgreSQL] Primary tables empty on initial boot. Seeding PostgreSQL from Local JSON Backup...');
          const localData = initialDataCallback(null, 'seed_from_local');
          if (localData) {
            await this.syncAll(localData);
          }
        }
      } finally {
        client.release();
      }
    } catch (err) {
      this.isConnected = false;
      this.statusMessage = 'Local JSON Backup (PostgreSQL Standby until Deploy)';
      console.log(`[TRIS Storage] PostgreSQL not yet reachable (${err.message || 'offline'}). Operating on Local JSON Backup (data/database.json).`);
    }
  }

  async _ensureDatabaseExists() {
    try {
      const url = new URL(this.connectionString);
      const dbName = url.pathname.replace(/^\//, '');
      if (!dbName || (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')) return;

      const adminUrl = new URL(this.connectionString);
      adminUrl.pathname = '/postgres';

      const client = new Client({
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 2000
      });
      await client.connect();
      const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      if (res.rowCount === 0) {
        await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
        console.log(`[TRIS PostgreSQL] Created database "${dbName}" automatically.`);
      }
      await client.end();
    } catch (_) {
      // Non-fatal: either remote DB or local Postgres service is not running
    }
  }

  async loadAll(existingClient = null) {
    if (!this.isConnected || !this.pool) return null;
    const client = existingClient || await this.pool.connect();
    try {
      const casesRes = await client.query('SELECT data FROM tris_cases ORDER BY priority_score DESC');
      const metaRes = await client.query('SELECT meta_key, meta_value FROM tris_metadata');

      const metaMap = {};
      metaRes.rows.forEach(r => {
        metaMap[r.meta_key] = r.meta_value;
      });

      return {
        cases: casesRes.rows.map(r => r.data),
        buildings: metaMap.buildings || [],
        ingestion_logs: metaMap.ingestion_logs || [],
        forecast_log: metaMap.forecast_log || [],
        conversions: metaMap.conversions || [],
        weights: metaMap.weights || { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 }
      };
    } catch (err) {
      console.error('[TRIS PostgreSQL] Failed to load state from PostgreSQL:', err.message);
      return null;
    } finally {
      if (!existingClient) client.release();
    }
  }

  async syncMetadataOnly(data) {
    if (!this.isConnected || !this.pool || !data) return false;
    try {
      const metaEntries = [
        ['buildings', data.buildings || []],
        ['ingestion_logs', data.ingestion_logs || []],
        ['forecast_log', data.forecast_log || []],
        ['conversions', data.conversions || []],
        ['weights', data.weights || { urgency: 30, revenue: 25, locality: 20, caseType: 15, engagement: 15 }]
      ];
      for (const [k, v] of metaEntries) {
        await this.pool.query(
          `INSERT INTO tris_metadata (meta_key, meta_value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (meta_key) DO UPDATE SET meta_value = EXCLUDED.meta_value, updated_at = NOW()`,
          [k, JSON.stringify(v)]
        );
      }
      this.lastSyncAt = new Date().toISOString();
      return true;
    } catch (err) {
      console.error('[TRIS PostgreSQL] Metadata sync error:', err.message);
      return false;
    }
  }

  async syncAll(data) {
    if (!this.isConnected || !this.pool || !data || this.isSyncing) return false;
    this.isSyncing = true;
    const startTime = Date.now();

    try {
      await this.syncMetadataOnly(data);

      const cases = data.cases || [];
      const batchSize = 500;
      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');
        for (let i = 0; i < cases.length; i += batchSize) {
          const slice = cases.slice(i, i + batchSize);
          const targetIds = [];
          const caseIds = [];
          const logIds = [];
          const files = [];
          const scores = [];
          const statuses = [];
          const jsonPayloads = [];

          slice.forEach(c => {
            targetIds.push(String(c.target_id || c.case_id || `case-${Math.random()}`));
            caseIds.push(String(c.case_id || ''));
            logIds.push(String(c.source_log_id || ''));
            files.push(String(c.source_file || ''));
            scores.push(Number(c.priority_score) || 0);
            statuses.push(String(c.status || 'Active'));
            jsonPayloads.push(JSON.stringify(c));
          });

          await client.query(
            `INSERT INTO tris_cases (target_id, case_id, source_log_id, source_file, priority_score, status, data, updated_at)
             SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::jsonb[])
             AS t(target_id, case_id, source_log_id, source_file, priority_score, status, data),
             LATERAL (SELECT NOW() AS updated_at) u
             ON CONFLICT (target_id) DO UPDATE SET
               case_id = EXCLUDED.case_id,
               source_log_id = EXCLUDED.source_log_id,
               source_file = EXCLUDED.source_file,
               priority_score = EXCLUDED.priority_score,
               status = EXCLUDED.status,
               data = EXCLUDED.data,
               updated_at = NOW()`,
            [targetIds, caseIds, logIds, files, scores, statuses, jsonPayloads]
          );
        }
        await client.query('COMMIT');
        this.lastSyncAt = new Date().toISOString();
        console.log(`[TRIS PostgreSQL] Synced ${cases.length} cases and metadata in ${Date.now() - startTime}ms.`);
        return true;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[TRIS PostgreSQL] Full sync error:', err.message);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  async deleteDocumentRecords(logId, fileName) {
    if (!this.isConnected || !this.pool) return false;
    try {
      await this.pool.query(
        'DELETE FROM tris_cases WHERE source_log_id = $1 OR source_file = $2',
        [String(logId || ''), String(fileName || '')]
      );
      this.lastSyncAt = new Date().toISOString();
      return true;
    } catch (err) {
      console.error('[TRIS PostgreSQL] Error deleting document cases from PostgreSQL:', err.message);
      return false;
    }
  }

  getStatus() {
    return {
      pgConnected: this.isConnected,
      statusMessage: this.statusMessage,
      lastSyncAt: this.lastSyncAt,
      backupMode: 'Local JSON Active (data/database.json)'
    };
  }
}

module.exports = new PgStore();
