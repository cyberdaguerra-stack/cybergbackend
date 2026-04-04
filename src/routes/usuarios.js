import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate, authorize('admin_geral'))

router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, nome, email, role, status, ultimo_acesso, criado_em FROM users ORDER BY criado_em')
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar utilizadores' }) }
})

router.post('/', async (req, res) => {
  const { nome, email, password, role = 'funcionario' } = req.body
  if (!nome || !email || !password) return res.status(400).json({ message: 'nome, email e password são obrigatórios' })
  if (password.length < 8) return res.status(400).json({ message: 'Password deve ter pelo menos 8 caracteres' })
  if (!['admin_geral','admin','funcionario'].includes(role)) return res.status(400).json({ message: 'role inválido' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      'INSERT INTO users (nome, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, nome, email, role, status, criado_em',
      [nome.trim(), email.toLowerCase().trim(), hash, role]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email já registado' })
    res.status(500).json({ message: 'Erro ao criar utilizador' })
  }
})

router.patch('/:id', async (req, res) => {
  const { nome, email, role, status } = req.body
  try {
    const { rows } = await query(
      'UPDATE users SET nome=COALESCE($1,nome), email=COALESCE($2,email), role=COALESCE($3,role), status=COALESCE($4,status) WHERE id=$5 RETURNING id, nome, email, role, status',
      [nome, email, role, status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Utilizador não encontrado' })
    res.json({ data: rows[0] })
  } catch (err) { res.status(500).json({ message: 'Erro ao actualizar' }) }
})

router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ message: 'Não pode eliminar a sua própria conta' })
  try {
    const { rowCount } = await query('DELETE FROM users WHERE id=$1', [req.params.id])
    if (!rowCount) return res.status(404).json({ message: 'Utilizador não encontrado' })
    res.json({ message: 'Utilizador eliminado' })
  } catch (err) { res.status(500).json({ message: 'Erro ao eliminar' }) }
})

export default router
