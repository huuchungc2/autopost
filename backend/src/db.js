import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'autopost_db',
  charset: 'utf8mb4_unicode_ci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: ['DATE', 'DATETIME', 'TIMESTAMP'],
  timezone: '+07:00',
});

pool.on('connection', (connection) => {
  connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Kiểm tra DB có lưu emoji 4-byte (🚐 📌) — cần utf8mb4. */
export async function getDbCharsetInfo() {
  try {
    const tableRows = await query(
      `SELECT TABLE_COLLATION FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' LIMIT 1`
    );
    const sessionRows = await query(
      `SELECT @@character_set_client AS client, @@character_set_connection AS connection`
    );
    const collation = tableRows[0]?.TABLE_COLLATION || null;
    const emojiReady = String(collation || '').startsWith('utf8mb4');

    let emoji_roundtrip = null;
    if (emojiReady) {
      try {
        const probe = '🚐';
        const [rows] = await pool.execute('SELECT ? AS emoji', [probe]);
        emoji_roundtrip = rows[0]?.emoji === probe;
      } catch {
        emoji_roundtrip = false;
      }
    }

    return {
      posts_table_collation: collation,
      emoji_ready: emojiReady && emoji_roundtrip !== false,
      emoji_roundtrip,
      connection_charset: sessionRows[0]?.connection || null,
    };
  } catch (error) {
    return { emoji_ready: false, error: error.message };
  }
}

export default pool;
