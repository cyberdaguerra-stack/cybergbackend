import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate, authorize('admin_geral', 'admin'))

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT r.*, u.nome AS gerado_por_nome
      FROM relatorios r
      LEFT JOIN users u ON u.id = r.gerado_por
      ORDER BY r.criado_em DESC
    `)
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao buscar relatórios' }) }
})

router.post('/gerar', async (req, res) => {
  const { tipo, periodo_inicio, periodo_fim } = req.body
  if (!tipo || !periodo_inicio || !periodo_fim) {
    return res.status(400).json({ message: 'tipo, periodo_inicio e periodo_fim são obrigatórios' })
  }
  try {
    const { rows: summary } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN tipo='saida'   THEN valor ELSE 0 END), 0) AS total_saidas
      FROM fluxo_caixa WHERE data_tx BETWEEN $1 AND $2
    `, [periodo_inicio, periodo_fim])

    const { rows } = await query(`
      INSERT INTO relatorios (tipo, periodo_inicio, periodo_fim, total_entradas, total_saidas, gerado_por)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [tipo, periodo_inicio, periodo_fim, Number(summary[0].total_entradas), Number(summary[0].total_saidas), req.user.id])

    res.status(201).json({ data: rows[0] })
  } catch (err) { res.status(500).json({ message: 'Erro ao gerar relatório' }) }
})

export default router
