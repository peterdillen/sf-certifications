import path from 'path';
import fs from 'fs';

let sqlite3; // Lazy loaded

const isDev = process.env.NODE_ENV === 'development';
let dbPath = path.join(process.cwd(), isDev ? 'trailblazer_dev.db' : 'trailblazer.db');

if (process.env.VERCEL) {
    const tmpPath = path.join('/tmp', path.basename(dbPath));
    try {
        if (!fs.existsSync(tmpPath)) {
            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, tmpPath);
                console.log('[DB] Copied DB to /tmp for Vercel writable access');
            } else {
                console.log('[DB] Source DB not found, a new one will be created in /tmp');
            }
        }
        dbPath = tmpPath;
    } catch (e) {
        console.error('[DB] Error configuring /tmp DB path:', e);
    }
}

// Use a global to avoid multiple connections and re-init in dev mode (HMR)
let db;
let schemaInitialized = false;
let isInitializing = false;

function getDB() {
    if (db) return db;

    process.stdout.write('[DB] getDB called. Loading sqlite3...\n');
    if (!sqlite3) {
        const moduleName = 'sq' + 'lite3';
        sqlite3 = require(moduleName).verbose();
        process.stdout.write('[DB] sqlite3 library required.\n');
    }

    console.log('[DB] Attempting to open database at:', dbPath);
    try {
        if (process.env.NODE_ENV === 'development') {
            if (!global._sqliteDb) {
                console.log('[DB] Creating new Database instance (dev mode)...');
                global._sqliteDb = new sqlite3.Database(dbPath, (err) => {
                    if (err) console.error('[DB] Constructor callback error:', err);
                    else console.log('[DB] Constructor callback: opened successfully');
                });
                global._sqliteDbInitialized = false;
                global._sqliteDbInitializing = false;
                console.log('[DB] Database instance created successfully');
            }
            db = global._sqliteDb;
        } else {
            console.log('[DB] Creating new Database instance (prod mode)...');
            db = new sqlite3.Database(dbPath);
            console.log('[DB] Database instance created successfully');
        }

        const isInit = process.env.NODE_ENV === 'development' ? global._sqliteDbInitialized : schemaInitialized;
        const inProgress = process.env.NODE_ENV === 'development' ? global._sqliteDbInitializing : isInitializing;

        console.log('[DB] State check: isInit=', isInit, 'inProgress=', inProgress);
        if (!isInit && !inProgress) {
            initSchema(db);
        }

        return db;
    } catch (err) {
        console.error('[DB] Critical error in getDB:', err);
        throw err;
    }
}

async function initSchema(database) {
    const isDev = process.env.NODE_ENV === 'development';
    const isInit = isDev ? global._sqliteDbInitialized : schemaInitialized;
    const inProgress = isDev ? global._sqliteDbInitializing : isInitializing;

    if (inProgress || isInit) return;

    if (isDev) global._sqliteDbInitializing = true;
    else isInitializing = true;

    console.log('[DB] Initializing schema (isDev:', isDev, ')...');
    database.serialize(() => {
        try {
            database.run('PRAGMA foreign_keys = ON');
            database.run(`CREATE TABLE IF NOT EXISTS trailblazers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias TEXT UNIQUE NOT NULL,
                name TEXT,
                profile_url TEXT,
                profile_picture_url TEXT,
                last_scraped DATETIME
            )`);
            database.run(`CREATE TABLE IF NOT EXISTS certifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                topic TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                UNIQUE(name, topic)
            )`);
            database.run(`CREATE TABLE IF NOT EXISTS trailblazer_certifications (
                trailblazer_id INTEGER,
                certification_id INTEGER,
                issue_date TEXT,
                is_expired INTEGER DEFAULT 0,
                cert_link TEXT,
                PRIMARY KEY (trailblazer_id, certification_id),
                FOREIGN KEY (trailblazer_id) REFERENCES trailblazers(id) ON DELETE CASCADE,
                FOREIGN KEY (certification_id) REFERENCES certifications(id) ON DELETE CASCADE
            )`);

            // Silent column updates
            database.run('ALTER TABLE trailblazers ADD COLUMN profile_picture_url TEXT', (err) => { });
            database.run('ALTER TABLE certifications ADD COLUMN image_url TEXT', (err) => { });
            database.run('ALTER TABLE trailblazer_certifications ADD COLUMN cert_link TEXT', (err) => { });

            if (isDev) {
                global._sqliteDbInitialized = true;
                global._sqliteDbInitializing = false;
            } else {
                schemaInitialized = true;
                isInitializing = false;
            }
            console.log('[DB] Schema initialization completed.');
        } catch (err) {
            console.error('[DB] Schema initialization error:', err);
            if (isDev) global._sqliteDbInitializing = false;
            else isInitializing = false;
        }
    });
}

export function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDB().all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDB().run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

export function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDB().get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function normalizeCertName(name) {
    if (!name) return name;
    return name
        .replace(/^Salesforce Certified\s+/i, '')
        .replace(/Accredited Professional/gi, '(Accreditation)')
        .trim();
}

