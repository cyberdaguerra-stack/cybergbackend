// ── SERVICOS ─────────────────────────────────────────────
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const servicosRouter = Router()
servicosRouter.use(authenticate)

servicosRouter.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT s.*, c.nome AS categoria FROM servicos s LEFT JOIN categorias_servico c ON c.id = s.categoria_id ORDER BY s.status DESC, s.nome')
    res.json(rows)
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar serviços' }) }
})

servicosRouter.post('/', authorize('admin_geral', 'admin'), async (req, res) => {
  const { nome, descricao, preco_mensal, categoria_id, status = 'activo' } = req.body
  if (!nome || !preco_mensal) return res.status(400).json({ message: 'nome e preco_mensal são obrigatórios' })
  try {
    const result = await query('INSERT INTO servicos (nome, descricao, preco_mensal, categoria_id, status, criado_por) VALUES (?,?,?,?,?,?)', [nome.trim(), descricao || null, Number(preco_mensal), categoria_id || null, status, req.user.id])
    res.status(201).json({ data: { id: result.insertId, nome, preco_mensal, status } })
  } catch (err) { res.status(500).json({ message: 'Erro ao criar serviço' }) }
})

servicosRouter.patch('/:id', authorize('admin_geral', 'admin'), async (req, res) => {
  const { nome, descricao, preco_mensal, status } = req.body
  try {
    await query('UPDATE servicos SET nome=COALESCE(?,nome), descricao=COALESCE(?,descricao), preco_mensal=COALESCE(?,preco_mensal), status=COALESCE(?,status) WHERE id=?', [nome, descricao, preco_mensal, status, req.params.id])
    const rows = await query('SELECT * FROM servicos WHERE id=?', [req.params.id])
    res.json({ data: rows[0] })
  } catch (err) { res.status(500).json({ message: 'Erro ao actualizar' }) }
})

servicosRouter.delete('/:id', authorize('admin_geral', 'admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM servicos WHERE id=?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Não encontrado' })
    res.json({ message: 'Serviço eliminado' })
  } catch (err) { res.status(500).json({ message: 'Erro ao eliminar' }) }
})

// ── CATEGORIAS SERVICO ────────────────────────────────────
servicosRouter.get('/categorias', async (req, res) => {
  try {
    const rows = await query('SELECT id, nome FROM categorias_servico ORDER BY nome')
    res.json(rows)
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar categorias' }) }
})

// ── CATEGORIAS FLUXO ──────────────────────────────────────
servicosRouter.get('/categorias-fluxo', async (req, res) => {
  try {
    const rows = await query('SELECT id, nome, tipo FROM categorias_caixa ORDER BY tipo, nome')
    res.json(rows)
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar categorias' }) }
})

// ── USUARIOS ─────────────────────────────────────────────
export const usuariosRouter = Router()
usuariosRouter.use(authenticate, authorize('admin_geral', 'admin'))

usuariosRouter.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT id, nome, email, role, status, ultimo_acesso, criado_em FROM users ORDER BY criado_em DESC')
    res.json(rows)
  } catch (err) { 
    console.error('[USUARIOS] GET error:', err.message)
    res.status(500).json({ message: 'Erro ao buscar utilizadores' }) 
  }
})

usuariosRouter.get('/:id', async (req, res) => {
  try {
    const rows = await query('SELECT id, nome, email, role, status, ultimo_acesso, criado_em FROM users WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Utilizador não encontrado' })
    res.json(rows[0])
  } catch (err) { 
    console.error('[USUARIOS] GET :id error:', err.message)
    res.status(500).json({ message: 'Erro ao buscar utilizador' }) 
  }
})

