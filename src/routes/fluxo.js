import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  const { data, tipo, page = 1, limit = 50 } = req.query
  const conds = []; const params = []
  if (data) { conds.push('f.data_tx = ?'); params.push(data) }
  if (tipo) { conds.push('f.tipo = ?');    params.push(tipo) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  try {
    const rows = await query(`
      SELECT f.id, f.tipo, f.descricao, f.valor, f.data_tx, f.hora_tx, f.observacoes, f.criado_em,
             c.nome AS categoria, u.nome AS criado_por_nome
      FROM fluxo_caixa f
      LEFT JOIN categorias_caixa c ON c.id = f.categoria_id
      LEFT JOIN users u ON u.id = f.criado_por
      ${where}
      ORDER BY f.data_tx DESC, f.hora_tx DESC
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), (Number(page) - 1) * Number(limit)])
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM fluxo_caixa f ${where}`, params)
    res.json({ data: rows, total, page: Number(page), limit: Number(limit) })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Erro ao buscar registos' }) }
})

router.get('/resumo', async (req, res) => {
  const { mes } = req.query
  const where = mes ? 'WHERE DATE_FORMAT(data_tx, "%Y-%m") = ?' : 'WHERE DATE_FORMAT(data_tx, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")'
  try {
    const [r] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN tipo='saida'   THEN valor ELSE 0 END), 0) AS total_saidas,
        COUNT(*) AS total_transaccoes
      FROM fluxo_caixa ${where}
    `, mes ? [mes] : [])
    res.json({ total_entradas: Number(r.total_entradas), total_saidas: Number(r.total_saidas), lucro_liquido: Number(r.total_entradas) - Number(r.total_saidas), total_transaccoes: Number(r.total_transaccoes) })
  } catch (err) { res.status(500).json({ message: 'Erro ao calcular resumo' }) }
})

router.post('/', async (req, res) => {
  const { tipo, descricao, valor, categoria_id, data_tx, observacoes } = req.body
  if (!tipo || !descricao || !valor) return res.status(400).json({ message: 'tipo, descricao e valor são obrigatórios' })
  if (!['entrada', 'saida'].includes(tipo)) return res.status(400).json({ message: 'tipo inválido' })
  if (Number(valor) <= 0) return res.status(400).json({ message: 'valor deve ser positivo' })
  try {
    const result = await query(
      'INSERT INTO fluxo_caixa (tipo, descricao, valor, categoria_id, data_tx, observacoes, criado_por) VALUES (?,?,?,?,?,?,?)',
      [tipo, descricao.trim(), valor, categoria_id || null, data_tx || new Date().toISOString().split('T')[0], observacoes || null, req.user.id]
    )
    res.status(201).json({ data: { id: result.insertId, tipo, descricao, valor } })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Erro ao criar registo' }) }
})

router.delete('/:id', authorize('admin_geral', 'admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM fluxo_caixa WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Registo não encontrado' })
    res.json({ message: 'Registo eliminado' })
  } catch (err) { res.status(500).json({ message: 'Erro ao eliminar' }) }
})

export default router