export async function addTrailblazer(alias, name = null) {
    const res = await run(
        'INSERT OR IGNORE INTO trailblazers (alias, name, last_scraped) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [alias, name]
    );
    if (res.changes === 0) {
        return await get('SELECT * FROM trailblazers WHERE alias = ?', [alias]);
    }
    return { id: res.id, alias, name };
}

export async function syncCertifications(trailblazerId, certs, name = null, profilePictureUrl = null, profileUrl = null) {
    if (name || profilePictureUrl || profileUrl) {
        let updateSql = 'UPDATE trailblazers SET ';
        const params = [];
        if (name) {
            updateSql += 'name = ?, ';
            params.push(name);
        }
        if (profilePictureUrl) {
            updateSql += 'profile_picture_url = ?, ';
            params.push(profilePictureUrl);
        }
        if (profileUrl) {
            updateSql += 'profile_url = ?, ';
            params.push(profileUrl);
        }
        updateSql = updateSql.slice(0, -2) + ' WHERE id = ?';
        params.push(trailblazerId);
        await run(updateSql, params);
    }

    for (const cert of certs) {
        const normalizedName = normalizeCertName(cert.name);
        await run(
            'INSERT OR IGNORE INTO certifications (name, topic, description, image_url) VALUES (?, ?, ?, ?)',
            [normalizedName, cert.topic, cert.description || '', cert.image || '']
        );
        if (cert.description || cert.image) {
            await run(
                `UPDATE certifications SET 
                    description = COALESCE(NULLIF(description, ''), ?),
                    image_url = COALESCE(NULLIF(image_url, ''), ?)
                WHERE name = ? AND topic = ?`,
                [cert.description || '', cert.image || '', normalizedName, cert.topic]
            );
        }
        const certRecord = await get(
            'SELECT id FROM certifications WHERE name = ? AND topic = ?',
            [normalizedName, cert.topic]
        );
        await run(
            'INSERT OR REPLACE INTO trailblazer_certifications (trailblazer_id, certification_id, issue_date, is_expired, cert_link) VALUES (?, ?, ?, ?, ?)',
            [trailblazerId, certRecord.id, cert.date, cert.isExpired ? 1 : 0, cert.link || '']
        );
    }
    await run('UPDATE trailblazers SET last_scraped = CURRENT_TIMESTAMP WHERE id = ?', [trailblazerId]);
}

export async function getComparisonData() {
    const trailblazers = await query('SELECT * FROM trailblazers ORDER BY alias');
    const certifications = await query(`
        SELECT DISTINCT c.*, 
        (SELECT COUNT(DISTINCT tc2.trailblazer_id) 
         FROM trailblazer_certifications tc2 
         JOIN trailblazers t ON tc2.trailblazer_id = t.id
         WHERE tc2.certification_id = c.id) as holder_count
        FROM certifications c
        JOIN trailblazer_certifications tc ON c.id = tc.certification_id
        JOIN trailblazers t ON tc.trailblazer_id = t.id
        ORDER BY c.topic, c.name
    `);
    const relationships = await query(`
        SELECT tc.* 
        FROM trailblazer_certifications tc
        JOIN trailblazers t ON tc.trailblazer_id = t.id
    `);

    return {
        trailblazers: trailblazers.map(t => ({ ...t, picture: t.profile_picture_url })),
        certifications,
        relationships: relationships.map(r => ({ ...r, link: r.cert_link }))
    };
}

export async function removeTrailblazer(id) {
    await run('DELETE FROM trailblazers WHERE id = ?', [id]);
}

export async function getCertificationDetail(id) {
    const cert = await get('SELECT * FROM certifications WHERE id = ?', [id]);
    if (!cert) return null;
    const holders = await query(`
        SELECT t.name, t.alias, t.profile_picture_url, tc.issue_date, tc.is_expired, tc.cert_link
        FROM trailblazers t
        JOIN trailblazer_certifications tc ON t.id = tc.trailblazer_id
        WHERE tc.certification_id = ?
        ORDER BY tc.is_expired ASC, tc.issue_date DESC
    `, [id]);
    return { ...cert, holders };
}

export async function getTrailblazerDetail(aliasOrId) {
    let trailblazer;
    if (isNaN(aliasOrId)) {
        trailblazer = await get('SELECT * FROM trailblazers WHERE alias = ?', [aliasOrId]);
    } else {
        trailblazer = await get('SELECT * FROM trailblazers WHERE id = ?', [aliasOrId]);
    }
    if (!trailblazer) return null;
    const certs = await query(`
        SELECT c.id as certification_id, c.name, c.topic, c.description, c.image_url, tc.issue_date, tc.is_expired, tc.cert_link
        FROM certifications c
        JOIN trailblazer_certifications tc ON c.id = tc.certification_id
        WHERE tc.trailblazer_id = ?
        ORDER BY tc.issue_date DESC
    `, [trailblazer.id]);
    return {
        ...trailblazer,
        picture: trailblazer.profile_picture_url,
        certifications: certs
    };
}