usuariosRouter.post('/', async (req, res) => {
  const { nome, email, password, role = 'funcionario' } = req.body
  
  if (!nome || !email || !password) return res.status(400).json({ message: 'Campos obrigatórios em falta' })
  if (password.length < 8) return res.status(400).json({ message: 'Password deve ter pelo menos 8 caracteres' })
  
  // Verificar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return res.status(400).json({ message: 'Email inválido' })
  
  // Apenas admin_geral pode criar admin_geral
  if (role === 'admin_geral' && req.user.role !== 'admin_geral') {
    return res.status(403).json({ message: 'Apenas Admin Geral pode criar Admin Geral' })
  }
  
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await query('INSERT INTO users (nome, email, password_hash, role, status) VALUES (?,?,?,?,?)', 
      [nome.trim(), email.toLowerCase().trim(), hash, role, 'activo'])
    
    const newUser = await query('SELECT id, nome, email, role, status, ultimo_acesso, criado_em FROM users WHERE id = ?', [result.insertId])
    res.status(201).json({ message: 'Utilizador criado com sucesso', data: newUser[0] })
  } catch (err) {
    console.error('[USUARIOS] POST error:', err.message)
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email já registado' })
    res.status(500).json({ message: 'Erro ao criar utilizador' })
  }
})

usuariosRouter.put('/:id', async (req, res) => {
  const { nome, email, role, status, password } = req.body
  const userId = parseInt(req.params.id)
  
  // Não permitir editar a si mesmo para remover permissões
  if (userId === req.user.id && req.user.role === 'admin' && role === 'funcionario') {
    return res.status(403).json({ message: 'Não pode remover suas próprias permissões' })
  }
  
  // Não permitir criar/editar admin_geral sem ser admin_geral
  if (role === 'admin_geral' && req.user.role !== 'admin_geral') {
    return res.status(403).json({ message: 'Apenas Admin Geral pode editar Admin Geral' })
  }
  
  try {
    const users = await query('SELECT id FROM users WHERE id = ?', [userId])
    if (!users.length) return res.status(404).json({ message: 'Utilizador não encontrado' })
    
    let updateFields = []
    let updateValues = []
    
    if (nome) {
      updateFields.push('nome = ?')
      updateValues.push(nome.trim())
    }
    
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) return res.status(400).json({ message: 'Email inválido' })
      
      const existing = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase().trim(), userId])
      if (existing.length > 0) return res.status(409).json({ message: 'Email já em uso' })
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
      if (password.length < 8) return res.status(400).json({ message: 'Senha deve ter pelo menos 8 caracteres' })
      updateFields.push('password_hash = ?')
      updateValues.push(await bcrypt.hash(password, 10))
    }
    
    if (updateFields.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' })
    
    updateFields.push('actualizado_em = NOW()')
    updateValues.push(userId)
    
    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`
    await query(sql, updateValues)
    
    const updated = await query('SELECT id, nome, email, role, status, ultimo_acesso, criado_em FROM users WHERE id = ?', [userId])
    res.json({ message: 'Utilizador atualizado com sucesso', data: updated[0] })
  } catch (err) {
    console.error('[USUARIOS] PUT error:', err.message)
    res.status(500).json({ message: 'Erro ao atualizar utilizador' })
  }
})

usuariosRouter.delete('/:id', async (req, res) => {
  const userId = parseInt(req.params.id)
  
  if (userId === req.user.id) return res.status(403).json({ message: 'Não pode eliminar a sua própria conta' })
  
  try {
    const users = await query('SELECT role FROM users WHERE id = ?', [userId])
    if (!users.length) return res.status(404).json({ message: 'Utilizador não encontrado' })
    
    if (users[0].role === 'admin_geral' && req.user.role !== 'admin_geral') {
      return res.status(403).json({ message: 'Apenas Admin Geral pode deletar Admin Geral' })
    }
    
    const result = await query('DELETE FROM users WHERE id = ?', [userId])
    res.json({ message: 'Utilizador eliminado com sucesso' })
  } catch (err) {
    console.error('[USUARIOS] DELETE error:', err.message)
    res.status(500).json({ message: 'Erro ao eliminar utilizador' })
  }
})

// ── ESTATISTICAS ─────────────────────────────────────────
export const estatisticasRouter = Router()
estatisticasRouter.use(authenticate, authorize('admin_geral', 'admin'))

estatisticasRouter.get('/kpis', async (req, res) => {
  try {
    const [r] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='entrada' AND DATE_FORMAT(data_tx,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m') THEN valor END),0) AS receita_mes,
        COALESCE(SUM(CASE WHEN tipo='saida'   AND DATE_FORMAT(data_tx,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m') THEN valor END),0) AS despesas_mes,
        COUNT(CASE  WHEN DATE_FORMAT(data_tx,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m') THEN 1 END) AS transaccoes_mes
      FROM fluxo_caixa
    `)
    const [{ total }] = await query("SELECT COUNT(*) AS total FROM servicos WHERE status='activo'")
    res.json({ receita_mes: Number(r.receita_mes), despesas_mes: Number(r.despesas_mes), lucro_mes: Number(r.receita_mes) - Number(r.despesas_mes), transaccoes_mes: Number(r.transaccoes_mes), servicos_activos: Number(total) })
  } catch (err) { res.status(500).json({ message: 'Erro ao calcular KPIs' }) }
})

