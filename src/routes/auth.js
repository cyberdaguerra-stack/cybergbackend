import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ message: 'Email e senha são obrigatórios' })
  try {
    const rows = await query('SELECT id, nome, email, password_hash, role, status FROM users WHERE email = ?', [email.toLowerCase().trim()])
    const user = rows[0]
    if (!user) return res.status(401).json({ message: 'Credenciais inválidas' })
    if (user.status !== 'activo') return res.status(401).json({ message: 'Conta inactiva. Contacte o administrador.' })
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'Credenciais inválidas' })
    await query('UPDATE users SET ultimo_acesso = NOW() WHERE id = ?', [user.id])
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } })
  } catch (err) {
    console.error('[AUTH] Login error:', err.message)
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Base de dados não foi inicializada. Execute: GET /api/setup?token=cyberg_setup_2025' })
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/register', async (req, res) => {
  const { nome, email, password, confirmPassword } = req.body
  
  // Validações
  if (!nome || !email || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios' })
  }
  
  if (password.length < 8) {
    return res.status(400).json({ message: 'Senha deve ter pelo menos 8 caracteres' })
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'As senhas não correspondem' })
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Email inválido' })
  }
  
  try {
    // Verifica se email já existe
    const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Este email já está registado' })
    }
    
    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10)
    
    // Cria novo utilizador
    await query(
      'INSERT INTO users (nome, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), passwordHash, 'funcionario', 'activo']
    )
    
    // Faz login automático
    const newUser = await query('SELECT id, nome, email, role, status FROM users WHERE email = ?', [email.toLowerCase().trim()])
    const user = newUser[0]
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' })
    
    res.status(201).json({
      message: 'Utilizador registado com sucesso',
      token,
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role }
    })
  } catch (err) {
    console.error('[AUTH] Register error:', err.message)
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'Base de dados não foi inicializada. Execute: GET /api/setup?token=cyberg_setup_2025' })
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Este email já está registado' })
    }
    res.status(500).json({ message: 'Erro ao registar utilizador' })
  }
})

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }))

router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ message: 'Nova senha deve ter pelo menos 8 caracteres' })
  const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!await bcrypt.compare(currentPassword, rows[0].password_hash)) return res.status(401).json({ message: 'Senha actual incorrecta' })
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), req.user.id])
  res.json({ message: 'Senha actualizada' })
})

export default router
