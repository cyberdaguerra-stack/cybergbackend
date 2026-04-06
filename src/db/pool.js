import mysql from 'mysql2/promise'
import 'dotenv/config'

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               Number(process.env.DB_PORT) || 14302,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASS,
  database:           process.env.DB_NAME || 'defaultdb',
  ssl:                { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit:    5,
  queueLimit:         0,
  enableKeepAlive:    true,
  timezone:           '+00:00',
})

pool.on('connection', () => {
  if (process.env.NODE_ENV !== 'production') console.log('[DB] New connection established')
})

export async function query(sql, params = []) {
  const start = Date.now()
  const [rows] = await pool.execute(sql, params)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DB] ${Date.now() - start}ms — ${sql.slice(0, 70)}`)
  }
  return rows
}

export default pool