estatisticasRouter.get('/mensal', async (req, res) => {
  try {
    const rows = await query(`
      SELECT DATE_FORMAT(data_tx, '%b') AS mes,
             YEAR(data_tx) AS ano,
             COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END),0) AS receita,
             COALESCE(SUM(CASE WHEN tipo='saida'   THEN valor ELSE 0 END),0) AS despesa,
             COUNT(*) AS transaccoes
      FROM fluxo_caixa
      WHERE data_tx >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(data_tx, '%Y-%m')
      ORDER BY DATE_FORMAT(data_tx, '%Y-%m')
    `)
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro nas estatísticas mensais' }) }
})

estatisticasRouter.get('/categorias', async (req, res) => {
  const { mes } = req.query
  const where = mes ? 'AND DATE_FORMAT(f.data_tx,"%Y-%m") = ?' : 'AND DATE_FORMAT(f.data_tx,"%Y-%m") = DATE_FORMAT(NOW(),"%Y-%m")'
  try {
    const rows = await query(`
      SELECT c.nome AS categoria, c.cor, SUM(f.valor) AS total
      FROM fluxo_caixa f
      JOIN categorias_caixa c ON c.id = f.categoria_id
      WHERE f.tipo = 'saida' ${where}
      GROUP BY c.nome, c.cor
      ORDER BY total DESC
    `, mes ? [mes] : [])
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro nas categorias' }) }
})

// ── RELATORIOS ────────────────────────────────────────────
export const relatoriosRouter = Router()
relatoriosRouter.use(authenticate, authorize('admin_geral', 'admin'))

relatoriosRouter.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT r.*, u.nome AS gerado_por_nome FROM relatorios r LEFT JOIN users u ON u.id = r.gerado_por ORDER BY r.criado_em DESC')
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar relatórios' }) }
})

relatoriosRouter.post('/gerar', async (req, res) => {
  const { tipo, periodo_inicio, periodo_fim } = req.body
  if (!tipo || !periodo_inicio || !periodo_fim) return res.status(400).json({ message: 'Campos obrigatórios em falta' })
  try {
    const [s] = await query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END),0) AS e, COALESCE(SUM(CASE WHEN tipo='saida' THEN valor ELSE 0 END),0) AS d FROM fluxo_caixa WHERE data_tx BETWEEN ? AND ?`, [periodo_inicio, periodo_fim])
    const result = await query('INSERT INTO relatorios (tipo, periodo_inicio, periodo_fim, total_entradas, total_saidas, gerado_por) VALUES (?,?,?,?,?,?)', [tipo, periodo_inicio, periodo_fim, Number(s.e), Number(s.d), req.user.id])
    res.status(201).json({ data: { id: result.insertId, tipo, periodo_inicio, periodo_fim, total_entradas: s.e, total_saidas: s.d } })
  } catch (err) { res.status(500).json({ message: 'Erro ao gerar relatório' }) }
})
