import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate, authorize('admin_geral', 'admin'))

// GET /api/estatisticas/mensal
router.get('/mensal', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', data_tx), 'Mon') AS mes,
        EXTRACT(YEAR FROM data_tx)::INT AS ano,
        COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END), 0) AS receita,
        COALESCE(SUM(CASE WHEN tipo='saida'   THEN valor ELSE 0 END), 0) AS despesa,
        COUNT(*) AS transaccoes
      FROM fluxo_caixa
      WHERE data_tx >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', data_tx)
      ORDER BY DATE_TRUNC('month', data_tx)
    `)
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao calcular estatísticas mensais' }) }
})

// GET /api/estatisticas/categorias?mes=YYYY-MM
router.get('/categorias', async (req, res) => {
  const { mes } = req.query
  const filter = mes
    ? `AND DATE_TRUNC('month', f.data_tx) = DATE_TRUNC('month', $1::date)`
    : `AND DATE_TRUNC('month', f.data_tx) = DATE_TRUNC('month', NOW())`
  try {
    const { rows } = await query(`
      SELECT c.nome AS categoria, c.cor, SUM(f.valor) AS total,
             ROUND(SUM(f.valor) * 100.0 / SUM(SUM(f.valor)) OVER (), 1) AS percentagem
      FROM fluxo_caixa f
      JOIN categorias_caixa c ON c.id = f.categoria_id
      WHERE f.tipo = 'saida' ${filter}
      GROUP BY c.nome, c.cor
      ORDER BY total DESC
    `, mes ? [mes + '-01'] : [])
    res.json({ data: rows })
  } catch (err) { res.status(500).json({ message: 'Erro ao calcular por categoria' }) }
})

// GET /api/estatisticas/kpis
router.get('/kpis', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo='entrada' AND DATE_TRUNC('month',data_tx)=DATE_TRUNC('month',NOW()) THEN valor END), 0) AS receita_mes,
        COALESCE(SUM(CASE WHEN tipo='saida'   AND DATE_TRUNC('month',data_tx)=DATE_TRUNC('month',NOW()) THEN valor END), 0) AS despesas_mes,
        COUNT(CASE WHEN DATE_TRUNC('month',data_tx)=DATE_TRUNC('month',NOW()) THEN 1 END) AS transaccoes_mes
      FROM fluxo_caixa
    `)
    const { rows: svcRows } = await query("SELECT COUNT(*) AS total FROM servicos WHERE status='activo'")
    const r = rows[0]
    res.json({
      receita_mes:       Number(r.receita_mes),
      despesas_mes:      Number(r.despesas_mes),
      lucro_mes:         Number(r.receita_mes) - Number(r.despesas_mes),
      transaccoes_mes:   Number(r.transaccoes_mes),
      servicos_activos:  Number(svcRows[0].total),
    })
  } catch (err) { res.status(500).json({ message: 'Erro ao calcular KPIs' }) }
})

export default router
