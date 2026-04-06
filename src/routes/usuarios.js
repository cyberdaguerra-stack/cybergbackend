import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()

// Middleware para proteger rotas de utilizadores (apenas admin e admin_geral)
const requireAdminAccess = (req, res, next) => {
  authenticate(req, res, () => {
    authorize('admin', 'admin_geral')(req, res, next)
  })
}

// GET /api/usuarios - Listar todos os utilizadores
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, nome, email, role, status, ultimo_acesso as ultimo, criado_em FROM users ORDER BY criado_em DESC'
    )
    res.json(rows)
  } catch (err) {
    console.error('[USUARIOS] GET error:', err.message)
    res.status(500).json({ message: 'Erro ao listar utilizadores' })
  }
})

// GET /api/usuarios/:id - Obter um utilizador específico
router.get('/:id', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, nome, email, role, status, ultimo_acesso as ultimo, criado_em FROM users WHERE id = ?',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Utilizador não encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[USUARIOS] GET :id error:', err.message)
    res.status(500).json({ message: 'Erro ao obter utilizador' })
  }
})

// POST /api/usuarios - Criar novo utilizador
router.post('/', requireAdminAccess, async (req, res) => {
  const { nome, email, password, role } = req.body

  // Validações
  if (!nome || !email || !password) {
    return res.status(400).json({ message: 'Nome, email e senha são obrigatórios' })
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Senha deve ter pelo menos 8 caracteres' })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Email inválido' })
  }

  if (!['funcionario', 'admin', 'admin_geral'].includes(role)) {
    return res.status(400).json({ message: 'Papel inválido' })
  }

  // Verificar se é admin_geral - apenas admin_geral pode criar admin_geral
  if (role === 'admin_geral' && req.user.role !== 'admin_geral') {
    return res.status(403).json({ message: 'Apenas Admin Geral pode criar Admin Geral' })
  }

  try {
    // Verificar se email já existe
    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Este email já está registado' })
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10)

    // Criar utilizador
    await query(
      'INSERT INTO users (nome, email, password_hash, role, status, criado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), passwordHash, role, 'activo', req.user.id]
    )

    // Obter utilizador criado
    const newUser = await query(
      'SELECT id, nome, email, role, status, ultimo_acesso as ultimo, criado_em FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    )

    res.status(201).json({
      message: 'Utilizador criado com sucesso',
      user: newUser[0]
    })
  } catch (err) {
    console.error('[USUARIOS] POST error:', err.message)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Este email já está registado' })
    }
    res.status(500).json({ message: 'Erro ao criar utilizador' })
  }
})

// PUT /api/usuarios/:id - Atualizar utilizador
router.put('/:id', requireAdminAccess, async (req, res) => {
  const { nome, email, role, status, password } = req.body
  const userId = parseInt(req.params.id)

  // Não permitir editar a si mesmo para remover permissões
  if (userId === req.user.id && req.user.role === 'admin' && role === 'funcionario') {
    return res.status(403).json({ message: 'Não pode remover suas próprias permissões de admin' })
  }

  // Verificar se está tentando fazer admin_geral sem permissão
  if (role === 'admin_geral' && req.user.role !== 'admin_geral') {
    return res.status(403).json({ message: 'Apenas Admin Geral pode criar/editar Admin Geral' })
  }

  try {
    // Obter utilizador atual
    const users = await query('SELECT id FROM users WHERE id = ?', [userId])
    if (!users.length) {
      return res.status(404).json({ message: 'Utilizador não encontrado' })
    }

    // Preparar campos para atualizar
    let updateFields = []
    let updateValues = []

    if (nome) {
      updateFields.push('nome = ?')
      updateValues.push(nome.trim())
    }

    if (email) {
      // Verificar se email já está em uso por outro utilizador
      const existing = await query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.toLowerCase().trim(), userId]
      )
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Este email já está em uso' })
      }
      updateFields.push('email = ?')
      updateValues.push(email.toLowerCase().trim())
    }

    if (role) {
      updateFields.push('role = ?')
      updateValues.push(role)
    }

    if (status) {
      updateFields.push('status = ?')
      updateValues.push(status)
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Senha deve ter pelo menos 8 caracteres' })
      }
      updateFields.push('password_hash = ?')
      updateValues.push(await bcrypt.hash(password, 10))
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' })
    }

    updateFields.push('actualizado_em = NOW()')
    updateValues.push(userId)

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`
    await query(sql, updateValues)

    // Obter utilizador atualizado
    const updated = await query(
      'SELECT id, nome, email, role, status, ultimo_acesso as ultimo, criado_em FROM users WHERE id = ?',
      [userId]
    )

    res.json({
      message: 'Utilizador atualizado com sucesso',
      user: updated[0]
    })
  } catch (err) {
    console.error('[USUARIOS] PUT error:', err.message)
    res.status(500).json({ message: 'Erro ao atualizar utilizador' })
  }
})

// DELETE /api/usuarios/:id - Eliminar utilizador
router.delete('/:id', requireAdminAccess, async (req, res) => {
  const userId = parseInt(req.params.id)

  // Não permitir deletar a si mesmo
  if (userId === req.user.id) {
    return res.status(403).json({ message: 'Não pode deletar sua própria conta' })
  }

  // Não permitir deletar admin_geral se não for admin_geral
  try {
    const users = await query('SELECT role FROM users WHERE id = ?', [userId])
    if (!users.length) {
      return res.status(404).json({ message: 'Utilizador não encontrado' })
    }

    if (users[0].role === 'admin_geral' && req.user.role !== 'admin_geral') {
      return res.status(403).json({ message: 'Apenas Admin Geral pode deletar Admin Geral' })
    }

    await query('DELETE FROM users WHERE id = ?', [userId])

    res.json({ message: 'Utilizador deletado com sucesso' })
  } catch (err) {
    console.error('[USUARIOS] DELETE error:', err.message)
    res.status(500).json({ message: 'Erro ao deletar utilizador' })
  }
})

export default router
