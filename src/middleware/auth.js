import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'

export async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de acesso necessário' })
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    const rows = await query('SELECT id, nome, email, role, status FROM users WHERE id = ?', [payload.sub])
    if (!rows.length || rows[0].status !== 'activo') {
      return res.status(401).json({ message: 'Utilizador inactivo ou não encontrado' })
    }
    req.user = rows[0]
    next()
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado' })
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Sem permissão para esta acção' })
    }
    next()
  }
}
